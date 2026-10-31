# Architecture

This document explains how WatchParty Sync is built and how WebSockets fit into every flow. Diagrams use [Mermaid](https://mermaid.js.org/) and render directly on GitHub.

## Contents

1. [System overview](#1-system-overview)
2. [Server design](#2-server-design)
3. [Data model](#3-data-model)
4. [Playback synchronization](#4-playback-synchronization)
5. [Role-based access control](#5-role-based-access-control)
6. [Request and approve flow](#6-request-and-approve-flow)
7. [Joining, late joiners and leaving](#7-joining-late-joiners-and-leaving)
8. [Client design](#8-client-design)
9. [Reconnection](#9-reconnection)
10. [Deployment topology](#10-deployment-topology)
11. [Scaling design](#11-scaling-design)
12. [Security considerations](#12-security-considerations)

---

## 1. System overview

The browser talks to the server over one long-lived WebSocket connection (Socket.IO). The server owns all room state. The YouTube player runs only in the browser.

```mermaid
flowchart LR
  subgraph Browser["Browser (React + Vite, hosted on Vercel)"]
    UI["Pages and components"]
    CTX["RoomContext (state + socket events)"]
    YT["useYouTubePlayer + YouTube IFrame API"]
  end

  subgraph Server["Server (Node + Express + Socket.IO, hosted on Render)"]
    H["Event handlers"]
    P["Permissions: can(role, action)"]
    RM["RoomManager"]
    R["Room and Participant models"]
  end

  UI --> CTX
  CTX <--> YT
  CTX <-->|"WebSocket (wss)"| H
  H --> P
  H --> RM
  RM --> R
```

**Why WebSockets:** playback control needs low-latency, two-way, server-initiated messages (the server pushes `sync_state` to everyone without being asked). HTTP polling would add delay and load. Socket.IO adds rooms, acknowledgements and automatic reconnection on top of WebSockets.

**One rule drives the design:** the server is the single source of truth. Clients send *intents* (for example `pause`), the server validates and updates state, and then tells everyone else what the new state is.

---

## 2. Server design

The server is object-oriented. Each class has one job.

```mermaid
flowchart TB
  S["socket.ts: on connection, create handlers per socket"]
  S --> RH["RoomHandler: create, join, leave, disconnect"]
  S --> PH["PlaybackHandler: play, pause, seek, change_video"]
  S --> RoH["RoleHandler: assign_role, remove, transfer_host"]
  S --> QH["RequestHandler: request_action, resolve_request"]
  S --> CH["ChatHandler: chat_message"]
  S --> XH["ReactionHandler: send_reaction"]
  S --> SH["SyncHandler: request_sync"]

  RH --> RM["RoomManager (all rooms)"]
  PH --> RM
  RoH --> RM
  QH --> RM
  CH --> RM
  XH --> RM
  SH --> RM

  PH --> PS["PlaybackService (validate + apply)"]
  QH --> PS
  PH --> PERM["rolePermissions.can()"]
  RoH --> PERM
  QH --> PERM

  RM --> R["Room (participants, video state, requests, chat)"]
  R --> PA["Participant (id, username, role)"]
```

| Class or module | Responsibility |
|---|---|
| `RoomManager` | Owns the map of rooms, generates unique room codes, maps socket id to room, creates and deletes rooms |
| `Room` | Participants, `VideoState`, pending requests, chat history, host invariant (`transferHost`, `promoteNextHost`) |
| `Participant` | One user: id, username, role |
| `*Handler` classes | Listen to socket events, run checks, call the model, broadcast results |
| `rolePermissions` | A single table of role to allowed actions, and `can(role, action)` |
| `PlaybackService` | Shared payload validation and "apply this action to the room" logic, used by both direct control and approved requests |

### Every state-changing event goes through the same three gates

```mermaid
flowchart LR
  E["Incoming event"] --> A{"Sender in a room?"}
  A -- no --> X["Ignore or ack error"]
  A -- yes --> B{"can(role, action)?"}
  B -- no --> D["Emit action_denied to sender"]
  B -- yes --> C{"Payload valid?"}
  C -- no --> D
  C -- yes --> U["Update Room state"] --> BR["Broadcast to the room"]
```

---

## 3. Data model

All state lives in memory inside the server process.

```mermaid
classDiagram
  class RoomManager {
    rooms
    socketToRoom
    createRoom()
    joinRoom()
    leaveRoom()
  }
  class Room {
    code
    participants
    videoState
    pendingRequests
    chat
    play()
    pause()
    seek()
    changeVideo()
    setRole()
    transferHost()
    promoteNextHost()
  }
  class Participant {
    id
    username
    role
  }
  class VideoState {
    videoId
    playState
    currentTime
    updatedAt
  }
  RoomManager "1" --> "*" Room : owns
  Room "1" --> "*" Participant : has
  Room "1" --> "1" VideoState : tracks
```

`Role` is `host`, `moderator` or `participant`. A participant's `id` is the Socket.IO socket id.

### Live playback position

The server does not run a timer. It stores the position at the last change plus the time of that change, and computes the live position on demand:

```
if playState == "playing":
    livePosition = currentTime + (now - updatedAt) / 1000
else:
    livePosition = currentTime
```

This is what lets a late joiner start at the right place without any background work.

---

## 4. Playback synchronization

### Host or Moderator controls playback

```mermaid
sequenceDiagram
  participant H as Host browser
  participant S as Server
  participant P as Participant browsers

  H->>S: pause { currentTime }
  S->>S: in room? can(role, pause)? payload valid?
  S->>S: room.pause(currentTime)
  S-->>P: sync_state { videoId, playState, currentTime }
  P->>P: applyState: suppress echo, fix drift above 1 second
```

Notes:

- The sender is **excluded** from the broadcast (`socket.to(room)`). The sender's own player already shows the change, so this avoids an echo loop.
- `play` and `pause` include the sender's `currentTime` so all clients align to the exact moment of the action.

### Client details that make sync reliable

| Problem | Solution |
|---|---|
| Calling `playVideo()` for a remote change fires the player's own state event, which would send a new event | A suppress flag is set for about 1.2 seconds whenever remote state is applied |
| The YouTube IFrame API has no seek event | Poll `currentTime` every 500 ms; a jump larger than 1.5 seconds beyond what playback explains is treated as a seek |
| Small timing differences between clients | Only seek when drift is larger than 1 second |
| A viewer's tab was in the background or the network lagged | Resync button, and automatic correction every 20 seconds for viewers who cannot control playback |
| A Host loads a new video | The change goes to others via the server, and the Host's own player is loaded locally at the same time |

---

## 5. Role-based access control

Permissions are defined once and enforced on the server.

| Action | Host | Moderator | Participant |
|---|:-:|:-:|:-:|
| play, pause, seek, change_video | ✅ | ✅ | ❌ |
| resolve_request | ✅ | ✅ | ❌ |
| assign_role, remove_participant, transfer_host | ✅ | ❌ | ❌ |

### Role changes are broadcast to everyone

```mermaid
sequenceDiagram
  participant H as Host
  participant S as Server
  participant R as Everyone in room (including target)

  H->>S: assign_role { userId, role: moderator }
  S->>S: can(host, assign_role)? target in room? not self? role valid?
  S->>S: room.setRole(userId, moderator)
  S-->>R: role_assigned { userId, role, participants }
  R->>R: Recompute own role from participants list, UI unlocks or locks controls
```

Each client derives its own role from the `participants` list in every event, so the UI cannot drift from the server's truth.

### Host invariants

- A room always has exactly one Host.
- `transfer_host` makes the previous Host a Moderator.
- If the Host leaves or disconnects while others remain, `promoteNextHost()` picks the first Moderator, otherwise the longest-present Participant, and `host_transferred` is broadcast.
- When the last person leaves, the room is deleted.

---

## 6. Request and approve flow

A Participant cannot control playback, but can ask for it. Only an approval makes the change apply.

```mermaid
sequenceDiagram
  participant Pt as Participant
  participant S as Server
  participant M as Host and Moderators
  participant All as Everyone

  Pt->>S: request_action { action, payload }
  S->>S: validate, one pending request per user
  S-->>Pt: ack { ok, requestId }
  S-->>M: requests_updated { requests } (full list)

  alt Approved
    M->>S: resolve_request { requestId, approve: true }
    S->>S: can(role, resolve_request)? apply action to room
    S-->>All: sync_state (including the approver)
    S-->>Pt: request_resolved { approved: true }
  else Rejected
    M->>S: resolve_request { requestId, approve: false }
    S-->>Pt: request_resolved { approved: false }
  end
  S-->>M: requests_updated { requests }
```

Design points:

- **Full-list snapshots** (`requests_updated`) are sent instead of incremental events, so a newly promoted Moderator immediately sees pending requests and state can never get out of sync.
- On approval, `sync_state` goes to **everyone including the approver**, because the approver's own player has not changed yet.
- A user's pending request is removed automatically when they leave.

---

## 7. Joining, late joiners and leaving

```mermaid
sequenceDiagram
  participant B as New browser
  participant S as Server
  participant O as Others in room

  B->>S: join_room { roomId, username } (ack)
  S->>S: room exists? username valid? not already in a room?
  S->>S: add Participant(role: participant)
  S-->>B: ack { role, participants, videoState (live position), chatHistory }
  S-->>O: user_joined { username, userId, role, participants }
  B->>B: Player loads video at the live position
```

Leaving (button, closing the tab or a dropped connection) runs the same path: remove the participant, clean up their pending requests, promote a new Host if needed, delete the room if empty, and broadcast `user_left`.

Room codes are 6 characters from an alphabet without look-alike characters (`0/O`, `1/I`), checked for uniqueness. Opening `/room/CODE` directly shows a join form, which is how invite links work.

---

## 8. Client design

```mermaid
flowchart TB
  subgraph Providers
    RP["RoomProvider (RoomContext)"]
  end
  RP --> HP["HomePage: create or join"]
  RP --> RoP["RoomPage"]
  RoP --> TB["TopBar"]
  RoP --> VP["VideoPlayer"]
  RoP --> SB["Sidebar (tabs)"]
  VP --> HK["useYouTubePlayer"]
  VP --> RL["ReactionLayer and dock"]
  VP --> FC["FloatingChat (fullscreen)"]
  VP --> RC["RequestControls (participants)"]
  SB --> CB["ChatBox"]
  SB --> PL["ParticipantList"]
  SB --> PR["PendingRequests (Host and Moderators)"]
```

- **`RoomContext`** is the only place that listens to socket events. It holds the room state (participants, own role, video state, chat, pending requests) and exposes actions such as `sendPlay`, `assignRole`, `sendChat`. Components never touch the socket directly (except through the context).
- **`useYouTubePlayer`** wraps the IFrame API: it loads the script once, creates the player, applies server state, and reports user-initiated play, pause and seek.
- **Custom fullscreen:** the YouTube player's own fullscreen button only fullscreens the iframe. It is disabled (`fs: 0`), and a custom button fullscreens the wrapper element instead, so chat, reactions and notices render on top of the video.
- **Participants cannot control the player:** a transparent overlay blocks clicks for non-controllers. Because the overlay is separate from the player, a role change simply removes it, with no need to recreate the player.

---

## 9. Reconnection

A new connection gets a new socket id, and the server has already removed the old participant on disconnect. The client therefore rejoins explicitly.

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server

  Note over C: Connection drops
  C->>C: Show "Reconnecting" banner, remember roomId and username
  C->>S: (Socket.IO reconnects automatically)
  C->>S: join_room { roomId, username }
  alt Room still exists
    S-->>C: ack ok, UI restored as a Participant
  else Room is gone (server restarted or empty)
    S-->>C: ack error
    C->>C: Redirect home with a message
  end
```

**Trade-off:** the user returns as a Participant, not their previous role, and for a short time the old entry may linger until the server detects the dropped connection. See the limitations in the README for the persistent-identity improvement.

---

## 10. Deployment topology

```mermaid
flowchart LR
  U["Users' browsers"] -->|"HTTPS: static files"| V["Vercel: React build (client)"]
  U -->|"WSS: Socket.IO"| RN["Render: Node server (server)"]
  RN --> MEM[("In-memory rooms")]
  V -. "VITE_SERVER_URL (build time)" .-> RN
  RN -. "CLIENT_URL (CORS allowed origin)" .-> V
```

| Concern | Choice |
|---|---|
| Static frontend | Vercel, with a rewrite of all paths to `index.html` so `/room/CODE` works on refresh |
| Realtime backend | Render web service, which supports long-lived WebSocket connections |
| Configuration | Environment variables only; no secrets in the client |
| Health check | `GET /health` returns `{ "status": "ok" }` |
| Build | `npm install --include=dev && npm run build`, then `npm start` (`node dist/server.js`) |

---

## 11. Scaling design

The current build is a single process with in-memory state, which is right for an assignment and for a few hundred concurrent users. This is how it would scale to 1,000+ users, 100+ rooms and 50+ users per room.

```mermaid
flowchart LR
  U["Browsers"] --> LB["Load balancer (sticky sessions)"]
  LB --> N1["Socket.IO node 1"]
  LB --> N2["Socket.IO node 2"]
  LB --> N3["Socket.IO node 3"]
  N1 <--> RD[("Redis: pub/sub + room state")]
  N2 <--> RD
  N3 <--> RD
```

| Step | What changes |
|---|---|
| Cross-node broadcast | Add the Socket.IO **Redis adapter** so `io.to(room).emit` reaches sockets on every node |
| Sticky sessions | Route a client to the same node during the Socket.IO handshake (needed for long-polling fallback) |
| Shared state | Move room state (participants, video state, requests, recent chat) from process memory into Redis |
| Room ownership | Keep room logic in one place, for example per-room keys with atomic updates, or route each room to one owner node |
| Persistence | Store room metadata in a database so rooms survive restarts |
| Identity | Persistent user ids and a reconnect grace period, so a refresh keeps the user's role |

Because all room logic is already behind `RoomManager` and `Room`, the migration is mostly swapping the storage behind those classes. Handlers would not need to change.

**Per-room load:** a 50-person room is cheap. Playback events are rare and tiny, chat and reactions are rate limited (chat: one message per 500 ms, reactions: 150 ms), and `requests_updated` goes only to Host and Moderators.

---

## 12. Security considerations

| Area | Measure |
|---|---|
| Authorization | Every state-changing event checks room membership and `can(role, action)` on the server |
| Input validation | Times must be finite numbers at or above zero; video ids match a strict 11-character pattern; usernames are trimmed and length limited; chat text is 1 to 300 characters |
| Allowlists | Reactions accept only a fixed set of emojis; roles accept only `moderator` or `participant` through `assign_role` |
| Abuse limits | Chat and reaction rate limits; one pending request per user |
| XSS | Chat and usernames are rendered as plain text by React; `dangerouslySetInnerHTML` is never used |
| CORS | Only the configured `CLIENT_URL` origin is allowed |
| Room access | The room code acts as the access token; codes are random and 6 characters from a 32-character alphabet |
| Secrets | None in the client bundle; configuration is injected through environment variables |

**Not covered (by design for this scope):** user authentication, per-room blocklists and persistent sessions. They are listed as future work in the README.

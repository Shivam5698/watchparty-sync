# 🎬 WatchParty Sync

Watch YouTube together, perfectly in sync. Create a room, share the link, and everyone sees the same video at the same moment, with **role-based control**, **live chat** and **emoji reactions**.

| | |
|---|---|
| 🌐 **Live app** |https://watchparty-sync.vercel.app |
| 🩺 **Backend health** |https://watchparty-sync-0782.onrender.com/health|
| 🎥 **Demo video** |https://drive.google.com/file/d/1YpNfhWCvlB-9d2dvmjfJlSHw_g8Pn1UE/view?usp=sharing |
| 💻 **Repository** |https://github.com/Shivam5698/watchparty-sync.git |

> ⏳ **Note:** the backend runs on a free hosting tier and sleeps when idle. The first request after a quiet period can take 30 to 60 seconds. Open the health link once before testing.

---

## Table of contents

- [Features](#features)
- [Roles and permissions](#roles-and-permissions)
- [Tech stack](#tech-stack)
- [Quick start (run locally)](#quick-start-run-locally)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [How synchronization works](#how-synchronization-works)
- [WebSocket events](#websocket-events)
- [Testing](#testing)
- [Deployment](#deployment)
- [Try it in two minutes](#try-it-in-two-minutes)
- [Known limitations and future work](#known-limitations-and-future-work)
- [Documentation](#documentation)

---

## Features

### Core (from the assignment)

- **Real-time sync**: play, pause, seek and change-video are mirrored to every participant over WebSockets
- **Rooms**: create a room and get a 6-character code and an invite link; join by code or link
- **YouTube IFrame API**: one embedded player per client, driven by the server's state
- **Role-based access control**: Host, Moderator and Participant, enforced on the backend
- **Host powers**: assign roles, remove participants, transfer host
- **Participant list** with live role badges

### Beyond the brief

- **Request and approve flow**: a Participant can request play, pause, seek or a new video; the Host or a Moderator approves or rejects it, and only then does it apply to everyone
- **Late joiners land in the right place**: the server computes the live playback position, so a new joiner starts where everyone else is
- **Resync**: a one-click resync button, plus automatic drift correction for viewers every 20 seconds
- **Live chat** with recent history for late joiners
- **Emoji reactions** that float over the video
- **Custom fullscreen** so chat and reactions stay visible while watching fullscreen
- **Reconnect handling**: automatic rejoin when the connection drops
- **Host continuity**: if the Host leaves, the next Moderator (or the longest-present Participant) becomes Host automatically

---

## Roles and permissions

| Action | Host | Moderator | Participant |
|---|:-:|:-:|:-:|
| Play / pause / seek / change video | ✅ | ✅ | ❌ (can request) |
| Approve or reject requests | ✅ | ✅ | ❌ |
| Assign roles | ✅ | ❌ | ❌ |
| Remove participants | ✅ | ❌ | ❌ |
| Transfer host | ✅ | ❌ | ❌ |
| Chat, react, resync | ✅ | ✅ | ✅ |

- The creator of a room is the Host. Joiners start as Participants.
- A room always has **exactly one Host**. Transferring host turns the previous Host into a Moderator.
- Every permission is checked **on the server** before an event is processed. Hiding buttons in the UI is a convenience, not security.

---

## Tech stack

| Layer | Technology | Used for |
|---|---|---|
| Frontend | React 18, TypeScript, Vite | UI, routing (React Router), state (Context) |
| Realtime | Socket.IO (client and server) | Bidirectional WebSocket communication, rooms, acknowledgements |
| Backend | Node.js, Express, TypeScript | HTTP health route, Socket.IO server, room logic |
| Video | YouTube IFrame Player API | Embedded, controllable player |
| Hosting | Vercel (frontend), Render (backend) | Public deployment |
| State | In memory on the server | Rooms, participants, video state, chat |

---

## Quick start (run locally)

**Prerequisites:** Node.js 18 or newer and npm.

```bash
# 1. Clone
git clone REPO_URL_HERE
cd watchparty-sync

# 2. Backend
cd server
cp .env.example .env
npm install
npm run dev            # http://localhost:4000

# 3. Frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev            # http://localhost:5173
```

Open `http://localhost:5173`, create a room, then open the invite link in a second (incognito) window to join as a Participant.

### Production build

```bash
cd server && npm run build && npm start
cd client && npm run build
```

---

## Environment variables

**Server** (`server/.env`)

| Variable | Example | Description |
|---|---|---|
| `PORT` | `4000` | Port to listen on (set automatically on most hosts) |
| `CLIENT_URL` | `http://localhost:5173` | Exact origin of the frontend, used for CORS. No trailing slash |

**Client** (`client/.env`)

| Variable | Example | Description |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:4000` | URL of the backend. Baked in at build time |

---

## Project structure

```
watchparty-sync/
├── client/                         React + TypeScript + Vite
│   ├── vercel.json                 SPA rewrite so /room/CODE links work on refresh
│   └── src/
│       ├── pages/                  HomePage, RoomPage (+ home.css)
│       ├── components/             VideoPlayer, TopBar, Sidebar, ChatBox, FloatingChat,
│       │                           ParticipantList, PendingRequests, RequestControls,
│       │                           ReactionBar, ReactionLayer, RoleBadge
│       ├── context/RoomContext.tsx Socket events, room state, actions, reconnect
│       ├── hooks/                  useYouTubePlayer, useRoom
│       ├── services/socket.ts      Single Socket.IO client instance
│       ├── utils/                  youtube.ts (URL parsing), permissions.ts
│       └── types/                  Shared TypeScript types
├── server/                         Node + Express + Socket.IO + TypeScript
│   ├── scripts/                    Integration test scripts (run with tsx)
│   └── src/
│       ├── server.ts, app.ts, socket.ts
│       ├── config/env.ts
│       ├── models/                 Room, Participant
│       ├── services/               RoomManager, PlaybackService, requestNotifier
│       ├── handlers/               RoomHandler, PlaybackHandler, RoleHandler,
│       │                           RequestHandler, ChatHandler, ReactionHandler, SyncHandler
│       ├── permissions/            rolePermissions.ts (role -> allowed actions)
│       ├── routes/                 health.routes.ts
│       ├── types/                  events.ts
│       └── utils/                  generateRoomCode.ts
└── docs/
    ├── architecture.md             How the system works, with diagrams
    └── decisions.md                What was decided and why
```

---

## How synchronization works

The **server is the single source of truth**. Clients never talk to each other; they send intents to the server, and the server decides.

1. A Host or Moderator presses pause. The client emits `pause { currentTime }`.
2. The server checks that the sender is in a room, that their role allows `pause`, and that the payload is valid.
3. The server updates the room's `VideoState` and broadcasts `sync_state` to the other participants.
4. Each client applies the state to its YouTube player. Echo is suppressed so applying a remote change does not trigger a new event, and small drift (under 1 second) is ignored.

For a late joiner, the server returns the current state in the join response. If the video is playing, it computes the live position as `storedTime + (now - updatedAt)`.

See [docs/architecture.md](docs/architecture.md) for sequence diagrams of every flow.

---

## WebSocket events

### Client to server

| Event | Payload | Who can send | Description |
|---|---|---|---|
| `create_room` | `{ username }` (ack) | Anyone | Create a room, become Host |
| `join_room` | `{ roomId, username }` (ack) | Anyone | Join as Participant |
| `leave_room` | none | Members | Leave the room |
| `play` / `pause` | `{ currentTime }` | Host, Moderator | Control playback |
| `seek` | `{ time }` | Host, Moderator | Jump to a time |
| `change_video` | `{ videoId }` | Host, Moderator | Load a different video |
| `assign_role` | `{ userId, role }` | Host | Set `moderator` or `participant` |
| `remove_participant` | `{ userId }` | Host | Remove a user |
| `transfer_host` | `{ userId }` | Host | Make another user the Host |
| `request_action` | `{ action, payload }` (ack) | Participant | Ask for a playback change |
| `resolve_request` | `{ requestId, approve }` | Host, Moderator | Approve or reject a request |
| `chat_message` | `{ text }` (ack) | Members | Send a chat message |
| `send_reaction` | `{ emoji }` | Members | Send an emoji reaction |
| `request_sync` | none (ack) | Members | Get the current video state |

### Server to client

| Event | Payload | Description |
|---|---|---|
| `user_joined` | `{ username, userId, role, participants }` | Someone joined |
| `user_left` | `{ username, userId, participants }` | Someone left |
| `sync_state` | `{ videoId, playState, currentTime, updatedAt }` | Apply this playback state |
| `role_assigned` | `{ userId, username, role, participants }` | A role changed |
| `participant_removed` | `{ userId, participants }` | Someone was removed |
| `host_transferred` | `{ fromUserId, toUserId, participants }` | Host changed (manual or automatic) |
| `requests_updated` | `{ requests }` | Pending requests list (Host and Moderators only) |
| `request_resolved` | `{ requestId, approved, action, byUsername }` | Result of your request |
| `chat_message` | `{ id, userId, username, role, text, timestamp }` | New chat message |
| `reaction` | `{ id, userId, username, emoji }` | Emoji reaction to display |
| `action_denied` | `{ action, message }` | Your action was rejected |

> **Deviation from the suggested spec:** `play` and `pause` carry the sender's `currentTime` instead of an empty payload. This keeps everyone aligned to the exact position at the moment of the action.

---

## Testing

Integration scripts in `server/scripts` drive the real Socket.IO server with simulated clients and print labeled results. Start the server first (`npm run dev`), then run:

```bash
cd server
npx tsx scripts/test-rooms.ts       # create, join, leave, errors
npx tsx scripts/test-playback.ts    # sync events, permissions, late-joiner time
npx tsx scripts/test-roles.ts       # assign, remove, transfer, host auto-promotion
npx tsx scripts/test-requests.ts    # request and approve flow, chat, history
```

Type checks and builds:

```bash
cd server && npm run build
cd client && npm run build
```

---

## Deployment

| Part | Platform | Settings |
|---|---|---|
| Backend | Render (Web Service) | Root `server` · Build `npm install --include=dev && npm run build` · Start `npm start` · Health check `/health` · Env `CLIENT_URL` |
| Frontend | Vercel | Root `client` · Framework Vite · Build `npm run build` · Output `dist` · Env `VITE_SERVER_URL` |

Notes:

- `--include=dev` is needed because TypeScript is a dev dependency and is required for the build step.
- `client/vercel.json` rewrites all routes to `index.html`, otherwise opening or refreshing `/room/CODE` would return a 404.
- `CLIENT_URL` must exactly match the deployed frontend origin (no trailing slash), or the browser will block requests with a CORS error.
- `VITE_SERVER_URL` is read at build time, so changing it requires a redeploy of the frontend.
- WebSockets work over `wss://` automatically when the backend URL is `https://`.

---

## Try it in two minutes

1. Open the live app in a normal window and create a room as **Alice** (Host).
2. Copy the invite link and open it in an incognito window or on your phone. Join as **Bob**.
3. As Alice, paste a YouTube link and press **Load video**. Both screens load it.
4. Play, pause and seek as Alice. Bob follows.
5. As Bob, try the **Request** controls. Alice sees the request in the **Requests** tab and approves it.
6. As Alice, open **People** and make Bob a **Moderator**. Bob's controls unlock instantly.
7. Send a few chat messages and reactions. Try **fullscreen**: chat and reactions still show.
8. Open the link on a third device and watch it join at the current position.

---

## Known limitations and future work

| Limitation | Why | Improvement |
|---|---|---|
| Rooms are lost when the server restarts or sleeps | State is in memory | Persist rooms in Redis or a database |
| Refreshing the page makes you a new participant (role resets to Participant) | User identity is the socket id | Persistent user id (local storage or auth) plus a reconnect grace period |
| A single server instance | In-memory state and local broadcasts | Socket.IO Redis adapter, sticky sessions, state in Redis (design in `docs/architecture.md`) |
| No authentication | Out of scope for the brief; join is username-based | Login with JWT or OAuth |
| Seek detection uses polling | The YouTube IFrame API has no seek event | Accept up to about 1 second of lag |
| A removed user can rejoin with the code | No per-room blocklist | Add a kick cooldown or blocklist |
| Browser autoplay rules may block remote play | Browser policy | Resync button, or a click to unlock audio |

---

## Documentation

- 🏗️ [Architecture](docs/architecture.md): components, data model, sequence diagrams, scaling design
- 🧭 [Decisions](docs/decisions.md): the key decisions and the reasoning behind each

---

## Author

**YOUR_NAME_HERE** · [LinkedIn](LINKEDIN_URL_HERE) · [GitHub](GITHUB_PROFILE_URL_HERE)

# Decisions

This document records the main decisions made while building WatchParty Sync, **why** each was made, and what was traded away. It is meant to make the codebase easy to explain and review.

Each decision follows the same shape: **Decision**, **Why**, **Trade-off**.

## Summary

| # | Area | Decision |
|---|---|---|
| 1 | Technology | Socket.IO instead of raw `ws` |
| 2 | Technology | TypeScript on both client and server |
| 3 | Technology | In-memory rooms, no database for the MVP |
| 4 | Architecture | Server is the single source of truth |
| 5 | Architecture | Object-oriented server (Room, Participant, RoomManager, handlers) |
| 6 | Security | One central permission table, enforced on the backend |
| 7 | Roles | Exactly one Host; transfer demotes to Moderator; auto-promotion on leave |
| 8 | Security | Strict input validation, allowlists and rate limits |
| 9 | Protocol | `play` and `pause` carry `currentTime` |
| 10 | Sync | Live position computed from `updatedAt`, no server timers |
| 11 | Sync | Sender excluded from broadcasts, except for approvals |
| 12 | Sync | Echo suppression and polling-based seek detection |
| 13 | Sync | Manual resync plus automatic drift correction |
| 14 | Roles | Request and approve flow for Participants |
| 15 | Protocol | Full-list snapshots for pending requests |
| 16 | Abuse | One pending request per user |
| 17 | Identity | `userId` is the socket id, with automatic rejoin on reconnect |
| 18 | UI | Theatre layout with a tabbed sidebar |
| 19 | UI | Custom fullscreen so chat and reactions overlay the video |
| 20 | UI | Participants blocked with an overlay, not by recreating the player |
| 21 | UI | Home page built with scoped CSS only, no external assets |
| 22 | Deployment | Vercel for the frontend, Render for the backend |
| 23 | Scope | No authentication, no persistence, Redis only as a design |
| 24 | Process | Phased build, regression scripts and small commits |

---

## Technology

### 1. Socket.IO instead of raw `ws`

- **Decision:** Use Socket.IO on both the server and the client.
- **Why:** The product needs rooms, broadcasting to a room, acknowledgements for request/response style calls (create, join, chat) and automatic reconnection. Socket.IO provides all of these over WebSockets, so none of it had to be hand-written. The assignment lists Socket.IO as an accepted choice.
- **Trade-off:** A slightly heavier protocol than raw WebSockets, and clients must also use Socket.IO. Acceptable for the speed and reliability gained.

### 2. TypeScript on both client and server

- **Decision:** React + TypeScript + Vite on the client, Node + Express + TypeScript on the server.
- **Why:** Event payloads (`sync_state`, `role_assigned` and others) are the contract between the two sides. Types catch mismatches at build time instead of at demo time. Vite gives fast development and a simple static build.
- **Trade-off:** The event types are mirrored by hand in both projects instead of shared through a package. Fine at this size; a shared package would be the next step.

### 3. In-memory rooms, no database for the MVP

- **Decision:** Keep rooms, participants, video state, requests and chat in server memory.
- **Why:** A watch room is short-lived, real-time state. The assignment marks the database as optional. In-memory state is the fastest and simplest option and keeps all sync logic in one place.
- **Trade-off:** Rooms are lost on restart or when the free host sleeps, and the server cannot be scaled horizontally as is. The scaling path (Redis) is documented in [architecture.md](architecture.md#11-scaling-design), and the storage sits behind `RoomManager` and `Room`, so it can be swapped later.

---

## Architecture and security

### 4. Server is the single source of truth

- **Decision:** Clients never message each other and never trust their own state. They send intents, the server validates and updates the room, and then broadcasts the result.
- **Why:** With many clients, any client-owned state would drift or conflict. One owner makes behaviour predictable and makes permissions enforceable.
- **Trade-off:** Every action makes a round trip to the server, which adds a small delay.

### 5. Object-oriented server structure

- **Decision:** `Room`, `Participant`, `RoomManager`, and one handler class per area (`RoomHandler`, `PlaybackHandler`, `RoleHandler`, `RequestHandler`, `ChatHandler`, `ReactionHandler`, `SyncHandler`).
- **Why:** Each class has a single job, which keeps files small, makes behaviour easy to find, and matches the assignment's OOP bonus. Shared logic (validation and applying a playback action) lives in `PlaybackService`, so direct control and approved requests cannot behave differently.
- **Trade-off:** More files than a single-file server, in exchange for clarity and testability.

### 6. One permission table, enforced on the backend

- **Decision:** `rolePermissions.ts` maps each role to its allowed actions, and every state-changing handler calls `can(role, action)` before doing anything.
- **Why:** The assignment requires the backend to validate permissions. A single table means a permission is defined once and cannot be forgotten in one handler. The UI hides controls for usability, but a client that bypasses the UI is still rejected.
- **Trade-off:** Chat, reactions and resync are deliberately open to all roles and are not part of the table.

### 7. Exactly one Host, with a predictable lifecycle

- **Decision:** A room always has one Host. `assign_role` can only set `moderator` or `participant`; `transfer_host` is a separate action that turns the old Host into a Moderator. If the Host leaves, the next Moderator (otherwise the longest-present Participant) becomes Host automatically.
- **Why:** A room without a Host would be uncontrollable, and two Hosts would conflict. Making the previous Host a Moderator avoids suddenly stripping their control after a handover.
- **Trade-off:** Host selection on departure is automatic, so the group does not get to choose the new Host.

### 8. Validate and limit all input

- **Decision:** Strict validation on the server for every event: finite non-negative times, an 11-character video id pattern, trimmed and length-limited names, and chat limited to 1 to 300 characters. Reactions use an allowlist of emojis. Chat and reactions are rate limited.
- **Why:** Clients cannot be trusted. Limits protect against malformed data and spam, and rendering text as plain text in React avoids script injection.
- **Trade-off:** A few legitimate edge cases are rejected (for example, very long chat messages).

---

## Synchronization

### 9. `play` and `pause` carry `currentTime`

- **Decision:** These events send the sender's current position, instead of the empty payload suggested in the assignment.
- **Why:** The server cannot know the exact position of the sender's player at the moment of the click. Sending it keeps everyone aligned to the same moment.
- **Trade-off:** A deliberate deviation from the suggested payload, so the sender's reported time is trusted (only Host and Moderators can send it).

### 10. Live position computed from `updatedAt`, no server timers

- **Decision:** The server stores `currentTime` and `updatedAt`. When playing, the live position is `currentTime + (now - updatedAt)`.
- **Why:** A late joiner needs the right position without the server running a ticking clock per room. This is cheap, exact enough, and needs no background work.
- **Trade-off:** Accuracy depends on the server clock only (not client clocks), and on the sender's reported time at the moment of the last change.

### 11. Sender excluded from broadcasts, except approvals

- **Decision:** Playback changes are sent to the *other* sockets in the room. When a request is approved, `sync_state` goes to *everyone*, including the approver.
- **Why:** The sender's player already reflects its own action, so echoing it back could create loops. An approver's player has not changed, so it needs the update.
- **Trade-off:** Two slightly different broadcast paths to understand.

### 12. Echo suppression and polling for seek detection

- **Decision:** When remote state is applied, a suppress flag (about 1.2 seconds) stops the player's own events from being re-sent. Seeks are detected by polling the player's time every 500 ms and flagging jumps larger than 1.5 seconds. Drift under 1 second is ignored when applying state.
- **Why:** The YouTube IFrame API fires events for programmatic changes and has no seek event. Without these measures, clients would trigger each other in loops, or seeks would never be detected.
- **Trade-off:** Seeks can lag by up to about a second, and the thresholds are tuned values rather than guarantees.

### 13. Manual resync and automatic drift correction

- **Decision:** A resync button asks the server for the current state. Viewers who cannot control playback also resync automatically every 20 seconds while their tab is visible.
- **Why:** Browser throttling, autoplay rules and network lag can leave a viewer behind. A cheap correction path keeps everyone close without extra server load.
- **Trade-off:** One small request per viewer every 20 seconds.

---

## Roles, requests and identity

### 14. Request and approve flow for Participants

- **Decision:** The assignment says participants must request an admin or moderator to approve changes. This was implemented as: a Participant sends `request_action` (play, pause, seek or change video); Host and Moderators see it and approve or reject; only approval applies the change for everyone.
- **Why:** It follows the stated requirement while keeping the permission model clean: Participants still cannot perform playback actions directly.
- **Trade-off:** The wording of the requirement is ambiguous, so this interpretation is documented here and in the README.

### 15. Full-list snapshots for pending requests

- **Decision:** Whenever the list changes, the server sends the complete list (`requests_updated`) to Host and Moderators, rather than sending individual add and remove events.
- **Why:** A newly promoted Moderator sees existing requests immediately, and clients can never get out of sync from a missed event.
- **Trade-off:** Slightly more data per update, which is negligible for a short list.

### 16. One pending request per user

- **Decision:** A Participant can have only one open request at a time, and it is removed if they leave.
- **Why:** Prevents request spam and keeps the moderation list manageable.
- **Trade-off:** A user must wait for a decision before asking for something else.

### 17. `userId` is the socket id, with automatic rejoin

- **Decision:** A participant's identity is their Socket.IO id. If the connection drops, the client rejoins the room automatically with the saved room code and username.
- **Why:** It is the simplest identity that works without accounts, and it fit the time available. Automatic rejoin covers brief network drops.
- **Trade-off:** A refresh or reconnect creates a new participant, so a Moderator comes back as a Participant. The proper fix is a persistent user id plus a reconnect grace period, listed as future work.

---

## User interface

### 18. Theatre layout with a tabbed sidebar

- **Decision:** A large video area, with Chat, People and Requests as tabs in a collapsible sidebar. Tabs show badges for unread messages and pending requests.
- **Why:** Reference products (Teleparty, Watch2Gether) showed that the video should dominate and chat should not shrink it. The earlier layout stacked three cards and made the video too small. Tabs also keep each concern separate and uncluttered.
- **Trade-off:** One extra click to switch between chat and people.

### 19. Custom fullscreen so chat and reactions overlay the video

- **Decision:** Disable the YouTube player's own fullscreen button and fullscreen the surrounding wrapper instead. Inside it, render floating chat, reactions, notices and a small control dock.
- **Why:** The native button only fullscreens the iframe, which would hide anything rendered on top of it. Fullscreening the wrapper keeps the social features visible, like Google Meet.
- **Trade-off:** The browser's Esc key always exits fullscreen, so closing the chat input with Esc is best effort.

### 20. Participants are blocked with an overlay, not by recreating the player

- **Decision:** A transparent overlay prevents clicks on the player for users who cannot control playback. Control rights come from the role in state.
- **Why:** When a role changes, the overlay appears or disappears instantly. The YouTube player does not need to be destroyed and rebuilt, which would reset playback.
- **Trade-off:** The overlay is a usability measure only; real enforcement is on the server.

### 21. Home page built with scoped CSS only

- **Decision:** A cinematic "poster wall" background made entirely of CSS gradients and emoji, with all styles in a separate `home.css` scoped under `.home-root`. No images, fonts or libraries were added.
- **Why:** An earlier restyle of global CSS broke other screens. Scoping every selector makes the page impossible to affect anything else, and avoiding external assets avoids licensing, loading time and hosting issues. Animations only use `transform` and are disabled for users who prefer reduced motion.
- **Trade-off:** The posters are stylised placeholders, not real artwork.

---

## Deployment and scope

### 22. Vercel for the frontend, Render for the backend

- **Decision:** Static React build on Vercel; Node and Socket.IO server on Render.
- **Why:** Each platform does what it is best at. Vercel serves static files globally; Render supports long-lived WebSocket connections. Configuration is through environment variables (`VITE_SERVER_URL`, `CLIENT_URL`, `PORT`). A rewrite in `vercel.json` makes `/room/CODE` links work on refresh. The build uses `npm install --include=dev` because TypeScript is a dev dependency.
- **Trade-off:** Two services to configure, and the free backend sleeps when idle, so the first request can be slow. CORS requires `CLIENT_URL` to match the frontend origin exactly.

### 23. Scope kept deliberate: no auth, no persistence, Redis as a design

- **Decision:** Authentication, database persistence and a Redis-backed multi-node setup were left out of the implementation. Scaling is covered as a design in the architecture document.
- **Why:** The assignment lists them as bonus items, the core flow is username-based, and adding them late would have put the working core at risk. A smaller, solid, well-tested product is better than a larger, fragile one.
- **Trade-off:** See the limitations table in the README. The code is structured so each can be added later (storage behind `RoomManager`, identity as a separate concern).

---

## Process

### 24. Built in phases, tested at each step, and committed often

- **Decision:** Work was split into small phases (setup, rooms, playback sync, roles, requests and chat, UI, reactions, deployment). Backend features were tested with scripted clients before any UI existed, and earlier scripts were re-run after refactors. Risky UI work was done on a separate branch with small, scoped changes.
- **Why:** Many failures in real-time apps are subtle. Testing the protocol on its own first made UI bugs easy to isolate, and frequent commits meant any bad change could be rolled back in one step.
- **Trade-off:** A little more setup time per feature, repaid by fewer regressions.

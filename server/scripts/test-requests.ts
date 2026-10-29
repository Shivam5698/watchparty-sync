import { io, type Socket } from "socket.io-client";

const serverUrl = "http://localhost:4000";

interface Participant {
  userId: string;
  username: string;
  role: string;
}

interface PlaybackRequest {
  id: string;
  userId: string;
  action: "play" | "pause" | "seek" | "change_video";
  payload: { currentTime?: number; time?: number; videoId?: string };
}

interface RoomAck {
  ok: boolean;
  error?: string;
  roomId?: string;
  requestId?: string;
  chatHistory?: ChatMessage[];
}

interface RequestsUpdated {
  requests: PlaybackRequest[];
}

interface RequestResolved {
  requestId: string;
  approved: boolean;
  action: string;
  byUsername: string;
}

interface VideoState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
  updatedAt: number;
}

interface ActionDenied {
  action: string;
  message: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: string;
  text: string;
  timestamp: number;
}

function connect(socket: Socket, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`[${name}] Connection timed out`));
    }, 5000);

    const onConnect = () => {
      cleanup();
      console.log(`[${name}] Connected (${socket.id})`);
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  });
}

function emitWithAck(
  socket: Socket,
  name: string,
  event: string,
  payload: object,
): Promise<RoomAck> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`[${name}] ${event} acknowledgement timed out`)),
      5000,
    );

    socket.emit(event, payload, (ack: RoomAck) => {
      clearTimeout(timeout);
      resolve(ack);
    });
  });
}

function waitForEvent<T>(
  socket: Socket,
  name: string,
  eventName: string,
  matches: (payload: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`[${name}] Timed out waiting for ${eventName}`));
    }, 5000);

    const onEvent = (payload: T) => {
      if (!matches(payload)) {
        return;
      }

      cleanup();
      resolve(payload);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(eventName, onEvent);
    };

    socket.on(eventName, onEvent);
  });
}

function trackEvents(socket: Socket, name: string) {
  const counts = new Map<string, number>();
  const eventNames = [
    "requests_updated",
    "request_resolved",
    "sync_state",
    "action_denied",
    "chat_message",
  ];

  for (const eventName of eventNames) {
    socket.on(eventName, (payload: unknown) => {
      counts.set(eventName, (counts.get(eventName) ?? 0) + 1);
      console.log(`[${name}] ${eventName}:`, payload);
    });
  }

  return {
    count: (eventName: string) => counts.get(eventName) ?? 0,
    disconnect: () => {
      for (const eventName of eventNames) {
        socket.off(eventName);
      }
    },
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function expectSuccess(ack: RoomAck, context: string): void {
  assert(ack.ok, `${context}: expected success, got "${ack.error}"`);
}

function expectError(ack: RoomAck, fragment: string, context: string): void {
  assert(
    !ack.ok && Boolean(ack.error?.includes(fragment)),
    `${context}: expected error containing "${fragment}", got "${ack.error}"`,
  );
}

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(): Promise<void> {
  const alice = io(serverUrl, { autoConnect: false });
  const bob = io(serverUrl, { autoConnect: false });
  const charlie = io(serverUrl, { autoConnect: false });
  const dave = io(serverUrl, { autoConnect: false });
  const clients = [alice, bob, charlie, dave];
  const trackers = [
    trackEvents(alice, "Alice"),
    trackEvents(bob, "Bob"),
    trackEvents(charlie, "Charlie"),
    trackEvents(dave, "Dave"),
  ];

  try {
    await Promise.all([
      connect(alice, "Alice"),
      connect(bob, "Bob"),
      connect(charlie, "Charlie"),
    ]);

    const createAck = await emitWithAck(alice, "Alice", "create_room", {
      username: "Alice",
    });
    expectSuccess(createAck, "Alice create_room");
    const roomId = requireValue(createAck.roomId, "Room creation returned no room id");

    for (const [client, name] of [
      [bob, "Bob"],
      [charlie, "Charlie"],
    ] as const) {
      const joinAck = await emitWithAck(client, name, "join_room", {
        roomId,
        username: name,
      });
      expectSuccess(joinAck, `${name} join_room`);
    }

    const aliceInitialUpdate = waitForEvent<RequestsUpdated>(
      alice,
      "Alice",
      "requests_updated",
      (event) => event.requests.length === 1,
    );
    const firstRequest = await emitWithAck(bob, "Bob", "request_action", {
      action: "change_video",
      payload: { videoId: "dQw4w9WgXcQ" },
    });
    expectSuccess(firstRequest, "Bob change_video request");
    const firstRequestId = requireValue(
      firstRequest.requestId,
      "Successful request returned no request id",
    );
    const initialList = await aliceInitialUpdate;
    assert(
      initialList.requests[0]?.id === firstRequestId,
      "Alice received a different request than Bob submitted",
    );
    await delay(150);
    assert(
      trackers[2].count("requests_updated") === 0,
      "Charlie unexpectedly received requests_updated",
    );

    const duplicateRequest = await emitWithAck(bob, "Bob", "request_action", {
      action: "pause",
      payload: { currentTime: 20 },
    });
    expectError(
      duplicateRequest,
      "already have a pending request",
      "Bob duplicate request",
    );

    const syncAfterApproval = [alice, bob, charlie].map((client, index) =>
      waitForEvent<VideoState>(
        client,
        ["Alice", "Bob", "Charlie"][index],
        "sync_state",
        (state) => state.videoId === "dQw4w9WgXcQ",
      ),
    );
    const bobFirstResolved = waitForEvent<RequestResolved>(
      bob,
      "Bob",
      "request_resolved",
      (event) =>
        event.requestId === firstRequestId && event.approved,
    );
    const emptyRequests = waitForEvent<RequestsUpdated>(
      alice,
      "Alice",
      "requests_updated",
      (event) => event.requests.length === 0,
    );
    alice.emit("resolve_request", {
      requestId: firstRequestId,
      approve: true,
    });
    await Promise.all([
      ...syncAfterApproval,
      bobFirstResolved,
      emptyRequests,
    ]);

    const pauseRequest = await emitWithAck(bob, "Bob", "request_action", {
      action: "pause",
      payload: { currentTime: 20 },
    });
    expectSuccess(pauseRequest, "Bob pause request");
    const pauseRequestId = requireValue(
      pauseRequest.requestId,
      "Pause request returned no request id",
    );
    await waitForEvent<RequestsUpdated>(
      alice,
      "Alice",
      "requests_updated",
      (event) => event.requests.some((request) => request.id === pauseRequestId),
    );
    const syncCountsBeforeDecline = trackers.map((tracker) =>
      tracker.count("sync_state"),
    );
    const bobDeclined = waitForEvent<RequestResolved>(
      bob,
      "Bob",
      "request_resolved",
      (event) =>
        event.requestId === pauseRequestId && !event.approved,
    );
    alice.emit("resolve_request", {
      requestId: pauseRequestId,
      approve: false,
    });
    await bobDeclined;
    await delay(150);
    assert(
      trackers.every(
        (tracker, index) =>
          tracker.count("sync_state") === syncCountsBeforeDecline[index],
      ),
      "Declining a request unexpectedly emitted sync_state",
    );

    const hostRequest = await emitWithAck(alice, "Alice", "request_action", {
      action: "play",
      payload: { currentTime: 5 },
    });
    expectError(hostRequest, "can already control", "Alice playback request");

    const seekRequest = await emitWithAck(bob, "Bob", "request_action", {
      action: "seek",
      payload: { time: 40 },
    });
    expectSuccess(seekRequest, "Bob seek request");
    const seekRequestId = requireValue(
      seekRequest.requestId,
      "Seek request returned no request id",
    );
    await waitForEvent<RequestsUpdated>(
      alice,
      "Alice",
      "requests_updated",
      (event) => event.requests.some((request) => request.id === seekRequestId),
    );

    const charlieDenied = waitForEvent<ActionDenied>(
      charlie,
      "Charlie",
      "action_denied",
      (event) => event.action === "resolve_request",
    );
    charlie.emit("resolve_request", {
      requestId: seekRequestId,
      approve: true,
    });
    await charlieDenied;

    const charlieRoleUpdate = waitForEvent<RequestsUpdated>(
      charlie,
      "Charlie",
      "requests_updated",
      (event) => event.requests.some((request) => request.id === seekRequestId),
    );
    alice.emit("assign_role", {
      userId: charlie.id,
      role: "moderator",
    });
    const charlieRequests = await charlieRoleUpdate;
    assert(
      charlieRequests.requests[0]?.id === seekRequestId,
      "Charlie did not receive Bob's seek request after promotion",
    );

    const syncAfterSeek = [alice, bob, charlie].map((client, index) =>
      waitForEvent<VideoState>(
        client,
        ["Alice", "Bob", "Charlie"][index],
        "sync_state",
        (state) => state.videoId === "dQw4w9WgXcQ" && state.currentTime >= 40,
      ),
    );
    charlie.emit("resolve_request", {
      requestId: seekRequestId,
      approve: true,
    });
    await Promise.all(syncAfterSeek);

    const pendingPlay = await emitWithAck(bob, "Bob", "request_action", {
      action: "play",
      payload: { currentTime: 5 },
    });
    expectSuccess(pendingPlay, "Bob play request");
    const pendingPlayId = requireValue(
      pendingPlay.requestId,
      "Play request returned no request id",
    );
    assert(pendingPlayId.length > 0, "Play request returned an empty request id");
    const noRequests = waitForEvent<RequestsUpdated>(
      alice,
      "Alice",
      "requests_updated",
      (event) => event.requests.length === 0,
    );
    bob.disconnect();
    await noRequests;

    await connect(dave, "Dave");
    const aliceChat = waitForEvent<ChatMessage>(
      alice,
      "Alice",
      "chat_message",
      (message) => message.text === "hello",
    );
    const charlieChat = waitForEvent<ChatMessage>(
      charlie,
      "Charlie",
      "chat_message",
      (message) => message.text === "hello",
    );
    const chatAck = await emitWithAck(charlie, "Charlie", "chat_message", {
      text: "hello",
    });
    expectSuccess(chatAck, "Charlie chat message");
    await Promise.all([aliceChat, charlieChat]);

    const emptyChat = await emitWithAck(charlie, "Charlie", "chat_message", {
      text: "   ",
    });
    expectError(emptyChat, "1-300 characters", "Empty chat message");

    const daveJoin = await emitWithAck(dave, "Dave", "join_room", {
      roomId,
      username: "Dave",
    });
    expectSuccess(daveJoin, "Dave join_room");
    assert(
      Boolean(daveJoin.chatHistory?.some((message) => message.text === "hello")),
      "Dave's join acknowledgement did not contain the chat history",
    );

    console.log("[Test] Request and chat flow passed");
  } finally {
    clients.forEach((client) => client.disconnect());
    trackers.forEach((tracker) => tracker.disconnect());
    console.log("[Test] Disconnected all clients");
  }
}

main().catch((error: unknown) => {
  console.error("[Test] Request flow failed:", error);
  process.exitCode = 1;
});

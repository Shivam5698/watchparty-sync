import { io, type Socket } from "socket.io-client";

const serverUrl = "http://localhost:4000";

interface ParticipantDTO {
  userId: string;
  username: string;
  role: string;
}

interface RoomAck {
  ok: boolean;
  error?: string;
  roomId?: string;
  participants?: ParticipantDTO[];
}

interface ActionDeniedEvent {
  action: string;
  message: string;
}

interface ParticipantsEvent {
  participants: ParticipantDTO[];
  userId?: string;
  fromUserId?: string;
  toUserId?: string;
  role?: string;
}

interface VideoState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
  updatedAt: number;
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

function logEvents(socket: Socket, name: string): void {
  for (const eventName of [
    "role_assigned",
    "participant_removed",
    "host_transferred",
    "user_left",
    "sync_state",
    "action_denied",
  ]) {
    socket.on(eventName, (payload: unknown) =>
      console.log(`[${name}] ${eventName}:`, payload),
    );
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function hasRole(
  participants: ParticipantDTO[],
  userId: string | undefined,
  role: string,
): boolean {
  return participants.some(
    (participant) => participant.userId === userId && participant.role === role,
  );
}

async function main(): Promise<void> {
  const alice = io(serverUrl, { autoConnect: false });
  const bob = io(serverUrl, { autoConnect: false });
  const charlie = io(serverUrl, { autoConnect: false });
  const clients = [alice, bob, charlie];
  logEvents(alice, "Alice");
  logEvents(bob, "Bob");
  logEvents(charlie, "Charlie");

  try {
    await Promise.all([
      connect(alice, "Alice"),
      connect(bob, "Bob"),
      connect(charlie, "Charlie"),
    ]);

    const createAck = await emitWithAck(alice, "Alice", "create_room", {
      username: "Alice",
    });
    assert(
      createAck.ok && Boolean(createAck.roomId),
      "Alice could not create a room",
    );
    const roomId = createAck.roomId;

    const bobJoin = await emitWithAck(bob, "Bob", "join_room", {
      roomId,
      username: "Bob",
    });
    assert(bobJoin.ok, "Bob could not join the room");
    const charlieJoin = await emitWithAck(charlie, "Charlie", "join_room", {
      roomId,
      username: "Charlie",
    });
    assert(charlieJoin.ok, "Charlie could not join the room");
    console.log("[Test] Alice, Bob, and Charlie joined room", roomId);

    const bobAssignDenied = waitForEvent<ActionDeniedEvent>(
      bob,
      "Bob",
      "action_denied",
      (event) => event.action === "assign_role",
    );
    bob.emit("assign_role", { userId: charlie.id, role: "moderator" });
    await bobAssignDenied;

    const roleAssigned = [alice, bob, charlie].map((client, index) =>
      waitForEvent<ParticipantsEvent>(
        client,
        ["Alice", "Bob", "Charlie"][index],
        "role_assigned",
        (event) => event.userId === bob.id && event.role === "moderator",
      ),
    );
    alice.emit("assign_role", { userId: bob.id, role: "moderator" });
    const assignedEvents = await Promise.all(roleAssigned);
    assert(
      assignedEvents.every((event) => hasRole(event.participants, bob.id, "moderator")),
      "Bob was not listed as a moderator for every client",
    );

    const aliceVideoSync = waitForEvent<VideoState>(
      alice,
      "Alice",
      "sync_state",
      (state) => state.videoId === "dQw4w9WgXcQ",
    );
    const charlieVideoSync = waitForEvent<VideoState>(
      charlie,
      "Charlie",
      "sync_state",
      (state) => state.videoId === "dQw4w9WgXcQ",
    );
    bob.emit("change_video", { videoId: "dQw4w9WgXcQ" });
    await Promise.all([aliceVideoSync, charlieVideoSync]);

    const moderatorAssignDenied = waitForEvent<ActionDeniedEvent>(
      bob,
      "Bob",
      "action_denied",
      (event) => event.action === "assign_role",
    );
    bob.emit("assign_role", { userId: charlie.id, role: "participant" });
    await moderatorAssignDenied;

    const invalidRoleDenied = waitForEvent<ActionDeniedEvent>(
      alice,
      "Alice",
      "action_denied",
      (event) => event.action === "assign_role",
    );
    alice.emit("assign_role", { userId: charlie.id, role: "host" });
    await invalidRoleDenied;

    const selfAssignDenied = waitForEvent<ActionDeniedEvent>(
      alice,
      "Alice",
      "action_denied",
      (event) => event.action === "assign_role",
    );
    alice.emit("assign_role", { userId: alice.id, role: "moderator" });
    await selfAssignDenied;

    const demotion = [alice, bob, charlie].map((client, index) =>
      waitForEvent<ParticipantsEvent>(
        client,
        ["Alice", "Bob", "Charlie"][index],
        "role_assigned",
        (event) => event.userId === bob.id && event.role === "participant",
      ),
    );
    alice.emit("assign_role", { userId: bob.id, role: "participant" });
    await Promise.all(demotion);

    const participantPlayDenied = waitForEvent<ActionDeniedEvent>(
      bob,
      "Bob",
      "action_denied",
      (event) => event.action === "play",
    );
    bob.emit("play", { currentTime: 3 });
    await participantPlayDenied;

    const removalEvents = [alice, bob, charlie].map((client, index) =>
      waitForEvent<ParticipantsEvent>(
        client,
        ["Alice", "Bob", "Charlie"][index],
        "participant_removed",
        (event) => event.userId === charlie.id,
      ),
    );
    alice.emit("remove_participant", { userId: charlie.id });
    const removed = await Promise.all(removalEvents);
    assert(
      removed.every(
        (event) => !event.participants.some((participant) => participant.userId === charlie.id),
      ),
      "Charlie remained in a participant_removed list",
    );

    const transferEvents = [alice, bob].map((client, index) =>
      waitForEvent<ParticipantsEvent>(
        client,
        ["Alice", "Bob"][index],
        "host_transferred",
        (event) => event.fromUserId === alice.id && event.toUserId === bob.id,
      ),
    );
    alice.emit("transfer_host", { userId: bob.id });
    const transferred = await Promise.all(transferEvents);
    assert(
      transferred.every((event) => hasRole(event.participants, bob.id, "host")),
      "Bob was not listed as host after transfer",
    );

    const formerHostDenied = waitForEvent<ActionDeniedEvent>(
      alice,
      "Alice",
      "action_denied",
      (event) => event.action === "assign_role",
    );
    alice.emit("assign_role", { userId: bob.id, role: "moderator" });
    await formerHostDenied;

    const disconnectedBobId = bob.id;
    assert(Boolean(disconnectedBobId), "Bob has no socket id before disconnecting");
    const bobLeft = waitForEvent<ParticipantsEvent>(
      alice,
      "Alice",
      "user_left",
      (event) => event.userId === disconnectedBobId,
    );
    const hostPromoted = waitForEvent<ParticipantsEvent>(
      alice,
      "Alice",
      "host_transferred",
      (event) =>
        event.fromUserId === disconnectedBobId && event.toUserId === alice.id,
    );
    bob.disconnect();
    const [leftEvent, promotedEvent] = await Promise.all([bobLeft, hostPromoted]);
    assert(
      hasRole(leftEvent.participants, alice.id, "host") &&
        hasRole(promotedEvent.participants, alice.id, "host"),
      "Alice was not listed as host after Bob disconnected",
    );

    console.log("[Test] Role and host-management flow passed");
  } finally {
    clients.forEach((client) => client.disconnect());
    console.log("[Test] Disconnected all clients");
  }
}

main().catch((error: unknown) => {
  console.error("[Test] Role flow failed:", error);
  process.exitCode = 1;
});

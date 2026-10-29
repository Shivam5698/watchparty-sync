import { io, type Socket } from "socket.io-client";

const serverUrl = "http://localhost:4000";

interface VideoState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
  updatedAt: number;
}

type RoomAck =
  | {
      ok: true;
      roomId: string;
      userId: string;
      role: string;
      participants: unknown[];
      videoState?: VideoState;
    }
  | { ok: false; error: string };

interface DeniedEvent {
  action: string;
  message: string;
}

function connect(socket: Socket, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} connection timed out`));
    }, 5000);

    const onConnect = () => {
      cleanup();
      console.log(`[${label}] Connected (${socket.id})`);
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
  event: string,
  payload: object,
): Promise<RoomAck> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${event} acknowledgement timed out`)),
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
  eventName: string,
  label: string,
  matches: (payload: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`[${label}] Timed out waiting for ${eventName}`));
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

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const alice = io(serverUrl, { autoConnect: false });
  const bob = io(serverUrl, { autoConnect: false });
  const charlie = io(serverUrl, { autoConnect: false });
  const clients = [alice, bob, charlie];

  for (const [label, client] of [
    ["Alice", alice],
    ["Bob", bob],
  ] as const) {
    client.on("sync_state", (state: VideoState) =>
      console.log(`[${label}] sync_state:`, state),
    );
    client.on("action_denied", (event: DeniedEvent) =>
      console.log(`[${label}] action_denied:`, event),
    );
  }
  charlie.on("sync_state", (state: VideoState) =>
    console.log("[Charlie] sync_state:", state),
  );
  charlie.on("action_denied", (event: DeniedEvent) =>
    console.log("[Charlie] action_denied:", event),
  );

  try {
    await Promise.all([connect(alice, "Alice"), connect(bob, "Bob")]);

    const createAck = await emitWithAck(alice, "create_room", {
      username: "Alice",
    });
    console.log("[Alice] create_room ack:", createAck);
    assert(createAck.ok, "Alice could not create a room");

    const joinAck = await emitWithAck(bob, "join_room", {
      roomId: createAck.roomId,
      username: "Bob",
    });
    console.log("[Bob] join_room ack:", joinAck);
    assert(joinAck.ok, "Bob could not join the room");

    const bobDeniedPlay = waitForEvent<DeniedEvent>(
      bob,
      "action_denied",
      "Bob",
      (event) => event.action === "play",
    );
    bob.emit("play", { currentTime: 5 });
    const deniedPlay = await bobDeniedPlay;
    assert(
      deniedPlay.message === "You don't have permission to do this",
      "Bob's play action was not denied as expected",
    );

    const videoChanged = waitForEvent<VideoState>(
      bob,
      "sync_state",
      "Bob",
      (state) =>
        state.videoId === "dQw4w9WgXcQ" &&
        state.playState === "playing" &&
        state.currentTime === 0,
    );
    alice.emit("change_video", { videoId: "dQw4w9WgXcQ" });
    await videoChanged;

    const sought = waitForEvent<VideoState>(
      bob,
      "sync_state",
      "Bob",
      (state) => state.currentTime >= 50 && state.currentTime < 51,
    );
    alice.emit("seek", { time: 50 });
    await sought;

    alice.emit("play", { currentTime: 10 });
    console.log("[Alice] Emitted play at 10 seconds");
    await delay(2000);

    await connect(charlie, "Charlie");
    const charlieJoinAck = await emitWithAck(charlie, "join_room", {
      roomId: createAck.roomId,
      username: "Charlie",
    });
    console.log("[Charlie] join_room ack:", charlieJoinAck);
    assert(charlieJoinAck.ok, "Charlie could not join the room");
    assert(
      charlieJoinAck.videoState !== undefined,
      "Charlie's join ack has no video state",
    );
    assert(
      charlieJoinAck.videoState.currentTime >= 11.5 &&
        charlieJoinAck.videoState.currentTime <= 15,
      `Expected Charlie's playback time near 12 seconds, got ${charlieJoinAck.videoState.currentTime}`,
    );

    const paused = waitForEvent<VideoState>(
      bob,
      "sync_state",
      "Bob",
      (state) => state.playState === "paused" && state.currentTime === 55,
    );
    alice.emit("pause", { currentTime: 55 });
    await paused;

    const invalidVideoDenied = waitForEvent<DeniedEvent>(
      alice,
      "action_denied",
      "Alice",
      (event) => event.action === "change_video",
    );
    alice.emit("change_video", { videoId: "bad" });
    const deniedVideo = await invalidVideoDenied;
    assert(deniedVideo.message === "Invalid data", "Invalid video was not rejected");
  } finally {
    clients.forEach((client) => client.disconnect());
    console.log("[Test] Disconnected all clients");
  }
}

main().catch((error: unknown) => {
  console.error("[Test] Playback flow failed:", error);
  process.exitCode = 1;
});

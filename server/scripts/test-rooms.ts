import { io, type Socket } from "socket.io-client";

const serverUrl = "http://localhost:4000";

type RoomAck =
  | {
      ok: true;
      roomId: string;
      userId: string;
      role: string;
      participants: unknown[];
      videoState?: unknown;
    }
  | { ok: false; error: string };

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

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(): Promise<void> {
  const clientA = io(serverUrl, { autoConnect: false });
  const clientB = io(serverUrl, { autoConnect: false });
  const clientC = io(serverUrl, { autoConnect: false });
  const clients = [clientA, clientB, clientC];

  clientA.on("user_joined", (event) =>
    console.log("[Client A] user_joined:", event),
  );
  clientA.on("user_left", (event) =>
    console.log("[Client A] user_left:", event),
  );

  try {
    await Promise.all([
      connect(clientA, "Client A"),
      connect(clientB, "Client B"),
      connect(clientC, "Temporary Client C"),
    ]);

    const createAck = await emitWithAck(clientA, "create_room", {
      username: "Alice",
    });
    console.log("[Client A] create_room ack:", createAck);
    if (!createAck.ok) {
      throw new Error(`Room creation failed: ${createAck.error}`);
    }

    const joinAck = await emitWithAck(clientB, "join_room", {
      roomId: createAck.roomId,
      username: "Bob",
    });
    console.log("[Client B] join_room ack:", joinAck);
    if (!joinAck.ok) {
      throw new Error(`Room join failed: ${joinAck.error}`);
    }

    const invalidJoinAck = await emitWithAck(clientC, "join_room", {
      roomId: "WRONG1",
      username: "Temp",
    });
    console.log("[Temporary Client C] join_room WRONG1 ack:", invalidJoinAck);

    clientB.emit("leave_room");
    console.log("[Client B] Emitted leave_room");

    await delay(1000);
  } finally {
    clients.forEach((client) => client.disconnect());
    console.log("[Test] Disconnected all clients");
  }
}

main().catch((error: unknown) => {
  console.error("[Test] Room flow failed:", error);
  process.exitCode = 1;
});

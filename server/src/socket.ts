import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "./config/env";
import { PlaybackHandler } from "./handlers/PlaybackHandler";
import { RoomHandler } from "./handlers/RoomHandler";

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    new RoomHandler(io, socket).register();
    new PlaybackHandler(io, socket).register();

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { socket } from "../services/socket";
import type { Participant, Role, RoomInfo, VideoState } from "../types";

type RoomAck<T> = ({ ok: true } & T) | { ok: false; error: string };

interface RoomResponse {
  roomId: string;
  userId: string;
  role: Role;
  participants: Participant[];
}

interface JoinRoomResponse extends RoomResponse {
  videoState: VideoState;
}

interface RoomEventPayload {
  participants: Participant[];
}

interface RoomContextValue {
  connected: boolean;
  room: RoomInfo | null;
  createRoom: (username: string) => Promise<string>;
  joinRoom: (roomId: string, username: string) => Promise<void>;
  leaveRoom: () => void;
}

export const RoomContext = createContext<RoomContextValue | undefined>(
  undefined,
);

interface RoomProviderProps {
  children: ReactNode;
}

export function RoomProvider({ children }: RoomProviderProps) {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomInfo | null>(null);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleRoomUpdate = (payload: RoomEventPayload) => {
      setRoom((currentRoom) =>
        currentRoom
          ? { ...currentRoom, participants: payload.participants }
          : null,
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("user_joined", handleRoomUpdate);
    socket.on("user_left", handleRoomUpdate);
    setConnected(socket.connected);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("user_joined", handleRoomUpdate);
      socket.off("user_left", handleRoomUpdate);
    };
  }, []);

  const createRoom = useCallback(
    (username: string) =>
      new Promise<string>((resolve, reject) => {
        socket.emit(
          "create_room",
          { username },
          (ack: RoomAck<RoomResponse>) => {
            if (ack.ok === false) {
              reject(new Error(ack.error));
              return;
            }

            setRoom({ ...ack, videoState: null });
            resolve(ack.roomId);
          },
        );
      }),
    [],
  );

  const joinRoom = useCallback(
    (roomId: string, username: string) =>
      new Promise<void>((resolve, reject) => {
        socket.emit(
          "join_room",
          { roomId, username },
          (ack: RoomAck<JoinRoomResponse>) => {
            if (ack.ok === false) {
              reject(new Error(ack.error));
              return;
            }

            setRoom(ack);
            resolve();
          },
        );
      }),
    [],
  );

  const leaveRoom = useCallback(() => {
    socket.emit("leave_room");
    setRoom(null);
  }, []);

  return (
    <RoomContext.Provider
      value={{ connected, room, createRoom, joinRoom, leaveRoom }}
    >
      {children}
    </RoomContext.Provider>
  );
}

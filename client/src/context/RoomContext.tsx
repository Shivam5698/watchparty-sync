import {
  createContext,
  useCallback,
  useEffect,
  useRef,
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

interface ActionDeniedPayload {
  action: string;
  message: string;
}

interface RoomContextValue {
  connected: boolean;
  room: RoomInfo | null;
  notice: string | null;
  createRoom: (username: string) => Promise<string>;
  joinRoom: (roomId: string, username: string) => Promise<void>;
  leaveRoom: () => void;
  sendPlay: (currentTime: number) => void;
  sendPause: (currentTime: number) => void;
  sendSeek: (time: number) => void;
  sendChangeVideo: (videoId: string) => void;
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
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    const handleSyncState = (videoState: VideoState) => {
      setRoom((currentRoom) =>
        currentRoom ? { ...currentRoom, videoState } : null,
      );
    };
    const handleActionDenied = ({ message }: ActionDeniedPayload) => {
      setNotice(message);
      if (noticeTimeout.current) {
        clearTimeout(noticeTimeout.current);
      }
      noticeTimeout.current = setTimeout(() => {
        setNotice(null);
        noticeTimeout.current = null;
      }, 3000);
    };
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
    socket.on("sync_state", handleSyncState);
    socket.on("action_denied", handleActionDenied);
    setConnected(socket.connected);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("user_joined", handleRoomUpdate);
      socket.off("user_left", handleRoomUpdate);
      socket.off("sync_state", handleSyncState);
      socket.off("action_denied", handleActionDenied);
      if (noticeTimeout.current) {
        clearTimeout(noticeTimeout.current);
      }
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

  const sendPlay = useCallback((currentTime: number) => {
    socket.emit("play", { currentTime });
  }, []);

  const sendPause = useCallback((currentTime: number) => {
    socket.emit("pause", { currentTime });
  }, []);

  const sendSeek = useCallback((time: number) => {
    socket.emit("seek", { time });
  }, []);

  const sendChangeVideo = useCallback((videoId: string) => {
    socket.emit("change_video", { videoId });
  }, []);

  return (
    <RoomContext.Provider
      value={{
        connected,
        room,
        notice,
        createRoom,
        joinRoom,
        leaveRoom,
        sendPlay,
        sendPause,
        sendSeek,
        sendChangeVideo,
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

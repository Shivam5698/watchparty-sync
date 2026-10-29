import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { socket } from "../services/socket";
import type {
  ChatMessage,
  Participant,
  PlaybackAction,
  PlaybackRequest,
  Role,
  RoomInfo,
  VideoState,
} from "../types";

type RoomAck<T> = ({ ok: true } & T) | { ok: false; error: string };

interface RoomResponse {
  roomId: string;
  userId: string;
  role: Role;
  participants: Participant[];
}

interface JoinRoomResponse extends RoomResponse {
  videoState: VideoState;
  chatHistory?: ChatMessage[];
}

interface RoomEventPayload {
  participants: Participant[];
}

interface RoleAssignedPayload extends RoomEventPayload {
  userId: string;
  username: string;
  role: Role;
}

interface ParticipantRemovedPayload extends RoomEventPayload {
  userId: string;
}

interface HostTransferredPayload extends RoomEventPayload {
  fromUserId: string;
  toUserId: string;
}

interface ActionDeniedPayload {
  action: string;
  message: string;
}

interface RequestsUpdatedPayload {
  requests: PlaybackRequest[];
}

interface RequestResolvedPayload {
  requestId: string;
  approved: boolean;
  action: PlaybackAction;
  byUsername: string;
}

interface RoomSession {
  roomId: string;
  username: string;
}

type RequestAck = RoomAck<{ requestId: string }>;
type ChatAck = RoomAck<Record<string, never>>;

function withParticipants(
  room: RoomInfo,
  participants: Participant[],
): RoomInfo {
  const currentUser = participants.find(
    (participant) => participant.userId === room.userId,
  );
  return {
    ...room,
    participants,
    role: currentUser?.role ?? room.role,
  };
}

interface RoomContextValue {
  connected: boolean;
  room: RoomInfo | null;
  notice: string | null;
  removalNotice: string | null;
  requests: PlaybackRequest[];
  hasPendingRequest: boolean;
  chat: ChatMessage[];
  reconnecting: boolean;
  createRoom: (username: string) => Promise<string>;
  joinRoom: (roomId: string, username: string) => Promise<void>;
  leaveRoom: () => void;
  clearRemovalNotice: () => void;
  assignRole: (userId: string, role: Role) => void;
  removeParticipant: (userId: string) => void;
  transferHost: (userId: string) => void;
  sendRequest: (
    action: PlaybackAction,
    payload: object,
  ) => Promise<void>;
  resolveRequest: (requestId: string, approve: boolean) => void;
  sendChat: (text: string) => Promise<void>;
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
  const [removalNotice, setRemovalNotice] = useState<string | null>(null);
  const [requests, setRequests] = useState<PlaybackRequest[]>([]);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const roomRef = useRef<RoomInfo | null>(room);
  roomRef.current = room;
  const session = useRef<RoomSession | null>(null);
  const hadDisconnect = useRef(false);
  const noticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      if (!hadDisconnect.current || !session.current) {
        return;
      }

      const currentSession = session.current;
      socket.emit(
        "join_room",
        {
          roomId: currentSession.roomId,
          username: currentSession.username,
        },
        (ack: RoomAck<JoinRoomResponse>) => {
          hadDisconnect.current = false;
          if (ack.ok === false) {
            session.current = null;
            setRoom(null);
            setRequests([]);
            setChat([]);
            setHasPendingRequest(false);
            setReconnecting(false);
            setRemovalNotice(
              "Connection was lost and the room is no longer available",
            );
            return;
          }

          setRoom(ack);
          setChat(ack.chatHistory ?? []);
          setRequests([]);
          setHasPendingRequest(false);
          setReconnecting(false);
          setNotice("Reconnected");
        },
      );
    };
    const handleDisconnect = (reason: string) => {
      setConnected(false);
      if (session.current && reason !== "io client disconnect") {
        setReconnecting(true);
        hadDisconnect.current = true;
      }
    };
    const handleSyncState = (videoState: VideoState) => {
      setRoom((currentRoom) =>
        currentRoom ? { ...currentRoom, videoState } : null,
      );
    };
    const handleRequestsUpdated = (payload: RequestsUpdatedPayload) => {
      setRequests(payload.requests);
    };
    const handleRequestResolved = (payload: RequestResolvedPayload) => {
      setHasPendingRequest(false);
      setNotice(
        `Your request was ${payload.approved ? "approved" : "rejected"} by ${payload.byUsername}`,
      );
    };
    const handleChatMessage = (message: ChatMessage) => {
      setChat((currentChat) => [...currentChat, message].slice(-100));
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
          ? withParticipants(currentRoom, payload.participants)
          : null,
      );
    };
    const handleRoleAssigned = (payload: RoleAssignedPayload) => {
      if (roomRef.current?.userId === payload.userId) {
        setNotice(
          payload.role === "moderator"
            ? "You are now a Moderator"
            : "You are now a Participant",
        );
      }

      setRoom((currentRoom) =>
        currentRoom
          ? withParticipants(currentRoom, payload.participants)
          : null,
      );
    };
    const handleParticipantRemoved = (
      payload: ParticipantRemovedPayload,
    ) => {
      if (roomRef.current?.userId === payload.userId) {
        session.current = null;
        hadDisconnect.current = false;
        setRoom(null);
        setRequests([]);
        setChat([]);
        setHasPendingRequest(false);
        setRemovalNotice("You were removed from the room by the host");
        return;
      }

      setRoom((currentRoom) =>
        currentRoom
          ? withParticipants(currentRoom, payload.participants)
          : null,
      );
    };
    const handleHostTransferred = (payload: HostTransferredPayload) => {
      const newHost = payload.participants.find(
        (participant) => participant.userId === payload.toUserId,
      );
      if (newHost) {
        setNotice(`${newHost.username} is now the host`);
      }

      setRoom((currentRoom) =>
        currentRoom
          ? withParticipants(currentRoom, payload.participants)
          : null,
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("user_joined", handleRoomUpdate);
    socket.on("user_left", handleRoomUpdate);
    socket.on("sync_state", handleSyncState);
    socket.on("action_denied", handleActionDenied);
    socket.on("role_assigned", handleRoleAssigned);
    socket.on("participant_removed", handleParticipantRemoved);
    socket.on("host_transferred", handleHostTransferred);
    socket.on("requests_updated", handleRequestsUpdated);
    socket.on("request_resolved", handleRequestResolved);
    socket.on("chat_message", handleChatMessage);
    setConnected(socket.connected);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("user_joined", handleRoomUpdate);
      socket.off("user_left", handleRoomUpdate);
      socket.off("sync_state", handleSyncState);
      socket.off("action_denied", handleActionDenied);
      socket.off("role_assigned", handleRoleAssigned);
      socket.off("participant_removed", handleParticipantRemoved);
      socket.off("host_transferred", handleHostTransferred);
      socket.off("requests_updated", handleRequestsUpdated);
      socket.off("request_resolved", handleRequestResolved);
      socket.off("chat_message", handleChatMessage);
      if (noticeTimeout.current) {
        clearTimeout(noticeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!room) {
      setRequests([]);
      setChat([]);
      setHasPendingRequest(false);
    }
  }, [room]);

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
            session.current = { roomId: ack.roomId, username };
            hadDisconnect.current = false;
            setRequests([]);
            setChat([]);
            setHasPendingRequest(false);
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
            session.current = { roomId, username };
            hadDisconnect.current = false;
            setRequests([]);
            setChat(ack.chatHistory ?? []);
            setHasPendingRequest(false);
            resolve();
          },
        );
      }),
    [],
  );

  const leaveRoom = useCallback(() => {
    socket.emit("leave_room");
    session.current = null;
    hadDisconnect.current = false;
    setRoom(null);
    setRequests([]);
    setChat([]);
    setHasPendingRequest(false);
  }, []);

  const clearRemovalNotice = useCallback(() => {
    setRemovalNotice(null);
  }, []);

  const assignRole = useCallback((userId: string, role: Role) => {
    socket.emit("assign_role", { userId, role });
  }, []);

  const removeParticipant = useCallback((userId: string) => {
    socket.emit("remove_participant", { userId });
  }, []);

  const transferHost = useCallback((userId: string) => {
    socket.emit("transfer_host", { userId });
  }, []);

  const sendRequest = useCallback(
    (action: PlaybackAction, payload: object) =>
      new Promise<void>((resolve, reject) => {
        socket.emit(
          "request_action",
          { action, payload },
          (ack: RequestAck) => {
            if (ack.ok === false) {
              reject(new Error(ack.error));
              return;
            }

            setHasPendingRequest(true);
            resolve();
          },
        );
      }),
    [],
  );

  const resolveRequest = useCallback(
    (requestId: string, approve: boolean) => {
      socket.emit("resolve_request", { requestId, approve });
    },
    [],
  );

  const sendChat = useCallback(
    (text: string) =>
      new Promise<void>((resolve, reject) => {
        socket.emit("chat_message", { text }, (ack: ChatAck) => {
          if (ack.ok === false) {
            reject(new Error(ack.error));
            return;
          }

          resolve();
        });
      }),
    [],
  );

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
        removalNotice,
        requests,
        hasPendingRequest,
        chat,
        reconnecting,
        createRoom,
        joinRoom,
        leaveRoom,
        clearRemovalNotice,
        assignRole,
        removeParticipant,
        transferHost,
        sendRequest,
        resolveRequest,
        sendChat,
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

import { useState } from "react";
import type { ChatMessage, Participant, PlaybackRequest, Role } from "../types";
import { canControlPlayback } from "../utils/permissions";
import ChatBox from "./ChatBox";
import ParticipantList from "./ParticipantList";
import PendingRequests from "./PendingRequests";

type SidebarTab = "chat" | "people" | "requests";

interface SidebarProps {
  role: Role;
  participants: Participant[];
  currentUserId: string;
  requests: PlaybackRequest[];
  chat: ChatMessage[];
  onAssignRole: (userId: string, role: Role) => void;
  onRemoveParticipant: (userId: string) => void;
  onTransferHost: (userId: string) => void;
  onResolveRequest: (id: string, approve: boolean) => void;
  onSendChat: (text: string) => Promise<void>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function Sidebar({
  role,
  participants,
  currentUserId,
  requests,
  chat,
  onAssignRole,
  onRemoveParticipant,
  onTransferHost,
  onResolveRequest,
  onSendChat,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("chat");
  const [seenMessageIds, setSeenMessageIds] = useState(
    () => new Set(chat.map(({ id }) => id)),
  );
  const canControl = canControlPlayback(role);
  const visibleTab =
    activeTab === "requests" && !canControl ? "chat" : activeTab;

  const unreadCount = chat.filter(
    (message) =>
      !seenMessageIds.has(message.id) &&
      message.userId !== currentUserId,
  ).length;

  const markChatAsRead = () => {
    setSeenMessageIds(new Set(chat.map(({ id }) => id)));
  };

  const openChat = () => {
    setActiveTab("chat");
    markChatAsRead();
    if (collapsed) {
      onToggleCollapsed();
    }
  };

  const selectTab = (tab: SidebarTab) => {
    if (visibleTab === "chat" && !collapsed) {
      markChatAsRead();
    }
    setActiveTab(tab);
  };

  const toggleCollapsed = () => {
    if (!collapsed && visibleTab === "chat") {
      markChatAsRead();
    }
    onToggleCollapsed();
  };

  if (collapsed) {
    return (
      <button
        className="btn btn-primary sidebar-open-button"
        type="button"
        onClick={openChat}
        aria-label={
          unreadCount > 0 ? `Open chat, ${unreadCount} unread messages` : "Open chat"
        }
      >
        Open chat
        {unreadCount > 0 && (
          <span className="tab-unread-count">{unreadCount}</span>
        )}
      </button>
    );
  }

  return (
    <aside className="room-sidebar">
      <div className="sidebar-tabs" role="tablist" aria-label="Room sidebar">
        <button
          className={`sidebar-tab${visibleTab === "chat" ? " is-active" : ""}`}
          id="sidebar-tab-chat"
          type="button"
          role="tab"
          aria-selected={visibleTab === "chat"}
          aria-controls="sidebar-panel"
          onClick={openChat}
        >
          Chat
          {unreadCount > 0 && visibleTab !== "chat" && (
            <span className="tab-unread-count">{unreadCount}</span>
          )}
        </button>
        <button
          className={`sidebar-tab${visibleTab === "people" ? " is-active" : ""}`}
          id="sidebar-tab-people"
          type="button"
          role="tab"
          aria-selected={visibleTab === "people"}
          aria-controls="sidebar-panel"
          onClick={() => selectTab("people")}
        >
          People ({participants.length})
        </button>
        {canControl && (
          <button
            className={`sidebar-tab${visibleTab === "requests" ? " is-active" : ""}`}
            id="sidebar-tab-requests"
            type="button"
            role="tab"
            aria-selected={visibleTab === "requests"}
            aria-controls="sidebar-panel"
            onClick={() => selectTab("requests")}
          >
            Requests ({requests.length})
            {requests.length > 0 && (
              <span className="tab-request-count">{requests.length}</span>
            )}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm sidebar-collapse-button"
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar (theatre mode)"
          title="Theatre mode"
        >
          ‹
        </button>
      </div>

      <div
        className="sidebar-tab-panel"
        id="sidebar-panel"
        role="tabpanel"
        aria-labelledby={`sidebar-tab-${visibleTab}`}
      >
        {visibleTab === "chat" && (
          <ChatBox
            messages={chat}
            currentUserId={currentUserId}
            onSend={onSendChat}
          />
        )}
        {visibleTab === "people" && (
          <section className="room-panel card participants-panel">
            <h2>Participants ({participants.length})</h2>
            <ParticipantList
              participants={participants}
              currentUserId={currentUserId}
              isHost={role === "host"}
              onAssignRole={onAssignRole}
              onRemove={onRemoveParticipant}
              onTransferHost={onTransferHost}
            />
          </section>
        )}
        {visibleTab === "requests" && canControl && (
          <PendingRequests requests={requests} onResolve={onResolveRequest} />
        )}
      </div>
    </aside>
  );
}

export default Sidebar;

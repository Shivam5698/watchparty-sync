import type { PlaybackRequest } from "../types";

interface PendingRequestsProps {
  requests: PlaybackRequest[];
  onResolve: (id: string, approve: boolean) => void;
}

function formatSeconds(seconds: number | undefined): string {
  const totalSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function describeRequest(request: PlaybackRequest): string {
  switch (request.action) {
    case "play":
      return `wants to play at ${formatSeconds(request.payload.currentTime)}`;
    case "pause":
      return `wants to pause at ${formatSeconds(request.payload.currentTime)}`;
    case "seek":
      return `wants to seek to ${formatSeconds(request.payload.time)}`;
    case "change_video":
      return "wants to change the video";
  }
}

export default function PendingRequests({
  requests,
  onResolve,
}: PendingRequestsProps) {
  return (
    <section className="pending-requests">
      <h2>Pending requests ({requests.length})</h2>
      {requests.length === 0 ? (
        <p className="pending-requests-empty">No pending requests</p>
      ) : (
        <ul className="pending-request-list">
          {requests.map((request) => (
            <li className="pending-request-item" key={request.id}>
              <div className="pending-request-description">
                <strong>{request.username}</strong>
                <span>{describeRequest(request)}</span>
              </div>
              <div className="pending-request-actions">
                <button
                  className="pending-request-button approve-request-button"
                  type="button"
                  onClick={() => onResolve(request.id, true)}
                >
                  Approve
                </button>
                <button
                  className="pending-request-button reject-request-button"
                  type="button"
                  onClick={() => onResolve(request.id, false)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

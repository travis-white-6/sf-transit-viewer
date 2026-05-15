import type { StopWithArrivals } from "../types/transit";
import { StopCard } from "./StopCard";

interface TransitBoardProps {
  stops: StopWithArrivals[];
  loading: boolean;
  error: string | null;
  accuracy: number | null;
  onRefresh: () => void;
}

export function TransitBoard({
  stops,
  loading,
  error,
  accuracy,
  onRefresh,
}: TransitBoardProps) {
  if (error) {
    return (
      <div className="status-message error">
        <p>{error}</p>
        <button onClick={onRefresh}>Retry</button>
      </div>
    );
  }

  if (loading && stops.length === 0) {
    return (
      <div className="status-message">
        <p>Finding nearby stops…</p>
      </div>
    );
  }

  if (!loading && stops.length === 0) {
    return (
      <div className="status-message">
        <p>No stops found within 400 m.</p>
        {accuracy !== null && accuracy > 200 && (
          <p className="accuracy-note">
            Location accuracy is ~{Math.round(accuracy)} m — try stepping outside
            or connecting to WiFi for a better fix.
          </p>
        )}
        <button onClick={onRefresh}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="transit-board">
      <div className="board-meta">
        {loading && <span className="refreshing">Refreshing…</span>}
        {accuracy !== null && (
          <span className="accuracy">~{Math.round(accuracy)} m accuracy</span>
        )}
        <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>
      <div className="stops-grid">
        {stops.map((stop) => (
          <StopCard key={stop.id} stop={stop} />
        ))}
      </div>
    </div>
  );
}

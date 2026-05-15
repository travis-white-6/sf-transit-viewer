import type { StopWithArrivals, Arrival } from "../types/transit";

function minutesFromNow(isoTime: string): number {
  return Math.round((new Date(isoTime).getTime() - Date.now()) / 60_000);
}

function ArrivalRow({ arrival }: { arrival: Arrival }) {
  const time = arrival.expectedTime ?? arrival.aimedTime;
  const mins = minutesFromNow(time);
  const label =
    mins <= 0 ? "Now" : mins === 1 ? "1 min" : `${mins} min`;

  return (
    <div className="arrival-row">
      <span className="arrival-line">{arrival.line}</span>
      <span className="arrival-destination">{arrival.destination}</span>
      <span className={`arrival-time ${arrival.isLive ? "live" : "scheduled"}`}>
        {label}
        {!arrival.isLive && <span className="sched-marker"> sched</span>}
      </span>
    </div>
  );
}

interface StopCardProps {
  stop: StopWithArrivals;
}

export function StopCard({ stop }: StopCardProps) {
  const upcomingArrivals = stop.arrivals
    .filter((a) => {
      const t = a.expectedTime ?? a.aimedTime;
      return minutesFromNow(t) >= -1;
    })
    .slice(0, 5);

  const distLabel =
    stop.distanceMeters !== undefined
      ? stop.distanceMeters < 100
        ? "<100 m"
        : `${Math.round(stop.distanceMeters)} m`
      : "";

  return (
    <div className={`stop-card agency-${stop.agency.toLowerCase()}`}>
      <div className="stop-header">
        <span className="stop-agency">{stop.agency === "BA" ? "BART" : "Muni"}</span>
        <span className="stop-name">{stop.name}</span>
        {distLabel && <span className="stop-distance">{distLabel}</span>}
      </div>
      <div className="arrivals">
        {upcomingArrivals.length === 0 ? (
          <p className="no-arrivals">No upcoming arrivals</p>
        ) : (
          upcomingArrivals.map((a, i) => <ArrivalRow key={i} arrival={a} />)
        )}
      </div>
    </div>
  );
}

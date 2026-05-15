import { useState, useEffect } from "react";
import "./App.css";
import { useGeolocation } from "./hooks/useGeolocation";
import { useTransit } from "./hooks/useTransit";
import { TransitBoard } from "./components/TransitBoard";

function RateLimitBanner({ until }: { until: number }) {
  const [remaining, setRemaining] = useState(Math.ceil((until - Date.now()) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <div className="rate-limit-banner">
      Rate limited by 511.org — retrying in {mins}:{secs}
    </div>
  );
}

export default function App() {
  const geo = useGeolocation();
  const transit = useTransit(geo.lat, geo.lng);
  const isRateLimited = transit.rateLimitedUntil > Date.now();

  if (geo.loading) {
    return (
      <main>
        <header>
          <h1>SF Transit</h1>
        </header>
        <div className="status-message">
          <p>Requesting your location…</p>
          <p className="hint">Allow location access when prompted.</p>
        </div>
      </main>
    );
  }

  if (geo.error) {
    return (
      <main>
        <header>
          <h1>SF Transit</h1>
        </header>
        <div className="status-message error">
          <p>{geo.error}</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      {isRateLimited && <RateLimitBanner until={transit.rateLimitedUntil} />}
      <header>
        <h1>SF Transit</h1>
        <p className="subtitle">Nearby arrivals · auto-refreshes every 30 s</p>
      </header>
      <TransitBoard
        stops={transit.stops}
        loading={transit.loading}
        error={transit.error}
        accuracy={geo.accuracy}
        onRefresh={transit.refresh}
      />
    </main>
  );
}

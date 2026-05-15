import "./App.css";
import { useGeolocation } from "./hooks/useGeolocation";
import { useTransit } from "./hooks/useTransit";
import { TransitBoard } from "./components/TransitBoard";

export default function App() {
  const geo = useGeolocation();
  const transit = useTransit(geo.lat, geo.lng);

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

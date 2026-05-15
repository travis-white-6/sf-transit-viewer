import { useState, useEffect, useCallback } from "react";
import type { StopWithArrivals } from "../types/transit";

const REFRESH_INTERVAL_MS = 30_000;

export function useTransit(lat: number | null, lng: number | null) {
  const [stops, setStops] = useState<StopWithArrivals[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransit = useCallback(async () => {
    if (lat === null || lng === null) return;
    setLoading(true);
    setError(null);

    try {
      const stopsRes = await fetch(
        `/api/stops?lat=${lat}&lng=${lng}&radius=400`
      );
      if (!stopsRes.ok) throw new Error(`Stops API error: ${stopsRes.status}`);
      const nearbyStops = await stopsRes.json();

      const withArrivals = await Promise.all(
        nearbyStops.map(async (stop: StopWithArrivals) => {
          try {
            const arrRes = await fetch(
              `/api/arrivals?agency=${stop.agency}&stopCode=${encodeURIComponent(stop.id)}`
            );
            const arrivals = arrRes.ok ? await arrRes.json() : [];
            return { ...stop, arrivals, fetchedAt: Date.now() };
          } catch {
            return { ...stop, arrivals: [], fetchedAt: Date.now() };
          }
        })
      );

      setStops(withArrivals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transit data.");
    } finally {
      setLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => {
    fetchTransit();
    const id = setInterval(fetchTransit, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTransit]);

  return { stops, loading, error, refresh: fetchTransit };
}

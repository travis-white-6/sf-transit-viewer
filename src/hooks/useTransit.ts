import { useState, useEffect, useCallback, useRef } from "react";
import type { Stop, StopWithArrivals } from "../types/transit";

const REFRESH_INTERVAL_MS = 30_000;
const RATE_LIMIT_BLOCK_MS = 2 * 60 * 1000;
const STOPS_CACHE_TTL_MS = 60 * 60 * 1000;
const STOPS_CACHE_MOVE_THRESHOLD_M = 200;

interface StopsCache {
  stops: Stop[];
  lat: number;
  lng: number;
  fetchedAt: number;
}

let stopsCache: StopsCache | null = null;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchStops(lat: number, lng: number): Promise<Stop[]> {
  const now = Date.now();
  if (stopsCache) {
    const moved = haversineMeters(lat, lng, stopsCache.lat, stopsCache.lng);
    const stale = now - stopsCache.fetchedAt > STOPS_CACHE_TTL_MS;
    if (!stale && moved < STOPS_CACHE_MOVE_THRESHOLD_M) {
      return stopsCache.stops;
    }
  }
  const res = await fetch(`/api/stops?lat=${lat}&lng=${lng}&radius=1000`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(`Stops API error: ${res.status}`), {
      is429: String(body.error ?? "").includes("429"),
    });
  }
  const stops = await res.json();
  stopsCache = { stops, lat, lng, fetchedAt: now };
  return stops;
}

function deduplicateStops(stops: StopWithArrivals[]): StopWithArrivals[] {
  const seen = new Set<string>();
  const result: StopWithArrivals[] = [];
  for (const stop of stops) {
    const hasNew = stop.arrivals.some((a) => !seen.has(`${a.line}|${a.destination}`));
    if (hasNew) {
      stop.arrivals.forEach((a) => seen.add(`${a.line}|${a.destination}`));
      result.push(stop);
    }
  }
  return result;
}

export function useTransit(lat: number | null, lng: number | null) {
  const [stops, setStops] = useState<StopWithArrivals[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const fetchingRef = useRef(false);

  // Auto-clear the rate limit block once the timer expires
  useEffect(() => {
    if (rateLimitedUntil <= 0) return;
    const remaining = rateLimitedUntil - Date.now();
    if (remaining <= 0) { setRateLimitedUntil(0); return; }
    const id = setTimeout(() => setRateLimitedUntil(0), remaining);
    return () => clearTimeout(id);
  }, [rateLimitedUntil]);

  const triggerRateLimit = useCallback(() => {
    setRateLimitedUntil(Date.now() + RATE_LIMIT_BLOCK_MS);
  }, []);

  const fetchTransit = useCallback(async () => {
    if (lat === null || lng === null) return;
    if (fetchingRef.current) return;
    if (Date.now() < rateLimitedUntil) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const nearbyStops = await fetchStops(lat, lng);

      const withArrivals: StopWithArrivals[] = [];
      for (const stop of nearbyStops as (Stop & { distanceMeters: number })[]) {
        try {
          const arrRes = await fetch(
            `/api/arrivals?agency=${stop.agency}&stopCode=${encodeURIComponent(stop.id)}`
          );
          if (arrRes.status === 502) {
            const body = await arrRes.json().catch(() => ({})) as { error?: string };
            if (String(body.error ?? "").includes("429")) {
              triggerRateLimit();
              break;
            }
          }
          const arrivals = arrRes.ok ? await arrRes.json() : [];
          withArrivals.push({ ...stop, arrivals, fetchedAt: Date.now() });
        } catch {
          withArrivals.push({ ...stop, arrivals: [], fetchedAt: Date.now() });
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (withArrivals.length > 0) setStops(deduplicateStops(withArrivals));
    } catch (err) {
      if ((err as { is429?: boolean }).is429) {
        triggerRateLimit();
      } else {
        setError(err instanceof Error ? err.message : "Failed to load transit data.");
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [lat, lng, rateLimitedUntil, triggerRateLimit]);

  useEffect(() => {
    fetchTransit();
    const id = setInterval(fetchTransit, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTransit]);

  return { stops, loading, error, rateLimitedUntil, refresh: fetchTransit };
}

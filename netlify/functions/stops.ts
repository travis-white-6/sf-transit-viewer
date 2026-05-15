import type { Handler } from "@netlify/functions";

const API_BASE = "https://api.511.org/transit";

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchStops(apiKey: string, operator: string) {
  const url = `${API_BASE}/stops?api_key=${apiKey}&operator_id=${operator}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`511 API ${res.status} for operator ${operator}`);

  const text = await res.text();
  // 511 API sometimes prefixes responses with a UTF-8 BOM
  const json = JSON.parse(text.replace(/^﻿/, ""));

  // The stops are nested under Contents.dataObjects.ScheduledStopPoint
  // If the shape changes, log `json` here to inspect
  const points: unknown[] =
    json?.Contents?.dataObjects?.ScheduledStopPoint ?? [];

  return points
    .map((p: unknown) => {
      const stop = p as Record<string, unknown>;
      const loc = stop.Location as Record<string, unknown> | undefined;
      return {
        // Strip agency prefix ("SF:15184" → "15184") — StopMonitoring needs bare stop code
        id: String(stop.id ?? "").replace(/^[A-Za-z]+:/, ""),
        name: String(stop.Name ?? ""),
        lat: parseFloat(String(loc?.Latitude ?? "0")),
        lng: parseFloat(String(loc?.Longitude ?? "0")),
        agency: operator,
      };
    })
    .filter((s) => s.id && !isNaN(s.lat) && !isNaN(s.lng));
}

export const handler: Handler = async (event) => {
  const { lat, lng, radius = "400" } = event.queryStringParameters ?? {};

  if (!lat || !lng) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "lat and lng are required" }),
    };
  }

  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "TRANSIT_API_KEY not configured" }),
    };
  }

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);
  const radiusM = parseFloat(radius);

  try {
    const [muniStops, bartStops] = await Promise.all([
      fetchStops(apiKey, "SF"),
      fetchStops(apiKey, "BA"),
    ]);

    const allWithDistance = [...muniStops, ...bartStops]
      .map((s) => ({
        ...s,
        distanceMeters: haversineMeters(userLat, userLng, s.lat, s.lng),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    // DEBUG: show raw sorted position of stops in the 330–400m band
    console.log("[stops] 330-400m band:", allWithDistance.filter(s => s.distanceMeters >= 330 && s.distanceMeters <= 400).map(s => `${s.id} ${s.name} ${Math.round(s.distanceMeters)}m`));

    // Walk stops closest-first; allow at most 2 per 100m proximity cluster so a
    // single dense intersection can't consume all candidate slots.
    const nearby: typeof allWithDistance = [];
    for (const stop of allWithDistance) {
      if (stop.distanceMeters > radiusM) break;
      const nearbyCount = nearby.filter(
        (r) => haversineMeters(r.lat, r.lng, stop.lat, stop.lng) < 100
      ).length;
      if (nearbyCount < 2) nearby.push(stop);
      if (nearby.length >= 15) break;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nearby),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Upstream error",
      }),
    };
  }
};

import type { Handler } from "@netlify/functions";

const API_BASE = "https://api.511.org/transit";

export const handler: Handler = async (event) => {
  const { agency, stopCode } = event.queryStringParameters ?? {};

  if (!agency || !stopCode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "agency and stopCode are required" }),
    };
  }

  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "TRANSIT_API_KEY not configured" }),
    };
  }

  // Strip agency prefix if present ("SF:15184" → "15184")
  const bareStopCode = stopCode.replace(/^[A-Za-z]+:/, "");

  const url =
    `${API_BASE}/StopMonitoring` +
    `?api_key=${apiKey}&agency=${agency}&stopCode=${encodeURIComponent(bareStopCode)}&format=json`;

  console.log(`[arrivals] ${agency} stopCode=${bareStopCode}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[arrivals] ${res.status} for stopCode=${bareStopCode}`);
      throw new Error(`511 API returned ${res.status}`);
    }

    const text = await res.text();
    const json = JSON.parse(text.replace(/^﻿/, ""));

    // 511 returns StopMonitoringDelivery as either an object or a 1-element array
    const raw = json?.ServiceDelivery?.StopMonitoringDelivery;
    const delivery = Array.isArray(raw) ? raw[0] : raw;
    const visits: unknown[] = delivery?.MonitoredStopVisit ?? [];

    console.log(`[arrivals] stopCode=${bareStopCode} → ${visits.length} visits`);
    if (visits.length === 0) {
      // Print enough of the raw response to diagnose shape mismatches
      console.log(`[arrivals] top-level keys:`, Object.keys(json?.ServiceDelivery ?? {}));
      console.log(`[arrivals] delivery:`, JSON.stringify(delivery ?? null).slice(0, 500));
    }

    const arrivals = visits.map((v: unknown) => {
      const visit = v as Record<string, unknown>;
      const journey = visit.MonitoredVehicleJourney as Record<string, unknown>;
      const call = journey?.MonitoredCall as Record<string, unknown>;

      // LineRef ("SF:22") gives the route number; PublishedLineName ("FILLMORE") is the name
      const lineRef = String(journey?.LineRef ?? "").replace(/^[A-Za-z]+:/, "");
      return {
        line: lineRef || String(journey?.PublishedLineName ?? "?"),
        destination: String(journey?.DestinationName ?? ""),
        expectedTime: call?.ExpectedArrivalTime
          ? String(call.ExpectedArrivalTime)
          : null,
        aimedTime: String(call?.AimedArrivalTime ?? ""),
        isLive: !!call?.ExpectedArrivalTime,
      };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arrivals),
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

import type { Handler } from "@netlify/functions";

const API_BASE = "https://api.511.org/transit";

interface Arrival {
  line: string;
  destination: string;
  expectedTime: string | null;
  aimedTime: string;
  isLive: boolean;
}

function parseVisits(visits: unknown[]): Map<string, Arrival[]> {
  const byStop = new Map<string, Arrival[]>();

  for (const v of visits) {
    const visit = v as Record<string, unknown>;
    const journey = visit.MonitoredVehicleJourney as Record<string, unknown>;
    const call = journey?.MonitoredCall as Record<string, unknown>;

    // The stop code for this visit lives on the MonitoredCall
    const rawStopRef = String(
      (call?.StopPointRef as string | undefined) ??
      (visit.MonitoringRef as string | undefined) ??
      ""
    );
    // Strip agency prefix if present ("SF:14618" → "14618")
    const stopRef = rawStopRef.replace(/^[A-Za-z]+:/, "");

    if (!stopRef) continue;

    const lineRef = String(journey?.LineRef ?? "").replace(/^[A-Za-z]+:/, "");
    const arrival: Arrival = {
      line: lineRef || String(journey?.PublishedLineName ?? "?"),
      destination: String(journey?.DestinationName ?? ""),
      expectedTime: call?.ExpectedArrivalTime
        ? String(call.ExpectedArrivalTime)
        : null,
      aimedTime: String(call?.AimedArrivalTime ?? ""),
      isLive: !!call?.ExpectedArrivalTime,
    };

    const list = byStop.get(stopRef) ?? [];
    list.push(arrival);
    byStop.set(stopRef, list);
  }

  return byStop;
}

async function fetchAgencyArrivals(
  agency: string,
  apiKey: string
): Promise<Map<string, Arrival[]>> {
  const url =
    `${API_BASE}/StopMonitoring` +
    `?api_key=${apiKey}&agency=${agency}&format=json`;

  console.log(`[arrivals-bulk] fetching all stops for agency=${agency}`);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error(`[arrivals-bulk] ${res.status} for agency=${agency}: ${body.slice(0, 200)}`);
    throw new Error(`511 API returned ${res.status} for agency=${agency}`);
  }

  const text = await res.text();
  const json = JSON.parse(text.replace(/^﻿/, ""));

  const raw = json?.ServiceDelivery?.StopMonitoringDelivery;
  const delivery = Array.isArray(raw) ? raw[0] : raw;
  const visits: unknown[] = delivery?.MonitoredStopVisit ?? [];

  console.log(`[arrivals-bulk] agency=${agency} → ${visits.length} total visits`);
  if (visits.length > 0) {
    // Log the first visit to help understand the response shape
    console.log(`[arrivals-bulk] first visit sample:`, JSON.stringify(visits[0]).slice(0, 500));
  } else {
    console.log(`[arrivals-bulk] delivery keys:`, Object.keys(delivery ?? {}));
    console.log(`[arrivals-bulk] delivery sample:`, JSON.stringify(delivery ?? null).slice(0, 500));
  }

  return parseVisits(visits);
}

export const handler: Handler = async (event) => {
  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "TRANSIT_API_KEY not configured" }),
    };
  }

  const params = event.queryStringParameters ?? {};
  const sfStops = (params.sfStops ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const baStops = (params.baStops ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (sfStops.length === 0 && baStops.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "sfStops or baStops query param required" }),
    };
  }

  const result: Record<string, Arrival[]> = {};

  try {
    if (sfStops.length > 0) {
      const sfMap = await fetchAgencyArrivals("SF", apiKey);
      for (const stopCode of sfStops) {
        result[stopCode] = sfMap.get(stopCode) ?? [];
      }
      console.log(
        `[arrivals-bulk] SF: requested ${sfStops.length} stops, ` +
        `found arrivals for ${sfStops.filter((s) => (result[s]?.length ?? 0) > 0).length}`
      );
    }

    if (baStops.length > 0) {
      const baMap = await fetchAgencyArrivals("BA", apiKey);
      for (const stopCode of baStops) {
        result[stopCode] = baMap.get(stopCode) ?? [];
      }
      console.log(
        `[arrivals-bulk] BA: requested ${baStops.length} stops, ` +
        `found arrivals for ${baStops.filter((s) => (result[s]?.length ?? 0) > 0).length}`
      );
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream error";
    const is429 = msg.includes("429");
    return {
      statusCode: is429 ? 429 : 502,
      body: JSON.stringify({ error: msg }),
    };
  }
};

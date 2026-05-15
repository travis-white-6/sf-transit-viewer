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

  const url =
    `${API_BASE}/StopMonitoring` +
    `?api_key=${apiKey}&agency=${agency}&stopCode=${encodeURIComponent(stopCode)}&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`511 API returned ${res.status}`);

    const text = await res.text();
    const json = JSON.parse(text.replace(/^﻿/, ""));

    const visits: unknown[] =
      json?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ??
      [];

    const arrivals = visits.map((v: unknown) => {
      const visit = v as Record<string, unknown>;
      const journey = visit.MonitoredVehicleJourney as Record<string, unknown>;
      const call = journey?.MonitoredCall as Record<string, unknown>;

      return {
        line: String(journey?.PublishedLineName ?? journey?.LineRef ?? "?"),
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

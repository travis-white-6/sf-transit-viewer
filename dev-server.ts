// Local dev server that runs the Netlify functions without netlify-cli.
// Production still uses Netlify Functions via netlify.toml.
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { URL } from "node:url";

const PORT = 9999;

const { handler: stopsHandler } = await import("./netlify/functions/stops.ts");
const { handler: arrivalsHandler } = await import("./netlify/functions/arrivals.ts");

const routes: Record<string, Function> = {
  "/stops": stopsHandler,
  "/arrivals": arrivalsHandler,
};

function toNetlifyEvent(req: IncomingMessage, url: URL) {
  return {
    httpMethod: req.method ?? "GET",
    path: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: req.headers as Record<string, string>,
    body: null,
    isBase64Encoded: false,
    rawUrl: url.toString(),
    rawQuery: url.search.slice(1),
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const handler = routes[url.pathname];

  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handler(toNetlifyEvent(req, url) as any, {} as any, () => {});
    const headers = { "Content-Type": "application/json", ...(result.headers ?? {}) };
    res.writeHead(result.statusCode ?? 200, headers);
    res.end(result.body ?? "");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
}).listen(PORT, () => {
  console.log(`[fn] http://localhost:${PORT}`);
});

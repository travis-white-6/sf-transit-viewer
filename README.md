# SF Transit Viewer

Real-time SF Muni and BART arrivals based on your current location.

Built with React + TypeScript + Vite, deployed on Netlify.

---

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Get a free 511.org API key**

Register at https://511.org/open-data/token — free, instant, no credit card.

**3. Configure your API key**
```bash
cp .env.example .env
# edit .env and set TRANSIT_API_KEY=your_key_here
```

**4. Start the dev server**
```bash
npx netlify dev
```

Opens at http://localhost:8888. Runs both the Vite frontend and the Netlify Functions proxy together.

---

## Architecture

The 511.org API does not send CORS headers, so it cannot be called directly from the browser. All transit API calls go through thin Netlify Functions that proxy the request and inject the API key server-side.

```
Browser
  ├── GET /api/stops?lat=...&lng=...&radius=400
  │        └── netlify/functions/stops.ts  →  api.511.org
  └── GET /api/arrivals?agency=SF&stopCode=...
           └── netlify/functions/arrivals.ts  →  api.511.org
```

The API key lives only in Netlify environment variables — never in the frontend bundle.

---

## Deploy to Netlify

1. Push this repo to GitHub
2. In the [Netlify dashboard](https://app.netlify.com), click **Add new site → Import from Git**
3. Build settings are auto-detected from `netlify.toml` (`npm run build` / `dist`)
4. Go to **Site Settings → Environment Variables** and add:
   - `TRANSIT_API_KEY` = your 511.org API key
5. Trigger a deploy — you'll get a `*.netlify.app` URL

---

## Notes

- Covers SF Muni (`SF`) and BART (`BA`) stops within 400 m of your location
- Auto-refreshes every 30 seconds
- Green arrival times = live GPS tracking; grey = scheduled only
- Location uses the browser Geolocation API — WiFi positioning on desktop (~20–100 m accuracy), GPS on mobile
- If the `/api/stops` response parses incorrectly, add a `console.log` in `netlify/functions/stops.ts` to inspect the raw 511.org JSON shape and adjust the path (`Contents.dataObjects.ScheduledStopPoint`) if needed

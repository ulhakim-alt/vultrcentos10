# Quotation Studio

A Japan tour pricing calculator — internal cost breakdown, per-day itinerary builder,
auto-suggested routing, and a customer-facing quotation PDF generator using the
official MKJ Travel branded template.

## Architecture

Two pieces:

1. **Frontend** (`src/`) — the React calculator. All pricing logic runs in the browser.
2. **Backend** (`server/`) — a small persistent Express server running Puppeteer +
   headless Chrome. Only job: turn itinerary/pricing data into a real,
   text-selectable PDF using the MKJ Travel template.

## Deploy — Vultr / VPS (recommended)

**See [`deploy/DEPLOY.md`](./deploy/DEPLOY.md) (Ubuntu/Debian) or
[`deploy/DEPLOY-CENTOS.md`](./deploy/DEPLOY-CENTOS.md) (CentOS Stream) for the
full step-by-step guide — use whichever matches your server's OS.**

Running both pieces on one VPS (Vultr, DigitalOcean, or similar) via Nginx + PM2
is the most reliable option for this app specifically, because:

- **No serverless timeout** — Puppeteer's Chrome cold-start (which can take
  several seconds) isn't racing against a 10-26 second platform limit like it
  would be on Netlify or Vercel.
- **No CORS complexity** — frontend and backend serve from the same domain
  (Nginx proxies `/api/*` to the Node process), so there's no cross-origin
  configuration to get wrong.
- **No cold-start sleep delay** — unlike free-tier Render, a VPS runs
  continuously; the first click of the day is just as fast as the hundredth.

The tradeoff: you're responsible for server maintenance (OS updates, restarting
if it crashes, etc.) — `deploy/DEPLOY.md` covers PM2's auto-restart-on-crash and
auto-start-on-reboot setup to minimize that burden.

## Run it locally (to test before deploying)

You need [Node.js](https://nodejs.org) installed (v18 or newer).

**Frontend:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`.

**Backend** (in a separate terminal):
```bash
cd server
npm install
npm start
```
Runs at `http://localhost:4000`. For local testing, set `VITE_API_URL=http://localhost:4000`
in a `.env` file at the project root (copy `.env.example`).

## Alternative deploy paths

These were explored earlier and are still valid options, though Vultr/VPS is
the recommended path for this app given Puppeteer's needs:

- **Render** — `render.yaml` is included for a Blueprint deploy (separate
  frontend Static Site + backend Web Service). Free tier sleeps after 15 min
  idle (slow wake, not a failure). See git history / ask for the Render-specific
  notes if you want to revisit this path.
- **Static-only host** (no PDF backend) — `npm run build` produces `dist/`,
  deployable anywhere static (GitHub Pages, S3, Netlify drag-and-drop). The
  "Print / Save as PDF" and "Download File" buttons work here with zero backend;
  only "Generate MKJ PDF (Server)" needs the Express backend running somewhere.

## Notes

- `server/_mkjTemplate.js` holds the MKJ Travel HTML/CSS template (navy + gold
  branding). Edit colors/layout there to change the generated PDF's design
  without touching calculator logic in `src/App.jsx`.
- The "Print / Save as PDF" and "Download File" buttons are fully client-side
  and need no backend at all — useful fallbacks if the backend is ever down.
- If you want a real backend later (saved quotations, multi-user access, login,
  auto-emailing the PDF to customers), `server/` is already a persistent Node
  process — a reasonable place to grow that from.

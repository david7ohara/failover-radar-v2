# Failover Radar

A small web app that shows real earthquakes and GitHub and Cloudflare status side by side on a dark map, filtered to the stack you choose. It turns what it sees into a template checklist and a copy-ready incident brief.

**Live demo:** https://failover-radar-v2-production.up.railway.(no login, no keys)
**Built for:** Kiroween 2026, Frankenstein category

## Why Frankenstein
It stitches together things that don't normally go together: USGS seismic data, Atlassian Statuspage feeds from GitHub and Cloudflare, great-circle distance rules for cloud regions, a Leaflet map, a browser-only "My Stack" filter, and a rule-based runbook generator.

## What it does today
- Live M4.5+ earthquakes from the past day (USGS), cached for 60 seconds
- Live GitHub and Cloudflare status (Statuspage), cached for 300 seconds
- Distance from each quake to six approximate cloud regions, classified "NEARBY (within 300 km)" or "CLEAR"
- Nearest alternative region by distance, always labeled "health not verified"
- My Stack: choose your regions and providers; saved only in your browser
- Template checklist (rule-based, no AI at runtime) and a plain-text incident brief you can copy
- Simulate: a clearly labeled SIMULATION event near Tokyo for demos. It is a demo input, not real data
- Stale data is labeled with its last successful fetch time

## What it does not do
- It does not predict outages or damage. Seismic proximity and provider status are separate signals.
- It cannot tell you whether any cloud region is operational or degraded beyond fetched status feeds.
- Region coordinates are approximate, city-level values.
- Only GitHub and Cloudflare status are included today. No alerts, no accounts.

## Data sources and credits
USGS Earthquake Hazards feeds; GitHub Status and Cloudflare Status (Atlassian Statuspage); Leaflet 1.9.4; map tiles and data by OpenStreetMap contributors.

## Data integrity rules
Every number shown comes from a fetched feed or a documented rule. Speculative or unverified status claims are never used. Simulated data and template output are always labeled.

## Run locally
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.main:app --port 8000
Open http://localhost:8000

## Tests
.venv/bin/python -m pytest -q
70 passed. Property-based tests use Hypothesis. Frontend pure functions have 34 passing tests via `node --test frontend/*.test.js`. Tests use saved sample data and no network.

## Deploy
A Dockerfile listens on $PORT. Deployed on Railway at https://railway.app.

## How Kiro was used
Built with Kiro CLI: specs (`requirements.md`, `design.md`, `tasks.md`) in `.kiro/specs/01-failover-radar`, steering files (`product.md`, `tech.md`, `data-integrity.md`) in `.kiro/steering`, scoped permission rules, and property-based tests. See `KIRO_LOG.md` for a task-by-task record. The app has no AI at runtime; AI assisted the build only.
Hooks: a PostFileSave command hook in .kiro/hooks/run-tests.json runs the backend tests after Kiro edits backend Python files.

## Pre-existing code
Libraries: FastAPI, Uvicorn, HTTPX, Pydantic, pytest, pytest-asyncio, Hypothesis (`requirements.txt`), and Leaflet 1.9.4. No other pre-existing code.

## License
MIT

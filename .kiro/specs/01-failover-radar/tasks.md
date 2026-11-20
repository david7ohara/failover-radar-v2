# Implementation Plan (Tasks)

- [ ] **T1: Geo Core — Region Data & Haversine Tests**
  - Create `backend/regions.json` with the 6 AWS region entries; each entry must have `approximate: true` and a `source` note.
  - Create `backend/geo.py`: load regions from `regions.json`, implement Haversine distance (`R = 6371.0 km`), classify as `NEARBY (within 300 km)` when `distance_km <= 300.0`, and return the nearest alternative region labeled `"Nearest alternative by distance (health not verified)"`.
  - Write `backend/tests/test_geo.py` using `pytest` and `hypothesis`; tests must not call the network.

- [ ] **T2: USGS Feed — Cache, Stale Handling & Tests**
  - In `backend/feeds.py` implement the async `httpx` fetcher for `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` with a 60-second in-memory TTL cache.
  - On fetch failure return the last cached payload with `stale: true` and the last successful UTC timestamp.
  - Write tests using a saved sample fixture (no network calls).

- [ ] **T3: Statuspage Feeds — Cache & Tests**
  - In `backend/feeds.py` add async fetchers for `https://www.githubstatus.com/api/v2/summary.json` and `https://www.cloudflarestatus.com/api/v2/summary.json` with 300-second TTL caches and the same stale-fallback pattern.
  - Write tests using saved sample fixtures (no network calls).

- [ ] **T4: `/api/radar` Route, Simulation Mode & Test-on-Save Hook**
  - In `backend/main.py` wire up `GET /api/radar?simulate=false` to merge USGS events (or the Tokyo M6.8 simulation at `(35.30, 140.85)` with distance computed by the Haversine function) with Statuspage data and geo proximity results.
  - Every simulated item must carry the `SIMULATION:` prefix throughout the payload.
  - Create `.kiro/hooks/run-tests.json` using Kiro's hook feature to run `pytest backend/tests/` automatically on every backend file save.

- [ ] **T5: Dockerfile & First Railway Deploy**
  - Write a production `Dockerfile` for a single-container deploy listening on `$PORT` (default `8000`).
  - Verify the image builds and the health endpoint responds.

- [ ] **T6: Frontend Map**
  - Create `frontend/index.html` and `frontend/styles.css` with the dark-mode layout (CartoDB Dark Matter tiles, mandatory CartoDB & OpenStreetMap attribution, `#0b0f17` background, `#ef4444` / `#10b981` status colours).
  - In `frontend/app.js` render Leaflet markers for cloud regions and earthquake epicentres; draw pulsing 300 km radius rings and dashed failover vector lines for `NEARBY (within 300 km)` regions.

- [ ] **T7: My Stack**
  - Add the My Stack drawer to the frontend: region and provider toggles, `localStorage` persistence, in-memory fallback when storage is blocked, and My Stack alerts surfaced at the top of the dashboard.

- [ ] **T8: Checklist Endpoint — Validator & Fallback**
  - Implement `POST /api/checklist` in `backend/checklist.py` and `backend/main.py`.
  - Build the checklist exclusively from the backend's computed data (Haversine distances, Statuspage titles, region names).
  - Reject any LLM response containing a number not present in the input payload and fall back to the deterministic template.
  - Label every response `"AI-generated suggestions. Verify before acting."` (LLM path) or `"Template checklist."` (deterministic path).

- [ ] **T9: Copy Incident Brief**
  - In `frontend/app.js` generate the Markdown incident brief with UTC timestamp, `SIMULATION:` prefix when simulated, exact Haversine kilometres, `"nearby"` phrasing (never `"affected"`), provider statuses, checklist steps, and clickable USGS/Statuspage URLs.
  - Add the Copy Incident Brief button (`navigator.clipboard.writeText`) and a visible, selectable `<textarea>` fallback.

- [ ] **T10: README & Kiro Write-Up**
  - Write a judge-ready `README.md` covering setup, local run, Railway deploy, simulation mode, and data sources with attribution.
  - Add a `KIRO.md` write-up describing which Kiro features were used (steering, specs, hooks) and why.

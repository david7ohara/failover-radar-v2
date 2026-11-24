# Technical Design: Failover Radar

## System Architecture
- **Backend (`backend/`):** FastAPI application serving JSON APIs and static frontend files from `frontend/`.
  - `backend/geo.py`: Cloud region registry (loaded from `backend/regions.json`), Haversine distance calculator, 300 km threshold evaluator, and nearest-alternative lookup.
  - `backend/feeds.py`: Async `httpx` fetchers with in-memory TTL caching (60s USGS at `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`, 300s Statuspage at `https://www.githubstatus.com/api/v2/summary.json` and `https://www.cloudflarestatus.com/api/v2/summary.json`) and Tokyo M6.8 simulation payload.
  - `backend/data/checklist_templates.json`: Plain-data scenario templates (`quake_nearby`, `provider_degraded`, `both`, `all_clear`), each with a title and ordered steps containing placeholders from a fixed set (`{event_title}`, `{magnitude}`, `{distance_km}`, `{region_label}`, `{provider_name}`, `{incident_name}`, `{usgs_url}`, `{status_url}`, `{nearest_label}`, `{generated_at_utc}`).
  - `backend/checklist.py`: Scenario selector and placeholder filler. Selects the scenario from the request parameters and radar data, then substitutes placeholders using only values the backend computed. Missing values are omitted, never guessed. No LLM call, no external API key required. (LLM-written checklists remain a possible future enhancement.)
  - `backend/main.py`: FastAPI routes (`GET /api/health`, `GET /api/radar?simulate=false`, `GET /api/checklist?region_id=...&event_id=...&provider=...&simulate=false`) and static file mounting for `/`.
  - `backend/tests/test_geo.py`: `pytest` + `hypothesis` property-based tests (no network calls; use saved sample fixtures).
- **Frontend (`frontend/`):**
  - `frontend/index.html`: Tactical dark-mode command center (Header + Simulate toggle + My Stack drawer, 60% Leaflet Map pane, 40% Incident Triage + Template Checklist + Copy Incident Brief pane).
  - `frontend/styles.css`: Responsive CSS Grid/Flexbox dark theme (`#0b0f17` background, `#ef4444` nearby alert, `#10b981` clear status) optimized for both desktop browsers and iPhone Safari.
  - `frontend/app.js`: State manager, `localStorage` My Stack persistence (with in-memory fallback when storage is blocked), Leaflet markers/circles/polylines, API polling, and Incident Brief formatter with Copy button + selectable `<textarea>`.

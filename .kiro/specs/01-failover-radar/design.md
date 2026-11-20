# Technical Design: Failover Radar

## System Architecture
- **Backend (`backend/`):** FastAPI application serving JSON APIs and static frontend files from `frontend/`.
  - `backend/geo.py`: Cloud region registry (loaded from `backend/regions.json`), Haversine distance calculator, 300 km threshold evaluator, and nearest-alternative lookup.
  - `backend/feeds.py`: Async `httpx` fetchers with in-memory TTL caching (60s USGS at `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`, 300s Statuspage at `https://www.githubstatus.com/api/v2/summary.json` and `https://www.cloudflarestatus.com/api/v2/summary.json`) and Tokyo M6.8 simulation payload.
  - `backend/checklist.py`: Pydantic-validated operator checklist generator (optional OpenAI-compatible LLM call with instant deterministic template fallback).
  - `backend/main.py`: FastAPI routes (`GET /api/health`, `GET /api/radar?simulate=false`, `POST /api/checklist`) and static file mounting for `/`.
  - `backend/tests/test_geo.py`: `pytest` + `hypothesis` property-based tests (no network calls; use saved sample fixtures).
- **Frontend (`frontend/`):**
  - `frontend/index.html`: Tactical dark-mode command center (Header + Simulate toggle + My Stack drawer, 60% Leaflet Map pane, 40% Incident Triage + AI Checklist + Copy Incident Brief pane).
  - `frontend/styles.css`: Responsive CSS Grid/Flexbox dark theme (`#0b0f17` background, `#ef4444` nearby alert, `#10b981` clear status) optimized for both desktop browsers and iPhone Safari.
  - `frontend/app.js`: State manager, `localStorage` My Stack persistence (with in-memory fallback when storage is blocked), Leaflet markers/circles/polylines, API polling, and Incident Brief formatter with Copy button + selectable `<textarea>`.

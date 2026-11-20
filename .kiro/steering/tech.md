# Technical Architecture Steering

## Tech Stack & Deployment Target
- **Backend:** Python 3.11+, FastAPI, `httpx` (async HTTP client), Pydantic v2, `uvicorn`.
- **Testing:** `pytest` and `hypothesis` for property-based testing of all geospatial and severity classification logic. Tests must not call the network; use saved sample fixtures for all HTTP responses.
- **Frontend:** Lightweight vanilla HTML5/CSS3/ES6 JavaScript served directly by FastAPI static routes (zero heavy build steps or fragile bundlers) paired with **Leaflet.js** and **CartoDB Dark Matter** tiles (with mandatory visible CartoDB & OpenStreetMap attribution).
- **Hosting:** Single-container `Dockerfile` optimized for Railway deployment listening on `$PORT` (default `8000`).

## Engineering & Resilience Standards
- **Safe Polling & Caching:** Cache USGS earthquake GeoJSON (`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`) for 60 seconds and Statuspage endpoints (`https://www.githubstatus.com/api/v2/summary.json`, `https://www.cloudflarestatus.com/api/v2/summary.json`) for 300 seconds to respect upstream rate limits.
- **Graceful Degradation:** If an upstream API times out or returns HTTP 5xx, serve the last cached payload with `stale: true` and the last successful UTC fetch timestamp.
- **Zero-API-Key Fallback:** The AI operator checklist endpoint must use an LLM API when configured via environment variables, and automatically fall back to deterministic, structured runbook templates when no API key is present so live demos and judging never fail.
- **Secrets Management:** All API keys and tokens must be supplied via environment variables only. No secrets may be committed to the repository in any form (source files, dotfiles, or comments).

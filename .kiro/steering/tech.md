# Technical Architecture Steering

## Tech Stack & Deployment Target
- **Backend:** Python 3.11+, FastAPI, `httpx` (async HTTP client), Pydantic v2, `uvicorn`.
- **Testing:** `pytest` and `hypothesis` for property-based testing of all geospatial and severity classification logic.
- **Frontend:** Lightweight vanilla HTML5/CSS3/ES6 JavaScript served directly by FastAPI static routes (zero heavy build steps or fragile bundlers) paired with **Leaflet.js** and **CartoDB Dark Matter** tiles (with mandatory visible CartoDB & OpenStreetMap attribution).
- **Hosting:** Single-container `Dockerfile` optimized for Railway deployment listening on `$PORT` (default `8000`).

## Engineering & Resilience Standards
- **Safe Polling & Caching:** Cache USGS earthquake GeoJSON (`https://usgs.gov`) for 60 seconds and Statuspage endpoints (`githubstatus.com`, `cloudflarestatus.com`) for 300 seconds to respect upstream rate limits.
- **Graceful Degradation:** If an upstream API times out or returns HTTP 5xx, serve the last cached payload with `stale: true` and the last successful UTC fetch timestamp.
- **Zero-API-Key Fallback:** The AI operator checklist endpoint must use an LLM API when configured via environment variables, and automatically fall back to deterministic, structured runbook templates when no API key is present so live demos and judging never fail.

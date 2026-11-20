Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing code in backend/. Do task T4 only (radar API, simulation, test hook). Use the paths in design.md.

Rules: every number comes from a feed or a documented rule. Never invent data. Say "nearby," never "affected." Never call a region healthy or unhealthy from provider status. Tests use no network.

T4:
1. backend/main.py: FastAPI app with GET /api/health and GET /api/radar?simulate=false.
2. /api/radar returns JSON with: quakes (from T2, with stale and last_success), providers (from T3, with stale and last_success), regions (each with id, label, nearby quakes with distance_km computed by backend/geo.py, classification "NEARBY (within 300 km)" or "CLEAR", and the nearest alternative region labeled "Nearest alternative by distance (health not verified)"), generated_at_utc, and attribution (USGS, GitHub Status, Cloudflare Status).
3. simulate=true adds exactly one event: id "SIMULATION-1", title starting with "SIMULATION:", magnitude 6.8, epicenter from a clearly named config constant near Tokyo (lat 35.30, lon 140.85, a chosen demo input). All distances and classifications for it are computed by code. Simulated events are excluded from live counts and always carry simulated: true.
4. Serve static files from frontend/ at / (create a minimal placeholder index.html saying "Failover Radar: map coming in T6").
5. Tests with no network (mock the T2 and T3 functions): classification, simulation labeling and exclusion from live counts, response shape, stale flags passed through.
6. Test-on-save automation: first check Kiro's documentation for the correct hook format for this tool (CLI vs IDE). Tell me what you found, then create the hook only if supported here. If not, say so and propose the closest alternative. Do not guess a format.

Show your plan and doubts first and wait for my approval. After coding, run the tests, show the results, then stop.

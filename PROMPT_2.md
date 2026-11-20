Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/. Do task T2 only (USGS feed). Use the paths in design.md.

Rules: every number comes from a feed or a documented rule. Never invent data. Say "nearby," never "affected." GeoJSON coordinates are [lon, lat, depth].

T2:
1. Async fetch with httpx of https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson, 10-second timeout.
2. Normalize each feature to: id, magnitude, place, lat, lon, depth_km, time_utc (ISO 8601, from the epoch milliseconds), url.
3. In-memory cache, 60-second TTL.
4. On failure, timeout or HTTP 5xx: return the last good data with stale: true and last_success (UTC). If there is none: empty list, stale: true, last_success: null.
5. Create tests/fixtures/usgs_sample.json by downloading one real response once with curl (I will approve it) and trimming it to 3 features. Do not hand-write sample data.
6. Tests with no network (mock httpx): parsing against the fixture, lon/lat order, time conversion, cache hit inside 60 seconds, stale fallback on failure.

Show your plan and doubts first and wait for my approval. After coding, run the tests, show the results, then stop.

Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/. Do task T1 from tasks.md only. Use the paths in design.md (backend/).

Rules: every number must come from a feed or a documented rule. Never invent coordinates, thresholds or sample data. Say "nearby," never "affected." GeoJSON is [lon, lat, depth].

T1:
1. backend/geo.py: haversine distance_km (R = 6371.0) as a pure function.
2. backend/data/regions.json for ap-south-1 (Mumbai), ap-northeast-1 (Tokyo), ap-southeast-1 (Singapore), us-east-1 (N. Virginia), us-west-1 (N. California), eu-central-1 (Frankfurt). Each entry: id, label, lat, lon, approximate: true, source. For source write "city-level approximation, needs verification." I will verify every value.
3. Proximity: classify "NEARBY (within 300 km)" when distance_km <= 300.0, else "CLEAR" (threshold configurable). Find the nearest other region, labeled "Nearest alternative by distance (health not verified)."
4. Tests with pytest and Hypothesis: haversine is non-negative, symmetric and zero for identical points; classification at exactly 300 km and just above. No network calls.
5. requirements.txt.

First show me your plan and any doubts in a few lines. Wait for my approval before writing code. After coding, run the tests and show the results, then stop.

Read all files in .kiro/steering/. Three of them (requirements.md, design.md, tasks.md) are specs placed there by mistake.

Step A: Move requirements.md, design.md and tasks.md to .kiro/specs/01-failover-radar/ without changing their contents. Tell me what moved.

Step B: Apply only these edits, then list each change:
1. Replace every shortened URL with the full endpoint: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson, https://www.githubstatus.com/api/v2/summary.json, https://www.cloudflarestatus.com/api/v2/summary.json.
2. Use one label everywhere: "NEARBY (within 300 km)". Keep the rule distance_km <= 300.0. Fix the broken label in tasks.md.
3. product.md: change "correlating" to "showing side by side" and "eliminates alert fatigue" to "reduces noise". Add an Out of scope section: no multi-agent or swarm features, no confidence scores, no money estimates, no failover automation, no accounts.
4. requirements.md: region coordinates come from a data file with approximate: true and a source note on each entry, never invented. The simulation distance is computed by code, not a fixed number. My Stack must work if localStorage is blocked. The checklist is built from the backend's own data. AI output with any number not in its input is rejected and replaced by the template, and every checklist is labeled "AI-generated suggestions. Verify before acting." or "Template checklist."
5. tech.md: secrets only in environment variables, never committed; tests must not call the network and use saved sample fixtures.
6. Rewrite tasks.md as small tasks: T1 geo core, regions data and tests; T2 USGS feed with cache, stale handling and tests; T3 Statuspage feeds and tests; T4 /api/radar with simulation and a test-on-save hook (create it with Kiro's hook feature); T5 Dockerfile and first Railway deploy; T6 frontend map; T7 My Stack; T8 checklist, validator and fallback; T9 Copy brief; T10 README and Kiro write-up.

Write no app code and create no other files. When done, stop.

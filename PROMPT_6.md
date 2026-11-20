Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing code. Do the map task only (tasks.md, the map task). If task numbers differ, follow tasks.md.

Rules: show only data from /api/radar. Never invent numbers. Say "nearby," never "affected." Never call a region healthy or unhealthy.

Build in frontend/ (index.html, styles.css, app.js), vanilla JavaScript, no build step:
1. Leaflet 1.9.4 from a pinned CDN URL, with CARTO Dark Matter tiles and visible attribution "© OpenStreetMap contributors © CARTO".
2. Fetch /api/radar (refresh every 60 seconds). Draw region markers colored by classification, quake markers sized by magnitude with a popup (place, magnitude, time UTC, USGS link).
3. For each NEARBY region: a 300 km circle around the epicenter with a CSS pulse, and a dashed line to the nearest alternative, labeled "Nearest alternative by distance (health not verified)".
4. A Simulate button that calls /api/radar?simulate=true. While active, show a persistent "SIMULATION:" banner. A Clear button returns to live data.
5. Per panel: source name, last updated, and a clear STALE badge when stale is true.
6. Responsive for iPhone Safari and desktop. Dark theme, high contrast.

Show your plan first and wait for my approval. After coding, run the app locally and describe what I should see.

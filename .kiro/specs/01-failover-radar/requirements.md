# Requirements Specification: Failover Radar

## Requirement 1: Live USGS Seismic Telemetry Ingestion
- **User Story:** As an operator, I want live M4.5+ earthquake data from the past 24 hours so I can spot seismic events near my cloud regions.
- **Acceptance Criteria:**
  1. WHEN `/api/radar` is requested, THE system SHALL fetch `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` and cache responses for 60 seconds.
  2. IF the USGS endpoint fails or times out, THEN THE system SHALL return the last cached payload with `stale: true` and the last successful UTC timestamp.
  3. THE system SHALL include visible USGS attribution and clickable event URLs for every earthquake.

## Requirement 2: Live SaaS Statuspage Ingestion
- **User Story:** As a founder, I want live operational status from GitHub and Cloudflare so I can see API degradations alongside seismic risks.
- **Acceptance Criteria:**
  1. WHEN `/api/radar` is requested, THE system SHALL fetch `https://www.githubstatus.com/api/v2/summary.json` and `https://www.cloudflarestatus.com/api/v2/summary.json`, caching results for 300 seconds.
  2. THE system SHALL surface overall indicator status, degraded components, active incidents, and clickable status page links.

## Requirement 3: Deterministic Haversine Proximity Engine
- **User Story:** As an SRE, I want exact distance calculations between earthquakes and cloud data center regions without hallucinated risk scores.
- **Acceptance Criteria:**
  1. THE system SHALL compute great-circle distance in kilometers using the Haversine formula (`R = 6371.0 km`) against predefined city-level coordinates for major AWS regions (`ap-south-1`, `ap-northeast-1`, `ap-southeast-1`, `us-east-1`, `us-west-1`, `eu-central-1`). Region coordinates SHALL be loaded from a data file where every entry carries `approximate: true` and a `source` note; coordinates are never invented inline in code.
  2. WHEN `distance_km <= 300.0`, THE system SHALL classify the region as `NEARBY (within 300 km)`; otherwise `CLEAR`.
  3. FOR EVERY region, THE system SHALL identify the closest geographic backup region strictly labeled `"Nearest alternative by distance (health not verified)"`.

## Requirement 4: Personal "My Stack" Filter Profile
- **User Story:** As a startup founder, I want to select only the cloud regions and SaaS providers I actually use so I am not distracted by unrelated global alerts.
- **Acceptance Criteria:**
  1. THE frontend SHALL provide a `My Stack` selector allowing users to toggle specific cloud regions and SaaS providers (`GitHub`, `Cloudflare`).
  2. THE frontend SHALL attempt to persist `My Stack` selections in browser `localStorage` with zero login required and highlight matching alerts at the top of the dashboard. IF `localStorage` is blocked or unavailable, the selector SHALL still function for the current session using in-memory state.

## Requirement 5: Labeled Tokyo Quake Simulation Mode
- **User Story:** As a hackathon judge or user testing on a quiet day, I want a 1-click simulation button to see how the radar reacts to a major quake near Tokyo.
- **Acceptance Criteria:**
  1. WHEN the user toggles `Simulate Tokyo M6.8 Quake`, THE backend SHALL inject a synthetic M6.8 earthquake at `(35.30, 140.85)`. The distance from that coordinate to `ap-northeast-1` SHALL be computed by the Haversine function at runtime, not stored as a fixed number.
  2. EVERY simulated event title, map badge, checklist, and exported brief SHALL begin with `SIMULATION:` so it is never mistaken for live data.

## Requirement 6: Interactive 2D Tactical Radar Map
- **User Story:** As an operator, I want a fast, dark-mode geospatial map showing earthquake radii, my cloud regions, and failover vectors.
- **Acceptance Criteria:**
  1. THE frontend SHALL render a dark-mode **Leaflet.js** map using CartoDB Dark Matter tiles with visible CartoDB and OpenStreetMap attribution.
  2. WHEN a region is `NEARBY (within 300 km)`, THE map SHALL draw a pulsing 300 km radius ring around the epicenter and a dashed failover vector line to the nearest alternative region.

## Requirement 7: Template-Based Operator Checklist
- **User Story:** As an on-call engineer, I want an actionable failover checklist built from live telemetry data, clearly labeled as a template, so I can triage quickly without relying on an external AI service.
- **Acceptance Criteria:**
  1. WHEN `GET /api/checklist?region_id=...&event_id=...&provider=...&simulate=false` is called, THE system SHALL select one of four scenarios (`quake_nearby`, `provider_degraded`, `both`, `all_clear`) from `backend/data/checklist_templates.json` and fill placeholders exclusively from the backend's own computed data (Haversine distances, Statuspage titles, region names, USGS event fields). Zero values may be invented or accepted from the client.
  2. WHEN `simulate=true` is passed, THE checklist title SHALL begin with `SIMULATION:`.
  3. Unknown `region_id` or `event_id` values SHALL return HTTP 404 with a short JSON error message.
  4. Every checklist response SHALL be labeled `"Template checklist"`, include the scenario name, a `generated_at_utc` timestamp, the ordered steps (each step as plain text plus an optional `https` link), sources with clickable URLs, and a stale warning with `last_success` for any feed that returned stale data.
  5. Steps SHALL use the word "nearby" and SHALL NOT use the words "affected", "impacted", "healthy", "unhealthy", "caused", or "outage confirmed". Seismic proximity and provider status SHALL be presented as parallel signals, never causally linked. Any step referring to a backup region SHALL state: "nearest alternative by distance, health not verified — verify before shifting traffic." Steps are suggestions to verify, never commands.
  6. The `all_clear` scenario SHALL state: "No nearby quake and no degraded provider in the data fetched at [time]. This does not guarantee nothing is wrong."
  7. All links in the response SHALL use `https` only.

## Requirement 8: Mobile & Desktop Responsive Layout + Early Deployment
- **User Story:** As a builder working on iPhone Safari for desktop judges, I want a clean responsive layout deployed early on Railway.
- **Acceptance Criteria:**
  1. THE UI SHALL render cleanly on both mobile viewports and desktop viewports (`Request Desktop Website` in Safari).
  2. THE repository SHALL include a production `Dockerfile` listening on `$PORT` for single-click Railway deployment.

## Requirement 9: 1-Click Copy Incident Brief Exporter (with Selectable Fallback)
- **User Story:** As an on-call engineer, I want to copy a plain-text, timestamped incident snapshot in one tap to paste directly into Slack, Discord, GitHub issues, or email.
- **Acceptance Criteria:**
  1. THE frontend SHALL generate a plain-text incident snapshot (no Markdown headings or tables) containing: UTC timestamp, `SIMULATION:` prefix on the first line when simulated, the user's stack summary ("Your stack: N regions, N providers" matching the banner counts, or "Stack: all regions and providers" when no selection is active), nearby quakes (closest first, at most 5, each with event id, magnitude, UTC time, place, region label, distance_km, the exact label `NEARBY (within 300 km)`, and a USGS https link; followed by "and N more" when additional quakes exist), provider status (name, indicator, description, fetched time, status page https link, plus degraded component names and statuses), stale warnings with `last_success` for any stale feed, the template checklist labeled "Template checklist" for the first nearby region or degraded provider, and the closing lines "Nearest alternative by distance (health not verified). Verify before shifting traffic." and "Seismic proximity and provider status are separate signals. Data from USGS, GitHub Status and Cloudflare Status."
  2. WHEN no nearby quake and no degraded provider exist, the brief SHALL state: "No nearby quake and no degraded provider in the data fetched at [time]. This does not guarantee nothing is wrong."
  3. The brief SHALL use the word "nearby" and SHALL NOT use the words "affected", "impacted", "healthy", "unhealthy", "caused", or "outage confirmed". All links SHALL use `https` only.
  4. THE UI SHALL display a "Copy incident brief" button (at least 44 px tall) and a visible read-only `<textarea>` whose value is set via `.value` (never `innerHTML`).
  5. On button tap: the frontend SHALL attempt `navigator.clipboard.writeText` inside `try/catch`; on failure SHALL select the textarea (`select()` and `setSelectionRange(0, 99999)`) and attempt `document.execCommand("copy")`; if that also fails SHALL display "Tap and hold the text, then Copy." A short "Copied" or fallback message SHALL be shown after each attempt.
  6. The brief SHALL update automatically whenever data, stack selection, or simulation state changes. The brief and stack selection SHALL never be sent to the server.

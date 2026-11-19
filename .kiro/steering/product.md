# Product Steering: Failover Radar

## Mission & Core Value
Failover Radar is a real-time infrastructure resilience command center built for startup founders, indie developers, and on-call SREs. It eliminates alert fatigue by correlating live USGS seismic telemetry and Atlassian Statuspage APIs (GitHub, Cloudflare) against a user's personal cloud and SaaS stack (`My Stack`), computing exact Haversine distances, and generating a plain-English operator failover checklist with a 1-click Copy Incident Brief exporter.

## Target User & UX Philosophy
- **Primary User:** On-call engineer or startup founder triaging potential downtime under time pressure.
- **Tactical Minimalism:** Keep the UI dark-mode, high-contrast, uncluttered, and fast-loading on both desktop monitors and mobile browsers.
- **Zero-Login Entry:** All features—including `My Stack` preferences (stored in `localStorage`), live telemetry, the `SIMULATION:` Tokyo M6.8 stress test, and the Copy Incident Brief exporter—must work immediately without accounts or paywalls.

## Non-Negotiable Product Guardrails
1. **Honest Status Labeling:** Never claim an alternative backup region is "healthy" unless verified by an official cloud status API. Label closest backup regions strictly as `"Nearest alternative by distance (health not verified)"`.
2. **Clear Simulation Framing:** Any simulated seismic event or generated brief from a simulation must explicitly begin with `SIMULATION:` so judges and operators never confuse test drills with live emergencies.
3. **Actionable Handoff:** Every disruption view must conclude with a 1-click Copy Incident Brief button (plus selectable `<textarea>` plain-text fallback) containing verified UTC timestamps, exact Haversine kilometers, `"nearby"` phrasing (never `"affected"`), and clickable source URLs.

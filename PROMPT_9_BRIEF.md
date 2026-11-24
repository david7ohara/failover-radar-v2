Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing code. Do the Copy Incident Brief task only, in two parts. The runtime checklist is template-based (no LLM, no key).

Part A (spec first): update requirements.md Requirement 9 to match: the brief is plain text (it must read well when pasted into Slack, Discord, GitHub issues or email; no Markdown headings or tables), it includes the checklist labeled "Template checklist", and there is no AI wording or validation clause. Fix any other leftover AI or Markdown wording in the specs. Show me a summary and wait for approval before Part B.

Part B (build):
1. frontend/brief.js: a pure function buildBrief(radarData, checklists, stackSelection, options) returning plain text. It uses only fetched data, no invented values. Missing values are omitted.
2. Brief layout (plain text, short lines):
   - First line: "SIMULATION: ..." if simulating, else "Failover Radar status snapshot".
   - "As of [generated_at_utc]".
   - "Your stack: [n] regions, [n] providers" using the same computed counts as the banner (if no selection, say "Stack: all regions and providers").
   - Nearby quakes (closest first, at most 5): event id, magnitude, UTC time, place, region label, distance_km, the exact label "NEARBY (within 300 km)", USGS link. If more exist, say "and N more" where N is computed.
   - Provider status: name, indicator, description, fetched time (last_success), status page link, plus any degraded components (name, status).
   - Stale warnings with last_success for any stale feed.
   - Checklist: label "Template checklist" and the steps for the first nearby region or degraded provider.
   - Last lines: "Nearest alternative by distance (health not verified). Verify before shifting traffic." and "Seismic proximity and provider status are separate signals. Data from USGS, GitHub Status and Cloudflare Status."
   - All-clear case: "No nearby quake and no degraded provider in the data fetched at [time]. This does not guarantee nothing is wrong."
3. Wording rules: say "nearby." Never use "affected", "impacted", "healthy", "unhealthy", "caused" or "outage confirmed." All links https.
4. UI: a "Copy incident brief" button (at least 44px tall) and a visible read-only textarea showing the brief. On tap: try navigator.clipboard.writeText inside try/catch; on failure select the textarea (select() and setSelectionRange(0, 99999)) and try document.execCommand("copy"); if that also fails, show "Tap and hold the text, then Copy." Show a short "Copied" or fallback message. Fill the textarea via .value, never innerHTML.
5. The brief updates when data, selection or simulation changes. Never send the brief or the selection to the server.
6. Tests: if node is installed, use node --test on buildBrief (SIMULATION prefix, all-clear, stale warning, forbidden words absent, numbers all present in the input data, https links only, "and N more" count). If node is missing, tell me and skip. Do not run npm install and do not add packages.
7. Do not change backend code unless a field the brief needs is missing from the API. If so, tell me first.

Show your plan for Part B first and wait for my approval. After coding, run the tests, show the results, then stop.

Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing frontend. Do the stack runbook task only. Frontend only: do not change backend files, do not add packages, do not run npm install.

Part A (spec): add a short Requirement 10 to requirements.md: a "Copy stack runbook" button produces a plain-text, pre-incident summary of the user's selected stack, built only from data already fetched. Show me the diff and wait for approval.

Part B (build):
1. frontend/runbook.js: a pure function buildRunbook(radarData, stackSelection) returning plain text. Use only fetched data and the selection. Omit anything missing. If nothing is selected, include all regions and providers.
2. Content: first line "Failover Radar stack runbook (pre-incident)". Then "As of [generated_at_utc]". For each selected region: label and id, and its nearest alternative by distance with the exact label "Nearest alternative by distance (health not verified)", plus the line "Before shifting traffic, verify that region's health yourself." For each selected provider: name, status page link, current indicator and description, and its fetched time. Then stale warnings with last_success, and the final line "Seismic proximity and provider status are separate signals."
3. Wording: say "nearby." Never use "affected", "impacted", "healthy", "unhealthy", "caused" or "outage confirmed." Links are https only.
4. UI: a "Copy stack runbook" button at least 44px tall, using the same clipboard try/catch and textarea fallback as the brief. Fill textareas with .value, never innerHTML. Nothing is sent to the server.
5. Tests with node --test only if node is installed: output contains the labels, never contains banned words, all values come from the input, https links only.

Show your plan first and wait for my approval. After coding, run .venv/bin/python -m pytest -q and node --test frontend/*.test.js, report the results, and stop.
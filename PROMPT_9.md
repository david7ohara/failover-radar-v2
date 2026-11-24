Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing frontend. Do the Copy Incident Brief task only.

1. A formatting function that builds plain text from the existing /api/radar and checklist data: event id, magnitude, UTC time, region, distance_km, the exact classification label, relevant provider statuses with their fetched timestamps, links to the USGS event and Statuspage pages.
2. Start with "SIMULATION:" when the event is simulated. Use "nearby," never "affected."
3. Include the checklist with its label "Template checklist."
4. A Copy brief button using navigator.clipboard.writeText, plus a visible selectable textarea fallback. Test it on iPhone Safari.

Show your plan first and wait for my approval. Then stop.

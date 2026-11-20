Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing frontend. Do the My Stack task only.

1. A checklist of cloud regions (from /api/radar) and providers (GitHub, Cloudflare).
2. Save the selection in localStorage inside try/catch. If storage is blocked or empty, show everything and do not break.
3. A summary banner that only uses counts computed from the fetched data and the selected items (for example "1 of your 2 regions is nearby a quake"). Say "nearby," never "affected."
4. Show the nearest-alternative suggestion only for selected regions that are NEARBY.
5. Never send the selection to the server.

Show your plan first and wait for my approval. After coding, describe what I should see.

Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/. Do task T3 only (Statuspage feeds). Use the paths in design.md.

Rules: every number comes from a feed or a documented rule. Never invent data. Never call a cloud region healthy or unhealthy from provider status.

T3:
1. Async fetch with httpx of https://www.githubstatus.com/api/v2/summary.json and https://www.cloudflarestatus.com/api/v2/summary.json, 10-second timeout.
2. Normalize per provider: provider name, page URL, status indicator and description, components (name, status), incidents (id, name, impact, link).
3. In-memory cache, 300-second TTL. Same stale handling as T2 (stale: true plus last_success).
4. Map component statuses operational, degraded_performance, partial_outage, major_outage to severity 0, 1, 2, 3.
5. Create fixtures by downloading one real response per provider once with curl (I will approve it), trimmed. Do not hand-write them. If the real structure differs from my description, follow the real one and tell me.
6. Tests with no network: parsing against the fixtures, stale fallback, and a Hypothesis property test that a worse status never maps to a lower severity.

Show your plan and doubts first and wait for my approval. After coding, run the tests, show the results, then stop.

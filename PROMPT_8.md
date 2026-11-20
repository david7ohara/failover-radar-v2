Read all files in .kiro/steering/ and .kiro/specs/01-failover-radar/ and the existing code. Do the checklist task only.

1. GET /api/checklist?event_id=... builds its input from the backend's own data (event id, magnitude, distance_km, region, fetched provider status values). Never accept state from the client.
2. Template checklist first: deterministic text built from that data, labeled "Template checklist."
3. Optional LLM: if an OpenAI-compatible key is set in environment variables, ask the model for a short checklist from the structured input only. Never commit keys. Label the output "AI-generated suggestions. Verify before acting."
4. Validator: extract every number from the model output. If any number is not in the input data, reject the output and return the template instead.
5. Cache results by event id. If the LLM fails, is rate-limited, or no key is set, return the template.
6. Simulated events always start with "SIMULATION:".
7. Tests with no network: validator accepts and rejects correctly, fallback works, no key needed.

Show your plan first and wait for my approval. Then stop after the tests pass.

# Kiro Engineering Log (`KIRO_LOG.md`)

| Task | What Kiro did well | What I had to correct | Kiro feature used (specs, steering, tests) | Credits |
| :--- | :--- | :--- | :--- | :--- |
| **Prompt 0 (spec cleanup)** | Structured EARS requirements (`R1`–`R9`), `design.md`, and `tasks.md` cleanly | Tightened wording rules so speculative status words are banned | `.kiro/specs/01-failover-radar/`, `.kiro/steering/` | ~1.5 |
| **T1 geo core** | Implemented Haversine great-circle distance and 6 AWS region coordinates | Enforced exact `NEARBY (within 300 km)` threshold label | `specs`, `steering`, `pytest` + Hypothesis property tests | ~2.0 |
| **T2 USGS feed** | Built async USGS M4.5+ client with 60s TTL cache and stale fallback | Verified `last_success` timestamp handling on upstream timeout | `specs`, `steering`, mocked HTTPX `pytest` suite | ~2.5 |
| **T3 Statuspage feeds** | Parsed GitHub and Cloudflare Statuspage feeds with 300s cache | Kept provider status strictly separate from seismic proximity | `specs`, `steering`, mocked HTTPX `pytest` suite | ~2.5 |
| **T4 radar API** | Unified `/api/radar` response with nearest-alternative distance ranking | Required `"Nearest alternative by distance (health not verified)"` caveat | `specs`, `steering`, `pytest` | ~2.5 |
| **T5 deploy prep** | Added deterministic Tokyo M6.8 `simulate=true` scenario + Dockerfile | Ensured `SIMULATION:` prefix on all simulated outputs | `specs`, `steering`, `pytest`, Railway deploy | ~2.0 |
| **T6 map UI** | Built dark-mode Leaflet `1.9.4` radar map, `300 km` rings, and HUD cards | Replaced watermarked tiles with OpenStreetMap + compact mobile cards | `specs`, `steering`, DOM safety `pytest` | ~5.0 |
| **T7 My Stack** | Created pure `frontend/stack.js` (`localStorage` only) + mobile drawer | Handled empty selection cleanly (`"Pick at least one region or provider"`) | `specs`, `steering`, 20 `node --test` unit tests | ~3.5 |
| **T8 Template checklist** | Built deterministic `/api/checklist` + `checklist_templates.json` (no LLM) | Fixed mobile Safari scroll/scrim overlay & verified `https://` links | `specs`, `steering`, 70 `pytest` tests | ~6.1 |
| **T9 Copy incident brief** | Built pure `frontend/brief.js` + 3-stage Safari clipboard fallback | Updated `requirements.md` R9 from Markdown/AI wording to plain-text template | `specs`, `steering`, 14 `node --test` tests (`104` total) | ~7.2 |
| **T10 audit & docs** | Verified `70` pytest + `34` node tests and finalized `README.md` & `KIRO_LOG.md` | Removed an unsupported `.kiro/hooks` claim during the audit; a test-on-save hook (`.kiro/hooks/run-tests.json`) has since been added, so hooks are now used | Manual audit + `pytest` + `node --test` | 0.0 |

## Kiro CLI Notes
Hooks: `.kiro/hooks/run-tests.json` is a PostFileSave command hook that runs the backend tests after Kiro edits backend Python files. Observed: after Kiro edited backend/geo.py, no hook output appeared, so I could not confirm the hook fires in the CLI. The hook file is committed in .kiro/hooks/.
I also tried a wording-guard hook. A manual test showed it flagged comments and test files that list the banned words, so I removed it. Wording is enforced by tests instead.

- **What worked well:** Running Kiro CLI in a two-step **Plan -> Audit against `.kiro/steering/` -> Approve** workflow kept every file edit small, predictable, and 100% aligned with data-integrity rules. Starting fresh `kiro-cli chat` sessions (`0%` context) per task prevented context bloat and saved credits.
- **What did not / lessons learned:** Large multi-task prompts consumed extra context tokens, whereas breaking work into single-task prompts (`PROMPT_1.md`–`PROMPT_10.md`) with explicit file scopes kept credit usage low and test suites green on every commit.

# Implementation Plan (Tasks)

- [ ] **Task 1: Geospatial Core & USGS Telemetry Ingestion**
  - Create `backend/geo.py` implementing Haversine distance (`R = 6371.0 km`), the 6 predefined AWS regions, the 300 km `NEARBY (`).
  - Create `.kiro/hooks/run-tests.json` to run `pytest` automatically on backend edits and write a judge-ready `README.md`.

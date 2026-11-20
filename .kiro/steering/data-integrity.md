# Data Integrity & Anti-Hallucination Steering

## Strict Factual Rules
1. **Zero Invented Numbers:** Never generate synthetic damage percentages, financial loss estimates, outage probabilities, or AI confidence scores. Every number displayed in the UI or incident brief must come directly from raw USGS GeoJSON fields, Statuspage JSON fields, or deterministic Haversine distance calculations.
2. **Exact Proximity Threshold:** Use great-circle Haversine math (Earth radius = `6371.0 km`). Flag a cloud region as `NEARBY (within 300 km)` if and only if `distance_km <= 300.0`; otherwise classify as `CLEAR`.
3. **No False Causation:** Do not claim an earthquake caused a software outage unless explicitly stated in an official Statuspage incident report. Present seismic proximity and provider status as parallel telemetry signals.
4. **Mandatory Source Attribution:** Every earthquake event, status component, and AI-generated checklist must include clickable links to the original USGS event URL, Statuspage incident URL, and USGS/CartoDB data attributions.

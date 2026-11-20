Only T1. Fix these in your plan:
1. Define the three labels once as module constants and use them everywhere: NEARBY_LABEL = "NEARBY (within 300 km)", CLEAR_LABEL = "CLEAR", ALT_LABEL = "Nearest alternative by distance (health not verified)".
2. classify_proximity returns NEARBY_LABEL when distance_km <= 300.0, otherwise CLEAR_LABEL.
3. nearest_regions uses region-to-region haversine distance, excludes the region itself, breaks ties by region id, and labels the result with ALT_LABEL.
4. Add boundary tests at exactly 300.0 km and at 300.01 km.
Confirm these four points in a few lines, then wait for my approval.

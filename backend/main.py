"""
main.py — FastAPI application for Failover Radar.

Routes
------
GET /api/health           → liveness probe
GET /api/radar            → merged telemetry (quakes + providers + regions)
  ?simulate=false         → inject Tokyo M6.8 simulation when true

Static files from frontend/ are mounted at /.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles

from backend.feeds import fetch_cloudflare_status, fetch_github_status, fetch_usgs
from backend.geo import (
    CLEAR_LABEL,
    DEFAULT_THRESHOLD_KM,
    NEARBY_LABEL,
    REGIONS,
    classify_proximity,
    haversine,
    nearest_region,
)

# ---------------------------------------------------------------------------
# Simulation constants  (documented demo inputs — never change silently)
# ---------------------------------------------------------------------------

SIMULATION_ID = "SIMULATION-1"
SIMULATION_TITLE = "SIMULATION: Tokyo M6.8 — demo stress test"
SIMULATION_MAGNITUDE = 6.8
SIMULATION_TOKYO_LAT = 35.30   # chosen demo epicentre — approximate offshore Tokyo
SIMULATION_TOKYO_LON = 140.85  # chosen demo epicentre — approximate offshore Tokyo
SIMULATION_DEPTH_KM = 10.0
SIMULATION_PLACE = "SIMULATION: offshore Tokyo, Japan"
SIMULATION_URL = "https://earthquake.usgs.gov/"  # placeholder — no real USGS event

# ---------------------------------------------------------------------------
# Attribution block (shown in every /api/radar response)
# ---------------------------------------------------------------------------

ATTRIBUTION = {
    "usgs": {
        "name": "USGS Earthquake Hazards Program",
        "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    },
    "github_status": {
        "name": "GitHub Status",
        "url": "https://www.githubstatus.com/api/v2/summary.json",
    },
    "cloudflare_status": {
        "name": "Cloudflare Status",
        "url": "https://www.cloudflarestatus.com/api/v2/summary.json",
    },
    "map_tiles": {
        "name": "© OpenStreetMap contributors",
        "url": "https://www.openstreetmap.org/copyright",
    },
}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Failover Radar", version="0.1.0")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Radar
# ---------------------------------------------------------------------------


def _build_simulation_quake() -> dict[str, Any]:
    """Return the fixed Tokyo M6.8 simulation event (distances computed at call time)."""
    return {
        "id": SIMULATION_ID,
        "magnitude": SIMULATION_MAGNITUDE,
        "place": SIMULATION_PLACE,
        "lat": SIMULATION_TOKYO_LAT,
        "lon": SIMULATION_TOKYO_LON,
        "depth_km": SIMULATION_DEPTH_KM,
        "time_utc": datetime.now(tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "url": SIMULATION_URL,
        "simulated": True,
        "title": SIMULATION_TITLE,
    }


def _enrich_quake_for_region(
    quake: dict[str, Any],
    region: dict[str, Any],
) -> dict[str, Any]:
    """Return a slim dict with distance and classification for one quake↔region pair."""
    distance_km = haversine(quake["lat"], quake["lon"], region["lat"], region["lon"])
    return {
        "quake_id": quake["id"],
        "magnitude": quake["magnitude"],
        "place": quake["place"],
        "time_utc": quake["time_utc"],
        "url": quake["url"],
        "distance_km": round(distance_km, 2),
        "classification": classify_proximity(distance_km),
        "simulated": quake.get("simulated", False),
    }


def _build_region_entry(
    region: dict[str, Any],
    all_quakes: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build the per-region section of the radar response.

    nearby_quakes  — quakes (live or simulated) within 300 km
    classification — NEARBY if any quake is within 300 km, else CLEAR
    nearest_alternative — computed by geo.nearest_region (region-to-region)
    """
    enriched = [_enrich_quake_for_region(q, region) for q in all_quakes]
    nearby = [e for e in enriched if e["classification"] == NEARBY_LABEL]

    if nearby:
        roll_up = NEARBY_LABEL
    else:
        roll_up = CLEAR_LABEL

    return {
        "id": region["id"],
        "label": region["label"],
        "lat": region["lat"],
        "lon": region["lon"],
        "classification": roll_up,
        "nearby_quakes": nearby,
        "nearest_alternative": nearest_region(region["id"], REGIONS),
    }


@app.get("/api/radar")
async def radar(
    simulate: bool = Query(default=False, description="Inject Tokyo M6.8 simulation quake"),
) -> dict[str, Any]:
    # Fetch all three feeds concurrently
    import asyncio

    usgs_data, github_data, cloudflare_data = await asyncio.gather(
        fetch_usgs(),
        fetch_github_status(),
        fetch_cloudflare_status(),
    )

    live_quakes: list[dict[str, Any]] = usgs_data["earthquakes"]
    live_count = len(live_quakes)

    # All quakes used for proximity calculations (live + optional simulation)
    all_quakes = list(live_quakes)
    if simulate:
        sim_quake = _build_simulation_quake()
        all_quakes.append(sim_quake)

    # Build per-region entries
    regions_out = [_build_region_entry(r, all_quakes) for r in REGIONS]

    # Quake list in the response includes the simulation entry when active
    quakes_out = list(live_quakes)
    if simulate:
        quakes_out.append(sim_quake)

    return {
        "generated_at_utc": datetime.now(tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "threshold_km": DEFAULT_THRESHOLD_KM,
        "quakes": {
            "live_count": live_count,
            "stale": usgs_data["stale"],
            "last_success": usgs_data["last_success"],
            "items": quakes_out,
        },
        "providers": [
            {**github_data},
            {**cloudflare_data},
        ],
        "regions": regions_out,
        "attribution": ATTRIBUTION,
    }


# ---------------------------------------------------------------------------
# Static files  (frontend/ at /)
# ---------------------------------------------------------------------------

app.mount(
    "/",
    StaticFiles(directory="frontend", html=True),
    name="frontend",
)

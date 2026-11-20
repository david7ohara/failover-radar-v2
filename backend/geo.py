"""
geo.py — Haversine proximity engine for Failover Radar.

All coordinates come from backend/data/regions.json (approximate: true).
No numbers are invented here; every threshold is a documented rule.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Labels — defined once, used everywhere
# ---------------------------------------------------------------------------

NEARBY_LABEL = "NEARBY (within 300 km)"
CLEAR_LABEL = "CLEAR"
ALT_LABEL = "Nearest alternative by distance (health not verified)"

# ---------------------------------------------------------------------------
# Earth radius (km) — fixed by the data-integrity steering rule
# ---------------------------------------------------------------------------

EARTH_RADIUS_KM = 6371.0

# ---------------------------------------------------------------------------
# Region registry
# ---------------------------------------------------------------------------

_REGIONS_PATH = Path(__file__).parent / "data" / "regions.json"


def load_regions() -> list[dict[str, Any]]:
    """Load region entries from the data file."""
    with _REGIONS_PATH.open() as fh:
        return json.load(fh)


REGIONS: list[dict[str, Any]] = load_regions()

# ---------------------------------------------------------------------------
# Haversine distance
# ---------------------------------------------------------------------------


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in kilometres between two points.

    Uses the Haversine formula with R = 6371.0 km.
    Input coordinates are decimal degrees.
    """
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)

    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(d_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_KM * c


# ---------------------------------------------------------------------------
# Proximity classification
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLD_KM = 300.0


def classify_proximity(distance_km: float, threshold_km: float = DEFAULT_THRESHOLD_KM) -> str:
    """Return NEARBY_LABEL when distance_km <= threshold_km, else CLEAR_LABEL."""
    if distance_km <= threshold_km:
        return NEARBY_LABEL
    return CLEAR_LABEL


# ---------------------------------------------------------------------------
# Nearest-alternative lookup (region-to-region)
# ---------------------------------------------------------------------------


def nearest_region(region_id: str, regions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Return the nearest other region to the given region.

    Ties are broken alphabetically by region id.
    The result dict includes the ALT_LABEL under the key 'relationship'.
    """
    if regions is None:
        regions = REGIONS

    target = next((r for r in regions if r["id"] == region_id), None)
    if target is None:
        raise ValueError(f"Unknown region id: {region_id!r}")

    candidates = [r for r in regions if r["id"] != region_id]
    if not candidates:
        raise ValueError("No other regions available for nearest-alternative lookup.")

    # Sort by distance first, then by id to break ties deterministically
    ranked = sorted(
        candidates,
        key=lambda r: (
            haversine(target["lat"], target["lon"], r["lat"], r["lon"]),
            r["id"],
        ),
    )
    best = ranked[0]
    distance_km = haversine(target["lat"], target["lon"], best["lat"], best["lon"])

    return {
        "id": best["id"],
        "label": best["label"],
        "distance_km": round(distance_km, 2),
        "relationship": ALT_LABEL,
    }


# ---------------------------------------------------------------------------
# Convenience: evaluate one epicentre against all regions
# ---------------------------------------------------------------------------


def evaluate_epicentre(
    epi_lat: float,
    epi_lon: float,
    regions: list[dict[str, Any]] | None = None,
    threshold_km: float = DEFAULT_THRESHOLD_KM,
) -> list[dict[str, Any]]:
    """Return proximity results for every region against a single epicentre.

    Each result contains: region id, label, distance_km, status, and
    the nearest alternative region (region-to-region, not epicentre-to-region).
    """
    if regions is None:
        regions = REGIONS

    results = []
    for region in regions:
        distance_km = haversine(epi_lat, epi_lon, region["lat"], region["lon"])
        results.append(
            {
                "region_id": region["id"],
                "region_label": region["label"],
                "distance_km": round(distance_km, 2),
                "status": classify_proximity(distance_km, threshold_km),
                "nearest_alternative": nearest_region(region["id"], regions),
            }
        )
    return results

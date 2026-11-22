"""
feeds.py — async data fetchers with in-memory TTL caching and stale fallback.

T2: USGS M4.5+ earthquake feed.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USGS_URL = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
)
USGS_TTL_SECONDS = 60
USGS_TIMEOUT_SECONDS = 10.0

# ---------------------------------------------------------------------------
# In-memory cache  (payload, fetched_at_monotonic, fetched_at_utc_iso)
# ---------------------------------------------------------------------------

_usgs_cache: dict[str, Any] = {
    "earthquakes": [],
    "stale": True,
    "last_success": None,
    "_fetched_at": None,  # monotonic float, None means never fetched
}


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

def _epoch_ms_to_utc_iso(epoch_ms: int) -> str:
    """Convert epoch milliseconds to an ISO 8601 UTC string."""
    dt = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _normalise_feature(feature: dict[str, Any]) -> dict[str, Any]:
    """
    Extract the fields we care about from a GeoJSON Feature.

    GeoJSON coordinate order is [longitude, latitude, depth_km].
    """
    props = feature["properties"]
    lon, lat, depth_km = feature["geometry"]["coordinates"]
    return {
        "id": feature["id"],
        "magnitude": props["mag"],
        "place": props["place"],
        "lat": lat,
        "lon": lon,
        "depth_km": depth_km,
        "time_utc": _epoch_ms_to_utc_iso(props["time"]),
        "url": props["url"],
    }


# ---------------------------------------------------------------------------
# Public fetch function
# ---------------------------------------------------------------------------

async def fetch_usgs() -> dict[str, Any]:
    """
    Return normalised USGS earthquake data.

    Cached for USGS_TTL_SECONDS seconds.  On any network error or HTTP 5xx,
    returns the last cached payload with stale=True.  If no cache exists yet,
    returns an empty list with stale=True and last_success=None.
    """
    now = time.monotonic()
    fetched_at = _usgs_cache["_fetched_at"]

    # Cache hit
    if fetched_at is not None and (now - fetched_at) < USGS_TTL_SECONDS:
        return {
            "earthquakes": _usgs_cache["earthquakes"],
            "stale": False,
            "last_success": _usgs_cache["last_success"],
        }

    # Attempt a fresh fetch
    try:
        async with httpx.AsyncClient(timeout=USGS_TIMEOUT_SECONDS) as client:
            response = await client.get(USGS_URL)

        if response.status_code >= 500:
            raise httpx.HTTPStatusError(
                f"HTTP {response.status_code}",
                request=response.request,
                response=response,
            )

        geojson = response.json()
        earthquakes = [
            _normalise_feature(f) for f in geojson.get("features", [])
        ]
        utc_now = datetime.now(tz=timezone.utc).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")

        # Update cache
        _usgs_cache["earthquakes"] = earthquakes
        _usgs_cache["last_success"] = utc_now
        _usgs_cache["_fetched_at"] = time.monotonic()

        return {
            "earthquakes": earthquakes,
            "stale": False,
            "last_success": utc_now,
        }

    except Exception:
        # Return whatever we have (may be empty list from initial state)
        return {
            "earthquakes": _usgs_cache["earthquakes"],
            "stale": True,
            "last_success": _usgs_cache["last_success"],
        }

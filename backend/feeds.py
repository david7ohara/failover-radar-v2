"""
feeds.py — async data fetchers with in-memory TTL caching and stale fallback.

T2: USGS M4.5+ earthquake feed.
T3: GitHub and Cloudflare Statuspage feeds.
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

STATUSPAGE_TTL_SECONDS = 300
STATUSPAGE_TIMEOUT_SECONDS = 10.0

GITHUB_STATUS_URL = "https://www.githubstatus.com/api/v2/summary.json"
CLOUDFLARE_STATUS_URL = "https://www.cloudflarestatus.com/api/v2/summary.json"

# Component status → severity (0 = healthy, 3 = worst).
# Any unrecognised status string maps to 0 (safe default: don't claim degradation
# that the data doesn't confirm).
_COMPONENT_SEVERITY: dict[str, int] = {
    "operational": 0,
    "degraded_performance": 1,
    "partial_outage": 2,
    "major_outage": 3,
}

# ---------------------------------------------------------------------------
# In-memory caches  (payload, fetched_at_monotonic, fetched_at_utc_iso)
# ---------------------------------------------------------------------------

_usgs_cache: dict[str, Any] = {
    "earthquakes": [],
    "stale": True,
    "last_success": None,
    "_fetched_at": None,  # monotonic float, None means never fetched
}

def _empty_sp_cache() -> dict[str, Any]:
    return {
        "provider": None,
        "page_url": None,
        "indicator": None,
        "description": None,
        "components": [],
        "incidents": [],
        "stale": True,
        "last_success": None,
        "_fetched_at": None,
    }

_github_cache: dict[str, Any] = _empty_sp_cache()
_cloudflare_cache: dict[str, Any] = _empty_sp_cache()


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


# ---------------------------------------------------------------------------
# Statuspage normalisation helpers (T3)
# ---------------------------------------------------------------------------

def component_severity(status: str) -> int:
    """
    Map a Statuspage component status string to an integer severity.

    Known mappings:
        operational          → 0
        degraded_performance → 1
        partial_outage       → 2
        major_outage         → 3

    Any unrecognised string maps to 0 (safe default: don't assert degradation
    that the upstream data doesn't confirm).
    """
    return _COMPONENT_SEVERITY.get(status, 0)


def _normalise_statuspage(raw: dict[str, Any], provider_name: str) -> dict[str, Any]:
    """
    Extract the fields we care about from an Atlassian Statuspage
    /api/v2/summary.json response.

    Real-API notes (confirmed from live responses 2025-11-22):
    - Incidents carry ``shortlink`` (not ``url``). We surface it as ``url``.
    - Components that are group containers carry a ``components`` key with a
      list of child IDs (strings, not objects). We skip that key; we only
      store ``name``, ``status``, and computed ``severity``.
    - ``scheduled_maintenances`` is ignored; only active ``incidents`` are
      surfaced.
    """
    page = raw.get("page", {})
    status = raw.get("status", {})

    components = [
        {
            "name": c["name"],
            "status": c["status"],
            "severity": component_severity(c["status"]),
        }
        for c in raw.get("components", [])
    ]

    incidents = [
        {
            "id": inc["id"],
            "name": inc["name"],
            "impact": inc.get("impact", ""),
            "url": inc.get("shortlink", ""),
        }
        for inc in raw.get("incidents", [])
    ]

    return {
        "provider": provider_name,
        "page_url": page.get("url", ""),
        "indicator": status.get("indicator", ""),
        "description": status.get("description", ""),
        "components": components,
        "incidents": incidents,
    }


async def _fetch_statuspage(
    url: str,
    provider_name: str,
    cache: dict[str, Any],
) -> dict[str, Any]:
    """
    Generic Statuspage fetcher with 300-second TTL and stale fallback.

    On timeout, network error, or HTTP 5xx, returns the last cached payload
    with ``stale: True``.  If no cache exists yet, returns empty data with
    ``stale: True`` and ``last_success: None``.
    """
    now = time.monotonic()
    fetched_at = cache["_fetched_at"]

    # Cache hit
    if fetched_at is not None and (now - fetched_at) < STATUSPAGE_TTL_SECONDS:
        return {
            "provider": cache["provider"],
            "page_url": cache["page_url"],
            "indicator": cache["indicator"],
            "description": cache["description"],
            "components": cache["components"],
            "incidents": cache["incidents"],
            "stale": False,
            "last_success": cache["last_success"],
        }

    # Attempt a fresh fetch
    try:
        async with httpx.AsyncClient(timeout=STATUSPAGE_TIMEOUT_SECONDS) as client:
            response = await client.get(url)

        if response.status_code >= 500:
            raise httpx.HTTPStatusError(
                f"HTTP {response.status_code}",
                request=response.request,
                response=response,
            )

        normalised = _normalise_statuspage(response.json(), provider_name)
        utc_now = (
            datetime.now(tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

        # Update cache in-place
        cache.update(normalised)
        cache["stale"] = False
        cache["last_success"] = utc_now
        cache["_fetched_at"] = time.monotonic()

        return {**normalised, "stale": False, "last_success": utc_now}

    except Exception:
        # Return whatever we have cached (may be empty from initial state)
        return {
            "provider": cache["provider"],
            "page_url": cache["page_url"],
            "indicator": cache["indicator"],
            "description": cache["description"],
            "components": cache["components"],
            "incidents": cache["incidents"],
            "stale": True,
            "last_success": cache["last_success"],
        }


async def fetch_github_status() -> dict[str, Any]:
    """Return normalised GitHub Statuspage data with caching."""
    return await _fetch_statuspage(GITHUB_STATUS_URL, "GitHub", _github_cache)


async def fetch_cloudflare_status() -> dict[str, Any]:
    """Return normalised Cloudflare Statuspage data with caching."""
    return await _fetch_statuspage(
        CLOUDFLARE_STATUS_URL, "Cloudflare", _cloudflare_cache
    )

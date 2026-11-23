"""
Tests for backend/main.py — /api/health and /api/radar.

No network calls: fetch_usgs, fetch_github_status, fetch_cloudflare_status
are all patched with fixtures.  All distance/classification assertions use
values computed by the real Haversine implementation in geo.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# Feed return-value builders
# ---------------------------------------------------------------------------

def _usgs_result(quakes: list[dict], stale: bool = False, last_success: str | None = "2025-01-01T00:00:00.000Z") -> dict:
    return {"earthquakes": quakes, "stale": stale, "last_success": last_success}


def _sp_result(provider: str, stale: bool = False, last_success: str | None = "2025-01-01T00:00:00.000Z") -> dict:
    return {
        "provider": provider,
        "page_url": f"https://www.{provider.lower()}status.com",
        "indicator": "none",
        "description": "All Systems Operational",
        "components": [],
        "incidents": [],
        "stale": stale,
        "last_success": last_success,
    }


# ---------------------------------------------------------------------------
# A minimal live quake NEAR ap-northeast-1 (Tokyo)
# Fixture quake 2: lat=34.4089, lon=140.131 → 146.93 km from ap-northeast-1
# ---------------------------------------------------------------------------

NEAR_TOKYO_QUAKE: dict[str, Any] = {
    "id": "us6000ucn8",
    "magnitude": 5.5,
    "place": "near the east coast of Honshu, Japan",
    "lat": 34.4089,
    "lon": 140.131,
    "depth_km": 65.465,
    "time_utc": "2026-11-13T10:10:44.504Z",
    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000ucn8",
}

# A quake far from every region
FAR_QUAKE: dict[str, Any] = {
    "id": "us6000ucni",
    "magnitude": 5.1,
    "place": "Jujuy, Argentina",
    "lat": -23.0294,
    "lon": -66.519,
    "depth_km": 209.784,
    "time_utc": "2026-11-13T05:50:14.280Z",
    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000ucni",
}


# ---------------------------------------------------------------------------
# Client fixture — reimport app inside each test so module state is fresh
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    from backend.main import app
    return TestClient(app, raise_server_exceptions=True)


# ===========================================================================
# T4-H: /api/health
# ===========================================================================

def test_health_returns_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ===========================================================================
# T4-1: Response shape — required top-level keys always present
# ===========================================================================

def test_radar_response_shape(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    assert r.status_code == 200
    body = r.json()

    for key in ("generated_at_utc", "quakes", "providers", "regions", "attribution"):
        assert key in body, f"Missing top-level key: {key!r}"

    # quakes sub-shape
    for key in ("live_count", "stale", "last_success", "items"):
        assert key in body["quakes"], f"Missing quakes key: {key!r}"

    # providers is a list of two
    assert isinstance(body["providers"], list)
    assert len(body["providers"]) == 2

    # regions: one entry per loaded region (6)
    assert len(body["regions"]) == 6

    # each region entry has the required keys
    for reg in body["regions"]:
        for key in ("id", "label", "lat", "lon", "classification", "nearby_quakes", "nearest_alternative"):
            assert key in reg, f"Region {reg.get('id')!r} missing key {key!r}"

    # attribution contains the four expected source keys
    for key in ("usgs", "github_status", "cloudflare_status", "map_tiles"):
        assert key in body["attribution"], f"Missing attribution key: {key!r}"


# ===========================================================================
# T4-2: Classification — nearby quake ≤300 km → NEARBY; far quake → CLEAR
# ===========================================================================

def test_classification_nearby_and_clear(client):
    """
    NEAR_TOKYO_QUAKE is 146.93 km from ap-northeast-1 → NEARBY.
    FAR_QUAKE is >10 000 km from every region → all CLEAR for that quake.
    """
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(
            return_value=_usgs_result([NEAR_TOKYO_QUAKE, FAR_QUAKE]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    regions = {reg["id"]: reg for reg in body["regions"]}

    # ap-northeast-1 must be NEARBY (NEAR_TOKYO_QUAKE is 146.93 km away)
    tokyo_region = regions["ap-northeast-1"]
    assert tokyo_region["classification"] == "NEARBY (within 300 km)"
    assert len(tokyo_region["nearby_quakes"]) == 1
    nearby = tokyo_region["nearby_quakes"][0]
    assert nearby["quake_id"] == "us6000ucn8"
    assert nearby["classification"] == "NEARBY (within 300 km)"
    assert nearby["distance_km"] == pytest.approx(146.93, abs=1.0)

    # All other regions must be CLEAR (no quake within 300 km)
    for region_id, reg in regions.items():
        if region_id == "ap-northeast-1":
            continue
        assert reg["classification"] == "CLEAR", (
            f"{region_id} should be CLEAR, got {reg['classification']!r}"
        )
        assert reg["nearby_quakes"] == []


# ===========================================================================
# T4-3: No quakes → all regions CLEAR
# ===========================================================================

def test_no_quakes_all_regions_clear(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    for reg in body["regions"]:
        assert reg["classification"] == "CLEAR"
        assert reg["nearby_quakes"] == []


# ===========================================================================
# T4-4: Simulation — adds exactly one event, labeled correctly, excluded from live_count
# ===========================================================================

def test_simulation_adds_one_event(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([FAR_QUAKE]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar?simulate=true")

    body = r.json()
    items = body["quakes"]["items"]

    # live_count must NOT include the simulation event
    assert body["quakes"]["live_count"] == 1  # only FAR_QUAKE

    # Total items = 1 live + 1 simulated
    assert len(items) == 2

    sim_items = [q for q in items if q.get("simulated") is True]
    assert len(sim_items) == 1, "Exactly one simulated item expected"

    sim = sim_items[0]
    assert sim["id"] == "SIMULATION-1"
    assert sim["title"].startswith("SIMULATION:")
    assert sim["magnitude"] == 6.8
    assert sim["lat"] == pytest.approx(35.30)
    assert sim["lon"] == pytest.approx(140.85)
    assert sim["simulated"] is True


# ===========================================================================
# T4-5: Simulation — ap-northeast-1 is NEARBY (113.20 km); others CLEAR
# ===========================================================================

def test_simulation_classification(client):
    """
    Simulation epicentre (35.30, 140.85) is 113.20 km from ap-northeast-1 → NEARBY.
    No other region is within 300 km of that point.
    """
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar?simulate=true")

    body = r.json()
    regions = {reg["id"]: reg for reg in body["regions"]}

    tokyo = regions["ap-northeast-1"]
    assert tokyo["classification"] == "NEARBY (within 300 km)"
    assert len(tokyo["nearby_quakes"]) == 1
    sim_entry = tokyo["nearby_quakes"][0]
    assert sim_entry["quake_id"] == "SIMULATION-1"
    assert sim_entry["simulated"] is True
    assert sim_entry["distance_km"] == pytest.approx(113.20, abs=1.0)

    for region_id, reg in regions.items():
        if region_id == "ap-northeast-1":
            continue
        assert reg["classification"] == "CLEAR", (
            f"{region_id} should be CLEAR for sim quake, got {reg['classification']!r}"
        )


# ===========================================================================
# T4-6: Simulation=false — no simulated items appear
# ===========================================================================

def test_no_simulation_by_default(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([FAR_QUAKE]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    items = body["quakes"]["items"]
    sim_items = [q for q in items if q.get("simulated") is True]
    assert sim_items == []
    assert body["quakes"]["live_count"] == 1


# ===========================================================================
# T4-7: Stale flags pass through from both feeds
# ===========================================================================

def test_stale_flags_pass_through(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(
            return_value=_usgs_result([], stale=True, last_success="2025-01-01T00:00:00.000Z"))),
        patch("backend.main.fetch_github_status", new=AsyncMock(
            return_value={**_sp_result("GitHub"), "stale": True, "last_success": "2025-01-01T00:00:00.000Z"})),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(
            return_value={**_sp_result("Cloudflare"), "stale": True, "last_success": "2025-01-01T00:00:00.000Z"})),
    ):
        r = client.get("/api/radar")

    body = r.json()
    assert body["quakes"]["stale"] is True
    assert body["quakes"]["last_success"] == "2025-01-01T00:00:00.000Z"

    for provider in body["providers"]:
        assert provider["stale"] is True
        assert provider["last_success"] == "2025-01-01T00:00:00.000Z"


# ===========================================================================
# T4-8: nearest_alternative is present on every region, labeled correctly
# ===========================================================================

def test_nearest_alternative_label(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    for reg in body["regions"]:
        alt = reg["nearest_alternative"]
        assert alt["relationship"] == "Nearest alternative by distance (health not verified)"
        assert alt["id"] != reg["id"]
        assert alt["distance_km"] > 0


# ===========================================================================
# T4-9: Nearby quake entry carries all required fields
# ===========================================================================

def test_nearby_quake_entry_fields(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(
            return_value=_usgs_result([NEAR_TOKYO_QUAKE]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    regions = {reg["id"]: reg for reg in body["regions"]}
    nearby = regions["ap-northeast-1"]["nearby_quakes"][0]

    for field in ("quake_id", "magnitude", "place", "time_utc", "url", "distance_km", "classification", "simulated"):
        assert field in nearby, f"nearby_quake missing field {field!r}"

    assert nearby["simulated"] is False


# ===========================================================================
# T4-10: Attribution block contains clickable URLs for all required sources
# ===========================================================================

def test_attribution_urls(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    attribution = r.json()["attribution"]
    assert "earthquake.usgs.gov" in attribution["usgs"]["url"]
    assert "githubstatus.com" in attribution["github_status"]["url"]
    assert "cloudflarestatus.com" in attribution["cloudflare_status"]["url"]
    assert "carto.com" in attribution["map_tiles"]["url"]


# ===========================================================================
# T6-1: threshold_km is present in /api/radar and equals exactly 300.0
# ===========================================================================

def test_threshold_km_field(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    body = r.json()
    assert "threshold_km" in body, "threshold_km must be a top-level field in /api/radar"
    assert body["threshold_km"] == 300.0


# ===========================================================================
# T6-2: Static files — GET / returns HTTP 200 (frontend is mounted)
# ===========================================================================

def test_static_root_returns_200(client):
    r = client.get("/")
    assert r.status_code == 200


# ===========================================================================
# T6-3: Attribution strings — required display names are present
# ===========================================================================

def test_attribution_display_names(client):
    with (
        patch("backend.main.fetch_usgs", new=AsyncMock(return_value=_usgs_result([]))),
        patch("backend.main.fetch_github_status", new=AsyncMock(return_value=_sp_result("GitHub"))),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=_sp_result("Cloudflare"))),
    ):
        r = client.get("/api/radar")

    attribution = r.json()["attribution"]
    assert "USGS" in attribution["usgs"]["name"]
    assert "GitHub" in attribution["github_status"]["name"]
    assert "Cloudflare" in attribution["cloudflare_status"]["name"]
    # CartoDB tile attribution must name both CartoDB and OpenStreetMap
    map_tile_name = attribution["map_tiles"]["name"]
    assert "CartoDB" in map_tile_name
    assert "OpenStreetMap" in map_tile_name

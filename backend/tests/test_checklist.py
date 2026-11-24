"""
Tests for backend/checklist.py and GET /api/checklist.

No network calls: all HTTP fetches are patched with fixtures.
Covers:
  TC-1  quake_nearby scenario renders
  TC-2  provider_degraded scenario renders
  TC-3  both scenario renders
  TC-4  all_clear scenario renders (includes "does not guarantee" caveat)
  TC-5  every number in output exists in the input data
  TC-6  simulate=True → title starts with "SIMULATION:"
  TC-7  stale feed → stale_feeds list is non-empty with last_success
  TC-8  unknown region_id → 404
  TC-9  unknown event_id → 404
  TC-10 forbidden words absent from templates file and all scenario responses
  TC-11 all links in every scenario response are https:// only
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.checklist import build_checklist, _TEMPLATES_PATH

# ---------------------------------------------------------------------------
# Shared test data — all numbers come from these dicts (never invented here)
# ---------------------------------------------------------------------------

REGION_ID   = "ap-northeast-1"
EVENT_ID    = "us6000test1"
MAGNITUDE   = 5.7
DISTANCE_KM = 146.93

_NEARBY_QUAKE: dict[str, Any] = {
    "id":         EVENT_ID,
    "magnitude":  MAGNITUDE,
    "place":      "near the east coast of Honshu, Japan",
    "lat":        34.4089,
    "lon":        140.131,
    "depth_km":   65.465,
    "time_utc":   "2026-11-13T10:10:44.504Z",
    "url":        "https://earthquake.usgs.gov/earthquakes/eventpage/us6000test1",
}

_GITHUB_DEGRADED: dict[str, Any] = {
    "provider":    "GitHub",
    "page_url":    "https://www.githubstatus.com/",
    "indicator":   "partial_outage",
    "description": "Partial system degradation",
    "components":  [{"name": "API Requests", "status": "partial_outage", "severity": 2}],
    "incidents":   [
        {
            "id":   "inc001",
            "name": "API latency spike",
            "impact": "minor",
            "url":  "https://www.githubstatus.com/incidents/inc001",
        }
    ],
    "stale":        False,
    "last_success": "2025-01-01T00:00:00.000Z",
}

_GITHUB_OK: dict[str, Any] = {
    "provider":    "GitHub",
    "page_url":    "https://www.githubstatus.com/",
    "indicator":   "none",
    "description": "All Systems Operational",
    "components":  [],
    "incidents":   [],
    "stale":        False,
    "last_success": "2025-01-01T00:00:00.000Z",
}

_CLOUDFLARE_OK: dict[str, Any] = {
    "provider":    "Cloudflare",
    "page_url":    "https://www.cloudflarestatus.com/",
    "indicator":   "none",
    "description": "All Systems Operational",
    "components":  [],
    "incidents":   [],
    "stale":        False,
    "last_success": "2025-01-01T00:00:00.000Z",
}


def _make_radar_data(
    quakes: list[dict],
    providers: list[dict],
    simulate: bool = False,
    stale_usgs: bool = False,
) -> dict[str, Any]:
    """
    Build a minimal radar_data dict shaped like /api/radar.

    Proximity enrichment for the quake is included inline so that
    build_checklist can find quake_id/distance_km in nearby_quakes.
    """
    from backend.geo import REGIONS, haversine, classify_proximity, nearest_region

    # Enrich quakes for every region
    regions_out = []
    for r in REGIONS:
        nearby = []
        for q in quakes:
            dist = round(haversine(q["lat"], q["lon"], r["lat"], r["lon"]), 2)
            if classify_proximity(dist) == "NEARBY (within 300 km)":
                nearby.append({
                    "quake_id":       q["id"],
                    "magnitude":      q["magnitude"],
                    "place":          q["place"],
                    "time_utc":       q["time_utc"],
                    "url":            q["url"],
                    "distance_km":    dist,
                    "classification": "NEARBY (within 300 km)",
                    "simulated":      q.get("simulated", False),
                })
        regions_out.append({
            "id":                 r["id"],
            "label":              r["label"],
            "lat":                r["lat"],
            "lon":                r["lon"],
            "classification":     "NEARBY (within 300 km)" if nearby else "CLEAR",
            "nearby_quakes":      nearby,
            "nearest_alternative": nearest_region(r["id"], REGIONS),
        })

    return {
        "quakes": {
            "stale":        stale_usgs,
            "last_success": "2025-01-01T00:00:00.000Z" if not stale_usgs else "2024-12-31T00:00:00.000Z",
            "items":        quakes,
        },
        "providers": providers,
        "regions":   regions_out,
        "attribution": {
            "usgs": {
                "name": "USGS Earthquake Hazards Program",
                "url":  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
            }
        },
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FORBIDDEN = re.compile(
    r"\b(affected|impacted|healthy|unhealthy|caused|outage confirmed)\b",
    re.IGNORECASE,
)

HTTPS_RE = re.compile(r"^https://", re.IGNORECASE)

def _all_links(obj: Any) -> list[str]:
    """Recursively collect all string values whose key is 'link' or 'url'."""
    links: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("link", "url") and isinstance(v, str) and v:
                links.append(v)
            else:
                links.extend(_all_links(v))
    elif isinstance(obj, list):
        for item in obj:
            links.extend(_all_links(item))
    return links


def _all_numbers_in_text(obj: Any) -> set[str]:
    """Collect every numeric substring from string and numeric values in obj."""
    nums: set[str] = set()
    if isinstance(obj, dict):
        for v in obj.values():
            nums |= _all_numbers_in_text(v)
    elif isinstance(obj, list):
        for item in obj:
            nums |= _all_numbers_in_text(item)
    elif isinstance(obj, str):
        for m in re.finditer(r"\d+\.\d+|\d+", obj):
            nums.add(m.group())
    elif isinstance(obj, (int, float)):
        # Stringify and extract all numeric tokens (handles 146.93, 5.7, etc.)
        for m in re.finditer(r"\d+\.\d+|\d+", str(obj)):
            nums.add(m.group())
    return nums


# ---------------------------------------------------------------------------
# TC-1: quake_nearby scenario
# ---------------------------------------------------------------------------

def test_quake_nearby_scenario():
    radar = _make_radar_data([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider=None,
        simulate=False,
        radar_data=radar,
    )

    assert result["label"] == "Template checklist"
    assert result["scenario"] == "quake_nearby"
    assert isinstance(result["steps"], list)
    assert len(result["steps"]) > 0

    # Title must mention the region
    region_label = next(r["label"] for r in radar["regions"] if r["id"] == REGION_ID)
    assert region_label in result["title"]

    # At least one step mentions the magnitude
    texts = " ".join(s["text"] for s in result["steps"])
    assert str(MAGNITUDE) in texts


# ---------------------------------------------------------------------------
# TC-2: provider_degraded scenario
# ---------------------------------------------------------------------------

def test_provider_degraded_scenario():
    # No quakes — only a degraded provider
    radar = _make_radar_data([], [_GITHUB_DEGRADED, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=None,
        event_id=None,
        provider="GitHub",
        simulate=False,
        radar_data=radar,
    )

    assert result["label"] == "Template checklist"
    assert result["scenario"] == "provider_degraded"
    assert len(result["steps"]) > 0

    texts = " ".join(s["text"] for s in result["steps"])
    assert "GitHub" in texts


# ---------------------------------------------------------------------------
# TC-3: both scenario
# ---------------------------------------------------------------------------

def test_both_scenario():
    radar = _make_radar_data([_NEARBY_QUAKE], [_GITHUB_DEGRADED, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider="GitHub",
        simulate=False,
        radar_data=radar,
    )

    assert result["scenario"] == "both"
    texts = " ".join(s["text"] for s in result["steps"])
    assert str(MAGNITUDE) in texts
    assert "GitHub" in texts


# ---------------------------------------------------------------------------
# TC-4: all_clear scenario — includes "does not guarantee" caveat
# ---------------------------------------------------------------------------

def test_all_clear_scenario():
    radar = _make_radar_data([], [_GITHUB_OK, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=None,
        event_id=None,
        provider=None,
        simulate=False,
        radar_data=radar,
    )

    assert result["scenario"] == "all_clear"
    texts = " ".join(s["text"] for s in result["steps"])
    assert "does not guarantee" in texts.lower()


# ---------------------------------------------------------------------------
# TC-5: every number in the output exists in the input
# ---------------------------------------------------------------------------

def test_numbers_in_output_exist_in_input():
    radar = _make_radar_data([_NEARBY_QUAKE], [_GITHUB_DEGRADED, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider="GitHub",
        simulate=False,
        radar_data=radar,
    )

    output_numbers = _all_numbers_in_text(result["steps"]) | _all_numbers_in_text(result["title"])
    # Build the set of all numbers present anywhere in the input
    input_numbers  = _all_numbers_in_text(radar)
    # Also include numbers from the NEARBY_QUAKE dict directly
    input_numbers |= _all_numbers_in_text(_NEARBY_QUAKE)
    input_numbers |= _all_numbers_in_text(_GITHUB_DEGRADED)

    for n in output_numbers:
        assert n in input_numbers, (
            f"Number {n!r} appears in checklist output but was not in the input data"
        )


# ---------------------------------------------------------------------------
# TC-6: simulate=True → title starts with "SIMULATION:"
# ---------------------------------------------------------------------------

def test_simulate_title_prefix():
    radar = _make_radar_data([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider=None,
        simulate=True,
        radar_data=radar,
    )

    assert result["title"].startswith("SIMULATION:")


def test_non_simulate_title_no_prefix():
    radar = _make_radar_data([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider=None,
        simulate=False,
        radar_data=radar,
    )

    assert not result["title"].startswith("SIMULATION:")


# ---------------------------------------------------------------------------
# TC-7: stale feed → stale_feeds non-empty with last_success
# ---------------------------------------------------------------------------

def test_stale_feed_warning():
    radar = _make_radar_data(
        [_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK], stale_usgs=True
    )
    result = build_checklist(
        region_id=REGION_ID,
        event_id=EVENT_ID,
        provider=None,
        simulate=False,
        radar_data=radar,
    )

    assert len(result["stale_feeds"]) > 0
    for sf in result["stale_feeds"]:
        assert "feed" in sf
        assert "last_success" in sf


# ---------------------------------------------------------------------------
# TC-8 & TC-9: unknown ids → 404 via the route
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    from backend.main import app
    return TestClient(app, raise_server_exceptions=True)


def _mock_fetches(quakes, providers, stale_usgs=False):
    usgs_result = {
        "earthquakes": quakes,
        "stale":       stale_usgs,
        "last_success": "2025-01-01T00:00:00.000Z",
    }
    return (
        patch("backend.main.fetch_usgs",            new=AsyncMock(return_value=usgs_result)),
        patch("backend.main.fetch_github_status",   new=AsyncMock(return_value=providers[0])),
        patch("backend.main.fetch_cloudflare_status", new=AsyncMock(return_value=providers[1])),
    )


def test_unknown_region_id_returns_404(client):
    patches = _mock_fetches([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    with patches[0], patches[1], patches[2]:
        r = client.get("/api/checklist?region_id=not-a-real-region")
    assert r.status_code == 404
    body = r.json()
    # FastAPI wraps HTTPException detail under "detail"
    assert "error" in body.get("detail", body)


def test_unknown_event_id_returns_404(client):
    patches = _mock_fetches([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    with patches[0], patches[1], patches[2]:
        r = client.get("/api/checklist?region_id=ap-northeast-1&event_id=no-such-event")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# TC-10: forbidden words absent from templates file and all scenario responses
# ---------------------------------------------------------------------------

def test_forbidden_words_absent_in_templates_file():
    raw = _TEMPLATES_PATH.read_text()
    matches = FORBIDDEN.findall(raw)
    assert matches == [], f"Forbidden word(s) in templates file: {matches}"


@pytest.mark.parametrize("scenario_name,quakes,providers,region_id,event_id,provider_name", [
    (
        "quake_nearby",
        [_NEARBY_QUAKE],
        [_GITHUB_OK, _CLOUDFLARE_OK],
        REGION_ID, EVENT_ID, None,
    ),
    (
        "provider_degraded",
        [],
        [_GITHUB_DEGRADED, _CLOUDFLARE_OK],
        None, None, "GitHub",
    ),
    (
        "both",
        [_NEARBY_QUAKE],
        [_GITHUB_DEGRADED, _CLOUDFLARE_OK],
        REGION_ID, EVENT_ID, "GitHub",
    ),
    (
        "all_clear",
        [],
        [_GITHUB_OK, _CLOUDFLARE_OK],
        None, None, None,
    ),
])
def test_forbidden_words_absent_in_scenario_response(
    scenario_name, quakes, providers, region_id, event_id, provider_name
):
    radar = _make_radar_data(quakes, providers)
    result = build_checklist(
        region_id=region_id,
        event_id=event_id,
        provider=provider_name,
        simulate=False,
        radar_data=radar,
    )

    full_text = json.dumps(result)
    matches = FORBIDDEN.findall(full_text)
    assert matches == [], (
        f"Scenario {scenario_name!r} response contains forbidden word(s): {matches}"
    )


# ---------------------------------------------------------------------------
# TC-11: all links in every scenario response are https:// only
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("scenario_name,quakes,providers,region_id,event_id,provider_name", [
    (
        "quake_nearby",
        [_NEARBY_QUAKE],
        [_GITHUB_OK, _CLOUDFLARE_OK],
        REGION_ID, EVENT_ID, None,
    ),
    (
        "provider_degraded",
        [],
        [_GITHUB_DEGRADED, _CLOUDFLARE_OK],
        None, None, "GitHub",
    ),
    (
        "both",
        [_NEARBY_QUAKE],
        [_GITHUB_DEGRADED, _CLOUDFLARE_OK],
        REGION_ID, EVENT_ID, "GitHub",
    ),
    (
        "all_clear",
        [],
        [_GITHUB_OK, _CLOUDFLARE_OK],
        None, None, None,
    ),
])
def test_all_links_are_https(
    scenario_name, quakes, providers, region_id, event_id, provider_name
):
    radar = _make_radar_data(quakes, providers)
    result = build_checklist(
        region_id=region_id,
        event_id=event_id,
        provider=provider_name,
        simulate=False,
        radar_data=radar,
    )

    links = _all_links(result)
    for link in links:
        assert HTTPS_RE.match(link), (
            f"Scenario {scenario_name!r}: non-https link found: {link!r}"
        )


# ---------------------------------------------------------------------------
# Route-level integration: GET /api/checklist returns 200 with correct shape
# ---------------------------------------------------------------------------

def test_checklist_route_quake_nearby(client):
    patches = _mock_fetches([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    with patches[0], patches[1], patches[2]:
        r = client.get(
            f"/api/checklist?region_id={REGION_ID}&event_id={EVENT_ID}"
        )

    assert r.status_code == 200
    body = r.json()
    assert body["label"] == "Template checklist"
    assert body["scenario"] == "quake_nearby"
    for key in ("title", "steps", "sources", "generated_at_utc", "stale_feeds"):
        assert key in body, f"Missing key {key!r}"


def test_checklist_route_simulate_prefix(client):
    patches = _mock_fetches([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK])
    with patches[0], patches[1], patches[2]:
        r = client.get(
            f"/api/checklist?region_id={REGION_ID}&event_id={EVENT_ID}&simulate=true"
        )

    assert r.status_code == 200
    assert r.json()["title"].startswith("SIMULATION:")


def test_checklist_route_stale_warning(client):
    patches = _mock_fetches([_NEARBY_QUAKE], [_GITHUB_OK, _CLOUDFLARE_OK], stale_usgs=True)
    with patches[0], patches[1], patches[2]:
        r = client.get(
            f"/api/checklist?region_id={REGION_ID}&event_id={EVENT_ID}"
        )

    assert r.status_code == 200
    body = r.json()
    assert len(body["stale_feeds"]) > 0
    for sf in body["stale_feeds"]:
        assert sf.get("last_success") is not None

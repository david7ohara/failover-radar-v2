"""
Tests for backend/feeds.py — USGS feed (T2) and Statuspage feeds (T3).

No network calls: httpx is fully mocked throughout.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "usgs_sample.json"
GITHUB_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "github_status_sample.json"
CLOUDFLARE_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "cloudflare_status_sample.json"


@pytest.fixture()
def usgs_sample() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_response(payload: dict, status_code: int = 200) -> MagicMock:
    """Build a mock httpx.Response."""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = payload
    mock_resp.request = MagicMock()
    return mock_resp


def _reset_cache() -> None:
    """Reset the module-level cache between tests."""
    import backend.feeds as feeds
    feeds._usgs_cache["earthquakes"] = []
    feeds._usgs_cache["stale"] = True
    feeds._usgs_cache["last_success"] = None
    feeds._usgs_cache["_fetched_at"] = None


# ---------------------------------------------------------------------------
# T2-1: Parsing — all 3 features produce correct normalised fields
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_parse_all_features(usgs_sample):
    _reset_cache()
    mock_resp = _make_response(usgs_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs
        result = await fetch_usgs()

    earthquakes = result["earthquakes"]
    assert len(earthquakes) == 3

    expected_ids = ["us6000ucpj", "us6000ucni", "us6000ucn8"]
    assert [eq["id"] for eq in earthquakes] == expected_ids

    # Spot-check required fields exist on every entry
    for eq in earthquakes:
        for field in ("id", "magnitude", "place", "lat", "lon", "depth_km", "time_utc", "url"):
            assert field in eq, f"Missing field '{field}' in {eq['id']}"


# ---------------------------------------------------------------------------
# T2-2: Coordinate order — GeoJSON [lon, lat, depth] maps correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_coordinate_order(usgs_sample):
    _reset_cache()
    mock_resp = _make_response(usgs_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs
        result = await fetch_usgs()

    earthquakes = result["earthquakes"]

    # Feature 0: coordinates [140.1129, -2.442, 31.078]  → lon=140.1129, lat=-2.442
    eq0 = earthquakes[0]
    assert eq0["lon"] == pytest.approx(140.1129)
    assert eq0["lat"] == pytest.approx(-2.442)
    assert eq0["depth_km"] == pytest.approx(31.078)

    # Feature 1: coordinates [-66.519, -23.0294, 209.784]
    eq1 = earthquakes[1]
    assert eq1["lon"] == pytest.approx(-66.519)
    assert eq1["lat"] == pytest.approx(-23.0294)
    assert eq1["depth_km"] == pytest.approx(209.784)

    # Feature 2: coordinates [140.131, 34.4089, 65.465]
    eq2 = earthquakes[2]
    assert eq2["lon"] == pytest.approx(140.131)
    assert eq2["lat"] == pytest.approx(34.4089)
    assert eq2["depth_km"] == pytest.approx(65.465)


# ---------------------------------------------------------------------------
# T2-3: Time conversion — epoch ms → ISO 8601 UTC
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_time_conversion(usgs_sample):
    _reset_cache()
    mock_resp = _make_response(usgs_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs
        result = await fetch_usgs()

    earthquakes = result["earthquakes"]

    # Verify each time_utc is a valid ISO 8601 UTC string ending in 'Z'
    for eq in earthquakes:
        assert eq["time_utc"].endswith("Z"), f"time_utc not UTC: {eq['time_utc']}"
        # Must parse without error
        dt = datetime.fromisoformat(eq["time_utc"].replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    # Feature 0: time=1795302965571 ms
    expected_ms = 1795302965571
    expected_dt = datetime.fromtimestamp(expected_ms / 1000.0, tz=timezone.utc)
    expected_iso = expected_dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    assert earthquakes[0]["time_utc"] == expected_iso

    # Feature 2: time=1795282244504 ms
    expected_ms2 = 1795282244504
    expected_dt2 = datetime.fromtimestamp(expected_ms2 / 1000.0, tz=timezone.utc)
    expected_iso2 = expected_dt2.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    assert earthquakes[2]["time_utc"] == expected_iso2


# ---------------------------------------------------------------------------
# T2-4: Cache hit — second call within 60 s does not call httpx again
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cache_hit_within_ttl(usgs_sample):
    _reset_cache()
    mock_resp = _make_response(usgs_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs

        # First call — populates cache
        result1 = await fetch_usgs()
        assert result1["stale"] is False

        # Second call — should hit cache
        result2 = await fetch_usgs()
        assert result2["stale"] is False

        # httpx.AsyncClient should have been constructed only once
        assert mock_client_cls.call_count == 1


# ---------------------------------------------------------------------------
# T2-5: Stale fallback on TimeoutException
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stale_on_timeout(usgs_sample):
    _reset_cache()

    # Prime the cache with a successful fetch first
    mock_resp = _make_response(usgs_sample)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs, _usgs_cache
        await fetch_usgs()
        last_success = _usgs_cache["last_success"]

    # Expire the cache
    import backend.feeds as feeds
    feeds._usgs_cache["_fetched_at"] = time.monotonic() - 61

    # Now simulate a timeout
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=__import__("httpx").TimeoutException("timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await fetch_usgs()

    assert result["stale"] is True
    assert result["last_success"] == last_success
    assert len(result["earthquakes"]) == 3  # still returns previously cached data


# ---------------------------------------------------------------------------
# T2-6: Stale fallback on HTTP 5xx
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stale_on_http_5xx(usgs_sample):
    _reset_cache()

    # Prime cache
    mock_resp_ok = _make_response(usgs_sample)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_ok)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs, _usgs_cache
        await fetch_usgs()
        last_success = _usgs_cache["last_success"]

    # Expire cache
    import backend.feeds as feeds
    feeds._usgs_cache["_fetched_at"] = time.monotonic() - 61

    # Simulate HTTP 503
    mock_resp_err = _make_response({}, status_code=503)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_err)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await fetch_usgs()

    assert result["stale"] is True
    assert result["last_success"] == last_success
    assert len(result["earthquakes"]) == 3


# ---------------------------------------------------------------------------
# T2-7: Cold failure — no prior cache → empty list, stale=True, last_success=None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cold_failure_no_cache():
    _reset_cache()

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=__import__("httpx").TimeoutException("timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_usgs
        result = await fetch_usgs()

    assert result["stale"] is True
    assert result["last_success"] is None
    assert result["earthquakes"] == []


# ===========================================================================
# T3 — Statuspage feeds (GitHub & Cloudflare)
# ===========================================================================

# ---------------------------------------------------------------------------
# Pytest fixtures for Statuspage sample data
# ---------------------------------------------------------------------------

@pytest.fixture()
def github_sample() -> dict:
    return json.loads(GITHUB_FIXTURE_PATH.read_text())


@pytest.fixture()
def cloudflare_sample() -> dict:
    return json.loads(CLOUDFLARE_FIXTURE_PATH.read_text())


# ---------------------------------------------------------------------------
# Cache-reset helpers for each provider
# ---------------------------------------------------------------------------

def _reset_github_cache() -> None:
    import backend.feeds as feeds
    feeds._github_cache.update(feeds._empty_sp_cache())


def _reset_cloudflare_cache() -> None:
    import backend.feeds as feeds
    feeds._cloudflare_cache.update(feeds._empty_sp_cache())


# ---------------------------------------------------------------------------
# T3-1: GitHub — required fields present on a successful fetch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_github_parse_required_fields(github_sample):
    _reset_github_cache()
    mock_resp = _make_response(github_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status
        result = await fetch_github_status()

    assert result["provider"] == "GitHub"
    assert result["page_url"] == "https://www.githubstatus.com"
    assert result["indicator"] == "none"
    assert result["description"] == "All Systems Operational"
    assert result["stale"] is False
    assert result["last_success"] is not None

    # 3 components in the fixture
    assert len(result["components"]) == 3
    for comp in result["components"]:
        assert "name" in comp
        assert "status" in comp
        assert "severity" in comp

    # GitHub fixture has no active incidents
    assert result["incidents"] == []


# ---------------------------------------------------------------------------
# T3-2: GitHub — severity values match the fixture's component statuses
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_github_component_severity_values(github_sample):
    _reset_github_cache()
    mock_resp = _make_response(github_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status
        result = await fetch_github_status()

    # All 3 components in the fixture are "operational" → severity 0
    for comp in result["components"]:
        assert comp["status"] == "operational"
        assert comp["severity"] == 0


# ---------------------------------------------------------------------------
# T3-3: Cloudflare — required fields present, incident surfaced correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cloudflare_parse_required_fields(cloudflare_sample):
    _reset_cloudflare_cache()
    mock_resp = _make_response(cloudflare_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_cloudflare_status
        result = await fetch_cloudflare_status()

    assert result["provider"] == "Cloudflare"
    assert result["page_url"] == "https://www.cloudflarestatus.com"
    assert result["indicator"] == "minor"
    assert result["stale"] is False

    # 3 group-level components in the fixture
    assert len(result["components"]) == 3

    # 1 real active incident in the fixture
    assert len(result["incidents"]) == 1
    inc = result["incidents"][0]
    assert inc["id"] == "0ocqieaifg7h"
    assert inc["impact"] == "minor"
    # shortlink from real API is exposed as "url"
    assert inc["url"] == "https://www.cloudflarestatus.com/incidents/0ocqieaifg7h"


# ---------------------------------------------------------------------------
# T3-4: Cloudflare — component severity values match statuses in fixture
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cloudflare_component_severity_values(cloudflare_sample):
    _reset_cloudflare_cache()
    mock_resp = _make_response(cloudflare_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_cloudflare_status
        result = await fetch_cloudflare_status()

    expected = {
        "Cloudflare Sites and Services": 1,  # degraded_performance
        "North America": 2,                  # partial_outage
        "Europe": 2,                         # partial_outage
    }
    for comp in result["components"]:
        assert comp["severity"] == expected[comp["name"]], (
            f"{comp['name']}: expected severity {expected[comp['name']]}, "
            f"got {comp['severity']} (status={comp['status']!r})"
        )


# ---------------------------------------------------------------------------
# T3-5: Cache hit within 300 s — no second HTTP call (GitHub)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_github_cache_hit_within_ttl(github_sample):
    _reset_github_cache()
    mock_resp = _make_response(github_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status
        r1 = await fetch_github_status()
        assert r1["stale"] is False

        r2 = await fetch_github_status()
        assert r2["stale"] is False

        # Only one HTTP call despite two fetch_github_status() calls
        assert mock_client_cls.call_count == 1


# ---------------------------------------------------------------------------
# T3-6: Stale fallback on timeout (Cloudflare)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cloudflare_stale_on_timeout(cloudflare_sample):
    _reset_cloudflare_cache()

    # Prime the cache
    mock_resp_ok = _make_response(cloudflare_sample)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_ok)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_cloudflare_status, _cloudflare_cache
        await fetch_cloudflare_status()
        last_success = _cloudflare_cache["last_success"]

    # Expire the cache
    import backend.feeds as feeds
    feeds._cloudflare_cache["_fetched_at"] = time.monotonic() - 301

    # Now simulate a timeout
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=__import__("httpx").TimeoutException("timed out")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await fetch_cloudflare_status()

    assert result["stale"] is True
    assert result["last_success"] == last_success
    assert result["provider"] == "Cloudflare"
    assert len(result["components"]) == 3


# ---------------------------------------------------------------------------
# T3-7: Stale fallback on HTTP 5xx (GitHub)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_github_stale_on_http_5xx(github_sample):
    _reset_github_cache()

    # Prime cache
    mock_resp_ok = _make_response(github_sample)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_ok)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status, _github_cache
        await fetch_github_status()
        last_success = _github_cache["last_success"]

    import backend.feeds as feeds
    feeds._github_cache["_fetched_at"] = time.monotonic() - 301

    mock_resp_err = _make_response({}, status_code=503)
    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_err)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        result = await fetch_github_status()

    assert result["stale"] is True
    assert result["last_success"] == last_success
    assert result["provider"] == "GitHub"


# ---------------------------------------------------------------------------
# T3-8: Cold failure — no prior cache → empty data, stale=True, last_success=None
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_github_cold_failure_no_cache():
    _reset_github_cache()

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=__import__("httpx").TimeoutException("timed out")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status
        result = await fetch_github_status()

    assert result["stale"] is True
    assert result["last_success"] is None
    assert result["provider"] is None
    assert result["components"] == []
    assert result["incidents"] == []


# ---------------------------------------------------------------------------
# T3-9: Hypothesis — a worse component status never yields a lower severity
# ---------------------------------------------------------------------------

# The four known statuses in severity order.
_STATUS_ORDER = ["operational", "degraded_performance", "partial_outage", "major_outage"]


@given(
    st.sampled_from(_STATUS_ORDER),
    st.sampled_from(_STATUS_ORDER),
)
@settings(max_examples=100, deadline=None)
def test_severity_monotone(status_a: str, status_b: str):
    """
    For any two known statuses, if status_b is strictly worse than status_a
    (i.e. it appears later in the ordering), then its severity must be strictly
    greater.  Equal statuses must yield equal severities.
    """
    from backend.feeds import component_severity

    sev_a = component_severity(status_a)
    sev_b = component_severity(status_b)
    idx_a = _STATUS_ORDER.index(status_a)
    idx_b = _STATUS_ORDER.index(status_b)

    if idx_a < idx_b:
        assert sev_a < sev_b, (
            f"{status_a!r} (sev {sev_a}) should be < {status_b!r} (sev {sev_b})"
        )
    elif idx_a == idx_b:
        assert sev_a == sev_b
    else:
        assert sev_a > sev_b, (
            f"{status_a!r} (sev {sev_a}) should be > {status_b!r} (sev {sev_b})"
        )


# ---------------------------------------------------------------------------
# T3-10: One provider times out while the other succeeds
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_one_provider_fails_other_succeeds(github_sample, cloudflare_sample):
    """
    Cloudflare times out (stale cold) while GitHub fetches successfully.
    The two caches are independent; a failure on one must not affect the other.
    """
    _reset_github_cache()
    _reset_cloudflare_cache()

    mock_resp_ok = _make_response(github_sample)
    mock_resp_timeout = __import__("httpx").TimeoutException("timed out")

    # GitHub succeeds, Cloudflare times out — patch AsyncClient to route by URL.
    original_async_client = __import__("httpx").AsyncClient

    class _SelectiveMockClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, **kwargs):
            if "github" in url:
                return mock_resp_ok
            raise mock_resp_timeout

    with patch("backend.feeds.httpx.AsyncClient", _SelectiveMockClient):
        from backend.feeds import fetch_github_status, fetch_cloudflare_status
        gh = await fetch_github_status()
        cf = await fetch_cloudflare_status()

    assert gh["stale"] is False
    assert gh["provider"] == "GitHub"
    assert len(gh["components"]) == 3

    assert cf["stale"] is True
    assert cf["last_success"] is None
    assert cf["components"] == []


# ---------------------------------------------------------------------------
# T3-11: Empty incidents list is normalised correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_empty_incidents_normalised(github_sample):
    """
    The GitHub fixture already has incidents=[].  Confirm the normalised
    result carries an empty list (not None, not missing).
    """
    _reset_github_cache()
    mock_resp = _make_response(github_sample)

    with patch("backend.feeds.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        from backend.feeds import fetch_github_status
        result = await fetch_github_status()

    assert "incidents" in result
    assert result["incidents"] == []


# ---------------------------------------------------------------------------
# T3-12: Unknown component status string maps to severity 0
# ---------------------------------------------------------------------------

def test_unknown_status_maps_to_zero():
    """
    Statuses not in the known set (e.g. 'under_maintenance', 'investigating',
    or any future string) must map to severity 0 — never assert degradation
    the data doesn't confirm.
    """
    from backend.feeds import component_severity

    for unknown in ("under_maintenance", "investigating", "", "OPERATIONAL", "3"):
        result = component_severity(unknown)
        assert result == 0, (
            f"Unknown status {unknown!r} should map to 0, got {result}"
        )

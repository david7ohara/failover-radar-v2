"""
Tests for backend/feeds.py — USGS feed parsing, caching, and stale fallback.

No network calls: httpx is fully mocked.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "usgs_sample.json"


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

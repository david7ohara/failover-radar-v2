"""
Tests for backend/geo.py.

No network calls. All inputs are either computed inline or loaded from the
local regions.json fixture via geo.load_regions().
"""

from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from backend.geo import (
    ALT_LABEL,
    CLEAR_LABEL,
    EARTH_RADIUS_KM,
    NEARBY_LABEL,
    classify_proximity,
    haversine,
    load_regions,
    nearest_region,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# A coordinate pair that produces a known ~0 km distance
SAME_POINT = (35.68, 139.69)  # Tokyo city-level coords


def _point_at_distance(lat: float, lon: float, distance_km: float) -> tuple[float, float]:
    """Return a point exactly `distance_km` north of (lat, lon)."""
    d_lat = math.degrees(distance_km / EARTH_RADIUS_KM)
    return lat + d_lat, lon


# ---------------------------------------------------------------------------
# Haversine — property-based
# ---------------------------------------------------------------------------


@given(
    lat=st.floats(min_value=-90, max_value=90),
    lon=st.floats(min_value=-180, max_value=180),
)
@settings(max_examples=500)
def test_haversine_non_negative(lat: float, lon: float) -> None:
    """Distance from any point to itself is non-negative."""
    assert haversine(lat, lon, lat, lon) >= 0.0


@given(
    lat1=st.floats(min_value=-90, max_value=90),
    lon1=st.floats(min_value=-180, max_value=180),
    lat2=st.floats(min_value=-90, max_value=90),
    lon2=st.floats(min_value=-180, max_value=180),
)
@settings(max_examples=500)
def test_haversine_symmetric(lat1: float, lon1: float, lat2: float, lon2: float) -> None:
    """d(A, B) == d(B, A)."""
    assert haversine(lat1, lon1, lat2, lon2) == pytest.approx(
        haversine(lat2, lon2, lat1, lon1), rel=1e-9
    )


@given(
    lat=st.floats(min_value=-90, max_value=90),
    lon=st.floats(min_value=-180, max_value=180),
)
@settings(max_examples=200)
def test_haversine_zero_for_identical_points(lat: float, lon: float) -> None:
    """d(A, A) == 0."""
    assert haversine(lat, lon, lat, lon) == pytest.approx(0.0, abs=1e-9)


# ---------------------------------------------------------------------------
# Haversine — unit checks
# ---------------------------------------------------------------------------


def test_haversine_known_value() -> None:
    """Tokyo to Singapore: roughly 5300 km (sanity-check order of magnitude)."""
    tokyo = (35.68, 139.69)
    singapore = (1.35, 103.82)
    d = haversine(*tokyo, *singapore)
    assert 5000 < d < 5700


# ---------------------------------------------------------------------------
# classify_proximity — boundary tests
# ---------------------------------------------------------------------------


def test_classify_exactly_300_km_is_nearby() -> None:
    assert classify_proximity(300.0) == NEARBY_LABEL


def test_classify_300_01_km_is_clear() -> None:
    assert classify_proximity(300.01) == CLEAR_LABEL


def test_classify_zero_km_is_nearby() -> None:
    assert classify_proximity(0.0) == NEARBY_LABEL


def test_classify_large_distance_is_clear() -> None:
    assert classify_proximity(10_000.0) == CLEAR_LABEL


def test_classify_custom_threshold() -> None:
    assert classify_proximity(500.0, threshold_km=500.0) == NEARBY_LABEL
    assert classify_proximity(500.01, threshold_km=500.0) == CLEAR_LABEL


# ---------------------------------------------------------------------------
# nearest_region
# ---------------------------------------------------------------------------


def test_nearest_region_returns_alt_label() -> None:
    regions = load_regions()
    result = nearest_region("ap-northeast-1", regions)
    assert result["relationship"] == ALT_LABEL


def test_nearest_region_excludes_self() -> None:
    regions = load_regions()
    result = nearest_region("ap-northeast-1", regions)
    assert result["id"] != "ap-northeast-1"


def test_nearest_region_distance_non_negative() -> None:
    regions = load_regions()
    for r in regions:
        result = nearest_region(r["id"], regions)
        assert result["distance_km"] >= 0.0


def test_nearest_region_tie_breaking_by_id() -> None:
    """With three equidistant regions, the alphabetically first id wins."""
    regions = [
        {"id": "z-region", "label": "Z", "lat": 0.0, "lon": 0.0, "approximate": True, "source": "test"},
        # Place both alternatives at the same distance north
        {"id": "a-region", "label": "A", "lat": 2.6929, "lon": 0.0, "approximate": True, "source": "test"},
        {"id": "b-region", "label": "B", "lat": 2.6929, "lon": 0.0, "approximate": True, "source": "test"},
    ]
    result = nearest_region("z-region", regions)
    assert result["id"] == "a-region"


def test_nearest_region_unknown_id_raises() -> None:
    with pytest.raises(ValueError, match="Unknown region id"):
        nearest_region("does-not-exist")


def test_nearest_region_all_six_regions_have_valid_alternative() -> None:
    regions = load_regions()
    ids = {r["id"] for r in regions}
    for region_id in ids:
        result = nearest_region(region_id, regions)
        assert result["id"] in ids
        assert result["id"] != region_id
        assert result["relationship"] == ALT_LABEL

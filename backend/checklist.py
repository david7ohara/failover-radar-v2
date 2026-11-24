"""
checklist.py — Template-based operator checklist for Failover Radar.

Design constraints
------------------
- No LLM, no external API key, no network I/O.
- All placeholder values come exclusively from radar_data produced by
  /api/radar logic (Haversine distances, Statuspage titles, region names,
  USGS event fields).  Missing values are omitted, never guessed.
- Forbidden words (never appear in output):
    affected, impacted, healthy, unhealthy, caused, outage confirmed
- "nearby" is the only proximity adjective used.
- Any step referring to a backup region must say:
    "nearest alternative by distance, health not verified"
- Steps are suggestions to verify, never commands.
- With simulate=True the title is prefixed with "SIMULATION: ".
- All links are https:// only.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.geo import NEARBY_LABEL, REGIONS

# ---------------------------------------------------------------------------
# Template loading
# ---------------------------------------------------------------------------

_TEMPLATES_PATH = Path(__file__).parent / "data" / "checklist_templates.json"

_TEMPLATES: dict[str, Any] = json.loads(_TEMPLATES_PATH.read_text())

# ---------------------------------------------------------------------------
# Scenario selection
# ---------------------------------------------------------------------------

_PROVIDER_NON_OPERATIONAL = {"degraded_performance", "partial_outage", "major_outage"}

# Map from known provider names to their public status page URL.
_PROVIDER_STATUS_URLS: dict[str, str] = {
    "GitHub":     "https://www.githubstatus.com/",
    "Cloudflare": "https://www.cloudflarestatus.com/",
}


def _select_scenario(
    region_data: dict[str, Any] | None,
    quake_data: dict[str, Any] | None,
    provider_data: dict[str, Any] | None,
) -> str:
    """Return the scenario key given what is present and active.

    'both'              — nearby quake AND non-operational provider
    'quake_nearby'      — nearby quake only
    'provider_degraded' — non-operational provider only
    'all_clear'         — neither
    """
    has_quake    = region_data is not None and quake_data is not None
    has_provider = (
        provider_data is not None
        and provider_data.get("indicator") in _PROVIDER_NON_OPERATIONAL
    )

    if has_quake and has_provider:
        return "both"
    if has_quake:
        return "quake_nearby"
    if has_provider:
        return "provider_degraded"
    return "all_clear"


# ---------------------------------------------------------------------------
# Placeholder filling
# ---------------------------------------------------------------------------

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")

_HTTPS_RE = re.compile(r"^https://", re.IGNORECASE)


def _safe_link(url: str | None) -> str | None:
    """Return url only if it starts with https://, else None."""
    if url and _HTTPS_RE.match(url):
        return url
    return None


def _fill(template_str: str, values: dict[str, str]) -> str:
    """Substitute {placeholder} tokens.  Missing keys drop the whole token."""
    def replacer(m: re.Match) -> str:
        key = m.group(1)
        return values.get(key, "")

    filled = _PLACEHOLDER_RE.sub(replacer, template_str)
    # Collapse any double-spaces left by omitted placeholders.
    return re.sub(r"  +", " ", filled).strip()


def _build_values(
    region_data: dict[str, Any] | None,
    quake_data: dict[str, Any] | None,
    provider_data: dict[str, Any] | None,
    generated_at_utc: str,
) -> dict[str, str]:
    """Build the substitution dict from verified backend values only."""
    values: dict[str, str] = {"generated_at_utc": generated_at_utc}

    if region_data:
        values["region_label"] = region_data.get("label", "")
        alt = region_data.get("nearest_alternative")
        if alt:
            values["nearest_label"] = alt.get("label", alt.get("id", ""))

    if quake_data:
        if quake_data.get("magnitude") is not None:
            values["magnitude"] = str(quake_data["magnitude"])
        if quake_data.get("distance_km") is not None:
            values["distance_km"] = str(quake_data["distance_km"])
        # event_title comes from the full quake item (title field or place)
        values["event_title"] = quake_data.get("title") or quake_data.get("place", "")
        url = _safe_link(quake_data.get("url") or quake_data.get("usgs_url"))
        if url:
            values["usgs_url"] = url

    if provider_data:
        values["provider_name"] = provider_data.get("provider", "")
        # incident_name: first active incident name, or description
        incidents = provider_data.get("incidents") or []
        if incidents:
            values["incident_name"] = incidents[0].get("name", "")
            # incident url
            inc_url = _safe_link(incidents[0].get("url"))
            if inc_url:
                values["status_url"] = inc_url
        else:
            values["incident_name"] = provider_data.get("description", "")
        # fallback status_url from known map
        if "status_url" not in values:
            provider_name = provider_data.get("provider", "")
            fallback = _PROVIDER_STATUS_URLS.get(provider_name)
            if fallback:
                values["status_url"] = fallback

    return values


def _render_steps(
    scenario_key: str,
    values: dict[str, str],
) -> list[dict[str, Any]]:
    """Fill template steps and return the rendered list."""
    template = _TEMPLATES[scenario_key]
    rendered: list[dict[str, Any]] = []

    for step in template["steps"]:
        text = _fill(step["text"], values)
        entry: dict[str, Any] = {"text": text}

        link_ph = step.get("link_placeholder")
        if link_ph:
            # Resolve the placeholder to an actual URL
            ph_key = link_ph.strip("{}")
            raw_url = values.get(ph_key)
            safe = _safe_link(raw_url)
            if safe:
                entry["link"] = safe

        rendered.append(entry)

    return rendered


def _build_sources(
    quake_data: dict[str, Any] | None,
    provider_data: dict[str, Any] | None,
    attribution: dict[str, Any] | None,
) -> list[dict[str, str]]:
    """Return a list of source attribution dicts with https links only."""
    sources: list[dict[str, str]] = []

    # USGS
    usgs_url: str | None = None
    if quake_data:
        usgs_url = _safe_link(quake_data.get("url") or quake_data.get("usgs_url"))
    if not usgs_url and attribution:
        usgs_url = _safe_link((attribution.get("usgs") or {}).get("url"))
    if usgs_url:
        sources.append({"name": "USGS Earthquake Hazards Program", "url": usgs_url})

    # Provider status page
    if provider_data:
        p_name = provider_data.get("provider", "")
        # Try page_url from the provider data first, then known map
        page_url = _safe_link(provider_data.get("page_url"))
        if not page_url:
            page_url = _PROVIDER_STATUS_URLS.get(p_name)
        if page_url:
            sources.append({"name": f"{p_name} Status", "url": page_url})

    return sources


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_checklist(
    *,
    region_id: str | None,
    event_id: str | None,
    provider: str | None,
    simulate: bool,
    radar_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Build and return a template checklist from verified radar_data.

    Parameters
    ----------
    region_id   : AWS region id (e.g. "ap-northeast-1") or None
    event_id    : USGS event id (e.g. "us6000ucn8") or SIMULATION-1, or None
    provider    : Provider name ("GitHub" | "Cloudflare") or None
    simulate    : If True the title is prefixed with "SIMULATION: "
    radar_data  : Full /api/radar-shaped dict (the same dict the route builds)

    Raises
    ------
    ValueError  : unknown region_id or unknown event_id (caller maps to 404)
    """
    generated_at_utc = (
        datetime.now(tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    # ── Validate & resolve region ────────────────────────────────────────────
    region_data: dict[str, Any] | None = None
    if region_id is not None:
        known_ids = {r["id"] for r in REGIONS}
        if region_id not in known_ids:
            raise ValueError(f"Unknown region_id: {region_id!r}")
        # Find region entry in radar response
        for r in radar_data.get("regions", []):
            if r["id"] == region_id:
                region_data = r
                break
        # region_data may be None if radar had no regions at all — not an error.

    # ── Validate & resolve quake ─────────────────────────────────────────────
    quake_data: dict[str, Any] | None = None
    if event_id is not None:
        all_quakes = radar_data.get("quakes", {}).get("items", [])
        matched = next((q for q in all_quakes if q["id"] == event_id), None)
        if matched is None:
            raise ValueError(f"Unknown event_id: {event_id!r}")
        # Find the enriched proximity entry for this quake in the region
        if region_data:
            for nq in region_data.get("nearby_quakes", []):
                if nq["quake_id"] == event_id:
                    # Merge full quake fields with proximity fields
                    quake_data = {**matched, **nq}
                    break
        if quake_data is None:
            quake_data = matched

    # ── Resolve provider ─────────────────────────────────────────────────────
    provider_data: dict[str, Any] | None = None
    if provider is not None:
        for p in radar_data.get("providers", []):
            if p.get("provider") == provider:
                provider_data = p
                break

    # ── If only region given (no event_id), use the first nearby quake ───────
    if region_data is not None and quake_data is None:
        nearby = region_data.get("nearby_quakes", [])
        if nearby:
            all_quakes = radar_data.get("quakes", {}).get("items", [])
            first_nq = nearby[0]
            full = next(
                (q for q in all_quakes if q["id"] == first_nq["quake_id"]), None
            )
            if full:
                quake_data = {**full, **first_nq}

    # ── Scenario selection ───────────────────────────────────────────────────
    scenario = _select_scenario(
        region_data if quake_data else None,
        quake_data,
        provider_data,
    )

    # ── Build values and render ──────────────────────────────────────────────
    values = _build_values(region_data, quake_data, provider_data, generated_at_utc)
    steps  = _render_steps(scenario, values)

    # ── Title ────────────────────────────────────────────────────────────────
    raw_title = _fill(_TEMPLATES[scenario]["title"], values)
    title = ("SIMULATION: " + raw_title) if simulate else raw_title

    # ── Sources ──────────────────────────────────────────────────────────────
    sources = _build_sources(
        quake_data,
        provider_data,
        radar_data.get("attribution"),
    )

    # ── Stale feeds ──────────────────────────────────────────────────────────
    stale_feeds: list[dict[str, str]] = []

    quakes_block = radar_data.get("quakes", {})
    if quakes_block.get("stale"):
        stale_feeds.append({
            "feed": "USGS",
            "last_success": quakes_block.get("last_success") or "",
        })

    for p in radar_data.get("providers", []):
        if p.get("stale"):
            stale_feeds.append({
                "feed": p.get("provider", "unknown"),
                "last_success": p.get("last_success") or "",
            })

    return {
        "label": "Template checklist",
        "scenario": scenario,
        "title": title,
        "steps": steps,
        "sources": sources,
        "generated_at_utc": generated_at_utc,
        "stale_feeds": stale_feeds,
    }

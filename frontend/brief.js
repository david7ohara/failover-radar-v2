/**
 * brief.js — Pure plain-text incident brief builder for Failover Radar.
 *
 * Rules enforced here (mirrors requirements.md R9 and steering):
 *   - All values come from the arguments passed in. Nothing is invented.
 *   - Missing values are silently omitted, never guessed.
 *   - Forbidden words: affected, impacted, healthy, unhealthy, caused,
 *     outage confirmed.
 *   - Only "nearby" is used to describe proximity.
 *   - All URLs must start with https://.
 *   - No Markdown headings or tables — plain text only.
 *   - textarea.value only, never innerHTML (enforced by callers).
 *   - The brief and stack selection are never sent to the server.
 *
 * Exports (browser):  window.BriefBuilder
 * Exports (Node):     module.exports
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.BriefBuilder = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Max nearby quakes shown before "and N more"
  var MAX_QUAKES = 5;

  // Set of provider indicator values that count as degraded
  var DEGRADED_INDICATORS = new Set([
    'degraded_performance',
    'partial_outage',
    'major_outage',
  ]);

  /**
   * Return url only when it starts with https://, else null.
   * @param {string|null|undefined} url
   * @returns {string|null}
   */
  function safeUrl(url) {
    if (typeof url === 'string' && url.startsWith('https://')) return url;
    return null;
  }

  /**
   * Format an ISO UTC timestamp for display.
   * Returns the original string unchanged if it cannot be parsed.
   * @param {string|null|undefined} iso
   * @returns {string}
   */
  function fmtUtc(iso) {
    if (!iso) return 'unknown';
    try {
      return new Date(iso).toUTCString();
    } catch (_) {
      return String(iso);
    }
  }

  /**
   * Collect all nearby quake entries across all regions, deduplicated by
   * quake_id, sorted by distance_km ascending. Each entry is enriched with
   * the region label from the region it was first seen in.
   *
   * @param {object[]} regions  - radarData.regions
   * @returns {{ quake_id, magnitude, place, time_utc, url, distance_km, regionLabel }[]}
   */
  function collectNearbyQuakes(regions) {
    var seen = {};
    var entries = [];

    for (var ri = 0; ri < regions.length; ri++) {
      var region = regions[ri];
      var nq = region.nearby_quakes;
      if (!Array.isArray(nq)) continue;

      for (var qi = 0; qi < nq.length; qi++) {
        var q = nq[qi];
        if (!q.quake_id || seen[q.quake_id]) continue;
        seen[q.quake_id] = true;
        entries.push({
          quake_id:    q.quake_id,
          magnitude:   q.magnitude,
          place:       q.place,
          time_utc:    q.time_utc,
          url:         q.url,
          distance_km: q.distance_km,
          regionLabel: region.label,
        });
      }
    }

    entries.sort(function (a, b) { return a.distance_km - b.distance_km; });
    return entries;
  }

  /**
   * Build and return the plain-text incident brief string.
   *
   * @param {object} radarData      - Full /api/radar JSON response.
   * @param {object[]} checklists   - Array of /api/checklist response objects
   *                                  already fetched by the caller.
   * @param {{ regions: string[], providers: string[] }|null} stackSelection
   *                                - Current My Stack selection, or null for
   *                                  "all regions and providers".
   * @param {{ simulate: boolean }} options
   * @returns {string}
   */
  function buildBrief(radarData, checklists, stackSelection, options) {
    var lines = [];
    var simulate = options && options.simulate;

    // ── Line 1: header ───────────────────────────────────────────────────
    if (simulate) {
      lines.push('SIMULATION: Tokyo M6.8 — demo stress test active');
    } else {
      lines.push('Failover Radar status snapshot');
    }

    // ── As of ────────────────────────────────────────────────────────────
    var generatedAt = radarData.generated_at_utc || '';
    lines.push('As of ' + fmtUtc(generatedAt));

    // ── Stack summary ────────────────────────────────────────────────────
    if (!stackSelection) {
      lines.push('Stack: all regions and providers');
    } else {
      var rCount = stackSelection.regions ? stackSelection.regions.length : 0;
      var pCount = stackSelection.providers ? stackSelection.providers.length : 0;
      lines.push(
        'Your stack: ' + rCount + ' ' + (rCount === 1 ? 'region' : 'regions') +
        ', ' + pCount + ' ' + (pCount === 1 ? 'provider' : 'providers')
      );
    }

    lines.push('');

    // ── Gather nearby quakes and degraded providers ───────────────────────
    var regions = (radarData.regions) || [];
    var providers = (radarData.providers) || [];

    var allNearby = collectNearbyQuakes(regions);

    var degradedProviders = providers.filter(function (p) {
      return DEGRADED_INDICATORS.has(p.indicator);
    });

    var hasNearby    = allNearby.length > 0;
    var hasDegraded  = degradedProviders.length > 0;

    // ── All-clear ────────────────────────────────────────────────────────
    if (!hasNearby && !hasDegraded) {
      lines.push(
        'No nearby quake and no degraded provider in the data fetched at ' +
        fmtUtc(generatedAt) + '. This does not guarantee nothing is wrong.'
      );
      lines.push('');
    } else {

      // ── Nearby quakes ──────────────────────────────────────────────────
      if (hasNearby) {
        lines.push('Nearby quakes:');
        var shown = allNearby.slice(0, MAX_QUAKES);
        var remaining = allNearby.length - shown.length;

        for (var qi = 0; qi < shown.length; qi++) {
          var q = shown[qi];
          var url = safeUrl(q.url);
          var line =
            '  ' + (q.quake_id || '—') +
            '  M' + q.magnitude +
            '  ' + fmtUtc(q.time_utc) +
            '  ' + (q.place || '') +
            '  |  ' + (q.regionLabel || '') +
            '  ' + q.distance_km + ' km  NEARBY (within 300 km)';
          if (url) line += '  ' + url;
          lines.push(line);
        }

        if (remaining > 0) {
          lines.push('  and ' + remaining + ' more nearby quake' + (remaining === 1 ? '' : 's') + ' not shown');
        }
        lines.push('');
      }

      // ── Provider status ────────────────────────────────────────────────
      if (providers.length > 0) {
        lines.push('Provider status:');
        for (var pi = 0; pi < providers.length; pi++) {
          var prov = providers[pi];
          var pageUrl = safeUrl(prov.page_url);
          var provLine =
            '  ' + (prov.provider || '—') +
            ': ' + (prov.indicator || '—') +
            ' — ' + (prov.description || '—') +
            '  (fetched ' + fmtUtc(prov.last_success) + ')';
          if (pageUrl) provLine += '  ' + pageUrl;
          lines.push(provLine);

          // Degraded components
          var comps = prov.components || [];
          for (var ci = 0; ci < comps.length; ci++) {
            var comp = comps[ci];
            if (comp.status && comp.status !== 'operational') {
              lines.push('    ' + (comp.name || '—') + ': ' + comp.status);
            }
          }
        }
        lines.push('');
      }

      // ── Stale warnings ─────────────────────────────────────────────────
      var staleLines = [];
      var quakesBlock = radarData.quakes || {};
      if (quakesBlock.stale) {
        staleLines.push(
          'USGS data is stale — last success: ' + fmtUtc(quakesBlock.last_success)
        );
      }
      for (var si = 0; si < providers.length; si++) {
        var sp = providers[si];
        if (sp.stale) {
          staleLines.push(
            (sp.provider || 'Provider') + ' data is stale — last success: ' +
            fmtUtc(sp.last_success)
          );
        }
      }
      if (staleLines.length > 0) {
        lines.push('Stale data warnings:');
        for (var sli = 0; sli < staleLines.length; sli++) {
          lines.push('  ' + staleLines[sli]);
        }
        lines.push('');
      }

      // ── Template checklist (first entry only) ──────────────────────────
      if (checklists && checklists.length > 0) {
        var cl = checklists[0];
        lines.push('Template checklist: ' + (cl.title || ''));
        var steps = cl.steps || [];
        for (var sti = 0; sti < steps.length; sti++) {
          var step = steps[sti];
          lines.push('  ' + (sti + 1) + '. ' + (step.text || ''));
          var stepUrl = safeUrl(step.link);
          if (stepUrl) lines.push('     ' + stepUrl);
        }
        lines.push('');
      }
    }

    // ── Closing lines (always present) ────────────────────────────────────
    lines.push('Nearest alternative by distance (health not verified). Verify before shifting traffic.');
    lines.push('Seismic proximity and provider status are separate signals. Data from USGS, GitHub Status and Cloudflare Status.');

    return lines.join('\n');
  }

  return { buildBrief: buildBrief };
}));

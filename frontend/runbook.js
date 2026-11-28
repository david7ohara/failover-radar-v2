/**
 * runbook.js — Pure plain-text pre-incident stack runbook builder for Failover Radar.
 *
 * Rules enforced here (mirrors requirements.md R10 and steering):
 *   - All values come from the arguments passed in. Nothing is invented.
 *   - Missing values are silently omitted, never guessed.
 *   - Forbidden words: affected, impacted, healthy, unhealthy, caused,
 *     outage confirmed.
 *   - Only "nearby" is used to describe proximity.
 *   - All URLs must start with https://.
 *   - Plain text only — no Markdown headings or tables.
 *   - textarea.value only, never innerHTML (enforced by callers).
 *   - The runbook and stack selection are never sent to the server.
 *
 * Exports (browser):  window.RunbookBuilder
 * Exports (Node):     module.exports
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RunbookBuilder = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
   * Build and return the plain-text pre-incident stack runbook string.
   *
   * @param {object} radarData      - Full /api/radar JSON response.
   * @param {{ regions: string[], providers: string[] }|null} stackSelection
   *                                - Current My Stack selection, or null for
   *                                  "all regions and providers".
   * @returns {string}
   */
  function buildRunbook(radarData, stackSelection) {
    var lines = [];

    // ── Line 1: header ─────────────────────────────────────────────────────
    lines.push('Failover Radar stack runbook (pre-incident)');

    // ── As of ──────────────────────────────────────────────────────────────
    var generatedAt = (radarData && radarData.generated_at_utc) || '';
    lines.push('As of ' + fmtUtc(generatedAt));

    lines.push('');

    // ── Determine which regions and providers to include ───────────────────
    var allRegions   = (radarData && radarData.regions)   || [];
    var allProviders = (radarData && radarData.providers) || [];

    var selectedRegions;
    var selectedProviders;

    if (!stackSelection) {
      // null selection → include everything
      selectedRegions   = allRegions;
      selectedProviders = allProviders;
    } else {
      var regionSet   = new Set(stackSelection.regions   || []);
      var providerSet = new Set(stackSelection.providers || []);

      // Empty sets → include everything (spec: "if nothing is selected, include all")
      if (regionSet.size === 0 && providerSet.size === 0) {
        selectedRegions   = allRegions;
        selectedProviders = allProviders;
      } else {
        selectedRegions   = allRegions.filter(function (r) {
          return regionSet.size === 0 || regionSet.has(r.id);
        });
        selectedProviders = allProviders.filter(function (p) {
          return providerSet.size === 0 || providerSet.has(p.provider);
        });
      }
    }

    // ── Regions section ────────────────────────────────────────────────────
    if (selectedRegions.length > 0) {
      lines.push('Regions:');

      for (var ri = 0; ri < selectedRegions.length; ri++) {
        var region = selectedRegions[ri];
        var label  = region.label || region.id || '—';
        var id     = region.id    || '—';

        lines.push('  ' + label + ' (' + id + ')');

        // Nearest alternative
        var alt = region.nearest_alternative;
        if (alt) {
          var altLabel = alt.label || alt.id || '—';
          var altId    = alt.id    || '';
          var altStr   = altLabel;
          if (altId && altId !== altLabel) {
            altStr = altLabel + ' (' + altId + ')';
          }
          lines.push(
            '    Nearest alternative by distance (health not verified): ' + altStr
          );
          lines.push(
            '    Before shifting traffic, verify that region\'s health yourself.'
          );
        }
      }

      lines.push('');
    }

    // ── Providers section ──────────────────────────────────────────────────
    if (selectedProviders.length > 0) {
      lines.push('Providers:');

      for (var pi = 0; pi < selectedProviders.length; pi++) {
        var prov    = selectedProviders[pi];
        var name    = prov.provider    || '—';
        var ind     = prov.indicator   || '—';
        var desc    = prov.description || '—';
        var fetched = fmtUtc(prov.last_success);
        var pageUrl = safeUrl(prov.page_url);

        lines.push('  ' + name);
        lines.push('    Indicator: ' + ind);
        lines.push('    Description: ' + desc);
        lines.push('    Fetched: ' + fetched);
        if (pageUrl) {
          lines.push('    Status page: ' + pageUrl);
        }
      }

      lines.push('');
    }

    // ── Stale warnings ─────────────────────────────────────────────────────
    var staleLines = [];
    var quakesBlock = (radarData && radarData.quakes) || {};

    if (quakesBlock.stale) {
      staleLines.push(
        'USGS data is stale — last success: ' + fmtUtc(quakesBlock.last_success)
      );
    }

    for (var si = 0; si < selectedProviders.length; si++) {
      var sp = selectedProviders[si];
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

    // ── Closing line (always present) ──────────────────────────────────────
    lines.push('Seismic proximity and provider status are separate signals.');

    return lines.join('\n');
  }

  return { buildRunbook: buildRunbook };
}));

/**
 * stack.js — My Stack pure logic for Failover Radar
 *
 * No DOM access. No network calls. Usable in Node --test and in the browser.
 *
 * Exports (browser):  window.MyStack
 * Exports (Node):     module.exports
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.MyStack = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'failoverRadar.myStack.v1';

  /**
   * Load My Stack from localStorage.
   *
   * @param {string[]} knownRegionIds   - All region IDs the API currently knows about.
   * @param {string[]} knownProviderIds - All provider names the API currently knows about.
   * @returns {{ regions: Set<string>, providers: Set<string>, persisted: boolean }}
   *
   * Rules:
   *  - Bad JSON → ignore saved data, return everything selected, persisted: false.
   *  - Unknown IDs (not in known* lists) → silently dropped.
   *  - localStorage blocked → return everything selected, persisted: false.
   *  - No saved entry → return everything selected, persisted: false.
   */
  function load(knownRegionIds, knownProviderIds) {
    const knownR = new Set(knownRegionIds);
    const knownP = new Set(knownProviderIds);

    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);

        // Validate top-level shape; anything unexpected → fall through to default
        if (
          parsed &&
          Array.isArray(parsed.regions) &&
          Array.isArray(parsed.providers)
        ) {
          // Drop unknown IDs silently
          const regions   = new Set(parsed.regions.filter(id => knownR.has(id)));
          const providers = new Set(parsed.providers.filter(id => knownP.has(id)));
          return { regions, providers, persisted: true };
        }
      }
    } catch (_) {
      // localStorage blocked or JSON.parse failed — fall through
    }

    // Default: everything selected, not yet persisted
    return {
      regions:   new Set(knownRegionIds),
      providers: new Set(knownProviderIds),
      persisted: false,
    };
  }

  /**
   * Persist My Stack to localStorage.
   *
   * @param {{ regions: Set<string>, providers: Set<string> }} state
   * @returns {boolean} true if the write succeeded, false otherwise.
   */
  function save(state) {
    try {
      const payload = {
        regions:   [...state.regions],
        providers: [...state.providers],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Return the subset of regions from data.regions that are:
   *  (a) selected in state.regions, AND
   *  (b) classified as NEARBY.
   *
   * @param {{ regions: Set<string> }} state
   * @param {{ regions: Array }} data  - /api/radar response
   * @returns {Array}
   */
  function nearbySelected(state, data) {
    return (data.regions || []).filter(
      r => state.regions.has(r.id) && r.classification && r.classification.startsWith('NEARBY')
    );
  }

  /**
   * Build the summary banner string from the current selection and API data.
   * Zero numbers are invented — every count comes from the passed-in arguments.
   *
   * Format:
   *   [SIMULATION: ]Your stack: X region[s], Y provider[s].
   *   Z region[s] nearby a quake. W provider[s] degraded.[  · Data may be stale.]
   *
   * Special cases (mutually exclusive from the normal format):
   *   - Nothing persisted yet → append "  · My Stack is saved only in this browser."
   *   - Zero regions AND zero providers ticked → return
   *     "Pick at least one region or provider."
   *
   * @param {{ regions: Set<string>, providers: Set<string>, persisted: boolean }} state
   * @param {{ regions: Array, providers: Array, quakes: { stale: boolean } }} data
   * @param {boolean} simulated
   * @returns {string}
   */
  function bannerText(state, data, simulated) {
    const allRegions   = data.regions   || [];
    const allProviders = data.providers || [];

    const selRegions   = allRegions.filter(r => state.regions.has(r.id));
    const selProviders = allProviders.filter(p => state.providers.has(p.provider));

    // Guard: nothing ticked
    if (selRegions.length === 0 && selProviders.length === 0) {
      return 'Pick at least one region or provider.';
    }

    const nearby = selRegions.filter(
      r => r.classification && r.classification.startsWith('NEARBY')
    );

    // Count providers that are not fully operational among selected ones
    const degraded = selProviders.filter(p => {
      const desc = (p.description || '').toLowerCase();
      return !desc.includes('all systems operational');
    });

    const rCount  = selRegions.length;
    const pCount  = selProviders.length;
    const nCount  = nearby.length;
    const dCount  = degraded.length;

    const rWord = rCount === 1 ? 'region'   : 'regions';
    const pWord = pCount === 1 ? 'provider' : 'providers';
    const nWord = nCount === 1 ? 'region'   : 'regions';
    const dWord = dCount === 1 ? 'provider' : 'providers';

    let text = '';

    if (simulated) text += 'SIMULATION: ';

    text +=
      'Your stack: ' + rCount + ' ' + rWord + ', ' + pCount + ' ' + pWord + '. ' +
      nCount + ' ' + nWord + ' nearby a quake. ' +
      dCount + ' ' + dWord + ' degraded.';

    if (data.quakes && data.quakes.stale) {
      text += '  \u00b7 Data may be stale.';
    }

    if (!state.persisted) {
      text += '  \u00b7 My Stack is saved only in this browser.';
    }

    return text;
  }

  return { STORAGE_KEY, load, save, nearbySelected, bannerText };
}));

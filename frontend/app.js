/**
 * app.js — Failover Radar frontend
 *
 * Rules enforced here:
 *   - All numbers come from /api/radar.  Zero invented values.
 *   - Feed-derived text written via textContent only, never innerHTML.
 *   - All URLs are relative (/api/radar).
 *   - Radius of proximity circles comes from threshold_km in the API response.
 *   - "nearby" phrasing only — never "affected".
 *   - No localStorage.
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let simulate = false;
let lastData  = null;        // last successful /api/radar payload

// ─── Map initialisation ───────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: true, worldCopyJump: false }).setView([20, 10], 1.5);

L.tileLayer(
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    noWrap: true,
    maxZoom: 19,
  }
).addTo(map);

// Layer groups — cleared and rebuilt on every successful fetch
const quakeLayer  = L.layerGroup().addTo(map);
const regionLayer = L.layerGroup().addTo(map);
const circleLayer = L.layerGroup().addTo(map);
const lineLayer   = L.layerGroup().addTo(map);

// ─── DOM references ───────────────────────────────────────────────────────────

const simBanner      = document.getElementById('sim-banner');
const simBannerText  = document.getElementById('sim-banner-text');
const btnSimulate    = document.getElementById('btn-simulate');
const btnClear       = document.getElementById('btn-clear');
const updateError    = document.getElementById('update-error');

// USGS panel
const staleUsgs         = document.getElementById('stale-usgs');
const usgsLastUpdated   = document.getElementById('usgs-last-updated');
const usgsCount         = document.getElementById('usgs-count');

// GitHub panel
const staleGithub         = document.getElementById('stale-github');
const githubSource        = document.getElementById('github-source');
const githubLastUpdated   = document.getElementById('github-last-updated');
const githubDescription   = document.getElementById('github-description');
const githubComponents    = document.getElementById('github-components');
const githubIncidents     = document.getElementById('github-incidents');

// Cloudflare panel
const staleCloudflare         = document.getElementById('stale-cloudflare');
const cloudflareSource        = document.getElementById('cloudflare-source');
const cloudflareLastUpdated   = document.getElementById('cloudflare-last-updated');
const cloudflareDescription   = document.getElementById('cloudflare-description');
const cloudflareComponents    = document.getElementById('cloudflare-components');
const cloudflareIncidents     = document.getElementById('cloudflare-incidents');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO 8601 UTC string for display, or return fallback. */
function fmtUtc(isoStr) {
  if (!isoStr) return 'unknown';
  try {
    return new Date(isoStr).toUTCString();
  } catch (_) {
    return isoStr;
  }
}

/** Map a Statuspage component status key to a CSS class suffix. */
function statusClass(status) {
  const known = ['operational', 'degraded_performance', 'partial_outage', 'major_outage'];
  return known.includes(status) ? status : 'unknown';
}

/** Map a Statuspage component status key to a human label. */
function statusLabel(status) {
  const labels = {
    operational:          'Operational',
    degraded_performance: 'Degraded',
    partial_outage:       'Partial outage',
    major_outage:         'Major outage',
  };
  return labels[status] ?? status;
}

// ─── Map rendering ────────────────────────────────────────────────────────────

/**
 * Build a Leaflet circle marker for a quake.
 * Size scales with magnitude; colour distinguishes simulated vs live.
 */
function buildQuakeMarker(quake) {
  const radius  = 6;
  const color   = quake.simulated ? '#a78bfa' : '#f97316';

  const marker = L.circleMarker([quake.lat, quake.lon], {
    radius,
    color,
    fillColor: color,
    fillOpacity: 0.85,
    weight: 2,
    className: 'quake-marker',
  });

  // Popup — all text via textContent nodes to avoid innerHTML injection
  const container = document.createElement('div');

  const place = document.createElement('p');
  place.className = 'popup-place';
  place.textContent = quake.place;
  container.appendChild(place);

  if (quake.simulated) {
    const simTag = document.createElement('p');
    simTag.className = 'popup-sim-tag';
    simTag.textContent = 'SIMULATION — not a real event';
    container.appendChild(simTag);
  }

  const mag = document.createElement('p');
  mag.className = 'popup-mag';
  mag.textContent = 'M' + quake.magnitude;
  container.appendChild(mag);

  const time = document.createElement('p');
  time.className = 'popup-time';
  time.textContent = fmtUtc(quake.time_utc);
  container.appendChild(time);

  const linkP = document.createElement('p');
  linkP.className = 'popup-link';
  const a = document.createElement('a');
  a.href = quake.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = quake.simulated ? 'USGS (placeholder)' : 'USGS event page';
  linkP.appendChild(a);
  container.appendChild(linkP);

  marker.bindPopup(container);
  return marker;
}

/**
 * Build a Leaflet circle marker for a cloud region.
 * Color: nearby = red, clear = green.
 */
function buildRegionMarker(region) {
  const isNearby = region.classification.startsWith('NEARBY');
  const color = isNearby ? '#ef4444' : '#10b981';

  const marker = L.circleMarker([region.lat, region.lon], {
    radius: 10,
    color,
    fillColor: color,
    fillOpacity: 0.85,
    weight: 2,
  });

  const label = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = region.label;
  label.appendChild(name);

  const cls = document.createElement('div');
  cls.textContent = region.classification;
  label.appendChild(cls);

  marker.bindTooltip(region.label, { permanent: false, direction: 'top' });
  marker.bindPopup(label);
  return marker;
}

/**
 * Build a pulsing 300 km circle around an epicentre.
 * Radius comes from threshold_km (passed in), not invented here.
 */
function buildProximityCircle(lat, lon, thresholdKm) {
  const circle = L.circle([lat, lon], {
    radius: thresholdKm * 1000,   // Leaflet uses metres
    color:  '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.04,
    weight: 1.5,
    dashArray: null,
    className: 'pulse-ring',
  });
  return circle;
}

/**
 * Build a dashed polyline from epicentre to nearest-alternative region.
 * Tooltip uses the ALT_LABEL string from the API, not an invented string.
 */
function buildFailoverLine(fromLat, fromLon, toRegion) {
  const line = L.polyline(
    [[fromLat, fromLon], [toRegion.lat, toRegion.lon]],
    {
      color: '#94a3b8',
      weight: 1.5,
      dashArray: '6 6',
      opacity: 0.7,
    }
  );
  line.bindTooltip(toRegion.relationship, { sticky: true });
  return line;
}

/** Rebuild all map layers from a fresh /api/radar payload. */
function renderMap(data) {
  quakeLayer.clearLayers();
  regionLayer.clearLayers();
  circleLayer.clearLayers();
  lineLayer.clearLayers();

  const thresholdKm = data.threshold_km;

  // Quake markers
  for (const quake of data.quakes.items) {
    buildQuakeMarker(quake).addTo(quakeLayer);
  }

  // Region markers + circles + failover lines
  for (const region of data.regions) {
    buildRegionMarker(region).addTo(regionLayer);

    if (!region.classification.startsWith('NEARBY')) continue;

    // For each nearby quake draw a proximity circle and a failover line
    for (const nq of region.nearby_quakes) {
      buildProximityCircle(nq.lat ?? region.lat, nq.lon ?? region.lon, thresholdKm)
        .addTo(circleLayer);

      // The failover line runs from the region itself to its nearest alternative
      if (region.nearest_alternative && region.nearest_alternative.lat !== undefined) {
        buildFailoverLine(
          region.lat, region.lon,
          region.nearest_alternative
        ).addTo(lineLayer);
      }
    }

    // Draw the failover line even when nearby_quakes come without coords
    // (they don't carry lat/lon — the circle needs the quake coords from
    //  data.quakes.items, so look them up)
    if (region.nearby_quakes.length > 0 && region.nearest_alternative) {
      // Find the matching full quake object to get its coords
      for (const nq of region.nearby_quakes) {
        const full = data.quakes.items.find(q => q.id === nq.quake_id);
        if (full) {
          // Replace placeholder circle with one using the real epicentre
          buildProximityCircle(full.lat, full.lon, thresholdKm).addTo(circleLayer);
        }
      }
    }
  }
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

function renderUsgsPanel(quakesBlock) {
  staleUsgs.hidden = !quakesBlock.stale;
  usgsLastUpdated.textContent = fmtUtc(quakesBlock.last_success);

  const count = quakesBlock.live_count;
  usgsCount.textContent = count + ' M4.5+ event' + (count === 1 ? '' : 's') + ' in last 24 h';
}

function renderComponentList(ulEl, components) {
  while (ulEl.firstChild) ulEl.removeChild(ulEl.firstChild);

  for (const c of components) {
    const li   = document.createElement('li');
    li.className = 'component-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'component-name';
    nameSpan.textContent = c.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'component-status-' + statusClass(c.status);
    statusSpan.textContent = statusLabel(c.status);

    li.appendChild(nameSpan);
    li.appendChild(statusSpan);
    ulEl.appendChild(li);
  }
}

function renderIncidentList(ulEl, incidents) {
  while (ulEl.firstChild) ulEl.removeChild(ulEl.firstChild);

  for (const inc of incidents) {
    const li = document.createElement('li');
    li.className = 'incident-item';

    if (inc.url) {
      const a = document.createElement('a');
      a.href = inc.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = inc.name;
      li.appendChild(a);
    } else {
      li.textContent = inc.name;
    }
    ulEl.appendChild(li);
  }
}

function renderProviderPanel(provider, staleEl, sourceEl, lastUpdEl, descEl, compEl, incEl) {
  staleEl.hidden    = !provider.stale;
  if (provider.provider) sourceEl.textContent = provider.provider;
  lastUpdEl.textContent = fmtUtc(provider.last_success);
  descEl.textContent    = provider.description ?? '—';
  renderComponentList(compEl, provider.components ?? []);
  renderIncidentList(incEl, provider.incidents ?? []);
}

/** Full panel update from a data payload. */
function renderPanels(data) {
  renderUsgsPanel(data.quakes);

  const providers = data.providers ?? [];
  const github     = providers.find(p => p.provider === 'GitHub');
  const cloudflare = providers.find(p => p.provider === 'Cloudflare');

  if (github) {
    renderProviderPanel(
      github,
      staleGithub, githubSource, githubLastUpdated,
      githubDescription, githubComponents, githubIncidents
    );
  }
  if (cloudflare) {
    renderProviderPanel(
      cloudflare,
      staleCloudflare, cloudflareSource, cloudflareLastUpdated,
      cloudflareDescription, cloudflareComponents, cloudflareIncidents
    );
  }
}

// ─── Failover line alt-region coordinate lookup ───────────────────────────────
// nearest_alternative in the API carries {id, label, distance_km, relationship}
// but not lat/lon.  We need the region registry to draw the line endpoint.
// Build a lookup from the regions array in the response itself.

function buildRegionLookup(regions) {
  const lookup = {};
  for (const r of regions) {
    lookup[r.id] = { lat: r.lat, lon: r.lon, label: r.label };
  }
  return lookup;
}

/** Re-renders failover lines using lat/lon from the full regions list. */
function renderFailoverLines(data) {
  lineLayer.clearLayers();

  const lookup      = buildRegionLookup(data.regions);
  const thresholdKm = data.threshold_km;

  for (const region of data.regions) {
    if (!region.classification.startsWith('NEARBY')) continue;
    if (!region.nearest_alternative) continue;

    const altId   = region.nearest_alternative.id;
    const altCoords = lookup[altId];
    if (!altCoords) continue;

    const altObj = {
      lat:          altCoords.lat,
      lon:          altCoords.lon,
      relationship: region.nearest_alternative.relationship,
    };

    const line = L.polyline(
      [[region.lat, region.lon], [altCoords.lat, altCoords.lon]],
      {
        color: '#94a3b8',
        weight: 1.5,
        dashArray: '6 6',
        opacity: 0.7,
      }
    );
    line.bindTooltip(region.nearest_alternative.relationship, { sticky: true });
    line.addTo(lineLayer);
  }
}

/** Full map render that handles the alt-region coordinate lookup. */
function renderAll(data) {
  quakeLayer.clearLayers();
  regionLayer.clearLayers();
  circleLayer.clearLayers();
  lineLayer.clearLayers();

  const thresholdKm = data.threshold_km;
  const lookup      = buildRegionLookup(data.regions);

  // Quake markers
  for (const quake of data.quakes.items) {
    buildQuakeMarker(quake).addTo(quakeLayer);
  }

  // Build a quake-id → quake map for circle placement
  const quakeById = {};
  for (const q of data.quakes.items) quakeById[q.id] = q;

  // Region markers, proximity circles, failover lines
  for (const region of data.regions) {
    buildRegionMarker(region).addTo(regionLayer);

    if (!region.classification.startsWith('NEARBY')) continue;

    // Proximity circles — one per nearby quake, centred on the epicentre
    for (const nq of region.nearby_quakes) {
      const full = quakeById[nq.quake_id];
      if (full) {
        buildProximityCircle(full.lat, full.lon, thresholdKm).addTo(circleLayer);
      }
    }

    // Failover line from this region to its nearest alternative
    if (region.nearest_alternative) {
      const altId     = region.nearest_alternative.id;
      const altCoords = lookup[altId];
      if (altCoords) {
        const line = L.polyline(
          [[region.lat, region.lon], [altCoords.lat, altCoords.lon]],
          {
            color: '#94a3b8',
            weight: 1.5,
            dashArray: '6 6',
            opacity: 0.7,
          }
        );
        line.bindTooltip(region.nearest_alternative.relationship, { sticky: true });
        line.addTo(lineLayer);
      }
    }
  }

  renderPanels(data);
}

// ─── Fetch & poll ─────────────────────────────────────────────────────────────

async function fetchRadar() {
  const url = '/api/radar?simulate=' + (simulate ? 'true' : 'false');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();

    lastData = data;
    updateError.hidden = true;
    renderAll(data);
  } catch (err) {
    // Keep the existing map layers; show non-blocking notice
    updateError.hidden = false;
    // If we have no data at all yet, show a minimal message
    if (!lastData) {
      updateError.querySelector('#update-error-text') ??
        (updateError.firstElementChild.textContent = 'Update failed, showing last data.');
    }
  }
}

// ─── Simulate / Clear buttons ─────────────────────────────────────────────────

btnSimulate.addEventListener('click', () => {
  simulate = true;
  simBanner.hidden  = false;
  btnSimulate.hidden = true;
  btnClear.hidden    = false;
  fetchRadar();
});

btnClear.addEventListener('click', () => {
  simulate = false;
  simBanner.hidden   = true;
  btnSimulate.hidden = false;
  btnClear.hidden    = true;
  fetchRadar();
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

fetchRadar();
setInterval(fetchRadar, 60_000);

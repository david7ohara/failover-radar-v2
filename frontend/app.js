/**
 * app.js — Failover Radar frontend
 *
 * Rules enforced here:
 *   - All numbers come from /api/radar.  Zero invented values.
 *   - Feed-derived text written via textContent only, never innerHTML.
 *   - All URLs are relative (/api/radar).
 *   - Radius of proximity circles comes from threshold_km in the API response.
 *   - "nearby" phrasing only — never "affected".
 *   - My Stack selection is never sent to the server; it filters display only.
 *   - Pure My Stack logic lives in stack.js (window.MyStack).
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let simulate  = false;
let lastData  = null;   // last successful /api/radar payload

// stackState is populated by initMyStack() after the first fetch.
// Shape: { regions: Set<string>, providers: Set<string>, persisted: boolean }
let stackState = null;

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

const simBanner    = document.getElementById('sim-banner');
const btnSimulate  = document.getElementById('btn-simulate');
const btnClear     = document.getElementById('btn-clear');
const updateError  = document.getElementById('update-error');

// My Stack drawer
const drawer        = document.getElementById('mystack-drawer');
const scrim         = document.getElementById('mystack-scrim');
const btnMyStack    = document.getElementById('btn-mystack');
const btnClose      = document.getElementById('btn-mystack-close');
const regionList    = document.getElementById('mystack-region-list');
const providerList  = document.getElementById('mystack-provider-list');
const mystackBanner = document.getElementById('mystack-banner');
const mystackAdvice = document.getElementById('mystack-advice');

// USGS panel
const staleUsgs       = document.getElementById('stale-usgs');
const usgsLastUpdated = document.getElementById('usgs-last-updated');
const usgsCount       = document.getElementById('usgs-count');

// GitHub panel
const staleGithub       = document.getElementById('stale-github');
const githubSource      = document.getElementById('github-source');
const githubLastUpdated = document.getElementById('github-last-updated');
const githubDescription = document.getElementById('github-description');
const githubComponents  = document.getElementById('github-components');
const githubIncidents   = document.getElementById('github-incidents');

// Cloudflare panel
const staleCloudflare       = document.getElementById('stale-cloudflare');
const cloudflareSource      = document.getElementById('cloudflare-source');
const cloudflareLastUpdated = document.getElementById('cloudflare-last-updated');
const cloudflareDescription = document.getElementById('cloudflare-description');
const cloudflareComponents  = document.getElementById('cloudflare-components');
const cloudflareIncidents   = document.getElementById('cloudflare-incidents');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUtc(isoStr) {
  if (!isoStr) return 'unknown';
  try { return new Date(isoStr).toUTCString(); } catch (_) { return isoStr; }
}

function statusClass(status) {
  const known = ['operational', 'degraded_performance', 'partial_outage', 'major_outage'];
  return known.includes(status) ? status : 'unknown';
}

function statusLabel(status) {
  const labels = {
    operational:          'Operational',
    degraded_performance: 'Degraded',
    partial_outage:       'Partial outage',
    major_outage:         'Major outage',
  };
  return labels[status] ?? status;
}

function setText(el, text) {
  el.textContent = text;
}

// ─── My Stack drawer ──────────────────────────────────────────────────────────

function openDrawer() {
  drawer.hidden = false;
  scrim.hidden  = false;
  btnMyStack.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  drawer.hidden = true;
  scrim.hidden  = true;
  btnMyStack.setAttribute('aria-expanded', 'false');
}

btnMyStack.addEventListener('click', () => {
  drawer.hidden ? openDrawer() : closeDrawer();
});
btnClose.addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

// ─── My Stack initialisation ──────────────────────────────────────────────────

/**
 * Build checkboxes for regions and providers.
 * Called once after the first successful /api/radar fetch.
 * Idempotent — the data-built guard prevents rebuilding on subsequent polls.
 */
function initMyStack(data) {
  const knownRegionIds   = data.regions.map(r => r.id);
  const knownProviderIds = (data.providers || []).map(p => p.provider);

  // Load persisted state (or defaults) from stack.js
  stackState = MyStack.load(knownRegionIds, knownProviderIds);

  // ── Region checkboxes ────────────────────────────────────────────────────
  if (regionList.dataset.built !== 'true') {
    while (regionList.firstChild) regionList.removeChild(regionList.firstChild);

    for (const region of data.regions) {
      const label = document.createElement('label');
      label.className = 'mystack-label';
      label.dataset.regionId = region.id;

      const cb = document.createElement('input');
      cb.type      = 'checkbox';
      cb.className = 'mystack-cb';
      cb.dataset.kind = 'region';
      cb.dataset.id   = region.id;
      cb.checked = stackState.regions.has(region.id);

      cb.addEventListener('change', () => {
        if (cb.checked) {
          stackState.regions.add(region.id);
        } else {
          stackState.regions.delete(region.id);
        }
        const saved = MyStack.save(stackState);
        if (saved) stackState.persisted = true;
        applyMyStack(lastData);
      });

      const text = document.createTextNode(region.label + '\u00a0(' + region.id + ')');
      label.appendChild(cb);
      label.appendChild(text);
      regionList.appendChild(label);
    }

    regionList.dataset.built = 'true';
  }

  // ── Provider checkboxes ──────────────────────────────────────────────────
  if (providerList.dataset.built !== 'true') {
    while (providerList.firstChild) providerList.removeChild(providerList.firstChild);

    for (const provider of (data.providers || [])) {
      const name = provider.provider;

      const label = document.createElement('label');
      label.className = 'mystack-label';
      label.dataset.providerId = name;

      const cb = document.createElement('input');
      cb.type      = 'checkbox';
      cb.className = 'mystack-cb';
      cb.dataset.kind = 'provider';
      cb.dataset.id   = name;
      cb.checked = stackState.providers.has(name);

      cb.addEventListener('change', () => {
        if (cb.checked) {
          stackState.providers.add(name);
        } else {
          stackState.providers.delete(name);
        }
        const saved = MyStack.save(stackState);
        if (saved) stackState.persisted = true;
        applyMyStack(lastData);
      });

      const text = document.createTextNode(name);
      label.appendChild(cb);
      label.appendChild(text);
      providerList.appendChild(label);
    }

    providerList.dataset.built = 'true';
  }
}

// ─── My Stack rendering ───────────────────────────────────────────────────────

/**
 * Dim unselected region/provider rows; bring selected ones to full opacity.
 * Selected items appear first within each fieldset.
 */
function applyCheckboxDimming() {
  if (!stackState) return;

  // Region labels
  regionList.querySelectorAll('label[data-region-id]').forEach(label => {
    const id       = label.dataset.regionId;
    const selected = stackState.regions.has(id);
    label.classList.toggle('mystack-label--dim', !selected);
  });

  // Provider labels
  providerList.querySelectorAll('label[data-provider-id]').forEach(label => {
    const id       = label.dataset.providerId;
    const selected = stackState.providers.has(id);
    label.classList.toggle('mystack-label--dim', !selected);
  });
}

/**
 * Render the summary banner using MyStack.bannerText().
 */
function renderBanner(data) {
  if (!stackState) return;
  const text = MyStack.bannerText(stackState, data, simulate);

  while (mystackBanner.firstChild) mystackBanner.removeChild(mystackBanner.firstChild);
  mystackBanner.appendChild(document.createTextNode(text));

  const hasNearby = MyStack.nearbySelected(stackState, data).length > 0;
  mystackBanner.className = 'mystack-banner' +
    (simulate   ? ' mystack-banner--sim'    : '') +
    (hasNearby  ? ' mystack-banner--nearby' : '');
}

/**
 * Render per-region failover advice for selected NEARBY regions.
 */
function renderAdvice(data) {
  if (!stackState) return;

  const nearby = MyStack.nearbySelected(stackState, data);
  while (mystackAdvice.firstChild) mystackAdvice.removeChild(mystackAdvice.firstChild);

  if (nearby.length === 0) {
    mystackAdvice.hidden = true;
    return;
  }

  // Build a region id → region lookup for alt-region labels
  const byId = {};
  for (const r of data.regions) byId[r.id] = r;

  mystackAdvice.hidden = false;

  for (const region of nearby) {
    const item = document.createElement('div');
    item.className = 'mystack-advice-item';

    const regionSpan = document.createElement('span');
    regionSpan.className = 'advice-region';
    regionSpan.textContent = region.label;
    item.appendChild(regionSpan);
    item.appendChild(document.createTextNode(' is nearby a quake.'));

    if (region.nearest_alternative) {
      const altId    = region.nearest_alternative.id;
      const altRegion = byId[altId];
      const altLabel  = altRegion
        ? altRegion.label
        : (region.nearest_alternative.label ?? altId);

      item.appendChild(document.createElement('br'));
      const note = document.createElement('span');
      note.className = 'advice-alt';
      note.textContent =
        'Nearest alternative: ' + altLabel +
        ' \u2014 Nearest alternative by distance (health not verified).';
      item.appendChild(note);
    }

    mystackAdvice.appendChild(item);
  }
}

/**
 * Show/hide the GitHub and Cloudflare sidebar panels based on selection.
 */
function renderProviderPanelVisibility() {
  if (!stackState) return;
  const panelGithub     = document.getElementById('panel-github');
  const panelCloudflare = document.getElementById('panel-cloudflare');
  if (panelGithub)     panelGithub.hidden     = !stackState.providers.has('GitHub');
  if (panelCloudflare) panelCloudflare.hidden = !stackState.providers.has('Cloudflare');
}

/**
 * Run all My Stack display updates after any state or data change.
 */
function applyMyStack(data) {
  if (!data) return;
  applyCheckboxDimming();
  renderBanner(data);
  renderAdvice(data);
  renderProviderPanelVisibility();
  // Redraw failover lines filtered to selected NEARBY regions only
  renderFilteredFailoverLines(data);
  // Rebuild checklist panel (async — fires and doesn't block the render)
  refreshChecklist(data);
}

// ─── Map rendering ────────────────────────────────────────────────────────────

function buildQuakeMarker(quake) {
  const color = quake.simulated ? '#a78bfa' : '#f97316';

  const marker = L.circleMarker([quake.lat, quake.lon], {
    radius: 6,
    color,
    fillColor: color,
    fillOpacity: 0.85,
    weight: 2,
    className: 'quake-marker',
  });

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
  a.href   = quake.url;
  a.target = '_blank';
  a.rel    = 'noopener noreferrer';
  a.textContent = quake.simulated ? 'USGS (placeholder)' : 'USGS event page';
  linkP.appendChild(a);
  container.appendChild(linkP);

  marker.bindPopup(container);
  return marker;
}

/**
 * Build a region marker.
 * @param {object} region
 * @param {boolean} isSelected - if false the marker is dimmed on the map too
 */
function buildRegionMarker(region, isSelected) {
  const isNearby = region.classification.startsWith('NEARBY');
  const baseColor = isNearby ? '#ef4444' : '#10b981';
  const opacity   = isSelected ? 0.85 : 0.25;

  const marker = L.circleMarker([region.lat, region.lon], {
    radius: 10,
    color:       isSelected ? baseColor : '#64748b',
    fillColor:   isSelected ? baseColor : '#334155',
    fillOpacity: opacity,
    weight: 2,
    opacity:     isSelected ? 1 : 0.4,
  });

  const label = document.createElement('div');
  const name  = document.createElement('strong');
  name.textContent = region.label;
  label.appendChild(name);
  const cls = document.createElement('div');
  cls.textContent = region.classification;
  label.appendChild(cls);

  marker.bindTooltip(region.label, { permanent: false, direction: 'top' });
  marker.bindPopup(label);
  return marker;
}

function buildProximityCircle(lat, lon, thresholdKm) {
  return L.circle([lat, lon], {
    radius: thresholdKm * 1000,
    color:       '#ef4444',
    fillColor:   '#ef4444',
    fillOpacity: 0.04,
    weight: 1.5,
    className: 'pulse-ring',
  });
}

function buildRegionLookup(regions) {
  const lookup = {};
  for (const r of regions) lookup[r.id] = { lat: r.lat, lon: r.lon, label: r.label };
  return lookup;
}

/**
 * Draw failover lines only for regions that are both NEARBY and selected
 * in My Stack. Called after every fetch and after every checkbox change.
 */
function renderFilteredFailoverLines(data) {
  lineLayer.clearLayers();
  if (!stackState) return;

  const lookup  = buildRegionLookup(data.regions);
  const nearby  = MyStack.nearbySelected(stackState, data);

  for (const region of nearby) {
    if (!region.nearest_alternative) continue;
    const altId     = region.nearest_alternative.id;
    const altCoords = lookup[altId];
    if (!altCoords) continue;

    const line = L.polyline(
      [[region.lat, region.lon], [altCoords.lat, altCoords.lon]],
      { color: '#94a3b8', weight: 1.5, dashArray: '6 6', opacity: 0.7 }
    );
    line.bindTooltip(region.nearest_alternative.relationship, { sticky: true });
    line.addTo(lineLayer);
  }
}

/** Full map + panel render from a fresh /api/radar payload. */
function renderAll(data) {
  quakeLayer.clearLayers();
  regionLayer.clearLayers();
  circleLayer.clearLayers();
  lineLayer.clearLayers();

  const thresholdKm = data.threshold_km;
  const quakeById   = {};
  for (const q of data.quakes.items) quakeById[q.id] = q;

  // Quake markers
  for (const quake of data.quakes.items) {
    buildQuakeMarker(quake).addTo(quakeLayer);
  }

  // Region markers + proximity circles
  for (const region of data.regions) {
    const isSelected = !stackState || stackState.regions.has(region.id);
    buildRegionMarker(region, isSelected).addTo(regionLayer);

    if (!region.classification.startsWith('NEARBY')) continue;

    // Proximity circles for all NEARBY regions (not filtered by selection)
    for (const nq of region.nearby_quakes) {
      const full = quakeById[nq.quake_id];
      if (full) {
        buildProximityCircle(full.lat, full.lon, thresholdKm).addTo(circleLayer);
      }
    }
  }

  // Failover lines: selected NEARBY only (or all NEARBY before stack is loaded)
  if (stackState) {
    renderFilteredFailoverLines(data);
  } else {
    // Pre-stack fallback: draw all NEARBY failover lines
    const lookup = buildRegionLookup(data.regions);
    for (const region of data.regions) {
      if (!region.classification.startsWith('NEARBY')) continue;
      if (!region.nearest_alternative) continue;
      const altCoords = lookup[region.nearest_alternative.id];
      if (!altCoords) continue;
      const line = L.polyline(
        [[region.lat, region.lon], [altCoords.lat, altCoords.lon]],
        { color: '#94a3b8', weight: 1.5, dashArray: '6 6', opacity: 0.7 }
      );
      line.bindTooltip(region.nearest_alternative.relationship, { sticky: true });
      line.addTo(lineLayer);
    }
  }

  renderPanels(data);
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

function renderUsgsPanel(quakesBlock) {
  staleUsgs.hidden = !quakesBlock.stale;
  setText(usgsLastUpdated, fmtUtc(quakesBlock.last_success));
  const count = quakesBlock.live_count;
  setText(usgsCount, count + ' M4.5+ event' + (count === 1 ? '' : 's') + ' in last 24 h');
}

function renderComponentList(ulEl, components) {
  while (ulEl.firstChild) ulEl.removeChild(ulEl.firstChild);
  for (const c of components) {
    const li = document.createElement('li');
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
      a.href   = inc.url;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.textContent = inc.name;
      li.appendChild(a);
    } else {
      li.textContent = inc.name;
    }
    ulEl.appendChild(li);
  }
}

function renderProviderPanel(provider, staleEl, sourceEl, lastUpdEl, descEl, compEl, incEl) {
  staleEl.hidden = !provider.stale;
  if (provider.provider) setText(sourceEl, provider.provider);
  setText(lastUpdEl, fmtUtc(provider.last_success));
  setText(descEl,    provider.description ?? '—');
  renderComponentList(compEl, provider.components ?? []);
  renderIncidentList(incEl,  provider.incidents   ?? []);
}

function renderPanels(data) {
  renderUsgsPanel(data.quakes);

  const providers  = data.providers ?? [];
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

// ─── Fetch & poll ─────────────────────────────────────────────────────────────

async function fetchRadar() {
  const url = '/api/radar?simulate=' + (simulate ? 'true' : 'false');

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();

    lastData = data;
    updateError.hidden = true;

    // Build My Stack checkboxes once; load/update state on every fetch
    const firstFetch = !stackState;
    if (firstFetch) {
      initMyStack(data);
    }

    renderAll(data);
    applyMyStack(data);
  } catch (_) {
    updateError.hidden = false;
  }
}

// ─── Simulate / Clear buttons ─────────────────────────────────────────────────

btnSimulate.addEventListener('click', () => {
  simulate = true;
  simBanner.hidden   = false;
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

// ─── Checklist panel ──────────────────────────────────────────────────────────

const checklistPanel = document.getElementById('checklist-panel');
const checklistCards = document.getElementById('checklist-cards');

/**
 * Build and return a checklist card DOM element for one API response.
 * Uses textContent only — never innerHTML.
 */
function buildChecklistCard(data) {
  const card = document.createElement('div');
  card.className = 'checklist-card' + (data.title.startsWith('SIMULATION:') ? ' checklist-card--sim' : '');

  // Title
  const title = document.createElement('p');
  title.className = 'checklist-card__title' + (data.title.startsWith('SIMULATION:') ? ' checklist-card__title--sim' : '');
  title.textContent = data.title;
  card.appendChild(title);

  // Stale warning (if any)
  if (data.stale_feeds && data.stale_feeds.length > 0) {
    const stale = document.createElement('p');
    stale.className = 'checklist-stale';
    const feedNames = data.stale_feeds.map(sf => sf.feed).join(', ');
    const lastTs    = data.stale_feeds[0].last_success || 'unknown';
    stale.textContent = 'STALE data — ' + feedNames + ' last updated ' + lastTs;
    card.appendChild(stale);
  }

  // Steps
  const ol = document.createElement('ol');
  ol.className = 'checklist-steps';

  for (const step of (data.steps || [])) {
    const li = document.createElement('li');
    li.className = 'checklist-step';

    // Tick-box — state held in memory only, never sent anywhere
    const cb = document.createElement('input');
    cb.type      = 'checkbox';
    cb.className = 'checklist-step__cb';
    cb.setAttribute('aria-label', 'Mark step done');
    cb.addEventListener('change', () => {
      li.classList.toggle('checklist-step--checked', cb.checked);
    });

    const body = document.createElement('span');
    body.className = 'checklist-step__body';

    const text = document.createElement('span');
    text.textContent = step.text;
    body.appendChild(text);

    if (step.link) {
      body.appendChild(document.createElement('br'));
      const a = document.createElement('a');
      a.href      = step.link;
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.className = 'checklist-step__link';
      a.textContent = step.link;
      body.appendChild(a);
    }

    li.appendChild(cb);
    li.appendChild(body);
    ol.appendChild(li);
  }

  card.appendChild(ol);

  // Sources
  if (data.sources && data.sources.length > 0) {
    const sources = document.createElement('div');
    sources.className = 'checklist-sources';

    const label = document.createElement('span');
    label.textContent = 'Sources: ';
    sources.appendChild(label);

    for (const src of data.sources) {
      const a = document.createElement('a');
      a.href      = src.url;
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.textContent = src.name;
      sources.appendChild(a);
    }

    card.appendChild(sources);
  }

  return card;
}

/**
 * Fetch checklist data from the server for a given region or provider and
 * append a card.  My Stack selection stays in the browser — only the
 * region_id / provider name is sent as a query parameter, never the full stack.
 */
async function fetchAndAppendChecklist(params) {
  const qs = new URLSearchParams();
  if (params.region_id) qs.set('region_id', params.region_id);
  if (params.event_id)  qs.set('event_id',  params.event_id);
  if (params.provider)  qs.set('provider',  params.provider);
  if (simulate)         qs.set('simulate',  'true');

  try {
    const r = await fetch('/api/checklist?' + qs.toString());
    if (!r.ok) return;   // 404 or other — silently skip
    const data = await r.json();
    checklistCards.appendChild(buildChecklistCard(data));
  } catch (_) {
    // Network error — silently skip; the main update-error banner already shows
  }
}

/**
 * Rebuild the checklist panel after each radar fetch.
 * Called from applyMyStack whenever stackState or data changes.
 */
async function refreshChecklist(data) {
  // Clear existing cards
  while (checklistCards.firstChild) checklistCards.removeChild(checklistCards.firstChild);

  if (!stackState) {
    checklistPanel.hidden = true;
    return;
  }

  const requests = [];

  // One card per selected NEARBY region
  const nearby = MyStack.nearbySelected(stackState, data);
  for (const region of nearby) {
    const firstQuake = region.nearby_quakes && region.nearby_quakes[0];
    requests.push({
      region_id: region.id,
      event_id:  firstQuake ? firstQuake.quake_id : undefined,
    });
  }

  // One card per selected degraded provider
  for (const prov of (data.providers || [])) {
    if (!stackState.providers.has(prov.provider)) continue;
    const degradedIndicators = new Set(['degraded_performance', 'partial_outage', 'major_outage']);
    if (!degradedIndicators.has(prov.indicator)) continue;
    requests.push({ provider: prov.provider });
  }

  // If nothing warrants a checklist, show all_clear
  if (requests.length === 0) {
    requests.push({});
  }

  checklistPanel.hidden = false;
  for (const params of requests) {
    await fetchAndAppendChecklist(params);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

fetchRadar();
setInterval(fetchRadar, 60_000);

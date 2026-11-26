
/**
 * app.js — Failover Radar frontend
 *
 * Frontend-only map integration:
 *   - /api/radar remains unchanged.
 *   - /api/checklist remains unchanged.
 *   - My Stack stays local to this browser.
 *   - Three.js globe receives the same radar data as the dashboard.
 *   - No backend logic or API contract is changed.
 */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let simulate = false;
let lastData = null;
let lastChecklists = [];
let stackState = null;

// ─── DOM references ─────────────────────────────────────────────────────────

const simBanner = document.getElementById('sim-banner');
const btnSimulate = document.getElementById('btn-simulate');
const btnClear = document.getElementById('btn-clear');
const updateError = document.getElementById('update-error');

// My Stack drawer
const drawer = document.getElementById('mystack-drawer');
const scrim = document.getElementById('mystack-scrim');
const btnMyStack = document.getElementById('btn-mystack');
const btnClose = document.getElementById('btn-mystack-close');
const regionList = document.getElementById('mystack-region-list');
const providerList = document.getElementById('mystack-provider-list');
const mystackBanner = document.getElementById('mystack-banner');
const mystackAdvice = document.getElementById('mystack-advice');

// USGS panel
const staleUsgs = document.getElementById('stale-usgs');
const usgsLastUpdated = document.getElementById('usgs-last-updated');
const usgsCount = document.getElementById('usgs-count');

// GitHub panel
const staleGithub = document.getElementById('stale-github');
const githubSource = document.getElementById('github-source');
const githubLastUpdated = document.getElementById('github-last-updated');
const githubDescription = document.getElementById('github-description');
const githubComponents = document.getElementById('github-components');
const githubIncidents = document.getElementById('github-incidents');

// Cloudflare panel
const staleCloudflare = document.getElementById('stale-cloudflare');
const cloudflareSource = document.getElementById('cloudflare-source');
const cloudflareLastUpdated = document.getElementById('cloudflare-last-updated');
const cloudflareDescription = document.getElementById('cloudflare-description');
const cloudflareComponents = document.getElementById('cloudflare-components');
const cloudflareIncidents = document.getElementById('cloudflare-incidents');

// Checklist panel
const checklistPanel = document.getElementById('checklist-panel');
const checklistCards = document.getElementById('checklist-cards');

// Incident Brief
const briefTextarea = document.getElementById('brief-textarea');
const btnCopyBrief = document.getElementById('btn-copy-brief');
const briefCopyMsg = document.getElementById('brief-copy-msg');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUtc(isoStr) {
  if (!isoStr) return 'unknown';

  try {
    return new Date(isoStr).toUTCString();
  } catch (_) {
    return String(isoStr);
  }
}

function statusClass(status) {
  const known = [
    'operational',
    'degraded_performance',
    'partial_outage',
    'major_outage'
  ];

  return known.includes(status) ? status : 'unknown';
}

function statusLabel(status) {
  const labels = {
    operational: 'Operational',
    degraded_performance: 'Degraded',
    partial_outage: 'Partial outage',
    major_outage: 'Major outage'
  };

  return labels[status] || status || 'Unknown';
}

function setText(element, value) {
  if (element) element.textContent = value;
}

// ─── My Stack drawer ─────────────────────────────────────────────────────────

function openDrawer() {
  drawer.hidden = false;
  scrim.hidden = false;
  scrim.classList.add('is-open');
  btnMyStack.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  drawer.hidden = true;
  scrim.classList.remove('is-open');
  scrim.hidden = true;
  btnMyStack.setAttribute('aria-expanded', 'false');
}

btnMyStack.addEventListener('click', function () {
  if (drawer.hidden) {
    openDrawer();
  } else {
    closeDrawer();
  }
});

btnClose.addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);

// ─── My Stack initialisation ──────────────────────────────────────────────────

function initMyStack(data) {
  const knownRegionIds = data.regions.map(function (region) {
    return region.id;
  });

  const knownProviderIds = (data.providers || []).map(function (provider) {
    return provider.provider;
  });

  stackState = MyStack.load(knownRegionIds, knownProviderIds);

  // Region checkboxes
  if (regionList.dataset.built !== 'true') {
    while (regionList.firstChild) {
      regionList.removeChild(regionList.firstChild);
    }

    for (const region of data.regions) {
      const label = document.createElement('label');
      label.className = 'mystack-label';
      label.dataset.regionId = region.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'mystack-cb';
      checkbox.dataset.kind = 'region';
      checkbox.dataset.id = region.id;
      checkbox.checked = stackState.regions.has(region.id);

      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          stackState.regions.add(region.id);
        } else {
          stackState.regions.delete(region.id);
        }

        const saved = MyStack.save(stackState);
        if (saved) stackState.persisted = true;

        applyMyStack(lastData);
      });

      label.appendChild(checkbox);
      label.appendChild(
        document.createTextNode(region.label + '\u00a0(' + region.id + ')')
      );

      regionList.appendChild(label);
    }

    regionList.dataset.built = 'true';
  }

  // Provider checkboxes
  if (providerList.dataset.built !== 'true') {
    while (providerList.firstChild) {
      providerList.removeChild(providerList.firstChild);
    }

    for (const provider of (data.providers || [])) {
      const name = provider.provider;

      const label = document.createElement('label');
      label.className = 'mystack-label';
      label.dataset.providerId = name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'mystack-cb';
      checkbox.dataset.kind = 'provider';
      checkbox.dataset.id = name;
      checkbox.checked = stackState.providers.has(name);

      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          stackState.providers.add(name);
        } else {
          stackState.providers.delete(name);
        }

        const saved = MyStack.save(stackState);
        if (saved) stackState.persisted = true;

        applyMyStack(lastData);
      });

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(name));
      providerList.appendChild(label);
    }

    providerList.dataset.built = 'true';
  }
}

// ─── My Stack rendering ──────────────────────────────────────────────────────

function applyCheckboxDimming() {
  if (!stackState) return;

  regionList.querySelectorAll('label[data-region-id]').forEach(function (label) {
    const selected = stackState.regions.has(label.dataset.regionId);
    label.classList.toggle('mystack-label--dim', !selected);
  });

  providerList.querySelectorAll('label[data-provider-id]').forEach(function (label) {
    const selected = stackState.providers.has(label.dataset.providerId);
    label.classList.toggle('mystack-label--dim', !selected);
  });
}

function renderBanner(data) {
  if (!stackState) return;

  const text = MyStack.bannerText(stackState, data, simulate);

  while (mystackBanner.firstChild) {
    mystackBanner.removeChild(mystackBanner.firstChild);
  }

  mystackBanner.appendChild(document.createTextNode(text));

  const hasNearby = MyStack.nearbySelected(stackState, data).length > 0;

  mystackBanner.className =
    'mystack-banner' +
    (simulate ? ' mystack-banner--sim' : '') +
    (hasNearby ? ' mystack-banner--nearby' : '');
}

function renderAdvice(data) {
  if (!stackState) return;

  const nearby = MyStack.nearbySelected(stackState, data);

  while (mystackAdvice.firstChild) {
    mystackAdvice.removeChild(mystackAdvice.firstChild);
  }

  if (nearby.length === 0) {
    mystackAdvice.hidden = true;
    return;
  }

  const byId = {};
  for (const region of data.regions) {
    byId[region.id] = region;
  }

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
      const altId = region.nearest_alternative.id;
      const altRegion = byId[altId];

      const altLabel = altRegion
        ? altRegion.label
        : (region.nearest_alternative.label || altId);

      item.appendChild(document.createElement('br'));

      const note = document.createElement('span');
      note.className = 'advice-alt';
      note.textContent =
        'Nearest alternative: ' + altLabel +
        ' — Nearest alternative by distance (health not verified).';

      item.appendChild(note);
    }

    mystackAdvice.appendChild(item);
  }
}

function renderProviderPanelVisibility() {
  if (!stackState) return;

  const panelGithub = document.getElementById('panel-github');
  const panelCloudflare = document.getElementById('panel-cloudflare');

  if (panelGithub) {
    panelGithub.hidden = !stackState.providers.has('GitHub');
  }

  if (panelCloudflare) {
    panelCloudflare.hidden = !stackState.providers.has('Cloudflare');
  }
}

/**
 * Update the globe from the same data used by the dashboard.
 * My Stack selection affects displayed region markers and routes only.
 */
function updateGlobe(data) {
  if (
    window.FailoverGlobe &&
    typeof window.FailoverGlobe.update === 'function'
  ) {
    window.FailoverGlobe.update(data, stackState, simulate);
  }
}

function applyMyStack(data) {
  if (!data) return;

  applyCheckboxDimming();
  renderBanner(data);
  renderAdvice(data);
  renderProviderPanelVisibility();

  updateGlobe(data);
  rebuildBrief();
  refreshChecklist(data);
}

// ─── Dashboard panel rendering ───────────────────────────────────────────────

function renderUsgsPanel(quakesBlock) {
  staleUsgs.hidden = !quakesBlock.stale;

  setText(usgsLastUpdated, fmtUtc(quakesBlock.last_success));

  const count = quakesBlock.live_count;
  setText(
    usgsCount,
    count + ' M4.5+ event' + (count === 1 ? '' : 's') + ' in last 24 h'
  );
}

function renderComponentList(listElement, components) {
  while (listElement.firstChild) {
    listElement.removeChild(listElement.firstChild);
  }

  for (const component of components) {
    const item = document.createElement('li');
    item.className = 'component-item';

    const name = document.createElement('span');
    name.className = 'component-name';
    name.textContent = component.name;

    const status = document.createElement('span');
    status.className = 'component-status-' + statusClass(component.status);
    status.textContent = statusLabel(component.status);

    item.appendChild(name);
    item.appendChild(status);
    listElement.appendChild(item);
  }
}

function renderIncidentList(listElement, incidents) {
  while (listElement.firstChild) {
    listElement.removeChild(listElement.firstChild);
  }

  for (const incident of incidents) {
    const item = document.createElement('li');
    item.className = 'incident-item';

    if (incident.url) {
      const link = document.createElement('a');
      link.href = incident.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = incident.name;
      item.appendChild(link);
    } else {
      item.textContent = incident.name;
    }

    listElement.appendChild(item);
  }
}

function renderProviderPanel(
  provider,
  staleElement,
  sourceElement,
  lastUpdatedElement,
  descriptionElement,
  componentsElement,
  incidentsElement
) {
  staleElement.hidden = !provider.stale;

  if (provider.provider) {
    setText(sourceElement, provider.provider);
  }

  setText(lastUpdatedElement, fmtUtc(provider.last_success));
  setText(descriptionElement, provider.description || '—');

  renderComponentList(
    componentsElement,
    provider.components || []
  );

  renderIncidentList(
    incidentsElement,
    provider.incidents || []
  );
}

function renderPanels(data) {
  renderUsgsPanel(data.quakes);

  const providers = data.providers || [];

  const github = providers.find(function (provider) {
    return provider.provider === 'GitHub';
  });

  const cloudflare = providers.find(function (provider) {
    return provider.provider === 'Cloudflare';
  });

  if (github) {
    renderProviderPanel(
      github,
      staleGithub,
      githubSource,
      githubLastUpdated,
      githubDescription,
      githubComponents,
      githubIncidents
    );
  }

  if (cloudflare) {
    renderProviderPanel(
      cloudflare,
      staleCloudflare,
      cloudflareSource,
      cloudflareLastUpdated,
      cloudflareDescription,
      cloudflareComponents,
      cloudflareIncidents
    );
  }
}

function renderAll(data) {
  renderPanels(data);
  updateGlobe(data);
}

// ─── Radar fetch and polling ──────────────────────────────────────────────────

async function fetchRadar() {
  const url = '/api/radar?simulate=' + (simulate ? 'true' : 'false');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();

    lastData = data;
    updateError.hidden = true;

    if (!stackState) {
      initMyStack(data);
    }

    renderAll(data);
    rebuildBrief();
    applyMyStack(data);
  } catch (_) {
    updateError.hidden = false;
  }
}

// ─── Simulation controls ─────────────────────────────────────────────────────

btnSimulate.addEventListener('click', function () {
  simulate = true;

  simBanner.hidden = false;
  btnSimulate.hidden = true;
  btnClear.hidden = false;

  fetchRadar();
});

btnClear.addEventListener('click', function () {
  simulate = false;

  simBanner.hidden = true;
  btnSimulate.hidden = false;
  btnClear.hidden = true;

  fetchRadar();
});

// ─── Checklist rendering ──────────────────────────────────────────────────────

function buildChecklistCard(data) {
  const titleText = data.title || '';
  const isSimulation = titleText.startsWith('SIMULATION:');

  const card = document.createElement('div');
  card.className = 'checklist-card' +
    (isSimulation ? ' checklist-card--sim' : '');

  const title = document.createElement('p');
  title.className = 'checklist-card__title' +
    (isSimulation ? ' checklist-card__title--sim' : '');
  title.textContent = titleText;
  card.appendChild(title);

  if (data.stale_feeds && data.stale_feeds.length > 0) {
    const stale = document.createElement('p');
    stale.className = 'checklist-stale';

    const feedNames = data.stale_feeds.map(function (feed) {
      return feed.feed;
    }).join(', ');

    const lastTimestamp =
      data.stale_feeds[0].last_success || 'unknown';

    stale.textContent =
      'STALE data — ' + feedNames + ' last updated ' + lastTimestamp;

    card.appendChild(stale);
  }

  const orderedList = document.createElement('ol');
  orderedList.className = 'checklist-steps';

  for (const step of (data.steps || [])) {
    const item = document.createElement('li');
    item.className = 'checklist-step';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checklist-step__cb';
    checkbox.setAttribute('aria-label', 'Mark step done');

    checkbox.addEventListener('change', function () {
      item.classList.toggle('checklist-step--checked', checkbox.checked);
    });

    const body = document.createElement('span');
    body.className = 'checklist-step__body';

    const text = document.createElement('span');
    text.textContent = step.text;
    body.appendChild(text);

    if (step.link) {
      body.appendChild(document.createElement('br'));

      const link = document.createElement('a');
      link.href = step.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'checklist-step__link';
      link.textContent = step.link;

      body.appendChild(link);
    }

    item.appendChild(checkbox);
    item.appendChild(body);
    orderedList.appendChild(item);
  }

  card.appendChild(orderedList);

  if (data.sources && data.sources.length > 0) {
    const sources = document.createElement('div');
    sources.className = 'checklist-sources';

    const label = document.createElement('span');
    label.textContent = 'Sources: ';
    sources.appendChild(label);

    for (const source of data.sources) {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.name;

      sources.appendChild(link);
    }

    card.appendChild(sources);
  }

  return card;
}

async function fetchAndAppendChecklist(params) {
  const query = new URLSearchParams();

  if (params.region_id) {
    query.set('region_id', params.region_id);
  }

  if (params.event_id) {
    query.set('event_id', params.event_id);
  }

  if (params.provider) {
    query.set('provider', params.provider);
  }

  if (simulate) {
    query.set('simulate', 'true');
  }

  try {
    const response = await fetch('/api/checklist?' + query.toString());

    if (!response.ok) return;

    const data = await response.json();

    lastChecklists.push(data);
    checklistCards.appendChild(buildChecklistCard(data));
  } catch (_) {
    // Keep the main dashboard available if a checklist request fails.
  }
}

async function refreshChecklist(data) {
  while (checklistCards.firstChild) {
    checklistCards.removeChild(checklistCards.firstChild);
  }

  if (!stackState) {
    checklistPanel.hidden = true;
    return;
  }

  const requests = [];

  // One checklist for each selected NEARBY region.
  const nearby = MyStack.nearbySelected(stackState, data);

  for (const region of nearby) {
    const firstQuake =
      region.nearby_quakes && region.nearby_quakes[0];

    requests.push({
      region_id: region.id,
      event_id: firstQuake ? firstQuake.quake_id : undefined
    });
  }

  // One checklist for each selected degraded provider.
  const degradedIndicators = new Set([
    'degraded_performance',
    'partial_outage',
    'major_outage'
  ]);

  for (const provider of (data.providers || [])) {
    if (!stackState.providers.has(provider.provider)) continue;
    if (!degradedIndicators.has(provider.indicator)) continue;

    requests.push({
      provider: provider.provider
    });
  }

  if (requests.length === 0) {
    requests.push({});
  }

  checklistPanel.hidden = false;
  lastChecklists = [];

  for (const params of requests) {
    await fetchAndAppendChecklist(params);
  }

  rebuildBrief();
}

// ─── Incident Brief ───────────────────────────────────────────────────────────

function rebuildBrief() {
  if (!lastData || typeof BriefBuilder === 'undefined') return;

  const stackSelection = stackState
    ? {
        regions: Array.from(stackState.regions),
        providers: Array.from(stackState.providers)
      }
    : null;

  const text = BriefBuilder.buildBrief(
    lastData,
    lastChecklists,
    stackSelection,
    { simulate: simulate }
  );

  briefTextarea.value = text;
}

function showCopyMsg(message, warning) {
  briefCopyMsg.textContent = message;
  briefCopyMsg.className =
    'brief-copy-msg' + (warning ? ' brief-copy-msg--warn' : '');
  briefCopyMsg.hidden = false;

  setTimeout(function () {
    briefCopyMsg.hidden = true;
  }, 3000);
}

btnCopyBrief.addEventListener('click', async function () {
  const text = briefTextarea.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showCopyMsg('Copied', false);
    return;
  } catch (_) {
    // Continue to the Safari fallback.
  }

  briefTextarea.select();
  briefTextarea.setSelectionRange(0, 99999);

  try {
    const copied = document.execCommand('copy');

    if (copied) {
      showCopyMsg('Copied', false);
      return;
    }
  } catch (_) {
    // Continue to the manual fallback.
  }

  showCopyMsg('Tap and hold the text, then Copy.', true);
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

fetchRadar();
setInterval(fetchRadar, 60_000);

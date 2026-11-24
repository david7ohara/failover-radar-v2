/**
 * brief.test.js — node --test suite for buildBrief
 *
 * Run: node --test frontend/brief.test.js
 *
 * Rules checked:
 *   1. SIMULATION prefix when simulate: true
 *   2. All-clear case when no nearby quakes and no degraded providers
 *   3. Stale warning when stale: true
 *   4. Forbidden words absent
 *   5. All numbers (distance_km, magnitude) in the output exist in the input
 *   6. All links in the output start with https://
 *   7. "and N more" count is correct when > 5 nearby quakes
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path     = require('node:path');

// Load buildBrief via require (UMD CommonJS branch)
const { buildBrief } = require(path.join(__dirname, 'brief.js'));

// ── Shared fixture helpers ────────────────────────────────────────────────────

function makeQuake(overrides) {
  return Object.assign({
    quake_id:    'us0001',
    magnitude:   5.2,
    place:       'offshore Tokyo, Japan',
    time_utc:    '2024-01-15T03:22:00.000Z',
    url:         'https://earthquake.usgs.gov/earthquakes/eventpage/us0001',
    distance_km: 123.45,
  }, overrides);
}

function makeRegion(overrides) {
  return Object.assign({
    id:             'ap-northeast-1',
    label:          'Tokyo (ap-northeast-1)',
    lat:            35.68,
    lon:            139.69,
    classification: 'NEARBY (within 300 km)',
    nearby_quakes:  [makeQuake()],
    nearest_alternative: { id: 'ap-southeast-1', label: 'Singapore (ap-southeast-1)' },
  }, overrides);
}

function makeProvider(overrides) {
  return Object.assign({
    provider:     'GitHub',
    indicator:    'none',
    description:  'All Systems Operational.',
    last_success: '2024-01-15T03:20:00.000Z',
    page_url:     'https://www.githubstatus.com/',
    stale:        false,
    components:   [],
    incidents:    [],
  }, overrides);
}

function makeRadarData(overrides) {
  return Object.assign({
    generated_at_utc: '2024-01-15T03:25:00.000Z',
    threshold_km:     300,
    quakes: {
      live_count:   1,
      stale:        false,
      last_success: '2024-01-15T03:24:00.000Z',
      items:        [],
    },
    providers: [ makeProvider() ],
    regions:   [ makeRegion() ],
    attribution: {
      usgs: { name: 'USGS', url: 'https://earthquake.usgs.gov/' },
    },
  }, overrides);
}

// Default stack selection with one region and one provider
const defaultStack = { regions: ['ap-northeast-1'], providers: ['GitHub'] };

// ── Tests ─────────────────────────────────────────────────────────────────────

test('SIMULATION prefix: first line starts with SIMULATION: when simulate true', () => {
  const data = makeRadarData();
  const brief = buildBrief(data, [], defaultStack, { simulate: true });
  const firstLine = brief.split('\n')[0];
  assert.ok(
    firstLine.startsWith('SIMULATION:'),
    'Expected first line to start with "SIMULATION:", got: ' + firstLine
  );
});

test('SIMULATION prefix: first line does NOT start with SIMULATION when simulate false', () => {
  const data = makeRadarData();
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  const firstLine = brief.split('\n')[0];
  assert.ok(
    !firstLine.startsWith('SIMULATION:'),
    'Expected first line NOT to start with "SIMULATION:", got: ' + firstLine
  );
});

test('all-clear case: contains "does not guarantee" when no nearby quakes and no degraded providers', () => {
  const data = makeRadarData({
    regions: [
      makeRegion({ classification: 'CLEAR', nearby_quakes: [] }),
    ],
    providers: [
      makeProvider({ indicator: 'none' }),
    ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    brief.includes('does not guarantee nothing is wrong'),
    'Expected all-clear phrase, got:\n' + brief
  );
});

test('all-clear case: does NOT contain "Template checklist" when all-clear', () => {
  const data = makeRadarData({
    regions:   [ makeRegion({ classification: 'CLEAR', nearby_quakes: [] }) ],
    providers: [ makeProvider({ indicator: 'none' }) ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    !brief.includes('Template checklist'),
    'Expected no checklist in all-clear brief'
  );
});

test('stale warning: appears when quakes feed is stale', () => {
  const data = makeRadarData({
    quakes: {
      live_count:   1,
      stale:        true,
      last_success: '2024-01-15T02:00:00.000Z',
      items:        [],
    },
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    brief.includes('USGS data is stale'),
    'Expected stale warning, got:\n' + brief
  );
});

test('stale warning: appears when a provider feed is stale', () => {
  const data = makeRadarData({
    providers: [ makeProvider({ stale: true, last_success: '2024-01-15T01:00:00.000Z' }) ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    brief.includes('data is stale'),
    'Expected provider stale warning, got:\n' + brief
  );
});

test('forbidden words: none of the banned words appear in a typical brief', () => {
  const data = makeRadarData();
  const checklist = {
    title: 'Quake nearby ap-northeast-1',
    steps: [
      { text: 'Verify status of ap-northeast-1.', link: 'https://status.aws.amazon.com/' },
    ],
  };
  const brief = buildBrief(data, [checklist], defaultStack, { simulate: false });
  const lower = brief.toLowerCase();
  const forbidden = ['affected', 'impacted', 'healthy', 'unhealthy', 'caused', 'outage confirmed'];
  for (const word of forbidden) {
    assert.ok(
      !lower.includes(word),
      'Found forbidden word "' + word + '" in brief:\n' + brief
    );
  }
});

test('numbers in input: every distance_km from input appears in the output', () => {
  const q1 = makeQuake({ quake_id: 'us0001', distance_km: 123.45, magnitude: 5.2 });
  const data = makeRadarData({
    regions: [ makeRegion({ nearby_quakes: [q1] }) ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    brief.includes('123.45'),
    'Expected distance_km 123.45 to appear in brief'
  );
  assert.ok(
    brief.includes('5.2'),
    'Expected magnitude 5.2 to appear in brief'
  );
});

test('https links only: no http:// (non-https) links appear in the brief', () => {
  const q = makeQuake({ url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us0001' });
  const data = makeRadarData({
    regions: [ makeRegion({ nearby_quakes: [q] }) ],
    providers: [
      makeProvider({ page_url: 'https://www.githubstatus.com/' }),
    ],
  });
  const checklist = {
    title: 'Test checklist',
    steps: [ { text: 'Check the page.', link: 'https://status.aws.amazon.com/' } ],
  };
  const brief = buildBrief(data, [checklist], defaultStack, { simulate: false });

  // Find all tokens starting with http:// that are NOT https://
  const httpOnlyRe = /\bhttp:\/\/[^\s]*/g;
  const matches = brief.match(httpOnlyRe) || [];
  assert.equal(
    matches.length, 0,
    'Found non-https link(s): ' + matches.join(', ')
  );
});

test('"and N more" count: correct when more than 5 nearby quakes exist', () => {
  // Build 7 nearby quakes in a single region
  const quakes = [];
  for (let i = 1; i <= 7; i++) {
    quakes.push(makeQuake({
      quake_id:    'us000' + i,
      distance_km: i * 20,
      magnitude:   4.5 + i * 0.1,
    }));
  }
  const data = makeRadarData({
    regions: [ makeRegion({ nearby_quakes: quakes }) ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    brief.includes('and 2 more nearby quakes not shown'),
    'Expected "and 2 more nearby quakes not shown", got:\n' + brief
  );
});

test('"and N more": not shown when 5 or fewer nearby quakes', () => {
  const quakes = [];
  for (let i = 1; i <= 5; i++) {
    quakes.push(makeQuake({ quake_id: 'us000' + i, distance_km: i * 20 }));
  }
  const data = makeRadarData({
    regions: [ makeRegion({ nearby_quakes: quakes }) ],
  });
  const brief = buildBrief(data, [], defaultStack, { simulate: false });
  assert.ok(
    !brief.includes('more nearby quake'),
    'Expected no "and N more" line for 5 quakes'
  );
});

test('stack: "all regions and providers" when stackSelection is null', () => {
  const data = makeRadarData();
  const brief = buildBrief(data, [], null, { simulate: false });
  assert.ok(
    brief.includes('Stack: all regions and providers'),
    'Expected all-stack line when stackSelection is null'
  );
});

test('stack: shows correct region and provider counts from stackSelection', () => {
  const data = makeRadarData();
  const stack = { regions: ['ap-northeast-1', 'us-east-1'], providers: ['GitHub', 'Cloudflare'] };
  const brief = buildBrief(data, [], stack, { simulate: false });
  assert.ok(
    brief.includes('Your stack: 2 regions, 2 providers'),
    'Expected "Your stack: 2 regions, 2 providers", got:\n' + brief
  );
});

test('closing lines: always present regardless of data', () => {
  const data = makeRadarData({
    regions:   [ makeRegion({ classification: 'CLEAR', nearby_quakes: [] }) ],
    providers: [ makeProvider({ indicator: 'none' }) ],
  });
  const brief = buildBrief(data, [], null, { simulate: false });
  assert.ok(
    brief.includes('Nearest alternative by distance (health not verified). Verify before shifting traffic.'),
    'Missing first closing line'
  );
  assert.ok(
    brief.includes('Seismic proximity and provider status are separate signals.'),
    'Missing second closing line'
  );
});

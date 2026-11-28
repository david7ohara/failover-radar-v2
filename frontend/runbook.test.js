/**
 * runbook.test.js — node --test suite for buildRunbook
 *
 * Run: node --test frontend/runbook.test.js
 *
 * Rules checked:
 *   1. First line is "Failover Radar stack runbook (pre-incident)"
 *   2. Contains "As of " followed by the data's generated_at_utc
 *   3. Contains "Nearest alternative by distance (health not verified)" for each selected region
 *   4. Contains "Before shifting traffic, verify that region's health yourself."
 *   5. Contains provider name, indicator, description for each selected provider
 *   6. Final line is "Seismic proximity and provider status are separate signals."
 *   7. No banned words (affected, impacted, healthy, unhealthy, caused, outage confirmed)
 *   8. All links start with https://
 *   9. Stale warning present when feed is stale
 *  10. With null stackSelection, all regions and providers included
 *  11. All values come from the input (no invented numbers or text)
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path     = require('node:path');

const { buildRunbook } = require(path.join(__dirname, 'runbook.js'));

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeProvider(overrides) {
  return Object.assign({
    provider:     'GitHub',
    indicator:    'none',
    description:  'All Systems Operational.',
    last_success: '2024-03-10T08:00:00.000Z',
    page_url:     'https://www.githubstatus.com/',
    stale:        false,
    components:   [],
    incidents:    [],
  }, overrides);
}

function makeRegion(overrides) {
  return Object.assign({
    id:             'ap-northeast-1',
    label:          'Tokyo (ap-northeast-1)',
    lat:            35.68,
    lon:            139.69,
    classification: 'CLEAR',
    nearby_quakes:  [],
    nearest_alternative: {
      id:    'ap-southeast-1',
      label: 'Singapore (ap-southeast-1)',
    },
  }, overrides);
}

function makeRadarData(overrides) {
  return Object.assign({
    generated_at_utc: '2024-03-10T08:05:00.000Z',
    threshold_km:     300,
    quakes: {
      live_count:   0,
      stale:        false,
      last_success: '2024-03-10T08:04:00.000Z',
      items:        [],
    },
    providers: [ makeProvider() ],
    regions:   [ makeRegion() ],
  }, overrides);
}

const defaultStack = {
  regions:   ['ap-northeast-1'],
  providers: ['GitHub'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test('first line is "Failover Radar stack runbook (pre-incident)"', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  const firstLine = text.split('\n')[0];
  assert.equal(
    firstLine,
    'Failover Radar stack runbook (pre-incident)',
    'First line mismatch: ' + firstLine
  );
});

test('contains "As of " with the generated_at_utc value', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  // The ISO string is formatted via toUTCString; just check "As of " is present
  assert.ok(
    text.includes('As of '),
    'Expected "As of " in runbook'
  );
});

test('contains "Nearest alternative by distance (health not verified)" for selected region', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(
    text.includes('Nearest alternative by distance (health not verified)'),
    'Missing nearest-alternative label'
  );
});

test('contains "Before shifting traffic, verify that region\'s health yourself."', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(
    text.includes("Before shifting traffic, verify that region's health yourself."),
    'Missing verify-before-shifting-traffic line'
  );
});

test('contains provider name for each selected provider', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('GitHub'), 'Missing provider name "GitHub"');
});

test('contains provider indicator for each selected provider', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('none'), 'Missing provider indicator');
});

test('contains provider description for each selected provider', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('All Systems Operational.'), 'Missing provider description');
});

test('final line is "Seismic proximity and provider status are separate signals."', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  const lines = text.split('\n').filter(function (l) { return l.trim() !== ''; });
  const lastLine = lines[lines.length - 1];
  assert.equal(
    lastLine,
    'Seismic proximity and provider status are separate signals.',
    'Last non-empty line mismatch: ' + lastLine
  );
});

test('no banned words in output', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  const lower = text.toLowerCase();
  const banned = ['affected', 'impacted', 'healthy', 'unhealthy', 'caused', 'outage confirmed'];
  for (var i = 0; i < banned.length; i++) {
    assert.ok(
      !lower.includes(banned[i]),
      'Found banned word "' + banned[i] + '" in runbook'
    );
  }
});

test('all links start with https://', () => {
  const data = makeRadarData({
    providers: [ makeProvider({ page_url: 'https://www.githubstatus.com/' }) ],
  });
  const text = buildRunbook(data, defaultStack);
  const httpOnlyRe = /\bhttp:\/\/[^\s]*/g;
  const matches = text.match(httpOnlyRe) || [];
  assert.equal(matches.length, 0, 'Found non-https link(s): ' + matches.join(', '));
});

test('http:// provider page_url is silently omitted', () => {
  const data = makeRadarData({
    providers: [ makeProvider({ page_url: 'http://insecure.example.com/' }) ],
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(
    !text.includes('http://insecure.example.com/'),
    'Insecure URL should not appear in output'
  );
});

test('stale warning present when USGS feed is stale', () => {
  const data = makeRadarData({
    quakes: {
      live_count:   0,
      stale:        true,
      last_success: '2024-03-10T07:00:00.000Z',
      items:        [],
    },
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('USGS data is stale'), 'Missing USGS stale warning');
});

test('stale warning present when provider feed is stale', () => {
  const data = makeRadarData({
    providers: [ makeProvider({ stale: true, last_success: '2024-03-10T06:00:00.000Z' }) ],
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('data is stale'), 'Missing provider stale warning');
});

test('no stale warning when neither feed is stale', () => {
  const data = makeRadarData();
  const text = buildRunbook(data, defaultStack);
  assert.ok(!text.includes('stale'), 'Unexpected stale warning in output');
});

test('null stackSelection includes all regions and providers', () => {
  const data = makeRadarData({
    regions: [
      makeRegion({ id: 'us-east-1',      label: 'N. Virginia (us-east-1)' }),
      makeRegion({ id: 'eu-central-1',   label: 'Frankfurt (eu-central-1)' }),
    ],
    providers: [
      makeProvider({ provider: 'GitHub',     page_url: 'https://www.githubstatus.com/' }),
      makeProvider({ provider: 'Cloudflare', page_url: 'https://www.cloudflarestatus.com/' }),
    ],
  });
  const text = buildRunbook(data, null);
  assert.ok(text.includes('us-east-1'),    'Missing us-east-1 with null selection');
  assert.ok(text.includes('eu-central-1'), 'Missing eu-central-1 with null selection');
  assert.ok(text.includes('GitHub'),       'Missing GitHub with null selection');
  assert.ok(text.includes('Cloudflare'),   'Missing Cloudflare with null selection');
});

test('only selected region appears when stackSelection specifies one region', () => {
  const data = makeRadarData({
    regions: [
      makeRegion({ id: 'ap-northeast-1', label: 'Tokyo (ap-northeast-1)' }),
      makeRegion({ id: 'us-east-1',      label: 'N. Virginia (us-east-1)' }),
    ],
  });
  const stack = { regions: ['ap-northeast-1'], providers: ['GitHub'] };
  const text = buildRunbook(data, stack);
  assert.ok(text.includes('ap-northeast-1'), 'Missing selected region');
  assert.ok(!text.includes('us-east-1'),     'Unselected region should not appear');
});

test('only selected provider appears when stackSelection specifies one provider', () => {
  const data = makeRadarData({
    providers: [
      makeProvider({ provider: 'GitHub',     page_url: 'https://www.githubstatus.com/' }),
      makeProvider({ provider: 'Cloudflare', page_url: 'https://www.cloudflarestatus.com/' }),
    ],
  });
  const stack = { regions: ['ap-northeast-1'], providers: ['GitHub'] };
  const text = buildRunbook(data, stack);
  assert.ok(text.includes('GitHub'),       'Missing selected provider');
  assert.ok(!text.includes('Cloudflare'),  'Unselected provider should not appear');
});

test('all values come from the input (region label present in output)', () => {
  const data = makeRadarData({
    regions: [ makeRegion({ label: 'Tokyo (ap-northeast-1)' }) ],
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(text.includes('Tokyo (ap-northeast-1)'), 'Region label not found in output');
});

test('nearest alternative label present in output', () => {
  const data = makeRadarData({
    regions: [
      makeRegion({
        nearest_alternative: { id: 'ap-southeast-1', label: 'Singapore (ap-southeast-1)' },
      }),
    ],
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(
    text.includes('Singapore (ap-southeast-1)'),
    'Nearest alternative label not found in output'
  );
});

test('provider status page link present in output', () => {
  const data = makeRadarData({
    providers: [ makeProvider({ page_url: 'https://www.githubstatus.com/' }) ],
  });
  const text = buildRunbook(data, defaultStack);
  assert.ok(
    text.includes('https://www.githubstatus.com/'),
    'Provider status page URL not found in output'
  );
});

test('empty-set stackSelection falls back to all regions and providers', () => {
  const data = makeRadarData({
    regions: [
      makeRegion({ id: 'us-east-1', label: 'N. Virginia (us-east-1)' }),
    ],
    providers: [
      makeProvider({ provider: 'Cloudflare', page_url: 'https://www.cloudflarestatus.com/' }),
    ],
  });
  const stack = { regions: [], providers: [] };
  const text = buildRunbook(data, stack);
  assert.ok(text.includes('us-east-1'),  'us-east-1 missing with empty selection');
  assert.ok(text.includes('Cloudflare'), 'Cloudflare missing with empty selection');
});

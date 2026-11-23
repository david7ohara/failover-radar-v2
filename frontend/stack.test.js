/**
 * stack.test.js — Node --test suite for stack.js pure logic.
 *
 * Run:  node --test frontend/stack.test.js
 *
 * No network calls, no DOM, no localStorage (stubbed inline).
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Stub localStorage before requiring stack.js ──────────────────────────────

let _store = {};
global.localStorage = {
  getItem:    (k)    => Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null,
  setItem:    (k, v) => { _store[k] = String(v); },
  removeItem: (k)    => { delete _store[k]; },
  clear:      ()     => { _store = {}; },
};

const { load, save, nearbySelected, bannerText, STORAGE_KEY } = require('./stack.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REGION_IDS   = ['us-east-1', 'us-west-1', 'ap-northeast-1', 'eu-central-1'];
const PROVIDER_IDS = ['GitHub', 'Cloudflare'];

function makeData({ nearbyIds = [], staleProv = [], stale = false } = {}) {
  return {
    quakes: { stale, live_count: nearbyIds.length },
    regions: REGION_IDS.map(id => ({
      id,
      label: id,
      classification: nearbyIds.includes(id) ? 'NEARBY (within 300 km)' : 'CLEAR',
      nearest_alternative: { id: 'eu-central-1', label: 'EU (Frankfurt)', relationship: 'nearest alt' },
    })),
    providers: PROVIDER_IDS.map(name => ({
      provider: name,
      description: staleProv.includes(name)
        ? 'Some systems experiencing disruptions'
        : 'All Systems Operational',
    })),
  };
}

// ── load() ────────────────────────────────────────────────────────────────────

test('load — no saved data returns all selected, persisted false', () => {
  localStorage.clear();
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions].sort(),   REGION_IDS.sort());
  assert.deepEqual([...s.providers].sort(), PROVIDER_IDS.sort());
  assert.equal(s.persisted, false);
});

test('load — valid saved data restores selection, persisted true', () => {
  localStorage.clear();
  const saved = { regions: ['us-east-1', 'ap-northeast-1'], providers: ['GitHub'] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions].sort(),   ['ap-northeast-1', 'us-east-1']);
  assert.deepEqual([...s.providers],        ['GitHub']);
  assert.equal(s.persisted, true);
});

test('load — unknown region IDs in saved data are dropped silently', () => {
  localStorage.clear();
  const saved = { regions: ['us-east-1', 'ap-south-1-UNKNOWN'], providers: ['GitHub'] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions], ['us-east-1']);
  assert.equal(s.persisted, true);
});

test('load — unknown provider IDs in saved data are dropped silently', () => {
  localStorage.clear();
  const saved = { regions: ['us-east-1'], providers: ['GitHub', 'AWS_UNKNOWN'] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.providers], ['GitHub']);
  assert.equal(s.persisted, true);
});

test('load — bad JSON returns all selected, persisted false', () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, '{not valid json,,}');
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions].sort(),   REGION_IDS.sort());
  assert.equal(s.persisted, false);
});

test('load — saved data with wrong shape returns all selected, persisted false', () => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions].sort(), REGION_IDS.sort());
  assert.equal(s.persisted, false);
});

// ── save() ────────────────────────────────────────────────────────────────────

test('save — writes and can be read back by load', () => {
  localStorage.clear();
  const state = { regions: new Set(['us-east-1']), providers: new Set(['Cloudflare']), persisted: false };
  const ok = save(state);
  assert.equal(ok, true);
  const s = load(REGION_IDS, PROVIDER_IDS);
  assert.deepEqual([...s.regions],   ['us-east-1']);
  assert.deepEqual([...s.providers], ['Cloudflare']);
  assert.equal(s.persisted, true);
});

// ── nearbySelected() ─────────────────────────────────────────────────────────

test('nearbySelected — returns only selected NEARBY regions', () => {
  const state = { regions: new Set(['us-east-1', 'ap-northeast-1']), providers: new Set() };
  const data  = makeData({ nearbyIds: ['ap-northeast-1', 'eu-central-1'] });
  const result = nearbySelected(state, data);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ap-northeast-1');
});

test('nearbySelected — returns empty when no selected region is NEARBY', () => {
  const state = { regions: new Set(['us-east-1']), providers: new Set() };
  const data  = makeData({ nearbyIds: ['ap-northeast-1'] });
  const result = nearbySelected(state, data);
  assert.equal(result.length, 0);
});

test('nearbySelected — returns empty when no regions selected', () => {
  const state = { regions: new Set(), providers: new Set() };
  const data  = makeData({ nearbyIds: ['us-east-1'] });
  const result = nearbySelected(state, data);
  assert.equal(result.length, 0);
});

// ── bannerText() ──────────────────────────────────────────────────────────────

test('bannerText — zero regions and zero providers selected', () => {
  const state = { regions: new Set(), providers: new Set(), persisted: true };
  const data  = makeData();
  const text  = bannerText(state, data, false);
  assert.equal(text, 'Pick at least one region or provider.');
});

test('bannerText — all selected, no nearby, all operational', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData();
  const text  = bannerText(state, data, false);
  assert.equal(
    text,
    'Your stack: 4 regions, 2 providers. 0 regions nearby a quake. 0 providers degraded.'
  );
});

test('bannerText — one region nearby', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData({ nearbyIds: ['ap-northeast-1'] });
  const text  = bannerText(state, data, false);
  assert.ok(text.includes('1 region nearby a quake.'), text);
});

test('bannerText — singular region/provider grammar', () => {
  const state = { regions: new Set(['us-east-1']), providers: new Set(['GitHub']), persisted: true };
  const data  = makeData({ nearbyIds: ['us-east-1'], staleProv: ['GitHub'] });
  const text  = bannerText(state, data, false);
  assert.ok(text.includes('1 region,'), text);
  assert.ok(text.includes('1 provider.'), text);
  assert.ok(text.includes('1 region nearby a quake.'), text);
  assert.ok(text.includes('1 provider degraded.'), text);
});

test('bannerText — simulation prefix', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData();
  const text  = bannerText(state, data, true);
  assert.ok(text.startsWith('SIMULATION: '), text);
});

test('bannerText — stale note appended when quakes.stale is true', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData({ stale: true });
  const text  = bannerText(state, data, false);
  assert.ok(text.includes('Data may be stale.'), text);
});

test('bannerText — no stale note when quakes.stale is false', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData({ stale: false });
  const text  = bannerText(state, data, false);
  assert.ok(!text.includes('stale'), text);
});

test('bannerText — not-persisted note appended', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: false };
  const data  = makeData();
  const text  = bannerText(state, data, false);
  assert.ok(text.includes('My Stack is saved only in this browser.'), text);
});

test('bannerText — no not-persisted note when persisted is true', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData();
  const text  = bannerText(state, data, false);
  assert.ok(!text.includes('saved only in this browser'), text);
});

test('bannerText — simulation and stale can combine', () => {
  const state = { regions: new Set(REGION_IDS), providers: new Set(PROVIDER_IDS), persisted: true };
  const data  = makeData({ stale: true });
  const text  = bannerText(state, data, true);
  assert.ok(text.startsWith('SIMULATION: '), text);
  assert.ok(text.includes('Data may be stale.'), text);
});

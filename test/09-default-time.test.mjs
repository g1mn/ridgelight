// Written with SI (AI coding model) assistance and reviewed by the author.
// test/09-default-time.test.mjs
// Test 9: the first screen opens at a step where the Sun and Earth are both up, and the map summary share is computed from the track.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modelScript = fs.readFileSync(path.resolve('web', 'src', 'model.js'), 'utf-8');
new Function(modelScript)();
const model = globalThis.LW.model;

const flat = { az_deg: [0, 90, 180, 270], elev_deg: [0, 0, 0, 0] };
function track(sunEl, earthEl) {
  const n = sunEl.length;
  return { n, step_minutes: 60, start_utc: '2026-11-14T01:00:00Z',
    sun: { az_deg: new Array(n).fill(90), el_deg: sunEl }, earth: { az_deg: new Array(n).fill(0), el_deg: earthEl } };
}

test('9a. pickDefaultTimeIndex picks the earliest step where the most sites see both, the selected site first', () => {
  const data = {
    sites: [{ site_id: 'a' }, { site_id: 'b' }],
    horizon: { a: flat, b: flat },
    tracks: { a: track([-1, 2, 2, 2], [-1, -1, 3, 3]), b: track([-1, -1, 1, 1], [-1, -1, -1, 2]) }
  };
  assert.equal(model.pickDefaultTimeIndex(data, 'a'), 3, 'step 3 has both bodies up at both sites');
  const onlyA = { ...data, tracks: { a: data.tracks.a, b: track([-1, -1, -1, -1], [-1, -1, -1, -1]) } };
  assert.equal(model.pickDefaultTimeIndex(onlyA, 'a'), 2, 'earliest step with both up at the selected site');
  assert.equal(model.pickDefaultTimeIndex({ sites: [], tracks: {}, horizon: {} }, null), 0, 'no tracks gives step 0');
});

test('9b. visibleShare counts steps above the terrain horizon', () => {
  const tr = track([-1, 2, 2, 2], [-1, -1, 3, 3]);
  assert.equal(model.visibleShare(tr, flat, 'sun'), 0.75);
  assert.equal(model.visibleShare(tr, flat, 'earth'), 0.5);
  assert.equal(model.visibleShare(null, flat, 'sun'), null);
});

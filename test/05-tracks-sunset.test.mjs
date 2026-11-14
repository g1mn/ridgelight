// Written with SI (AI coding model) assistance and reviewed by the author.
// test/05-tracks-sunset.test.mjs
// Test 7: Next sunset calculation using synthetic fixtures returns expected index/time or null.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load model.js into global context
const modelScript = fs.readFileSync(path.resolve('web', 'src', 'model.js'), 'utf-8');
new Function(modelScript)();

const model = globalThis.LW.model;

test('7. Next sunset calculation with synthetic track and horizon', () => {
  const trackPath = path.resolve('test', 'fixtures', 'synthetic-track.json');
  const horizonPath = path.resolve('test', 'fixtures', 'synthetic-horizon.json');
  const noSunsetPath = path.resolve('test', 'fixtures', 'synthetic-track-nosunset.json');

  const track = JSON.parse(fs.readFileSync(trackPath, 'utf-8'));
  const horizon = JSON.parse(fs.readFileSync(horizonPath, 'utf-8'));
  const noSunsetTrack = JSON.parse(fs.readFileSync(noSunsetPath, 'utf-8'));

  // In synthetic-track.json:
  // step_minutes: 60
  // Sun el_deg: [5.0, 3.0, 1.0, -1.0, -3.0]
  // Horizon elev_deg: [0, 0, 0, ...] (0 at all azimuths)
  // At i=0: el = 5.0 > 0 (visible)
  // At i=1: el = 3.0 > 0 (visible)
  // At i=2: el = 1.0 > 0 (visible)
  // At i=3: el = -1.0 <= 0 (hidden -> first sunset transition occurs at index 3)

  const sunsetFrom0 = model.findNextSunset(track, horizon, 0);
  assert.ok(sunsetFrom0, 'Must find sunset from index 0');
  assert.equal(sunsetFrom0.index, 3, 'First sunset transition index should be 3');
  assert.equal(sunsetFrom0.hours, 3.0, 'Hours from index 0 to 3 with 60-min steps should be 3.0');

  const sunsetFrom1 = model.findNextSunset(track, horizon, 1);
  assert.ok(sunsetFrom1, 'Must find sunset from index 1');
  assert.equal(sunsetFrom1.index, 3);
  assert.equal(sunsetFrom1.hours, 2.0);

  const sunsetFrom2 = model.findNextSunset(track, horizon, 2);
  assert.ok(sunsetFrom2, 'Must find sunset from index 2');
  assert.equal(sunsetFrom2.index, 3);
  assert.equal(sunsetFrom2.hours, 1.0);

  // If already at or past index 3, there are no subsequent sunsets in track
  const sunsetFrom3 = model.findNextSunset(track, horizon, 3);
  assert.equal(sunsetFrom3, null, 'No sunset after index 3 in loaded track');

  // When track never goes below horizon, must return null
  const noSunset = model.findNextSunset(noSunsetTrack, horizon, 0);
  assert.equal(noSunset, null, 'Track with no sunset must return null');
});

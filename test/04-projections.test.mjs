// Written with SI (AI coding model) assistance and reviewed by the author.
// test/04-projections.test.mjs
// Tests 4, 5, 6: Polar stereographic projection, Sky dome coords, Great circle distance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load model.js into global context
const modelScript = fs.readFileSync(path.resolve('web', 'src', 'model.js'), 'utf-8');
new Function(modelScript)();

const model = globalThis.LW.model;

test('4. Polar stereographic projection math satisfies map requirements', () => {
  const cx = 250;
  const cy = 250;
  const radiusPx = 200;
  const boundLat = -80;

  // 1. Pole is center: lat = -90 -> (cx, cy)
  const poleProj = model.polarStereographicProject(-90, 0, boundLat, radiusPx, cx, cy);
  assert.equal(Math.round(poleProj.x), cx);
  assert.equal(Math.round(poleProj.y), cy);
  assert.equal(poleProj.r, 0);

  // 2. Same latitude has same radius regardless of longitude
  const p1 = model.polarStereographicProject(-85, 0, boundLat, radiusPx, cx, cy);
  const p2 = model.polarStereographicProject(-85, 90, boundLat, radiusPx, cx, cy);
  const p3 = model.polarStereographicProject(-85, 180, boundLat, radiusPx, cx, cy);
  const p4 = model.polarStereographicProject(-85, -90, boundLat, radiusPx, cx, cy);

  assert.ok(Math.abs(p1.r - p2.r) < 1e-9);
  assert.ok(Math.abs(p2.r - p3.r) < 1e-9);
  assert.ok(Math.abs(p3.r - p4.r) < 1e-9);

  // 3. Latitude further from pole has larger radius
  const r88 = model.polarStereographicProject(-88, 0, boundLat, radiusPx, cx, cy).r;
  const r85 = model.polarStereographicProject(-85, 0, boundLat, radiusPx, cx, cy).r;
  const r80 = model.polarStereographicProject(-80, 0, boundLat, radiusPx, cx, cy).r;

  assert.ok(r88 < r85, `r(-88)=${r88} must be less than r(-85)=${r85}`);
  assert.ok(r85 < r80, `r(-85)=${r85} must be less than r(-80)=${r80}`);
  assert.ok(Math.abs(r80 - radiusPx) < 1e-9, `r at boundLat must equal radiusPx`);

  // 4. Longitude 0 is top (North), 90 deg E is right (East)
  const lon0 = model.polarStereographicProject(-85, 0, boundLat, radiusPx, cx, cy);
  assert.equal(Math.round(lon0.x), cx);
  assert.ok(lon0.y < cy, 'lon 0 deg must be above center (top)');

  const lon90E = model.polarStereographicProject(-85, 90, boundLat, radiusPx, cx, cy);
  assert.ok(lon90E.x > cx, 'lon 90 deg E must be to the right of center');
  assert.equal(Math.round(lon90E.y), cy);
});

test('5. Sky dome coordinates math satisfies dome requirements', () => {
  const cx = 250;
  const cy = 250;
  const radiusPx = 200;

  // 1. Elevation 90 is center
  const zenith = model.skyDomeProject(0, 90, radiusPx, cx, cy);
  assert.equal(Math.round(zenith.x), cx);
  assert.equal(Math.round(zenith.y), cy);
  assert.equal(zenith.r, 0);

  // 2. Elevation 0, Azimuth 0 is top (N label position)
  const northHorizon = model.skyDomeProject(0, 0, radiusPx, cx, cy);
  assert.equal(Math.round(northHorizon.x), cx);
  assert.equal(Math.round(northHorizon.y), cy - radiusPx);

  // 3. Azimuth 90 is right (E label position)
  const eastHorizon = model.skyDomeProject(90, 0, radiusPx, cx, cy);
  assert.equal(Math.round(eastHorizon.x), cx + radiusPx);
  assert.equal(Math.round(eastHorizon.y), cy);

  // 4. Azimuth 180 is bottom (S label position)
  const southHorizon = model.skyDomeProject(180, 0, radiusPx, cx, cy);
  assert.equal(Math.round(southHorizon.x), cx);
  assert.equal(Math.round(southHorizon.y), cy + radiusPx);

  // 5. Azimuth 270 is left (W label position)
  const westHorizon = model.skyDomeProject(270, 0, radiusPx, cx, cy);
  assert.equal(Math.round(westHorizon.x), cx - radiusPx);
  assert.equal(Math.round(westHorizon.y), cy);
});

test('6. Great circle distance between South Pole and lat -89 deg is 1737.4 * pi / 180 km (to 2 decimal places)', () => {
  const expected = Number((1737.4 * Math.PI / 180).toFixed(2));
  const measured = model.greatCircleDistanceKm(-90, 0, -89, 0);
  const measuredRounded = Number(measured.toFixed(2));

  assert.equal(measuredRounded, expected, `Expected ${expected} km, got ${measuredRounded} km`);
  assert.equal(measuredRounded, 30.32);
});

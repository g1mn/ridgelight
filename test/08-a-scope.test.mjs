// Written with SI (AI coding model) assistance and reviewed by the author.
// test/08-a-scope.test.mjs
// A scope data in LW.model: M1 key spellings, L2 products, empty states.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

new Function(fs.readFileSync(path.resolve('web', 'src', 'model.js'), 'utf-8'))();
const model = globalThis.LW.model;

test('14. normalizeM1 accepts the N10 keys and the brief keys', () => {
  const a = model.normalizeM1({ agreement_pct: 94, kappa: 0.7, baseline: { agreement_pct: 56 }, target: { agreement_pct_min: 85 }, target_met: true });
  assert.deepEqual([a.agreement, a.kappa, a.baseline, a.targetMin, a.targetMet], [94, 0.7, 56, 85, true]);
  const b = model.normalizeM1({ agreement_layer_a: 90, baseline_no_terrain_agreement: 50 });
  assert.deepEqual([b.agreement, b.baseline, b.targetMet], [90, 50, null]);
  assert.equal(model.normalizeM1(null).agreement, null);
});

test('15. M1 row: met from target_met, not_met when false, blocked is not done', () => {
  const rowOf = (m1) => model.normalizeVerify({ m1 }, null).find((r) => r.id === 'm1');
  assert.equal(rowOf({ frames: 3, agreement_pct: 90, target_met: true }).status, 'met');
  assert.equal(rowOf({ frames: 3, agreement_pct: 70, target_met: false }).status, 'not_met');
  const blocked = rowOf({ blocked: 'no frames' });
  assert.equal(blocked.status, 'not_measured');
  assert.match(blocked.measured, /Observation check not done/);
});

test('16. normalizeL2 handles missing and partial products without throwing', () => {
  assert.equal(model.normalizeL2(null, null).available, false);
  assert.equal(model.normalizeL2({}, null).available, false);
  const r = model.normalizeL2(
    {
      sites: { r1: { points: [{ point_id: 'r1-01' }], center: { x_m: 0, y_m: 0 }, best_point_id: 'r1-01' }, bad: { points: 1 } },
      calendar: { period: { start: '2027-01-01', end: '2027-01-10' }, x_hours: 72, y_earth_pct: 50, sites: [{ site_id: 'r1', dates_ok: ['2027-01-02'] }] },
      shadow: { rows: [{ site_id: 'r1', point_kind: 'best' }, { site_id: 'zz' }] },
      dsn: { stations: [], sites: [{ site_id: 'r1', comm_fraction: 0.5 }] }
    },
    null
  );
  assert.equal(r.available, true);
  assert.deepEqual(Object.keys(r.bySite), ['r1']);
  assert.equal(r.bySite.r1.calendar.n_dates_ok, 1);
  assert.equal(r.bySite.r1.shadow.length, 1);
  assert.equal(r.bySite.r1.dsn.comm_fraction, 0.5);
});

test('17. L2 and DSN rows only appear when their data exists', () => {
  assert.equal(model.normalizeVerify(null, null).length, 3);
  const rows = model.normalizeVerify({ l2: { rank_pairs_total: 10, rank_changed_combos: 4, regions: 9, best_vs_center_hours: { a: 1, b: 5 } }, dsn_horizons: { max_diff_min: 0.1, target_max_diff_min: 5, target_met: true, n_boundaries: 3 } }, null);
  assert.ok(rows.find((r) => r.id === 'l2'));
  assert.equal(rows.find((r) => r.id === 'dsn').status, 'met');
});

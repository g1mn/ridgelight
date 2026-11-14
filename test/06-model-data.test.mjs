// Written with SI (AI coding model) assistance and reviewed by the author.
// test/06-model-data.test.mjs
// Tests 8, 12, 13: Normalization resilience, approx inference, and aliases handling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load model.js into global context
const modelScript = fs.readFileSync(path.resolve('web', 'src', 'model.js'), 'utf-8');
new Function(modelScript)();

const model = globalThis.LW.model;

test('8. LW.model: empty or missing LW_DATA returns empty state without throwing; malformed files marked error', () => {
  // Empty data calls must not throw
  const resNull = model.normalizeData(null);
  assert.ok(resNull);
  assert.deepEqual(resNull.sites, []);
  assert.equal(resNull.verifyRows.length, 3); // L1a, L1b, M1 default rows
  assert.equal(resNull.verifyRows[0].status, 'not_measured');
  assert.equal(resNull.verifyRows[0].measured, 'Not measured yet');

  const resEmpty = model.normalizeData({});
  assert.ok(resEmpty);
  assert.deepEqual(resEmpty.sites, []);
  assert.equal(resEmpty.verifyRows[0].status, 'not_measured');

  // Partial missing files: sites present, verify missing
  const resPartial = model.normalizeData({ sites: [] });
  assert.ok(resPartial);
  assert.equal(resPartial.verifyRows[0].status, 'not_measured');

  // Malformed L1a summary missing required keys (max_sep_deg or median_sep_deg)
  const resBadVerify = model.normalizeData({
    verify: {
      l1a: { n_pairs: 100 } // missing max_sep_deg and median_sep_deg!
    }
  });
  const badRow = resBadVerify.verifyRows.find((r) => r.id === 'l1a');
  assert.ok(badRow);
  assert.equal(badRow.isError, true, 'Row with missing required keys must be marked as error state');
});

test('12. Synthetic site with only coord_quality and no approx resolves approx correctly', () => {
  const synSitesPath = path.resolve('test', 'fixtures', 'synthetic-sites.json');
  const fixture = JSON.parse(fs.readFileSync(synSitesPath, 'utf-8'));
  const normalized = model.normalizeData(fixture);

  // 1. approx_from_public_map -> approx: true
  const siteApprox = normalized.sites.find((s) => s.site_id === 'syn-site-approx');
  assert.ok(siteApprox);
  assert.equal(siteApprox.approx, true, 'approx_from_public_map must have approx: true');

  // 2. published_text -> approx: false
  const sitePublished = normalized.sites.find((s) => s.site_id === 'syn-site-published');
  assert.ok(sitePublished);
  assert.equal(sitePublished.approx, false, 'published_text must have approx: false');

  // 3. landing_report -> approx: false
  const siteReport = normalized.sites.find((s) => s.site_id === 'syn-site-report');
  assert.ok(siteReport);
  assert.equal(siteReport.approx, false, 'landing_report must have approx: false');

  // 4. unrecognized quality -> approx: true (do not assume not approx)
  const siteUnknown = normalized.sites.find((s) => s.site_id === 'syn-site-unknown-quality');
  assert.ok(siteUnknown);
  assert.equal(siteUnknown.approx, true, 'unrecognized coord_quality must have approx: true');
  assert.equal(siteUnknown.coord_quality, 'unrecognized_source', 'original coord_quality string must be preserved');
});

test('13. Aliases: id alias, read_at_kst alias, array sites.json, minimal L1a summary', () => {
  const synSitesPath = path.resolve('test', 'fixtures', 'synthetic-sites.json');
  const synArrayPath = path.resolve('test', 'fixtures', 'synthetic-sites-array.json');
  const synL1aPath = path.resolve('test', 'fixtures', 'synthetic-l1a-minimal.json');

  const synSites = JSON.parse(fs.readFileSync(synSitesPath, 'utf-8'));
  const synArray = JSON.parse(fs.readFileSync(synArrayPath, 'utf-8'));
  const synL1a = JSON.parse(fs.readFileSync(synL1aPath, 'utf-8'));

  // 1. Row with id only (no site_id)
  const normSites = model.normalizeData(synSites);
  const aliasSite = normSites.sites.find((s) => s.id === 'syn-site-id-alias');
  assert.ok(aliasSite, 'Must find site by id alias');
  assert.equal(aliasSite.site_id, 'syn-site-id-alias', 'site_id must be populated from id');

  // 2. Row with read_at_kst only
  assert.equal(aliasSite.read_at, '2026-11-14 10:00 KST', 'read_at must accept read_at_kst');

  // 3. Bare array sites.json
  const normArray = model.normalizeData({ sites: synArray });
  assert.equal(normArray.sites.length, 2, 'Array sites.json must be accepted and parsed');
  assert.equal(normArray.sites[0].site_id, 'syn-array-1');
  assert.equal(normArray.sites[1].site_id, 'syn-array-2');

  // Direct bare array passed as rawData.sites
  const normBare = model.normalizeData(synArray);
  assert.equal(normBare.sites.length, 2);

  // 4. L1a summary with only required keys (max_sep_deg and median_sep_deg)
  const normL1a = model.normalizeData({
    verify: {
      l1a: synL1a
    }
  });
  const l1aRow = normL1a.verifyRows.find((r) => r.id === 'l1a');
  assert.ok(l1aRow);
  assert.equal(l1aRow.isError, false, 'L1a with required keys only must not be an error row');
  assert.equal(l1aRow.n, '-', 'Optional n_pairs defaults to -');
  assert.equal(l1aRow.target, '-', 'Optional target defaults to -');
  assert.ok(l1aRow.measured.includes('0.0012'), 'Measured contains max_sep_deg');
  assert.ok(l1aRow.measured.includes('0.0004'), 'Measured contains median_sep_deg');
  assert.equal(l1aRow.status, 'met');
});

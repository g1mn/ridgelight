// Written with SI (AI coding model) assistance and reviewed by the author.
// test/01-i18n.test.mjs
// Test 1: web/i18n/ 10 JSON files have identical flattened key sets and no empty values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function flattenKeys(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenKeys(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

test('1. web/i18n/ JSON 10 files have identical flattened key sets and no empty values', () => {
  const i18nDir = path.resolve('web', 'i18n');
  const expectedLangs = ['en', 'ko', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'vi'].sort();
  const files = fs.readdirSync(i18nDir).filter((f) => f.endsWith('.json')).sort();

  assert.equal(files.length, 10, `Expected 10 i18n files, got ${files.length}`);

  const loadedLangs = files.map((f) => path.basename(f, '.json')).sort();
  assert.deepEqual(loadedLangs, expectedLangs, 'Language file names must match expected 10 languages');

  let baselineKeys = null;
  let baselineFile = null;

  for (const file of files) {
    const filePath = path.join(i18nDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const flattened = flattenKeys(parsed);

    // Check no empty values
    for (const [k, v] of Object.entries(flattened)) {
      assert.notEqual(v, null, `Value at ${k} in ${file} is null`);
      assert.notEqual(v, undefined, `Value at ${k} in ${file} is undefined`);
      assert.notEqual(String(v).trim(), '', `Value at ${k} in ${file} is empty string`);
    }

    const currentKeys = Object.keys(flattened).sort();

    if (baselineKeys === null) {
      baselineKeys = currentKeys;
      baselineFile = file;
    } else {
      assert.deepEqual(
        currentKeys,
        baselineKeys,
        `Keys in ${file} do not match baseline keys in ${baselineFile}`
      );
    }
  }

  assert.ok(baselineKeys.length > 0, 'Must have at least one key');
});

// test/07-build-data.test.mjs
// Tests 9, 10, 11: build-data generation reproducibility, no synthetic fixture in data.js, size <= 5 MB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('9. tools/build-data.mjs outputs identically to a temp directory matching web/gen/*.js', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-build-test-'));

  try {
    // Run build-data with output to tempDir
    execFileSync(process.execPath, [path.resolve('tools', 'build-data.mjs'), tempDir], {
      cwd: process.cwd(),
      encoding: 'utf-8'
    });

    const genDataCommitted = fs.readFileSync(path.resolve('web', 'gen', 'data.js'), 'utf-8');
    const genI18nCommitted = fs.readFileSync(path.resolve('web', 'gen', 'i18n.js'), 'utf-8');

    const genDataTemp = fs.readFileSync(path.join(tempDir, 'data.js'), 'utf-8');
    const genI18nTemp = fs.readFileSync(path.join(tempDir, 'i18n.js'), 'utf-8');

    assert.equal(
      genDataTemp,
      genDataCommitted,
      'web/gen/data.js must match freshly generated data from sources'
    );
    assert.equal(
      genI18nTemp,
      genI18nCommitted,
      'web/gen/i18n.js must match freshly generated i18n from web/i18n/'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('10. web/gen/data.js does NOT contain the synthetic_test_fixture string', () => {
  const dataPath = path.resolve('web', 'gen', 'data.js');
  const content = fs.readFileSync(dataPath, 'utf-8');
  assert.equal(
    content.includes('synthetic_test_fixture'),
    false,
    'web/gen/data.js must not contain synthetic_test_fixture'
  );
});

test('11. web/gen/data.js size is 5 MB or less', () => {
  const dataPath = path.resolve('web', 'gen', 'data.js');
  const stat = fs.statSync(dataPath);
  const maxBytes = 5 * 1024 * 1024;
  assert.ok(
    stat.size <= maxBytes,
    `web/gen/data.js size ${stat.size} exceeds maximum 5 MB (${maxBytes} bytes)`
  );
});

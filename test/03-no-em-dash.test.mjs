// test/03-no-em-dash.test.mjs
// Test 3: Zero U+2014 em dash characters in web/, test/, tools/, README.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

test('3. Zero U+2014 em dashes in web/, test/, tools/, and README.md', () => {
  const dirs = ['web', 'test', 'tools'].map((d) => path.resolve(d));
  let allFiles = [];
  for (const d of dirs) {
    allFiles = allFiles.concat(walkDir(d));
  }
  const readmePath = path.resolve('README.md');
  if (fs.existsSync(readmePath)) {
    allFiles.push(readmePath);
  }

  const emDash = '\u2014';
  const found = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes(emDash)) {
      found.push(path.relative(process.cwd(), file));
    }
  }

  assert.equal(
    found.length,
    0,
    `Found forbidden U+2014 em dash in files: ${found.join(', ')}`
  );
});

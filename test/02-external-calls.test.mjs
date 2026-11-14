// Written with SI (AI coding model) assistance and reviewed by the author.
// test/02-external-calls.test.mjs
// Test 2: In web/, 0 external calls via fetch, script src, link href, img src, @import, url()

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir) {
  let results = [];
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

test('2. web/ has 0 external calls to http(s) via fetch, script, link, img, @import, url()', () => {
  const webDir = path.resolve('web');
  const files = walkDir(webDir);

  const patterns = [
    { name: 'fetch', regex: /fetch\s*\(\s*['"]https?:/i },
    { name: 'script src', regex: /<script[^>]+src\s*=\s*['"]https?:/i },
    { name: 'link href', regex: /<link[^>]+href\s*=\s*['"]https?:/i },
    { name: 'img src', regex: /<img[^>]+src\s*=\s*['"]https?:/i },
    { name: '@import', regex: /@import\s+['"]https?:/i },
    { name: 'url()', regex: /url\s*\(\s*['"]?https?:/i }
  ];

  const violations = [];

  for (const file of files) {
    // Only inspect web text files: html, css, js, json
    if (!/\.(html|css|js|json)$/i.test(file)) continue;

    const content = fs.readFileSync(file, 'utf-8');

    for (const pat of patterns) {
      if (pat.regex.test(content)) {
        violations.push({ file: path.relative(process.cwd(), file), pattern: pat.name });
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Found external resource calls in web/: ${JSON.stringify(violations)}`
  );
});

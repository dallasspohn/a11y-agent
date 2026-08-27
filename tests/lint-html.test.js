import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintHtml } from '../src/lib/lint-html.js';

const bad = readFileSync(new URL('../samples/bad-page.html', import.meta.url), 'utf8');
const good = readFileSync(new URL('../samples/good-page.html', import.meta.url), 'utf8');

test('bad-page trips core shift-left rules', () => {
  const ids = new Set(lintHtml(bad).map((v) => v.id));
  for (const id of ['html-has-lang', 'image-alt', 'label', 'link-name', 'heading-order', 'click-handler', 'table-headers', 'media-controls']) {
    assert.ok(ids.has(id), `expected ${id}`);
  }
});

test('good-page has no static lint violations', () => {
  assert.deepEqual(lintHtml(good), []);
});

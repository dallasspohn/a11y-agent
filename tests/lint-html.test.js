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

// Ranges drive the editor squiggles. If an offset drifts, the extension
// underlines the wrong element, so pin the contract rather than the numbers.
test('every violation carries a source range', () => {
  for (const v of lintHtml(bad)) {
    const { range } = v.nodes[0];
    assert.ok(range, `${v.id} has no range`);
    assert.ok(Number.isInteger(range.start.line), `${v.id} start.line`);
    assert.ok(Number.isInteger(range.start.column), `${v.id} start.column`);
    assert.ok(range.end.offset >= range.start.offset, `${v.id} end before start`);
  }
});

test('range offsets slice the element out of the source', () => {
  for (const v of lintHtml(bad)) {
    const { start, end } = v.nodes[0].range;
    const sliced = bad.slice(start.offset, end.offset);
    assert.ok(sliced.startsWith('<'), `${v.id} does not slice to an element: ${sliced.slice(0, 40)}`);
  }
});

test('line and column are 0-based and land on the element', () => {
  const html = ['<html lang="en">', '<body>', '  <img src="logo.png">', '</body>', '</html>'].join('\n');
  const [{ nodes: [node] }] = lintHtml(html).filter((v) => v.id === 'image-alt');

  assert.equal(node.range.start.line, 2, '0-based line — third line of the doc');
  assert.equal(node.range.start.column, 2, '0-based column — after two spaces');
  assert.equal(html.split('\n')[node.range.start.line].trim(), '<img src="logo.png">');
});

test('CRLF documents do not shift line numbers', () => {
  const html = ['<html lang="en">', '<body>', '<img src="logo.png">', '</body>', '</html>'].join('\r\n');
  const [{ nodes: [node] }] = lintHtml(html).filter((v) => v.id === 'image-alt');
  assert.equal(node.range.start.line, 2);
});

// An editor lints on every save, including part-written and broken markup.
// Bad offsets crash the extension host, so these must degrade, not throw.
test('partial and malformed documents produce in-bounds ranges', () => {
  for (const html of ['', '<img src=x>', '<div><img src=x>', '<p>no closing tag']) {
    for (const v of lintHtml(html)) {
      const { start, end } = v.nodes[0].range ?? { start: { offset: 0 }, end: { offset: 0 } };
      assert.ok(start.offset >= 0 && start.offset <= html.length, `${v.id} start out of bounds`);
      assert.ok(end.offset >= 0 && end.offset <= html.length, `${v.id} end out of bounds`);
    }
  }
});

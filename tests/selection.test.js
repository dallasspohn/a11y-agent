import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelection, isApplyRequest } from '../src/lib/selection.js';

// Mirrors the real bad-page.html ordering (worst-first)
const violations = [
  { impact: 'critical', id: 'image-alt' },
  { impact: 'critical', id: 'select-name' },
  { impact: 'serious', id: 'color-contrast' },
  { impact: 'serious', id: 'html-has-lang' },
  { impact: 'serious', id: 'link-name' },
  { impact: 'moderate', id: 'heading-order' },
  { impact: 'moderate', id: 'landmark-one-main' },
  { impact: 'moderate', id: 'page-has-heading-one' },
  { impact: 'moderate', id: 'region' },
];

/** Selection expressed as 1-based issue numbers, for readable assertions */
const pick = (text) => parseSelection(text, violations).indices.map((i) => i + 1);

test('selects by severity', () => {
  assert.deepEqual(pick('fix all critical issues'), [1, 2]);
  assert.deepEqual(pick('fix critical and serious'), [1, 2, 3, 4, 5]);
});

test('selects by spoken number words and digits identically', () => {
  assert.deepEqual(pick('fix issue one and three'), [1, 3]);
  assert.deepEqual(pick('fix issue 1 and 3'), [1, 3]);
  assert.deepEqual(pick('fix number two'), [2]);
});

test('handles ranges and ordinals', () => {
  assert.deepEqual(pick('fix issues one through four'), [1, 2, 3, 4]);
  assert.deepEqual(pick('fix the first three'), [1, 2, 3]);
  assert.deepEqual(pick('fix the second one'), [2]);
});

test('selects everything', () => {
  assert.equal(pick('fix everything').length, violations.length);
  assert.equal(pick('fix all').length, violations.length);
});

test('"fix all critical" resolves by severity, not as "all"', () => {
  // Regression: ALL_WORDS matching must run after severity matching
  assert.deepEqual(pick('fix all critical'), [1, 2]);
});

test('rejects out-of-range and unparseable input', () => {
  const tooBig = parseSelection('fix issue twelve', violations);
  assert.deepEqual(tooBig.indices, []);
  assert.match(tooBig.error, /no issue number 12/);

  const none = parseSelection('fix all minor', violations);
  assert.deepEqual(none.indices, []);
  assert.match(none.error, /no minor issues/);

  assert.deepEqual(parseSelection('blah blah', violations).indices, []);
});

test('keeps valid numbers and warns about invalid ones', () => {
  const mixed = parseSelection('fix issue two and 90', violations);
  assert.deepEqual(mixed.indices, [1]);
  assert.match(mixed.error, /Skipping 90 — there are only 9 issues/);
});

test('deduplicates and sorts', () => {
  assert.deepEqual(pick('fix issue three and one and three'), [1, 3]);
});

test('handles empty violation list', () => {
  const result = parseSelection('fix all', []);
  assert.deepEqual(result.indices, []);
  assert.match(result.error, /no violations/i);
});

test('recognizes apply requests', () => {
  for (const phrase of ['apply', 'auto fix', 'autofix', 'go ahead', 'do it', 'patch it']) {
    assert.ok(isApplyRequest(phrase), `expected "${phrase}" to be an apply request`);
  }
  assert.ok(!isApplyRequest('show me the fixes'));
});

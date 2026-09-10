/**
 * Regression gate for the accuracy numbers we put in the submission.
 *
 * The benchmark itself lives in evaluation/ (PR #6). This wrapper does two
 * things the standalone runner does not:
 *   1. asserts hard thresholds, so a silent accuracy regression fails CI
 *   2. asserts the benchmark actually exercised both tools, so a dead scanner
 *      can't be mistaken for a clean page
 *
 * It costs ~50s (24 pages x lint + browser scan), so it is opt-in rather than
 * part of the default `npm test` loop:
 *
 *   A11Y_EVAL=1 npm test        # or: npm run eval:check
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = resolve(ROOT, 'evaluation/run-eval.js');

// Thresholds. Current measured values are 100 / 0 — these leave headroom for
// a genuinely harder page being added without a false alarm.
const MIN_TPR = 95;
const MAX_FPR = 5;

const available = existsSync(RUNNER);
const enabled = process.env.A11Y_EVAL === '1';
const skip = !available
  ? 'evaluation/ not present (merge PR #6)'
  : !enabled
    ? 'slow — set A11Y_EVAL=1 to run'
    : false;

let report;

before(async () => {
  if (skip) return;
  // --json exits 0 unconditionally, so parse failure is the real signal here
  const { stdout } = await execFileAsync('node', [RUNNER, '--json'], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60_000,
  });
  report = JSON.parse(stdout);
});

test('benchmark meets the true-positive rate we claim', { skip }, () => {
  const tpr = Number(report.summary.avgTPR);
  assert.ok(
    tpr >= MIN_TPR,
    `true positive rate ${tpr}% fell below ${MIN_TPR}%`
  );
});

test('benchmark stays free of false positives on clean pages', { skip }, () => {
  const fpr = Number(report.summary.fpRate);
  assert.ok(
    fpr <= MAX_FPR,
    `false positive rate ${fpr}% exceeded ${MAX_FPR}%`
  );
});

test('every bad page detected all of its expected rules', { skip }, () => {
  const pages = Object.values(report.results)
    .flatMap((g) => g.results)
    .filter((r) => r.type === 'true-positive-check');

  const incomplete = pages.filter((r) => r.missed.length);
  assert.deepEqual(
    incomplete.map((r) => `${r.file}: missed ${r.missed.join(', ')}`),
    []
  );
});

/**
 * The runner swallows a crashed scan into `{count: 0, rules: []}`, which looks
 * identical to a clean page — so a dead scanner scores 100%/0% and exits 0.
 * Verified by replacing src/scan.js with `process.exit(3)`: the benchmark still
 * passed. This asserts the browser half actually produced findings.
 */
test('the browser scan actually ran (not silently dead)', { skip }, () => {
  const badPages = Object.values(report.results)
    .flatMap((g) => g.results)
    .filter((r) => r.type === 'true-positive-check');

  const scanFoundSomething = badPages.some((r) => r.scan.count > 0);
  assert.ok(
    scanFoundSomething,
    'no bad page produced a single scan violation — src/scan.js is probably ' +
      'broken, or Playwright browsers are not installed'
  );
});

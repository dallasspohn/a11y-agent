#!/usr/bin/env node
/**
 * A11Y Agent — Benchmark Evaluation Runner
 *
 * Measures per-rule detection accuracy against pages with known violations.
 *
 * Usage:
 *   node evaluation/run-eval.js            # run all test cases
 *   node evaluation/run-eval.js --json     # output raw JSON (for CI / analysis)
 *
 * Metrics reported:
 *   - True Positive Rate (recall):  % of expected rules that were detected
 *   - False Positive Rate:          % of clean pages that incorrectly showed violations
 *   - Per-rule detection table:     which rules the linter catches vs misses
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, '..');
const manifest = JSON.parse(readFileSync(resolve(__dir, 'manifest.json'), 'utf8'));
const jsonMode = process.argv.includes('--json');

// ── helpers ──────────────────────────────────────────────────────────────────

function runLint(filePath) {
  try {
    const out = execSync(`node src/lint.js --file "${filePath}"`, {
      cwd: ROOT, encoding: 'utf8', timeout: 15_000,
    });
    return parseOutput(out);
  } catch (e) {
    return parseOutput(e.stdout || '');
  }
}

function runScan(filePath) {
  try {
    const out = execSync(`node src/scan.js --file "${filePath}"`, {
      cwd: ROOT, encoding: 'utf8', timeout: 30_000,
    });
    return parseOutput(out);
  } catch (e) {
    return parseOutput(e.stdout || '');
  }
}

function parseOutput(out) {
  const countMatch = out.match(/(\d+)\s+violations?\s+found/);
  const rules = [];
  for (const m of out.matchAll(/\[(CRITICAL|SERIOUS|MODERATE|MINOR)\]\s+(\S+)/g)) {
    if (!rules.includes(m[2])) rules.push(m[2]);
  }
  return { count: countMatch ? parseInt(countMatch[1]) : 0, rules };
}

function checkPage(page, groupLabel, groupMeta) {
  const abs = resolve(__dir, page.file);
  const lint = runLint(abs);
  const scan = runScan(abs);

  // Merge rules found by either tool
  const allRules = [...new Set([...lint.rules, ...scan.rules])];

  if (groupLabel === 'good') {
    // False-positive test — lint must be 0; scan allowed up to threshold (default 0)
    const scanThreshold = groupMeta.scan_violation_threshold ?? 0;
    return {
      file: page.file,
      type: 'false-positive-check',
      pass: lint.count === 0 && scan.count <= scanThreshold,
      scan_threshold: scanThreshold,
      lint: { count: lint.count, rules: lint.rules },
      scan: { count: scan.count, rules: scan.rules },
    };
  }

  // True-positive test — check each expected rule is detected by lint OR scan
  const expected = page.expected_rules || [];
  const detected = expected.filter(r => allRules.includes(r));
  const missed   = expected.filter(r => !allRules.includes(r));
  const extra    = allRules.filter(r => !expected.includes(r));
  const tpr = expected.length > 0 ? detected.length / expected.length : 1;

  return {
    file: page.file,
    category: page.category || 'external',
    type: 'true-positive-check',
    pass: missed.length === 0,
    tpr,
    expected,
    detected,
    missed,
    extra,
    lint: { count: lint.count, rules: lint.rules },
    scan: { count: scan.count, rules: scan.rules },
  };
}

// ── run ───────────────────────────────────────────────────────────────────────

const allResults = {};
const ruleAccuracy = {}; // rule → { expected, detected }

for (const [groupKey, group] of Object.entries(manifest.test_cases)) {
  const groupResults = [];
  for (const page of group.pages) {
    const r = checkPage(page, group.label, group);
    groupResults.push(r);

    // Accumulate per-rule stats (only for bad pages with expected_rules)
    if (r.type === 'true-positive-check') {
      for (const rule of r.expected) {
        if (!ruleAccuracy[rule]) ruleAccuracy[rule] = { expected: 0, detected: 0 };
        ruleAccuracy[rule].expected++;
        if (r.detected.includes(rule)) ruleAccuracy[rule].detected++;
      }
    }
  }
  allResults[groupKey] = { meta: group, results: groupResults };
}

// ── aggregate ─────────────────────────────────────────────────────────────────

const tpTests    = Object.values(allResults).flatMap(g => g.results).filter(r => r.type === 'true-positive-check');
const fpTests    = Object.values(allResults).flatMap(g => g.results).filter(r => r.type === 'false-positive-check');
const avgTPR     = tpTests.length ? (tpTests.reduce((s, r) => s + r.tpr, 0) / tpTests.length * 100).toFixed(1) : 'N/A';
const fpCount    = fpTests.filter(r => !r.pass).length;
const fpRate     = fpTests.length ? ((fpCount / fpTests.length) * 100).toFixed(1) : 'N/A';

// ── output ────────────────────────────────────────────────────────────────────

if (jsonMode) {
  console.log(JSON.stringify({ results: allResults, ruleAccuracy, summary: { avgTPR, fpRate } }, null, 2));
  process.exit(0);
}

const c = {
  pass: '\x1b[32m',
  fail: '\x1b[31m',
  warn: '\x1b[33m',
  dim:  '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

console.log(`\n${c.bold}  ╔══════════════════════════════════════════════════╗`);
console.log(`  ║   A11Y AGENT — BENCHMARK EVALUATION v2          ║`);
console.log(`  ╚══════════════════════════════════════════════════╝${c.reset}\n`);

for (const [groupKey, group] of Object.entries(allResults)) {
  console.log(`${c.bold}  ── ${group.meta.description} ──${c.reset}\n`);

  for (const r of group.results) {
    const icon = r.pass ? `${c.pass}✅ PASS${c.reset}` : `${c.fail}❌ FAIL${c.reset}`;
    const short = r.file.replace('pages/', '');

    if (r.type === 'false-positive-check') {
      const lintOk = r.lint.count === 0 ? `${c.pass}lint 0${c.reset}` : `${c.fail}lint ${r.lint.count}${c.reset}`;
      const scanAllowed = r.scan_threshold > 0 ? `≤${r.scan_threshold}` : '0';
      const scanOk = r.scan.count <= r.scan_threshold ? `${c.pass}scan ${r.scan.count}${c.reset}` : `${c.fail}scan ${r.scan.count}${c.reset}`;
      const thresholdNote = r.scan_threshold > 0 ? `${c.dim} (scan threshold: ${scanAllowed})${c.reset}` : '';
      console.log(`  ${icon}  ${short}  ${c.dim}[${c.reset}${lintOk}${c.dim} | ${c.reset}${scanOk}${c.dim}]${c.reset}${thresholdNote}`);
      if (!r.pass) {
        if (r.lint.rules.length) console.log(`  ${c.fail}       lint false positives: ${r.lint.rules.join(', ')}${c.reset}`);
        if (r.scan.rules.length) console.log(`  ${c.fail}       scan false positives: ${r.scan.rules.join(', ')}${c.reset}`);
      }
    } else {
      const tprStr = `TPR ${(r.tpr * 100).toFixed(0)}%`;
      const tprColor = r.tpr === 1 ? c.pass : r.tpr >= 0.5 ? c.warn : c.fail;
      console.log(`  ${icon}  ${short}  ${tprColor}[${tprStr}]${c.reset}  ${c.dim}lint:${r.lint.count} scan:${r.scan.count}${c.reset}`);
      if (r.detected.length) console.log(`  ${c.dim}       ✓ detected: ${r.detected.join(', ')}${c.reset}`);
      if (r.missed.length)   console.log(`  ${c.fail}       ✗ missed:   ${r.missed.join(', ')}${c.reset}`);
      if (r.extra.length)    console.log(`  ${c.dim}       + bonus:    ${r.extra.join(', ')}${c.reset}`);
    }
    console.log('');
  }
}

// Per-rule table
console.log(`${c.bold}  ── Per-rule Detection Rate ──${c.reset}\n`);
const sorted = Object.entries(ruleAccuracy).sort((a, b) => b[1].detected/b[1].expected - a[1].detected/a[1].expected);
for (const [rule, { expected, detected }] of sorted) {
  const pct = Math.round(detected / expected * 100);
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  const col = pct === 100 ? c.pass : pct >= 50 ? c.warn : c.fail;
  console.log(`  ${col}${bar}${c.reset}  ${pct.toString().padStart(3)}%  ${rule}`);
}

// Summary
console.log(`\n${c.bold}  ════════════════════════════════════════════════════`);
console.log(`  SUMMARY`);
console.log(`  ════════════════════════════════════════════════════${c.reset}`);
console.log(`  True Positive Rate  (rule recall):  ${c.bold}${avgTPR}%${c.reset}  — did we catch the rules we should?`);
console.log(`  False Positive Rate (clean pages):  ${c.bold}${fpRate}%${c.reset}  — did we flag anything we shouldn't?`);
console.log(`  Bad pages with partial detection:   ${tpTests.filter(r => r.tpr < 1).length} of ${tpTests.length}`);
console.log(`  Clean pages with false positives:   ${fpCount} of ${fpTests.length}`);

const anyFail = tpTests.some(r => !r.pass) || fpTests.some(r => !r.pass);
console.log('');
process.exit(anyFail ? 1 : 0);

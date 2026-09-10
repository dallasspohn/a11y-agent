import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFixPlan } from '../src/lib/apply-fixes.js';

const SOURCE = `<html>
<body>
  <img src="logo.png">
  <img src="banner.jpg" width="800">
</body>
</html>`;

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'a11y-apply-'));
  const file = join(dir, 'page.html');
  await writeFile(file, SOURCE, 'utf-8');
  return file;
}

const entry = (edits, overrides = {}) => ({
  violation: { id: 'image-alt', impact: 'critical' },
  edits,
  error: null,
  ...overrides,
});

test('applies validated edits and writes a backup', async () => {
  const file = await fixture();
  const plan = [entry([
    { before: '<img src="logo.png">', after: '<img src="logo.png" alt="Logo">', applicable: true },
  ])];

  const result = await applyFixPlan(file, plan);

  assert.equal(result.applied.length, 1);
  assert.ok(result.changed);
  assert.ok(result.backupPath);

  assert.match(await readFile(file, 'utf-8'), /alt="Logo"/);
  assert.equal(await readFile(result.backupPath, 'utf-8'), SOURCE);
});

test('skips edits whose before text is absent', async () => {
  const file = await fixture();
  const plan = [entry([
    { before: '<img src="nope.png">', after: '<img src="nope.png" alt="x">', applicable: false, reason: 'not found' },
  ])];

  const result = await applyFixPlan(file, plan);

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.changed, false);
  assert.equal(await readFile(file, 'utf-8'), SOURCE);
});

test('dryRun reports changes without writing', async () => {
  const file = await fixture();
  const plan = [entry([
    { before: '<img src="logo.png">', after: '<img src="logo.png" alt="Logo">', applicable: true },
  ])];

  const result = await applyFixPlan(file, plan, { dryRun: true });

  assert.equal(result.applied.length, 1);
  assert.ok(result.changed);
  assert.equal(await readFile(file, 'utf-8'), SOURCE, 'file must be untouched');
});

test('applies multiple edits to distinct elements', async () => {
  const file = await fixture();
  const plan = [entry([
    { before: '<img src="logo.png">', after: '<img src="logo.png" alt="Logo">', applicable: true },
    { before: '<img src="banner.jpg" width="800">', after: '<img src="banner.jpg" width="800" alt="Banner">', applicable: true },
  ])];

  const result = await applyFixPlan(file, plan);
  const output = await readFile(file, 'utf-8');

  assert.equal(result.applied.length, 2);
  assert.match(output, /alt="Logo"/);
  assert.match(output, /alt="Banner"/);
});

test('skips an entry that failed generation', async () => {
  const file = await fixture();
  const plan = [entry([], { error: 'model did not return valid JSON' })];

  const result = await applyFixPlan(file, plan);

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0].reason, 'model did not return valid JSON');
  assert.equal(result.changed, false);
});

test('detects text consumed by an earlier edit', async () => {
  const file = await fixture();
  // Both edits claim the same source text; only the first can apply
  const plan = [entry([
    { before: '<img src="logo.png">', after: '<img src="logo.png" alt="A">', applicable: true },
    { before: '<img src="logo.png">', after: '<img src="logo.png" alt="B">', applicable: true },
  ])];

  const result = await applyFixPlan(file, plan);

  assert.equal(result.applied.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /changed by an earlier fix/);
});

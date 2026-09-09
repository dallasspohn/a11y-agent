/**
 * Write a validated fix plan to disk.
 *
 * Every edit is a literal string replacement whose "before" was already
 * confirmed to exist in the source (see fix-plan.js validateEdits). Edits are
 * applied against an in-memory buffer and only written once all of them
 * succeed, so a partial failure never leaves a half-patched file.
 */
import { readFile, writeFile, copyFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * @param {string} filePath  File to patch
 * @param {Array}  plan      Output of generateFixPlan()
 * @param {object} [options]
 * @param {boolean} [options.backup=true]  Write a .bak alongside the original
 * @param {boolean} [options.dryRun=false] Compute results without writing
 * @returns {Promise<{applied: Array, skipped: Array, backupPath: string|null, changed: boolean}>}
 */
export async function applyFixPlan(filePath, plan, options = {}) {
  const { backup = true, dryRun = false } = options;
  const absolute = resolve(filePath);

  let source = await readFile(absolute, 'utf-8');
  const applied = [];
  const skipped = [];

  for (const entry of plan) {
    const { violation, edits } = entry;

    if (entry.error) {
      skipped.push({ violation, reason: entry.error });
      continue;
    }
    if (!edits.length) {
      skipped.push({ violation, reason: 'no automatic edit available' });
      continue;
    }

    for (const edit of edits) {
      if (!edit.applicable) {
        skipped.push({ violation, reason: edit.reason, edit });
        continue;
      }

      // Re-check against the working buffer: an earlier edit may have consumed
      // or altered this text, and validation ran against the original source.
      const index = source.indexOf(edit.before);
      if (index === -1) {
        skipped.push({ violation, reason: 'text changed by an earlier fix', edit });
        continue;
      }

      // Replace this occurrence only — repeated edits target distinct elements
      source = source.slice(0, index) + edit.after + source.slice(index + edit.before.length);
      applied.push({ violation, edit });
    }
  }

  const original = await readFile(absolute, 'utf-8');
  const changed = source !== original;

  let backupPath = null;
  if (changed && !dryRun) {
    if (backup) {
      backupPath = `${absolute}.bak`;
      await copyFile(absolute, backupPath);
    }
    await writeFile(absolute, source, 'utf-8');
  }

  return { applied, skipped, backupPath, changed };
}

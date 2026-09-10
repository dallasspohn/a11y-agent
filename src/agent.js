#!/usr/bin/env node
/**
 * a11y-agent — hands-free accessibility triage.
 *
 * The whole loop is voice-first: the agent announces itself, takes a spoken
 * scan target, reads back a numbered list of violations, then takes a spoken
 * selection ("fix all critical", "fix issue one and three") and generates —
 * optionally applies — fixes for just those issues.
 *
 * --text runs the identical flow over the keyboard, which is what makes this
 * demoable without a microphone and testable in CI.
 */
import 'dotenv/config';
import { program } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { existsSync } from 'fs';

import { scanTarget } from './lib/scanner.js';
import { speak as ttsSpeak, DEFAULT_ENGINE, DEFAULT_VOICE, DEFAULT_RATE } from './lib/tts.js';
import { listenForCommand, checkVoskAvailability, parseVoiceCommand } from './voice-commands.js';
import { parseSelection, isApplyRequest } from './lib/selection.js';
import { generateFixPlan, applicableEditCount } from './lib/fix-plan.js';
import { applyFixPlan } from './lib/apply-fixes.js';
import { orderViolations, printViolationList, summarySpeech, listSpeech } from './lib/violation-list.js';

program
  .name('a11y-agent')
  .description('Voice-driven accessibility triage')
  .option('--text', 'Type commands instead of speaking them', false)
  .option('--no-speech', 'Disable text-to-speech output')
  .option('--voice-engine <engine>', 'TTS engine: edge|piper|espeak', DEFAULT_ENGINE)
  .option('--voice-name <name>', 'Voice name for edge-tts', DEFAULT_VOICE)
  .option('--rate <speed>', 'Speech rate in words per minute', DEFAULT_RATE)
  .option('--model-path <path>', 'Path to Vosk model directory')
  .option('--timeout <ms>', 'Page navigation timeout in milliseconds', '60000')
  .option('--auto-apply', 'Write fixes to disk without asking', false)
  .parse();

const opts = program.opts();

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function voiceOptions() {
  return {
    enabled: opts.speech !== false,
    engine: opts.voiceEngine,
    voice: opts.voiceName,
    rate: opts.rate,
  };
}

/** Print and speak in one call — everything the user sees, they also hear */
async function say(text, speechOverride) {
  if (text) console.log(text);
  await ttsSpeak(speechOverride ?? text, voiceOptions());
}

// Line-queue reader rather than rl.question(): piped stdin delivers every line
// up front and then closes, which makes sequential question() calls throw
// "readline was closed" mid-flow.
let rl = null;
const pendingLines = [];
const waitingReaders = [];
let inputClosed = false;

function initReader() {
  if (rl) return;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.on('line', (line) => {
    const reader = waitingReaders.shift();
    if (reader) reader(line.trim());
    else pendingLines.push(line.trim());
  });

  rl.on('close', () => {
    inputClosed = true;
    while (waitingReaders.length) waitingReaders.shift()(null);
  });
}

/** Resolves to the next line, or null once input is exhausted */
function prompt(question) {
  initReader();
  process.stdout.write(chalk.cyan(question));

  if (pendingLines.length) return Promise.resolve(pendingLines.shift());
  if (inputClosed) return Promise.resolve(null);
  return new Promise((resolve) => waitingReaders.push(resolve));
}

/**
 * Get the next command from the user — spoken or typed.
 * Both paths return a plain string (or null at end of input) so the rest of
 * the flow is identical.
 */
async function nextCommand(promptText, modelPath) {
  if (opts.text) return prompt(promptText);

  const result = await listenForCommand(modelPath, { announce: false, voice: voiceOptions() });
  return result.text || '';
}

const EXIT_WORDS = /\b(done|exit|quit|stop|goodbye|bye|never mind|nevermind)\b/;

// ---------------------------------------------------------------------------
// Flow steps
// ---------------------------------------------------------------------------

/**
 * Resolve a spoken scan command into a target, defaulting to the sample page.
 *
 * Returns `{ error }` for a file that isn't there. Letting a misheard target
 * through means Playwright dies on ERR_FILE_NOT_FOUND and takes the session
 * with it — the worst possible outcome for a hands-free user, who then has to
 * find the terminal and start over.
 */
function resolveTarget(command) {
  const parsed = parseVoiceCommand(command);
  if (parsed.url) return { url: parsed.url };
  if (parsed.file) {
    if (!existsSync(parsed.file)) {
      return { error: `I could not find a file called ${parsed.file}.` };
    }
    return { file: parsed.file };
  }
  return null;
}

async function runScan(target) {
  const label = target.url || target.file;
  await say(chalk.dim(`\n  Scanning ${label}...`), `Scanning ${label}`);

  const { results, html } = await scanTarget({
    ...target,
    timeout: Number(opts.timeout),
    onProgress: (msg) => console.log(chalk.dim(`  (${msg})`)),
  });

  // This ordering is the contract for "issue N" — keep list and selection aligned
  const violations = orderViolations(results.violations);
  return { violations, html };
}

/** Ask what to fix, resolve the selection, and generate structured fixes */
async function fixLoop({ violations, html, target, modelPath }) {
  while (violations.length) {
    const command = await nextCommand('  What should I fix? > ', modelPath);

    if (command === null) return 'done'; // input exhausted
    if (!command) {
      await say(chalk.yellow('  I did not catch that.'), 'I did not catch that.');
      continue;
    }
    if (EXIT_WORDS.test(command.toLowerCase())) return 'done';

    const selection = parseSelection(command, violations);

    if (!selection.indices.length) {
      await say(chalk.yellow(`  ${selection.error}`), selection.error);
      continue;
    }
    if (selection.error) {
      await say(chalk.yellow(`  ${selection.error}`), selection.error);
    }

    const selected = selection.indices.map((i) => violations[i]);
    await say(
      chalk.bold(`\n  Generating fixes for ${selection.label} (${selected.length})...\n`),
      `Generating fixes for ${selection.label}.`
    );

    const plan = await generateFixPlan({
      violations: selected,
      source: html,
      onProgress: (n, total, v) => console.log(chalk.dim(`  [${n}/${total}] ${v.id}...`)),
    });

    printFixPlan(plan, violations);

    const count = applicableEditCount(plan);
    const spoken = plan
      .map((entry, i) => `Issue ${violations.indexOf(entry.violation) + 1}. ${entry.why || entry.violation.help}.`)
      .join(' ');

    await say('', spoken);

    // Only offer to write when we actually have verified edits
    if (!count) {
      await say(
        chalk.yellow('  No automatically applicable edits in this batch.'),
        'I could not produce an automatic edit for those. Try another issue.'
      );
      continue;
    }

    const result = await maybeApply({
      plan,
      count,
      target,
      modelPath,
      beforeCount: violations.length,
    });

    // Re-seed the loop from the verified re-scan so "issue 3" keeps meaning
    // whatever the user was last read, not a stale pre-fix numbering.
    if (result.applied) {
      violations = result.violations;
      html = result.html;

      if (!violations.length) {
        await say(chalk.bold.green('\n  All violations resolved.\n'), 'All violations resolved. Nice work.');
        return 'clean';
      }

      printViolationList(violations);
      await say('', listSpeech(violations));
    }
  }

  return 'done';
}

function printFixPlan(plan, allViolations) {
  for (const entry of plan) {
    const number = allViolations.indexOf(entry.violation) + 1;
    console.log(chalk.bold.cyan(`\n  [${number}] ${entry.violation.id}`));

    if (entry.error) {
      console.log(chalk.red(`      could not generate a fix: ${entry.error}`));
      continue;
    }

    if (entry.why) console.log(chalk.white(`      why:  ${entry.why}`));
    if (entry.wcag) console.log(chalk.dim(`      wcag: ${entry.wcag}`));

    if (!entry.edits.length) {
      console.log(chalk.yellow('      no automatic edit available'));
      continue;
    }

    for (const edit of entry.edits) {
      if (edit.applicable) {
        console.log(chalk.red(`      - ${edit.before.trim()}`));
        console.log(chalk.green(`      + ${edit.after.trim()}`));
      } else {
        console.log(chalk.yellow(`      ! manual: ${edit.reason}`));
        console.log(chalk.dim(`        suggested: ${edit.after.trim()}`));
      }
    }
  }
  console.log('');
}

/** Confirm and write the fixes, then re-scan to prove the change landed */
async function maybeApply({ plan, count, target, modelPath, beforeCount }) {
  const unchanged = { applied: false };

  if (!target.file) {
    await say(
      chalk.dim('  (auto-apply only works on local files, not URLs)'),
      'I can only apply fixes to local files, not live URLs.'
    );
    return unchanged;
  }

  if (!opts.autoApply) {
    await say(
      chalk.bold(`\n  ${count} edit${count === 1 ? '' : 's'} ready to apply.`),
      `I have ${count} ${count === 1 ? 'edit' : 'edits'} ready. Should I apply them?`
    );

    const answer = await nextCommand('  Apply them? > ', modelPath);
    if (!answer || (!isApplyRequest(answer) && !/\b(yes|yeah|yep|sure|ok|okay|please)\b/i.test(answer))) {
      await say(chalk.dim('  Leaving the file unchanged.'), 'Okay, leaving the file unchanged.');
      return unchanged;
    }
  }

  const { applied, skipped, backupPath, changed } = await applyFixPlan(target.file, plan);

  if (!changed) {
    await say(chalk.yellow('  Nothing was changed.'), 'Nothing was changed.');
    return unchanged;
  }

  console.log(chalk.green(`\n  Applied ${applied.length} edit${applied.length === 1 ? '' : 's'} to ${target.file}`));
  if (backupPath) console.log(chalk.dim(`  Backup: ${backupPath}`));
  for (const s of skipped) {
    console.log(chalk.yellow(`  Skipped ${s.violation.id}: ${s.reason}`));
  }

  // Re-scan so the result is verified, not asserted
  await say(chalk.dim('\n  Re-scanning to verify...'), 'Re-scanning to verify.');
  const { violations: after, html: afterHtml } = await runScan(target);

  const stillPresent = after.filter((v) => plan.some((p) => p.violation.id === v.id)).length;
  const resolvedSelected = plan.length - stillPresent;
  const totalResolved = beforeCount - after.length;

  const parts = [
    `${resolvedSelected} of ${plan.length} selected ${plan.length === 1 ? 'issue' : 'issues'} resolved.`,
  ];

  // One fix often clears another (alt text on a logo also names its link) —
  // call that out rather than letting the number look like a miscount.
  const cascaded = totalResolved - resolvedSelected;
  if (cascaded > 0) {
    parts.push(`${cascaded} more ${cascaded === 1 ? 'issue' : 'issues'} resolved as a knock-on effect.`);
  }
  parts.push(`${after.length} ${after.length === 1 ? 'violation remains' : 'violations remain'}.`);

  const message = parts.join(' ');
  await say(chalk.bold.green(`\n  ${message}\n`), message);

  return { applied: true, violations: after, html: afterHtml };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let modelPath = null;

  if (!opts.text) {
    const vosk = await checkVoskAvailability();
    if (!vosk.available) {
      console.error(chalk.red(`\n  Voice input unavailable: ${vosk.error}`));
      console.error(chalk.yellow('  Run ./setup-voice.sh, or use --text to type commands.\n'));
      process.exit(1);
    }
    modelPath = opts.modelPath || vosk.modelPath;
  }

  console.log(chalk.bold.blue('\n  A11Y AGENT'));
  await say(chalk.dim('  Agent at the ready.\n'), 'Agent at the ready.');

  // Keep asking until we have a target that actually exists. A mishearing
  // should cost one retry, not the whole session.
  let target = null;
  while (!target) {
    const command = await nextCommand('  What should I scan? > ', modelPath);

    if (command === null || (command && EXIT_WORDS.test(command.toLowerCase()))) {
      await say(chalk.dim('  Goodbye.'), 'Goodbye.');
      return;
    }

    const resolved = command ? resolveTarget(command) : null;

    if (resolved?.error) {
      await say(
        chalk.yellow(`  ${resolved.error} Try "scan the bad page" or "scan the good page".`),
        `${resolved.error} Try, scan the bad page, or, scan the good page.`
      );
      continue;
    }
    if (!resolved) {
      await say(
        chalk.yellow('  I did not catch a scan target. Try "scan the bad page".'),
        'I did not catch a scan target. Try, scan the bad page.'
      );
      continue;
    }
    target = resolved;
  }

  const { violations, html } = await runScan(target);

  await say('', summarySpeech(violations));

  if (!violations.length) {
    console.log(chalk.green('\n  No accessibility violations found.\n'));
    return;
  }

  printViolationList(violations);
  await say('', listSpeech(violations));

  await fixLoop({ violations, html, target, modelPath });

  await say(chalk.dim('\n  Agent signing off.'), 'Agent signing off.');
}

main()
  .catch((err) => {
    console.error(chalk.red(`\n  Error: ${err.message}`));
    process.exitCode = 1;
  })
  .finally(() => rl?.close());

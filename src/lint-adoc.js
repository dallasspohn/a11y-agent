#!/usr/bin/env node
/**
 * Vale linter for AsciiDoc files
 * Uses vale CLI to check Red Hat Training content against style guides
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { program } from 'commander';
import { printResults, exitIfFailed } from './lib/report.js';
import { getFixSuggestions } from './lib/ai-fixes.js';
import { speak } from './lib/tts.js';

const execAsync = promisify(exec);

program
  .name('a11y-lint-adoc')
  .description('Lint AsciiDoc files with vale')
  .option('--file <path>', 'AsciiDoc file to lint')
  .option('--dir <path>', 'Directory of AsciiDoc files to lint')
  .option('--fix', 'Generate AI fix suggestions for vale violations', false)
  .option('--json', 'Output raw JSON results', false)
  .option('--voice', 'Enable text-to-speech output', false)
  .option('--voice-engine <engine>', 'TTS engine: edge|piper|espeak (default: edge)', 'edge')
  .option('--voice-name <name>', 'Voice name (edge-tts: en-US-GuyNeural, en-US-JennyNeural, etc.)', 'en-US-GuyNeural')
  .option('--rate <speed>', 'Speech rate (words per minute, default 175)', '175')
  .option('--fail-on <severity>', 'Exit 1 if violations at this severity or higher (serious|moderate|minor)')
  .option('--config <path>', 'Path to vale config file (default: ~/.vale.ini)')
  .parse();

const opts = program.opts();

if (!opts.file && !opts.dir) {
  console.error('Provide --file or --dir');
  process.exit(1);
}

/**
 * Speak text using configured TTS engine (if --voice enabled)
 */
async function speakText(text) {
  return speak(text, {
    enabled: opts.voice,
    engine: opts.voiceEngine,
    voice: opts.voiceName,
    rate: opts.rate
  });
}

/**
 * Run vale and parse JSON output
 */
async function lintWithVale(target) {
  const configFlag = opts.config ? `--config="${opts.config}"` : '';
  const valeCmd = `vale --output=JSON ${configFlag} "${target}"`;

  try {
    const { stdout } = await execAsync(valeCmd);
    return JSON.parse(stdout);
  } catch (error) {
    // Vale exits with code 1 when violations found, but still outputs JSON
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        throw new Error(`Vale failed: ${error.message}`);
      }
    }
    throw new Error(`Vale failed: ${error.message}`);
  }
}

/**
 * Convert vale results to a11y-agent format
 */
function convertValeResults(valeResults) {
  const violations = [];

  for (const [file, alerts] of Object.entries(valeResults)) {
    for (const alert of alerts) {
      // Map vale severity to impact levels
      const impactMap = {
        'error': 'serious',
        'warning': 'moderate',
        'suggestion': 'minor'
      };

      violations.push({
        id: alert.Check,
        impact: impactMap[alert.Severity] || 'minor',
        help: alert.Message,
        description: alert.Description || alert.Message,
        helpUrl: alert.Link || 'https://vale.sh',
        tags: ['vale', `vale-${alert.Severity}`],
        nodes: [{
          target: [file],
          html: alert.Match,
          failureSummary: `Line ${alert.Line}, Column ${alert.Span[0]}: ${alert.Message}`,
          line: alert.Line,
          column: alert.Span[0]
        }]
      });
    }
  }

  return {
    violations,
    passed: [],
    testEngine: {
      name: 'vale',
      version: '3.10.0'
    },
    url: opts.file || opts.dir
  };
}

async function main() {
  const target = opts.file || opts.dir;
  console.log(`  Linting ${target} with vale...\n`);
  await speakText(`Linting ${target} with vale`);

  const valeResults = await lintWithVale(target);
  const results = convertValeResults(valeResults);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  await printResults(results);

  // Speak results summary
  if (results.violations.length === 0) {
    await speakText('Linting complete. No style guide violations detected.');
  } else {
    // Count by severity
    const summary = { serious: 0, moderate: 0, minor: 0 };
    for (const v of results.violations) {
      if (summary[v.impact] !== undefined) summary[v.impact]++;
    }

    const summaryText = `Linting complete. ${results.violations.length} violations found. ${summary.serious} serious, ${summary.moderate} moderate, ${summary.minor} minor.`;
    await speakText(summaryText);

    // Speak individual violations if there are only a few
    if (opts.voice && results.violations.length <= 5) {
      for (const v of results.violations.slice(0, 5)) {
        const impactLabel = v.impact === 'serious' ? 'Serious issue' :
                            v.impact === 'moderate' ? 'Moderate issue' : 'Minor issue';
        await speakText(`${impactLabel}. ${v.help}`);
      }
    }
  }

  // Generate AI fix suggestions if requested
  if (opts.fix && results.violations.length > 0) {
    console.log('\n  Generating AI fix suggestions for vale violations...\n');
    await speakText('Generating AI fix suggestions');

    // Read the file content
    const { readFile } = await import('fs/promises');
    const content = opts.file ? await readFile(opts.file, 'utf-8') : '';

    const fixes = await getFixSuggestions({
      violations: results.violations,
      source: content,
      sourceLabel: 'AsciiDoc Source'
    });
    console.log(fixes);
    await speakText('Fix suggestions generated. See output for details.');
  }

  // Exit with appropriate code if --fail-on specified
  exitIfFailed(results.violations, opts.failOn, { json: opts.json });
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

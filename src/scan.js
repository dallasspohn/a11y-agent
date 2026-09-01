import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { exec } from 'child_process';
import readline from 'readline';
import { listenForCommand, checkVoskAvailability, parseVoiceCommand } from './voice-commands.js';
import { ConversationState, handleUserInput, generateResponse, States } from './conversation.js';

program
  .option('--url <url>', 'URL to scan')
  .option('--file <path>', 'Local HTML file to scan')
  .option('--fix', 'Generate AI fix suggestions via Claude', false)
  .option('--json', 'Output raw JSON results', false)
  .option('--voice', 'Enable text-to-speech output', false)
  .option('--rate <speed>', 'Speech rate (words per minute, default 175)', '175')
  .option('--listen', 'Enable voice command mode (speech-to-text)', false)
  .option('--model-path <path>', 'Path to Vosk model directory')
  .option('--interactive', 'Enable interactive conversation mode', false)
  .option('--fail-on <impact>', 'Exit 1 if violations at this impact or higher (critical|serious|moderate|minor)')
  .parse();

let opts = program.opts();

// Validation moved to main() to support voice command merging

const impactColors = {
  critical: chalk.bgRed.white.bold,
  serious: chalk.red.bold,
  moderate: chalk.yellow,
  minor: chalk.dim,
};

const impactEmoji = {
  critical: '!!',
  serious: '! ',
  moderate: '~ ',
  minor: '- ',
};

/**
 * Strip ANSI color codes from text
 */
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Speak text using espeak-ng TTS (if --voice enabled)
 */
async function speakText(text) {
  if (!opts.voice) return;

  const cleanText = stripAnsi(text);
  const escapedText = cleanText.replace(/"/g, '\\"').replace(/'/g, "\\'");

  return new Promise((resolve) => {
    exec(`espeak-ng -s ${opts.rate} "${escapedText}"`, (error) => {
      if (error) {
        console.error(chalk.dim(`[TTS Error: ${error.message}]`));
      }
      resolve();
    });
  });
}

async function scanPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (opts.file) {
    const filePath = resolve(opts.file);
    await page.goto(`file://${filePath}`);
  } else {
    await page.goto(opts.url);
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const html = opts.file
    ? await readFile(resolve(opts.file), 'utf-8')
    : await page.content();

  await browser.close();
  return { results, html };
}

async function printResults(results) {
  const { violations, passes } = results;

  console.log(chalk.bold('\n  A11Y AGENT SCAN RESULTS\n'));
  console.log(`  ${chalk.green(passes.length)} rules passed`);
  console.log(`  ${chalk.red(violations.length)} violations found\n`);

  if (violations.length === 0) {
    console.log(chalk.green.bold('  No accessibility violations detected.\n'));
    await speakText('Scanning complete. No accessibility violations detected.');
    return;
  }

  const sorted = [...violations].sort((a, b) => {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return (order[a.impact] ?? 4) - (order[b.impact] ?? 4);
  });

  for (const v of sorted) {
    const colorFn = impactColors[v.impact] || chalk.white;
    const emoji = impactEmoji[v.impact] || '  ';

    console.log(colorFn(`  ${emoji} [${v.impact.toUpperCase()}] ${v.id}`));
    console.log(`     ${v.help}`);
    console.log(chalk.dim(`     ${v.helpUrl}`));

    for (const node of v.nodes) {
      console.log(chalk.cyan(`     target: ${node.target.join(', ')}`));
      if (node.html) {
        const snippet = node.html.length > 120
          ? node.html.slice(0, 120) + '...'
          : node.html;
        console.log(chalk.dim(`     html:   ${snippet}`));
      }
    }
    console.log();

    // Speak each violation if voice enabled
    if (opts.voice) {
      const impactLabel = v.impact === 'critical' ? 'Critical issue' :
                          v.impact === 'serious' ? 'Serious issue' :
                          v.impact === 'moderate' ? 'Moderate issue' :
                          'Minor issue';
      await speakText(`${impactLabel}. ${v.help}`);
    }
  }

  const summary = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) summary[v.impact]++;
  console.log(chalk.bold('  Summary:'));
  console.log(`  ${chalk.bgRed.white.bold(` ${summary.critical} critical `)} ${chalk.red.bold(`${summary.serious} serious`)} ${chalk.yellow(`${summary.moderate} moderate`)} ${chalk.dim(`${summary.minor} minor`)}\n`);

  // Speak summary
  const summaryText = `Scanning complete. ${violations.length} violations found. ${summary.critical} critical, ${summary.serious} serious, ${summary.moderate} moderate, ${summary.minor} minor.`;
  await speakText(summaryText);
}

async function getFixSuggestions(violations, html) {
  const client = new Anthropic();

  const violationSummary = violations.map(v => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    wcag: v.tags.filter(t => t.startsWith('wcag')),
    nodes: v.nodes.map(n => ({
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are an accessibility expert. Given the following axe-core violations found in an HTML page, provide specific, actionable fix suggestions for each violation.

For each violation:
1. Explain WHY it matters (impact on users with disabilities)
2. Show the EXACT code fix (before → after)
3. Note the WCAG criterion it addresses

Be concise and practical — developers should be able to copy-paste your fixes.

## Violations Found

${JSON.stringify(violationSummary, null, 2)}

## Source HTML

\`\`\`html
${html}
\`\`\``,
    }],
  });

  return response.content[0].text;
}

/**
 * Text-based conversation mode (no voice)
 */
async function startTextConversation(violations, fixes) {
  const state = new ConversationState(violations, fixes);

  // Show initial summary
  const initialResponse = generateResponse(state);
  console.log(initialResponse.text);

  if (initialResponse.nextState) {
    state.state = initialResponse.nextState;
  }

  // Set up readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    if (state.state === States.DONE) {
      rl.close();
      return;
    }

    rl.question(chalk.cyan('\n> '), (input) => {
      if (!input.trim()) {
        askQuestion();
        return;
      }

      const response = handleUserInput(input, state);
      console.log(response.text);

      if (state.state === States.DONE) {
        rl.close();
      } else {
        askQuestion();
      }
    });
  };

  askQuestion();
}

async function main() {
  // Handle voice command mode
  if (opts.listen) {
    const voskCheck = await checkVoskAvailability();

    if (!voskCheck.available) {
      console.error(chalk.red('\n  Voice command mode not available:'));
      console.error(chalk.yellow(`  ${voskCheck.error}\n`));
      console.log(chalk.dim('  Installation instructions:'));
      console.log(chalk.dim('  1. Install Vosk: npm install vosk mic'));
      console.log(chalk.dim('  2. Download model: wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'));
      console.log(chalk.dim('  3. Extract to ./models/ directory\n'));
      process.exit(1);
    }

    const modelPath = opts.modelPath || voskCheck.modelPath;
    console.log(chalk.dim(`  Using Vosk model: ${modelPath}`));

    try {
      const voiceArgs = await listenForCommand(modelPath);

      // Merge voice command args with CLI args (voice takes precedence for conflicts)
      opts = { ...opts, ...voiceArgs };

      console.log(chalk.green('  Voice command received:'));
      console.log(chalk.dim(`  ${JSON.stringify(voiceArgs, null, 2)}\n`));
    } catch (err) {
      console.error(chalk.red(`  Voice command error: ${err.message}`));
      process.exit(1);
    }
  }

  // Validate that we have a target
  if (!opts.url && !opts.file) {
    console.error(chalk.red('Provide --url or --file (or use --listen for voice commands)'));
    process.exit(1);
  }

  console.log(chalk.dim(`\n  Scanning ${opts.url || opts.file}...`));
  await speakText(`Scanning ${opts.url || opts.file}`);

  const { results, html } = await scanPage();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  await printResults(results);

  // Check --fail-on threshold (for CI/CD)
  if (opts.failOn && results.violations.length > 0) {
    const impactLevels = ['minor', 'moderate', 'serious', 'critical'];
    const thresholdIndex = impactLevels.indexOf(opts.failOn);

    if (thresholdIndex === -1) {
      console.error(chalk.red(`Invalid --fail-on value: ${opts.failOn}`));
      console.error(chalk.yellow('Valid values: critical, serious, moderate, minor'));
      process.exit(1);
    }

    const failingViolations = results.violations.filter(v => {
      const violationIndex = impactLevels.indexOf(v.impact);
      return violationIndex >= thresholdIndex;
    });

    if (failingViolations.length > 0) {
      console.log(chalk.red(`\n  ✗ Found ${failingViolations.length} violation(s) at or above "${opts.failOn}" threshold\n`));
      process.exit(1);
    }
  }

  let fixes = null;

  // Generate fixes if requested OR if interactive mode is enabled
  if ((opts.fix || opts.interactive) && results.violations.length > 0) {
    console.log(chalk.bold.blue('\n  Generating AI fix suggestions...\n'));
    await speakText('Generating AI fix suggestions');
    fixes = await getFixSuggestions(results.violations, html);

    if (!opts.interactive) {
      // Non-interactive mode: just print fixes and exit
      console.log(fixes);
      console.log();
      await speakText('Fix suggestions generated. See output for details.');
    }
  }

  // Start interactive conversation mode
  if (opts.interactive) {
    if (results.violations.length === 0) {
      console.log(chalk.green('\n  No violations to explore. Exiting.\n'));
      return;
    }

    // Voice mode: use TTS/STT
    if (opts.voice && opts.listen) {
      const voskCheck = await checkVoskAvailability();
      const modelPath = opts.modelPath || voskCheck.modelPath;

      const state = new ConversationState(results.violations, fixes);

      // Generate and display initial summary
      const initialResponse = generateResponse(state);
      console.log(initialResponse.text);
      await speakText(initialResponse.speech);

      if (initialResponse.nextState) {
        state.state = initialResponse.nextState;
      }

      // Voice conversation loop
      while (state.state !== States.DONE) {
        console.log(chalk.dim('\n[Listening for command...]'));

        try {
          const voiceInput = await listenForCommand(modelPath);
          const text = voiceInput.text || voiceInput.url || voiceInput.file || '';

          if (!text) {
            console.log(chalk.yellow('No command detected, try again'));
            continue;
          }

          console.log(chalk.dim(`[You said: "${text}"]`));

          const response = handleUserInput(text, state);
          console.log(response.text);

          await speakText(response.speech);

          if (state.state === States.DONE) {
            break;
          }
        } catch (err) {
          console.error(chalk.red(`Error: ${err.message}`));
          break;
        }
      }
    }
    // Text mode: use readline
    else {
      await startTextConversation(results.violations, fixes);
    }
  }
}

main().catch(err => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});

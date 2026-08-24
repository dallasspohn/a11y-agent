import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';

program
  .option('--url <url>', 'URL to scan')
  .option('--file <path>', 'Local HTML file to scan')
  .option('--fix', 'Generate AI fix suggestions via Claude', false)
  .option('--json', 'Output raw JSON results', false)
  .parse();

const opts = program.opts();

if (!opts.url && !opts.file) {
  console.error(chalk.red('Provide --url or --file'));
  process.exit(1);
}

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

function printResults(results) {
  const { violations, passes } = results;

  console.log(chalk.bold('\n  A11Y AGENT SCAN RESULTS\n'));
  console.log(`  ${chalk.green(passes.length)} rules passed`);
  console.log(`  ${chalk.red(violations.length)} violations found\n`);

  if (violations.length === 0) {
    console.log(chalk.green.bold('  No accessibility violations detected.\n'));
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
  }

  const summary = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) summary[v.impact]++;
  console.log(chalk.bold('  Summary:'));
  console.log(`  ${chalk.bgRed.white.bold(` ${summary.critical} critical `)} ${chalk.red.bold(`${summary.serious} serious`)} ${chalk.yellow(`${summary.moderate} moderate`)} ${chalk.dim(`${summary.minor} minor`)}\n`);
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

async function main() {
  console.log(chalk.dim(`\n  Scanning ${opts.url || opts.file}...`));

  const { results, html } = await scanPage();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printResults(results);

  if (opts.fix && results.violations.length > 0) {
    console.log(chalk.bold.blue('\n  Generating AI fix suggestions...\n'));
    const fixes = await getFixSuggestions(results.violations, html);
    console.log(fixes);
    console.log();
  }
}

main().catch(err => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { printResults, exitIfFailed } from './lib/report.js';
import { getFixSuggestions } from './lib/ai-fixes.js';

program
  .name('a11y-scan')
  .description('Render a page and scan it with axe-core')
  .option('--url <url>', 'URL to scan')
  .option('--file <path>', 'Local HTML file to scan')
  .option('--fix', 'Generate AI fix suggestions via Claude', false)
  .option('--json', 'Output raw JSON results', false)
  .option('--fail-on <impact>', 'Exit 1 if violations at this impact or higher (critical|serious|moderate|minor)')
  .parse();

const opts = program.opts();

if (!opts.url && !opts.file) {
  console.error(chalk.red('Provide --url or --file'));
  process.exit(1);
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

async function main() {
  console.log(chalk.dim(`\n  Scanning ${opts.url || opts.file}...`));

  const { results, html } = await scanPage();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printResults(results);

    if (opts.fix && results.violations.length > 0) {
      console.log(chalk.bold.blue('\n  Generating AI fix suggestions...\n'));
      const fixes = await getFixSuggestions({
        violations: results.violations,
        source: html,
        sourceLabel: 'Source HTML',
      });
      console.log(fixes);
      console.log();
    }
  }

  exitIfFailed(results.violations, opts.failOn, { json: opts.json });
}

main().catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  if (/Executable doesn't exist|browserType\.launch/i.test(err.message)) {
    console.error(chalk.dim('  Run: npx playwright install chromium'));
  }
  process.exit(1);
});

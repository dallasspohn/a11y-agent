import 'dotenv/config';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { lintHtml } from './lib/lint-html.js';
import { printResults, exitIfFailed } from './lib/report.js';
import { getFixSuggestions } from './lib/ai-fixes.js';

program
  .name('a11y-lint')
  .description('Static HTML accessibility lint — no browser required')
  .requiredOption('--file <path>', 'Local HTML file to lint')
  .option('--fix', 'Generate AI fix suggestions via Claude', false)
  .option('--json', 'Output raw JSON results', false)
  .option('--fail-on <impact>', 'Exit 1 if violations at this impact or higher (critical|serious|moderate|minor)')
  .parse();

const opts = program.opts();

async function main() {
  const filePath = resolve(opts.file);
  console.log(chalk.dim(`\n  Linting ${opts.file}...`));

  const html = await readFile(filePath, 'utf-8');
  const violations = lintHtml(html, opts.file);
  const results = { violations, passes: [] };

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printResults(results, 'A11Y AGENT LINT RESULTS');
    if (opts.fix && violations.length > 0) {
      console.log(chalk.bold.blue('\n  Generating AI fix suggestions...\n'));
      const fixes = await getFixSuggestions({
        violations,
        source: html,
        sourceLabel: 'Source HTML',
      });
      console.log(fixes);
      console.log();
    }
  }

  exitIfFailed(violations, opts.failOn, { json: opts.json });
}

main().catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});

import { watch } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { lintHtml } from './lib/lint-html.js';
import { printResults } from './lib/report.js';

program
  .name('a11y-watch')
  .description('Watch a directory and lint .html files on save')
  .option('--dir <path>', 'Directory to watch', '.')
  .parse();

const opts = program.opts();
const dir = resolve(opts.dir);

const lintFile = async (name) => {
  const filePath = join(dir, name);
  try {
    const html = await readFile(filePath, 'utf-8');
    console.log(chalk.dim(`\n  Linting ${name}...`));
    const violations = lintHtml(html, name);
    printResults({ violations, passes: [] }, `A11Y AGENT LINT — ${name}`);
  } catch (err) {
    console.error(chalk.red(`  Error linting ${name}: ${err.message}`));
  }
};

console.log(chalk.bold.blue(`\n  Watching ${opts.dir} for .html changes... (Ctrl+C to stop)`));

const debounce = new Map();
watch(dir, (event, name) => {
  if (!name || !name.endsWith('.html')) return;
  clearTimeout(debounce.get(name));
  debounce.set(name, setTimeout(() => lintFile(name), 100));
});

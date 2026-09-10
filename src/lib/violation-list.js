/**
 * Numbered violation listing.
 *
 * The numbers here are the contract for voice selection — whatever order this
 * renders is the order parseSelection() resolves "issue three" against, so
 * always list and select from the same array.
 */
import chalk from 'chalk';
import { IMPACT_ORDER } from './report.js';

const IMPACT_COLORS = {
  critical: chalk.bgRed.white.bold,
  serious: chalk.red.bold,
  moderate: chalk.yellow,
  minor: chalk.dim,
};

/** Sort violations worst-first so issue 1 is always the most severe */
export function orderViolations(violations) {
  return [...violations].sort(
    (a, b) => (IMPACT_ORDER[a.impact] ?? 99) - (IMPACT_ORDER[b.impact] ?? 99)
  );
}

/** Print the numbered list the user will select from */
export function printViolationList(violations) {
  console.log(chalk.bold('\n  ISSUES FOUND\n'));

  violations.forEach((v, i) => {
    const color = IMPACT_COLORS[v.impact] || chalk.white;
    const count = v.nodes?.length || 0;
    console.log(
      `  ${chalk.bold.cyan(`[${i + 1}]`)} ${color(` ${v.impact} `)} ${chalk.white(v.help)}` +
      chalk.dim(`  (${v.id}, ${count} element${count === 1 ? '' : 's'})`)
    );
  });

  console.log(chalk.dim('\n  Say "fix all critical", "fix issue one and three", or "fix everything"\n'));
}

/** Spoken summary: counts by impact */
export function summarySpeech(violations) {
  if (!violations.length) return 'No accessibility violations found. Nice work.';

  const counts = violations.reduce((acc, v) => {
    acc[v.impact] = (acc[v.impact] || 0) + 1;
    return acc;
  }, {});

  const breakdown = ['critical', 'serious', 'moderate', 'minor']
    .filter((level) => counts[level])
    .map((level) => `${counts[level]} ${level}`)
    .join(', ');

  return `Scan complete. ${violations.length} violation${violations.length === 1 ? '' : 's'} found. ${breakdown}.`;
}

/**
 * Spoken version of the numbered list.
 * Reads the help text rather than the axe rule id — "images must have
 * alternative text" is far clearer aloud than "image-alt".
 */
export function listSpeech(violations, { limit = 10 } = {}) {
  const shown = violations.slice(0, limit);
  const lines = shown.map((v, i) => `${i + 1}. ${v.impact}. ${v.help}.`);

  if (violations.length > shown.length) {
    lines.push(`And ${violations.length - shown.length} more.`);
  }

  lines.push('Which would you like to fix?');
  return lines.join(' ');
}

import chalk from 'chalk';

export const IMPACT_ORDER = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

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

export function violationsAtOrAbove(violations, failOn) {
  const threshold = IMPACT_ORDER[failOn];
  if (threshold === undefined) return [];
  return violations.filter((v) => (IMPACT_ORDER[v.impact] ?? 4) <= threshold);
}

export function printResults(results, title = 'A11Y AGENT SCAN RESULTS') {
  const { violations, passes = [] } = results;

  console.log(chalk.bold(`\n  ${title}\n`));
  if (passes.length) {
    console.log(`  ${chalk.green(passes.length)} rules passed`);
  }
  console.log(`  ${chalk.red(violations.length)} violations found\n`);

  if (violations.length === 0) {
    console.log(chalk.green.bold('  No accessibility violations detected.\n'));
    return;
  }

  const sorted = [...violations].sort((a, b) => {
    return (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4);
  });

  for (const v of sorted) {
    const colorFn = impactColors[v.impact] || chalk.white;
    const emoji = impactEmoji[v.impact] || '  ';
    const impact = (v.impact || 'minor').toUpperCase();

    console.log(colorFn(`  ${emoji} [${impact}] ${v.id}`));
    console.log(`     ${v.help}`);
    if (v.helpUrl) {
      console.log(chalk.dim(`     ${v.helpUrl}`));
    }

    for (const node of v.nodes || []) {
      const target = Array.isArray(node.target) ? node.target.join(', ') : node.target;
      if (target) {
        console.log(chalk.cyan(`     target: ${target}`));
      }
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
  for (const v of violations) {
    if (summary[v.impact] !== undefined) summary[v.impact]++;
  }
  console.log(chalk.bold('  Summary:'));
  console.log(
    `  ${chalk.bgRed.white.bold(` ${summary.critical} critical `)} ${chalk.red.bold(`${summary.serious} serious`)} ${chalk.yellow(`${summary.moderate} moderate`)} ${chalk.dim(`${summary.minor} minor`)}\n`,
  );
}

export function exitIfFailed(violations, failOn, { json = false } = {}) {
  if (!failOn) return;
  if (!(failOn in IMPACT_ORDER)) {
    console.error(chalk.red(`Invalid --fail-on value "${failOn}". Use critical, serious, moderate, or minor.`));
    process.exit(2);
  }
  const failing = violationsAtOrAbove(violations, failOn);
  if (failing.length === 0) return;
  if (!json) {
    console.error(chalk.red(`  Failed: ${failing.length} violation(s) at ${failOn} or higher.\n`));
  }
  process.exit(1);
}

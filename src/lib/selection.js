/**
 * Turn a spoken phrase into a concrete set of violations to fix.
 *
 * Speech-to-text emits number *words*, not digits, so "fix issue one and three"
 * has to resolve the same way "fix issue 1 and 3" would.
 *
 * Selections are resolved against the numbered list the user just heard, so the
 * caller must pass violations in the same order it displayed them.
 */

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  // Frequent small-model mishears of digits
  won: 1, tree: 3, free: 3, ate: 8, nan: 9,
};

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10,
};

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'];

// "serious" is routinely transcribed as "series"/"cirrus" by the small model
const SEVERITY_ALIASES = {
  critical: 'critical', criticals: 'critical', critic: 'critical',
  serious: 'serious', series: 'serious', cirrus: 'serious',
  moderate: 'moderate', moderates: 'moderate',
  minor: 'minor', minors: 'minor', miner: 'minor',
};

/** Words that mean "everything" */
const ALL_WORDS = ['all', 'everything', 'every', 'the lot', 'them all'];

function wordToNumber(token) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

/**
 * Extract explicit issue numbers, including ranges.
 * "one and three" → [1, 3]; "two through five" → [2, 3, 4, 5]
 */
function extractNumbers(tokens) {
  const numbers = [];

  for (let i = 0; i < tokens.length; i++) {
    const value = wordToNumber(tokens[i]);
    if (value === null) continue;

    // Look back for a range connector: "one through four", "two to five"
    const connector = tokens[i - 1];
    const isRange = ['through', 'thru', 'to', 'until', 'til'].includes(connector);
    const previous = numbers[numbers.length - 1];

    if (isRange && previous !== undefined && value > previous) {
      for (let n = previous + 1; n <= value; n++) numbers.push(n);
    } else {
      numbers.push(value);
    }
  }

  return numbers;
}

/**
 * Parse a spoken selection into violation indices.
 *
 * @param {string} text        What the user said
 * @param {Array}  violations  Violations in the order they were presented
 * @returns {{indices: number[], label: string, error: string|null}}
 *          `indices` are 0-based into `violations`
 */
export function parseSelection(text, violations = []) {
  const normalized = String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const tokens = normalized.split(/[\s,]+/).filter(Boolean);
  const empty = { indices: [], label: '', error: null };

  if (!violations.length) {
    return { ...empty, error: 'There are no violations to fix.' };
  }
  if (!normalized) {
    return { ...empty, error: 'I did not catch that.' };
  }

  const all = violations.map((_, i) => i);

  // 1. Severity selection — "fix all critical", "critical and serious"
  const severities = [...new Set(
    tokens.map((t) => SEVERITY_ALIASES[t]).filter(Boolean)
  )];

  if (severities.length) {
    const indices = all.filter((i) => severities.includes(violations[i].impact));
    const label = severities.join(' and ');

    if (!indices.length) {
      return { ...empty, label, error: `There are no ${label} issues.` };
    }
    return { indices, label: `all ${label} issues`, error: null };
  }

  // 2. "first three" / "top two" — ordinal or number directly after first/top
  const leadMatch = normalized.match(/\b(?:first|top|worst)\s+(\w+)\b/);
  if (leadMatch) {
    const count = wordToNumber(leadMatch[1]);
    if (count) {
      const indices = all.slice(0, count);
      return { indices, label: `the first ${indices.length}`, error: null };
    }
  }

  // 3. Ordinals — "the second one", "fix the third"
  const ordinals = tokens.map((t) => ORDINAL_WORDS[t]).filter(Boolean);
  if (ordinals.length) {
    const indices = ordinals.map((n) => n - 1).filter((i) => i >= 0 && i < violations.length);
    if (indices.length) {
      return { indices: [...new Set(indices)], label: describe(indices), error: null };
    }
  }

  // 4. Explicit numbers — "issue one and three", "number 2"
  const numbers = extractNumbers(tokens);
  if (numbers.length) {
    const valid = [];
    const invalid = [];

    for (const n of numbers) {
      if (n >= 1 && n <= violations.length) valid.push(n - 1);
      else invalid.push(n);
    }

    if (!valid.length) {
      return {
        ...empty,
        error: `There is no issue number ${invalid.join(' or ')}. Say a number from 1 to ${violations.length}.`,
      };
    }

    const indices = [...new Set(valid)].sort((a, b) => a - b);
    const error = invalid.length
      ? `Skipping ${invalid.join(' and ')} — there ${violations.length === 1 ? 'is only 1 issue' : `are only ${violations.length} issues`}.`
      : null;

    return { indices, label: describe(indices), error };
  }

  // 5. Everything — checked last so "fix all critical" resolves by severity
  if (ALL_WORDS.some((w) => normalized.includes(w))) {
    return { indices: all, label: `all ${all.length} issues`, error: null };
  }

  return {
    ...empty,
    error: 'I did not understand which issues to fix. Try "fix all critical" or "fix issue one and three".',
  };
}

function describe(indices) {
  const numbers = indices.map((i) => i + 1);
  if (numbers.length === 1) return `issue ${numbers[0]}`;
  const last = numbers.pop();
  return `issues ${numbers.join(', ')} and ${last}`;
}

/** True if the phrase is asking to apply/write fixes rather than just show them */
export function isApplyRequest(text) {
  const normalized = String(text || '').toLowerCase();
  return /\b(apply|auto[- ]?fix|autofix|write|patch|make the change|do it|go ahead)\b/.test(normalized);
}

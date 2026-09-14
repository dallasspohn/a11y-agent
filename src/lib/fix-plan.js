/**
 * Structured, per-violation fix generation.
 *
 * getFixSuggestions() returns one markdown blob for the whole scan, which is
 * fine to read aloud but impossible to cherry-pick or apply. This module asks
 * the model for one violation at a time and demands exact before/after strings,
 * so a fix can be selected individually and written to disk.
 */
import { complete } from './ai-fixes.js';

const MAX_SOURCE_CHARS = 60_000;
const MAX_NODES_PER_VIOLATION = 4;

const SYSTEM_PROMPT = `You are an accessibility expert who outputs only JSON.

You will be given ONE accessibility violation and the HTML source it came from.
Return a fix as JSON with this exact shape:

{
  "why": "One short sentence on how this affects users with disabilities.",
  "wcag": "The WCAG criterion, e.g. '1.1.1 Non-text Content'",
  "edits": [
    { "before": "<exact snippet copied verbatim from the source>",
      "after":  "<the corrected snippet>" }
  ]
}

CRITICAL RULES FOR "before":
- Copy it CHARACTER-FOR-CHARACTER from the source HTML provided. Do not
  reformat, reindent, reorder attributes, or change quote styles.
- Make it long enough to appear EXACTLY ONCE in the source.
- One edit object per affected element.
- If you cannot produce a safe automatic edit, return "edits": [].

Output JSON only. No markdown fences, no commentary.`;

/**
 * Pull JSON out of a model response that may be wrapped in prose or fences.
 */
function parseJsonResponse(content) {
  const trimmed = String(content || '').trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to fence/brace extraction
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Fall through
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through
    }
  }

  return null;
}

function buildUserPrompt(violation, source) {
  const nodes = (violation.nodes || []).slice(0, MAX_NODES_PER_VIOLATION).map((n) => ({
    target: n.target,
    html: n.html,
    failureSummary: n.failureSummary,
  }));

  const truncated = source.length > MAX_SOURCE_CHARS
    ? `${source.slice(0, MAX_SOURCE_CHARS)}\n<!-- truncated -->`
    : source;

  return `## Violation

id: ${violation.id}
impact: ${violation.impact}
help: ${violation.help}
wcag tags: ${(violation.tags || []).filter((t) => t.startsWith('wcag')).join(', ') || 'n/a'}

Affected elements:
${JSON.stringify(nodes, null, 2)}

## Source HTML

\`\`\`html
${truncated}
\`\`\``;
}

/**
 * Verify each edit against the real source and annotate whether it can be
 * applied automatically. The model routinely paraphrases "before", so this is
 * what keeps a bad edit from silently corrupting the file.
 */
function validateEdits(edits, source) {
  return (Array.isArray(edits) ? edits : [])
    .filter((e) => e && typeof e.before === 'string' && typeof e.after === 'string' && e.before.length)
    .map((edit) => {
      const occurrences = source.split(edit.before).length - 1;

      let applicable = true;
      let reason = null;

      if (occurrences === 0) {
        applicable = false;
        reason = 'the "before" text was not found in the source verbatim';
      } else if (edit.before === edit.after) {
        applicable = false;
        reason = 'the fix is identical to the original';
      }

      return { ...edit, occurrences, applicable, reason };
    });
}

/**
 * Generate a structured fix for each supplied violation.
 *
 * @param {object}   params
 * @param {Array}    params.violations  Violations to fix (already filtered)
 * @param {string}   params.source      The HTML source they came from
 * @param {Function} [params.onProgress] Called as (index, total, violation)
 * @returns {Promise<Array>} One entry per violation, in the same order
 */
export async function generateFixPlan({ violations, source, onProgress }) {
  const plan = [];

  for (const [index, violation] of violations.entries()) {
    onProgress?.(index + 1, violations.length, violation);

    try {
      const content = await complete({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(violation, source),
        // Low temperature: we need verbatim source copying, not creativity
        temperature: 0,
        json: true,
        maxTokens: 2048,
      });

      const parsed = parseJsonResponse(content);

      if (!parsed) {
        plan.push({ violation, why: null, wcag: null, edits: [], error: 'model did not return valid JSON' });
        continue;
      }

      plan.push({
        violation,
        why: parsed.why || null,
        wcag: parsed.wcag || null,
        edits: validateEdits(parsed.edits, source),
        error: null,
      });
    } catch (err) {
      plan.push({ violation, why: null, wcag: null, edits: [], error: err.message });
    }
  }

  return plan;
}

/** Count edits across a plan that are safe to write to disk */
export function applicableEditCount(plan) {
  return plan.reduce((sum, entry) => sum + entry.edits.filter((e) => e.applicable).length, 0);
}

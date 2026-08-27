import OpenAI from 'openai';

const MAX_SOURCE_CHARS = 60_000;

const DEFAULT_URL = 'http://localhost:11434/v1';
const DEFAULT_MODEL = 'llama3.1';

function createClient() {
  const baseURL = process.env.A11Y_AI_URL || DEFAULT_URL;
  const apiKey = process.env.A11Y_AI_KEY || 'ollama';
  return new OpenAI({ baseURL, apiKey });
}

export async function getFixSuggestions({ violations, source, sourceLabel = 'Source' }) {
  const client = createClient();
  const model = process.env.A11Y_AI_MODEL || DEFAULT_MODEL;
  const truncated = source.length > MAX_SOURCE_CHARS
    ? `${source.slice(0, MAX_SOURCE_CHARS)}\n<!-- truncated -->`
    : source;

  const violationSummary = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    wcag: (v.tags || []).filter((t) => t.startsWith('wcag')),
    nodes: (v.nodes || []).map((n) => ({
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));

  const prompt = `You are an accessibility expert. Given the following accessibility violations, provide specific, actionable fix suggestions for each violation.

For each violation:
1. Explain WHY it matters (impact on users with disabilities) in one short sentence
2. Show the EXACT code fix (before → after)
3. Note the WCAG criterion it addresses

Be concise and practical — developers should be able to copy-paste your fixes.

## Violations Found

${JSON.stringify(violationSummary, null, 2)}

## ${sourceLabel}

\`\`\`html
${truncated}
\`\`\``;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.choices[0].message.content;
}

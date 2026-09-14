import OpenAI from 'openai';

const MAX_SOURCE_CHARS = 60_000;

const DEFAULT_URL = 'http://localhost:11434/v1';
const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_VERTEX_MODEL = 'claude-3-7-sonnet@20250219';
const DEFAULT_VERTEX_REGION = 'us-east5';

/**
 * Which backend to talk to.
 *  - 'openai' (default): any OpenAI-compatible Chat Completions endpoint —
 *    Ollama, OpenAI, Groq, LM Studio, etc. — configured via A11Y_AI_URL.
 *  - 'vertex': Claude on Google Vertex AI, called directly with Anthropic's
 *    Messages API shape (Vertex does not speak OpenAI's wire format for
 *    Claude models, so this needs its own client — see completeVertex).
 */
export function activeProvider() {
  return (process.env.A11Y_AI_PROVIDER || 'openai').toLowerCase();
}

export function createClient() {
  const baseURL = process.env.A11Y_AI_URL || DEFAULT_URL;
  const apiKey = process.env.A11Y_AI_KEY || 'ollama';
  return new OpenAI({ baseURL, apiKey });
}

export function activeModel() {
  if (activeProvider() === 'vertex') {
    return process.env.A11Y_AI_MODEL || DEFAULT_VERTEX_MODEL;
  }
  return process.env.A11Y_AI_MODEL || DEFAULT_MODEL;
}

async function completeOpenAI({ model, system, user, temperature, json, maxTokens }) {
  const client = createClient();
  const messages = system
    ? [{ role: 'system', content: system }, { role: 'user', content: user }]
    : [{ role: 'user', content: user }];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages,
  });

  return response.choices[0].message.content;
}

/**
 * Claude via Google Vertex AI.
 *
 * No project ID or credentials live in this repo — everything comes from
 * the caller's own environment:
 *
 *   ANTHROPIC_VERTEX_PROJECT_ID   your GCP project id
 *   CLOUD_ML_REGION               e.g. us-east5 (default below)
 *
 * plus standard Google Application Default Credentials
 * (`gcloud auth application-default login`, or a service account via
 * GOOGLE_APPLICATION_CREDENTIALS). See README.md "Claude via Vertex AI".
 */
async function completeVertex({ model, system, user, temperature, maxTokens }) {
  let AnthropicVertex;
  try {
    ({ AnthropicVertex } = await import('@anthropic-ai/vertex-sdk'));
  } catch {
    throw new Error(
      'A11Y_AI_PROVIDER=vertex requires the optional dependency @anthropic-ai/vertex-sdk.\n' +
        'Install it with: npm install @anthropic-ai/vertex-sdk'
    );
  }

  const client = new AnthropicVertex({
    projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    region: process.env.CLOUD_ML_REGION || DEFAULT_VERTEX_REGION,
  });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: user }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Provider-agnostic chat completion. Everything in this repo that talks to
 * an LLM should go through here (rather than building its own client) so
 * that A11Y_AI_PROVIDER=vertex works everywhere — lint --fix, scan --fix,
 * and the structured fix plan — not just one code path.
 */
export async function complete({ system, user, temperature, json = false, maxTokens = 4096 }) {
  const model = activeModel();
  return activeProvider() === 'vertex'
    ? completeVertex({ model, system, user, temperature, maxTokens })
    : completeOpenAI({ model, system, user, temperature, json, maxTokens });
}

export async function getFixSuggestions({ violations, source, sourceLabel = 'Source' }) {
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

  return complete({ user: prompt, maxTokens: 4096 });
}

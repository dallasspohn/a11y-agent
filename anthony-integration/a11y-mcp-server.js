#!/usr/bin/env node

/**
 * A11Y Agent MCP Server
 *
 * Model Context Protocol (MCP) server wrapper for a11y-agent.
 * Exposes accessibility scanning tools to Anthony via stdio JSON-RPC.
 *
 * Protocol: https://modelcontextprotocol.io/
 *
 * Available Tools:
 * - scan_accessibility: Scan URL/file for WCAG violations
 * - explain_violation: Get detailed explanation for a violation ID
 * - get_fix_suggestion: Get AI-powered fix for specific violation
 * - list_violations: Get summary of violations from last scan
 */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import readline from 'readline';

// --- State Management ---
let lastScanResults = null;
let lastScanHtml = null;
let lastScanTarget = null;

// --- MCP Protocol Handlers ---

const TOOLS = [
  {
    name: 'scan_accessibility',
    description: 'Scan a URL or local HTML file for WCAG accessibility violations using axe-core',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'URL (http://...) or file path (/path/to/file.html)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'WCAG tags to test (default: wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice)',
          default: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'explain_violation',
    description: 'Get detailed explanation of a specific accessibility violation',
    inputSchema: {
      type: 'object',
      properties: {
        violation_id: {
          type: 'string',
          description: 'The axe-core violation ID (e.g., "color-contrast", "image-alt")',
        },
      },
      required: ['violation_id'],
    },
  },
  {
    name: 'get_fix_suggestion',
    description: 'Generate AI-powered fix suggestions for violations using Claude',
    inputSchema: {
      type: 'object',
      properties: {
        violation_id: {
          type: 'string',
          description: 'Optional: specific violation ID to fix (defaults to all violations from last scan)',
        },
      },
    },
  },
  {
    name: 'list_violations',
    description: 'List violations from the most recent scan',
    inputSchema: {
      type: 'object',
      properties: {
        impact: {
          type: 'string',
          enum: ['critical', 'serious', 'moderate', 'minor'],
          description: 'Filter by impact level (optional)',
        },
      },
    },
  },
];

/**
 * Scan page for accessibility violations
 */
async function scanAccessibility(target, tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Determine if target is URL or file
    if (target.startsWith('http://') || target.startsWith('https://')) {
      await page.goto(target);
    } else {
      const filePath = resolve(target);
      await page.goto(`file://${filePath}`);
    }

    const results = await new AxeBuilder({ page })
      .withTags(tags)
      .analyze();

    const html = target.startsWith('http://') || target.startsWith('https://')
      ? await page.content()
      : await readFile(resolve(target), 'utf-8');

    // Store for later reference
    lastScanResults = results;
    lastScanHtml = html;
    lastScanTarget = target;

    return {
      target,
      timestamp: new Date().toISOString(),
      violations: results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map(n => ({
          target: n.target,
          html: n.html,
          failureSummary: n.failureSummary,
        })),
      })),
      passes: results.passes.length,
      summary: {
        critical: results.violations.filter(v => v.impact === 'critical').length,
        serious: results.violations.filter(v => v.impact === 'serious').length,
        moderate: results.violations.filter(v => v.impact === 'moderate').length,
        minor: results.violations.filter(v => v.impact === 'minor').length,
        total: results.violations.length,
      },
    };
  } finally {
    await browser.close();
  }
}

/**
 * Explain a specific violation
 */
function explainViolation(violationId) {
  if (!lastScanResults) {
    throw new Error('No scan results available. Run scan_accessibility first.');
  }

  const violation = lastScanResults.violations.find(v => v.id === violationId);

  if (!violation) {
    return {
      error: `Violation ID "${violationId}" not found in last scan.`,
      availableIds: lastScanResults.violations.map(v => v.id),
    };
  }

  return {
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    wcagCriteria: violation.tags.filter(t => t.startsWith('wcag')),
    affectedElements: violation.nodes.length,
    examples: violation.nodes.slice(0, 3).map(n => ({
      target: n.target,
      html: n.html,
      issue: n.failureSummary,
    })),
  };
}

/**
 * Generate AI fix suggestions using Claude
 */
async function getFixSuggestion(violationId = null) {
  if (!lastScanResults || !lastScanHtml) {
    throw new Error('No scan results available. Run scan_accessibility first.');
  }

  const violations = violationId
    ? lastScanResults.violations.filter(v => v.id === violationId)
    : lastScanResults.violations;

  if (violations.length === 0) {
    return { message: 'No violations to fix.' };
  }

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
${lastScanHtml}
\`\`\``,
    }],
  });

  return {
    target: lastScanTarget,
    violationId: violationId || 'all',
    fixSuggestions: response.content[0].text,
  };
}

/**
 * List violations from last scan
 */
function listViolations(impactFilter = null) {
  if (!lastScanResults) {
    throw new Error('No scan results available. Run scan_accessibility first.');
  }

  let violations = lastScanResults.violations;

  if (impactFilter) {
    violations = violations.filter(v => v.impact === impactFilter);
  }

  return {
    target: lastScanTarget,
    total: violations.length,
    violations: violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      affectedElements: v.nodes.length,
    })),
  };
}

/**
 * Execute a tool call
 */
async function executeTool(name, args) {
  switch (name) {
    case 'scan_accessibility':
      return await scanAccessibility(args.target, args.tags);

    case 'explain_violation':
      return explainViolation(args.violation_id);

    case 'get_fix_suggestion':
      return await getFixSuggestion(args.violation_id);

    case 'list_violations':
      return listViolations(args.impact);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Handle MCP protocol messages
 */
async function handleMessage(message) {
  const { method, params, id } = message;

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'a11y-agent-mcp',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS,
        },
      };
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const result = await executeTool(name, args || {});

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    }

    throw new Error(`Unknown method: ${method}`);
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message,
      },
    };
  }
}

/**
 * Main MCP server loop (stdio transport)
 */
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    try {
      const message = JSON.parse(line);
      const response = await handleMessage(message);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.error(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
      }));
    }
  });
}

// Start the server
main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

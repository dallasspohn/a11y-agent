# Anthony Integration Architecture

## Executive Summary

**Anthony** is a voice-driven desktop orchestrator for GNOME/Linux that uses local LLMs (Gemma 4) for natural language command processing. **A11Y Agent** is an AI-powered accessibility testing tool that combines axe-core with Claude AI for fix suggestions.

This document provides a complete integration architecture enabling Anthony to invoke a11y-agent via voice commands like:
- "scan this page for accessibility issues"
- "check accessibility of example.com"
- "find WCAG violations in my-app.html and suggest fixes"

## Anthony Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│ Voice Input (Silero VAD + Faster-Whisper STT)              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ orchestrator.py (Main Loop)                                 │
│ - Manages llama-server (Gemma 4 LLM)                       │
│ - Routes commands to matcher/conversation/LLM              │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
┌─────────▼─────────┐  ┌────────▼────────┐
│ command_matcher.py│  │ llm_chain.py    │
│ - @step patterns  │  │ - Tool calling  │
│ - Semantic search │  │ - Conversation  │
└─────────┬─────────┘  └────────┬────────┘
          │                     │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │ tools/              │
          │ - facades.py        │
          │ - standalone.py     │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │ anthony-mcp         │
          │ (GNOME extension +  │
          │  MCP server)        │
          └─────────────────────┘
```

### Integration Points

Anthony provides **four** integration mechanisms:

1. **MCP Server** - Standard tool interface (RECOMMENDED)
2. **Command Modules** - `@step` decorated pattern handlers in `commands/`
3. **Standalone Tools** - Python functions in `tools/standalone.py`
4. **Tool Schemas** - OpenAI-format schemas in `config/tool_schemas.py`

## Integration Approach: MCP Server Wrapper (RECOMMENDED)

### Why MCP?

- **Standard Protocol** - Anthony already uses MCP for desktop automation
- **Language Agnostic** - A11Y Agent stays in Node.js, no rewrite needed
- **Clean Separation** - A11Y Agent runs as independent service
- **Bidirectional** - Can pass results back to Anthony for voice feedback

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────┐
│ Anthony (Python)                                           │
│                                                            │
│  ┌──────────────┐         ┌──────────────┐               │
│  │ commands/    │         │ config/      │               │
│  │ a11y.py      │────────▶│ tool_schemas │               │
│  │ @step        │         │ .py          │               │
│  │ patterns     │         │ (a11y tool)  │               │
│  └──────┬───────┘         └──────────────┘               │
│         │                                                 │
│  ┌──────▼────────────┐                                    │
│  │ tools/facades.py  │                                    │
│  │ accessibility_    │                                    │
│  │   control()       │                                    │
│  └──────┬────────────┘                                    │
│         │                                                 │
│  ┌──────▼────────────┐                                    │
│  │ mcp_client.py     │                                    │
│  │ call_tool()       │                                    │
│  └──────┬────────────┘                                    │
│         │ stdio (JSON-RPC)                                │
└─────────┼─────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────┐
│ A11Y Agent MCP Server (Node.js)                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ a11y-mcp-server.js (NEW)                             │ │
│  │                                                       │ │
│  │ @mcp.tool()                                          │ │
│  │ scan_accessibility(target, options)                  │ │
│  │   → calls scan.js                                    │ │
│  │   → returns violations + fixes                       │ │
│  │                                                       │ │
│  │ @mcp.tool()                                          │ │
│  │ explain_violation(violation_id)                      │ │
│  │   → returns detailed explanation                     │ │
│  │                                                       │ │
│  │ @mcp.tool()                                          │ │
│  │ get_fix_suggestion(violation_id, html_snippet)       │ │
│  │   → returns before/after code fix                    │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                                                  │
│  ┌──────▼────────────────────────────────────────────────┐│
│  │ src/scan.js (EXISTING)                                ││
│  │ - Playwright + axe-core scanner                       ││
│  │ - Claude AI fix generation                            ││
│  └───────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: MCP Server Wrapper (Days 1-2)

**1.1 Create MCP Server Entry Point**

File: `/home/dspohn/dev/1-workspace/a11y-agent/src/a11y-mcp-server.js`

```javascript
#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Minimal MCP server using stdio protocol
class MCPServer {
  constructor(name) {
    this.name = name;
    this.tools = [];
  }

  tool(handler) {
    this.tools.push(handler);
    return handler;
  }

  async run() {
    // Listen on stdin for JSON-RPC requests
    process.stdin.on('data', async (data) => {
      try {
        const request = JSON.parse(data.toString());
        
        if (request.method === 'tools/list') {
          const toolList = this.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.schema
          }));
          
          this.respond(request.id, toolList);
        } 
        else if (request.method === 'tools/call') {
          const { name, arguments: args } = request.params;
          const tool = this.tools.find(t => t.name === name);
          
          if (tool) {
            const result = await tool.handler(args);
            this.respond(request.id, result);
          } else {
            this.error(request.id, `Tool not found: ${name}`);
          }
        }
      } catch (err) {
        this.error(null, err.message);
      }
    });
  }

  respond(id, result) {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  error(id, message) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: { message }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

const server = new MCPServer('a11y-agent');

// Tool 1: Scan accessibility
const scanTool = {
  name: 'scan_accessibility',
  description: 'Scan a URL or local HTML file for WCAG accessibility violations using axe-core. Returns violations with severity, description, and optionally AI-generated fix suggestions.',
  schema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'URL (https://example.com) or file path (/path/to/file.html)'
      },
      generate_fixes: {
        type: 'boolean',
        description: 'Generate AI fix suggestions via Claude',
        default: false
      }
    },
    required: ['target']
  },
  handler: async ({ target, generate_fixes = false }) => {
    const args = target.startsWith('http') 
      ? ['--url', target]
      : ['--file', target];
    
    if (generate_fixes) args.push('--fix');
    args.push('--json');

    const { scanPage, getFixSuggestions } = await import('./scan.js');
    
    // Run scan
    const { results, html } = await scanPage({ 
      url: target.startsWith('http') ? target : null,
      file: target.startsWith('http') ? null : target
    });

    let fixes = null;
    if (generate_fixes && results.violations.length > 0) {
      fixes = await getFixSuggestions(results.violations, html);
    }

    return {
      violations: results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map(n => ({
          target: n.target,
          html: n.html,
          failureSummary: n.failureSummary
        }))
      })),
      passes: results.passes.length,
      fixes: fixes,
      summary: {
        critical: results.violations.filter(v => v.impact === 'critical').length,
        serious: results.violations.filter(v => v.impact === 'serious').length,
        moderate: results.violations.filter(v => v.impact === 'moderate').length,
        minor: results.violations.filter(v => v.impact === 'minor').length
      }
    };
  }
};

server.tool(scanTool);

// Tool 2: Explain violation
const explainTool = {
  name: 'explain_violation',
  description: 'Get detailed explanation of a specific WCAG violation by ID, including impact on users with disabilities',
  schema: {
    type: 'object',
    properties: {
      violation_id: {
        type: 'string',
        description: 'axe-core violation ID (e.g., "color-contrast", "html-has-lang")'
      }
    },
    required: ['violation_id']
  },
  handler: async ({ violation_id }) => {
    // Load axe-core rule metadata
    const axe = await import('axe-core');
    const rule = axe.default.getRules().find(r => r.ruleId === violation_id);
    
    if (!rule) {
      return { error: `Unknown violation: ${violation_id}` };
    }

    return {
      id: rule.ruleId,
      description: rule.description,
      help: rule.help,
      helpUrl: rule.helpUrl,
      tags: rule.tags
    };
  }
};

server.tool(explainTool);

// Run server
server.run();
console.error('[a11y-agent MCP server started]');
```

**1.2 Refactor scan.js for Programmatic Use**

Modify `src/scan.js` to export key functions:

```javascript
// Make these functions exportable
export async function scanPage(options = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (options.file) {
    const filePath = resolve(options.file);
    await page.goto(`file://${filePath}`);
  } else if (options.url) {
    await page.goto(options.url);
  }

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();

  const html = options.file
    ? await readFile(resolve(options.file), 'utf-8')
    : await page.content();

  await browser.close();
  return { results, html };
}

export async function getFixSuggestions(violations, html) {
  // Existing implementation
  // ...
}

// Only run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  });
}
```

### Phase 2: Anthony Command Module (Days 2-3)

**2.1 Create A11Y Command Module**

File: `~/anthony/commands/a11y.py`

```python
import json
from commands import _mcp_client, _speak, step
from utils import log_and_print

@step(
    "scan {target} for accessibility",
    "check accessibility of {target}",
    "find accessibility issues in {target}",
    "check {target} for WCAG violations",
    category="accessibility",
    help_text="Scan a URL or file for accessibility violations"
)
def scan_accessibility(target):
    """Scan a URL or HTML file for accessibility violations."""
    log_and_print(f"\n[A11Y] Scanning {target}...")
    
    try:
        result = _mcp_client.call_tool(
            "scan_accessibility",
            {"target": target, "generate_fixes": False}
        )
        
        data = json.loads(result)
        violations = data["violations"]
        summary = data["summary"]
        
        if not violations:
            _speak("No accessibility violations found")
            return "✓ No accessibility violations detected"
        
        # Speak summary
        total = sum(summary.values())
        _speak(f"Found {total} accessibility violations. "
               f"{summary['critical']} critical, "
               f"{summary['serious']} serious, "
               f"{summary['moderate']} moderate, "
               f"{summary['minor']} minor.")
        
        # Format output
        lines = [f"\n{'='*60}"]
        lines.append(f"ACCESSIBILITY SCAN: {target}")
        lines.append(f"{'='*60}\n")
        lines.append(f"Total violations: {total}")
        lines.append(f"  Critical: {summary['critical']}")
        lines.append(f"  Serious:  {summary['serious']}")
        lines.append(f"  Moderate: {summary['moderate']}")
        lines.append(f"  Minor:    {summary['minor']}\n")
        
        # Show top 3 violations
        for i, v in enumerate(violations[:3], 1):
            lines.append(f"{i}. [{v['impact'].upper()}] {v['id']}")
            lines.append(f"   {v['help']}")
            lines.append(f"   {v['helpUrl']}\n")
        
        if len(violations) > 3:
            lines.append(f"...and {len(violations) - 3} more violations\n")
        
        return "\n".join(lines)
    
    except Exception as e:
        log_and_print(f"[A11Y] Error: {e}", level="error")
        _speak(f"Accessibility scan failed: {e}")
        return f"Error: {e}"


@step(
    "scan {target} and suggest fixes",
    "scan {target} for accessibility and show fixes",
    "check {target} for WCAG violations and suggest fixes",
    category="accessibility",
    help_text="Scan with AI-powered fix suggestions"
)
def scan_with_fixes(target):
    """Scan with AI-generated fix suggestions."""
    log_and_print(f"\n[A11Y] Scanning {target} with AI fixes...")
    _speak("Scanning for accessibility violations and generating fix suggestions")
    
    try:
        result = _mcp_client.call_tool(
            "scan_accessibility",
            {"target": target, "generate_fixes": True}
        )
        
        data = json.loads(result)
        violations = data["violations"]
        fixes = data.get("fixes", "")
        
        if not violations:
            _speak("No accessibility violations found")
            return "✓ No accessibility violations detected"
        
        # Format output with fixes
        output = scan_accessibility(target)  # Get base report
        
        if fixes:
            output += f"\n{'='*60}\n"
            output += "AI-GENERATED FIX SUGGESTIONS\n"
            output += f"{'='*60}\n\n"
            output += fixes
        
        _speak("Fix suggestions generated. Check the terminal for details.")
        return output
    
    except Exception as e:
        log_and_print(f"[A11Y] Error: {e}", level="error")
        _speak(f"Accessibility scan failed: {e}")
        return f"Error: {e}"
```

**2.2 Add Tool Schema**

File: `~/anthony/config/tool_schemas.py`

Add to `TOOL_SCHEMAS` list:

```python
{
    "type": "function",
    "function": {
        "name": "scan_accessibility",
        "description": "Scan a URL or local HTML file for WCAG accessibility violations using axe-core. Returns violations with severity (critical/serious/moderate/minor), descriptions, and optionally AI-generated fix suggestions. Use for checking accessibility compliance, finding WCAG violations, or auditing web pages.",
        "parameters": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "URL (https://example.com) or file path (/path/to/file.html or ~/Documents/page.html). Can be local HTML files or live websites."
                },
                "generate_fixes": {
                    "type": "boolean",
                    "description": "Generate AI-powered fix suggestions via Claude for each violation. Default false.",
                    "default": False
                }
            },
            "required": ["target"]
        }
    }
}
```

**2.3 Register Command Module**

File: `~/anthony/commands/__init__.py`

Add to import list:

```python
def init(...):
    # existing imports...
    from commands import (
        apps,
        audio,
        brightness,
        help,
        input,
        power,
        settings,
        shortcuts,
        search,
        system,
        vision,
        window,
        workspace,
        a11y,  # NEW
    )
```

**2.4 Start A11Y MCP Server**

File: `~/anthony/orchestrator.py`

Add MCP server startup:

```python
def start_a11y_server():
    """Start the a11y-agent MCP server."""
    a11y_server_path = os.path.expanduser("~/dev/1-workspace/a11y-agent/src/a11y-mcp-server.js")
    
    if not os.path.exists(a11y_server_path):
        log_and_print("[ORCHESTRATOR] a11y-agent MCP server not found", level="warning")
        return None
    
    try:
        proc = subprocess.Popen(
            ["node", a11y_server_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        log_and_print("[ORCHESTRATOR] Started a11y-agent MCP server")
        return proc
    except Exception as e:
        log_and_print(f"[ORCHESTRATOR] Failed to start a11y-agent: {e}", level="error")
        return None

# In main():
a11y_server = start_a11y_server()
```

### Phase 3: Context Passing & Command Chaining (Day 4)

**3.1 Browser Context Detection**

Anthony can detect the current focused window and extract context:

```python
@step(
    "scan this page",
    "check this page for accessibility",
    "scan current page for accessibility",
    category="accessibility",
    help_text="Scan the currently focused browser window"
)
def scan_current_page():
    """Scan the URL from the currently focused browser window."""
    from tools.facades import window_control
    
    # Get focused window
    windows = json.loads(window_control(action="list", window_name=""))
    focused = next((w for w in windows if w.get("focused")), None)
    
    if not focused:
        _speak("No focused window found")
        return "Error: No focused window"
    
    # Extract URL if it's a browser
    title = focused.get("title", "")
    
    # Browser detection patterns
    browser_patterns = {
        "firefox": r"^(.*?)(?:\s*[-—]\s*Mozilla Firefox)?$",
        "chrome": r"^(.*?)(?:\s*[-—]\s*Google Chrome)?$",
        "chromium": r"^(.*?)(?:\s*[-—]\s*Chromium)?$"
    }
    
    app_name = focused.get("app_name", "").lower()
    
    if any(browser in app_name for browser in browser_patterns.keys()):
        # Try to extract URL from title or use clipboard
        # This is a heuristic - browsers don't expose URLs via AT-SPI
        _speak("Detected browser. Copy the URL and say 'scan this URL'")
        return "Browser detected. Please copy the URL and say 'scan this URL'"
    
    _speak("Focused window is not a browser")
    return "Error: Focused window is not a browser"


@step(
    "scan clipboard URL",
    "scan this URL",
    "check clipboard URL for accessibility",
    category="accessibility",
    help_text="Scan the URL from clipboard"
)
def scan_clipboard_url():
    """Scan URL from clipboard."""
    import subprocess
    
    try:
        # Get clipboard content
        result = subprocess.run(
            ["xclip", "-o", "-selection", "clipboard"],
            capture_output=True,
            text=True,
            timeout=2
        )
        
        url = result.stdout.strip()
        
        if not url.startswith("http"):
            _speak("Clipboard does not contain a valid URL")
            return "Error: Clipboard does not contain a URL"
        
        return scan_accessibility(url)
    
    except Exception as e:
        _speak(f"Error reading clipboard: {e}")
        return f"Error: {e}"
```

**3.2 Command Chaining**

Anthony already supports command chaining via `command_matcher.py`. Example:

"open firefox and scan example.com for accessibility"

This splits into:
1. "open firefox" → `apps.py:launch_app()`
2. "scan example.com for accessibility" → `a11y.py:scan_accessibility()`

### Phase 4: Testing & Polish (Day 5)

**4.1 Test Voice Commands**

```bash
cd ~/anthony
./orchestrator.py --ptt

# Test commands:
# - "scan example.com for accessibility"
# - "check bad-page.html for WCAG violations"
# - "scan github.com and suggest fixes"
# - "scan this page"
```

**4.2 Add to Anthony's Help System**

The `@step` decorator automatically registers commands in the help system:

```python
# User says: "help accessibility"
# Anthony responds with all accessibility commands
```

## Voice Command Examples

| User Says | Anthony Does |
|-----------|--------------|
| "scan example.com for accessibility" | Scans URL, reports violations via TTS |
| "check my-page.html for WCAG violations" | Scans local file, shows results |
| "scan github.com and suggest fixes" | Scans + generates AI fixes |
| "scan this page" | Prompts to copy URL from browser |
| "scan clipboard URL" | Scans URL from clipboard |
| "open firefox and scan example.com" | Opens Firefox, waits, then scans |

## Integration Benefits

1. **Hands-Free Accessibility Testing** - Speak to scan, no typing needed
2. **Desktop Integration** - Automatically detect browsers, extract URLs
3. **Command Chaining** - "open app, wait 5 seconds, scan it"
4. **Voice Feedback** - Hear violation summaries via TTS
5. **AI Assistance** - Get Claude-powered fix suggestions via voice
6. **Workflow Automation** - Scan → Fix → Re-scan loops

## Technical Requirements

### Anthony Side

- **Python 3.10+**
- **anthony** installed (`~/anthony`)
- **anthony-mcp** GNOME extension
- **MCP client** (`mcp_client.py`)
- **Command registry** (`commands/__init__.py`)

### A11Y Agent Side

- **Node.js 18+**
- **Existing dependencies** (playwright, axe-core, @anthropic-ai/sdk)
- **MCP server wrapper** (new file)
- **ANTHROPIC_API_KEY** environment variable (for AI fixes)

### System Requirements

- **Fedora/GNOME** (Anthony requirement)
- **16GB+ RAM** (for Anthony's local LLM)
- **Vulkan GPU** (optional, for faster LLM inference)
- **Working microphone** (for voice input)

## Context Passing Mechanisms

Anthony can pass the following context to a11y-agent:

1. **Focused Window URL** (via clipboard or manual input)
2. **Local File Path** (from voice command or file browser)
3. **Screenshot Analysis** (take screenshot → analyze for a11y with vision model)
4. **Browser Automation** (future: integrate with Playwright MCP to get URL directly)

## Command Chaining Examples

Anthony's `command_matcher.py` supports multi-step commands:

```
"open firefox, wait 3 seconds, scan example.com, and suggest fixes"
  → apps.open("firefox")
  → system.wait(3)
  → a11y.scan_with_fixes("example.com")
```

"take a screenshot and scan it for accessibility"
  → vision.screenshot()
  → a11y.scan_accessibility("/tmp/screenshot.png")
```

## Limitations & Future Work

### Current Limitations

1. **No Direct Browser URL Access** - AT-SPI doesn't expose browser address bar
   - Workaround: Use clipboard or manual voice input
   - Future: Integrate browser automation MCP server

2. **Node.js Subprocess** - MCP server spawns Node process per call
   - Workaround: Keep server running as daemon
   - Future: Persistent server with process pooling

3. **No Real-Time Scanning** - Must explicitly invoke scan command
   - Future: Auto-scan on page load (via browser extension)

### Future Enhancements

1. **Browser Extension** - Expose active tab URL to Anthony via MCP
2. **Live Monitoring** - Auto-scan pages as developer works
3. **Fix Application** - Apply fixes directly to files via voice
4. **Re-scan Verification** - "apply fix and re-scan"
5. **CI/CD Integration** - "scan latest deployment"
6. **Batch Scanning** - "scan all HTML files in this directory"

## File Structure

```
/home/dspohn/dev/1-workspace/a11y-agent/
├── src/
│   ├── scan.js (MODIFIED - add exports)
│   ├── a11y-mcp-server.js (NEW - MCP wrapper)
│   ├── conversation.js (EXISTING)
│   └── voice-commands.js (EXISTING)
├── package.json (MODIFIED - add bin entry)
└── ANTHONY_INTEGRATION.md (THIS FILE)

~/anthony/
├── commands/
│   ├── __init__.py (MODIFIED - import a11y)
│   └── a11y.py (NEW - accessibility commands)
├── config/
│   └── tool_schemas.py (MODIFIED - add scan_accessibility)
└── orchestrator.py (MODIFIED - start a11y MCP server)
```

## Installation Steps

### 1. Install Anthony

```bash
git clone https://github.com/g0dd4rd/anthony.git ~/anthony
cd ~/anthony
./install.sh
./build_llama.sh
./download_model.sh
```

### 2. Setup A11Y Agent MCP Server

```bash
cd /home/dspohn/dev/1-workspace/a11y-agent

# Create MCP server wrapper
# (create src/a11y-mcp-server.js as shown above)

# Make executable
chmod +x src/a11y-mcp-server.js

# Add to package.json
npm pkg set bin.a11y-mcp-server="./src/a11y-mcp-server.js"
```

### 3. Configure Anthony

```bash
cd ~/anthony

# Create a11y command module
# (create commands/a11y.py as shown above)

# Update config/tool_schemas.py
# (add scan_accessibility tool)

# Update commands/__init__.py
# (import a11y module)

# Update orchestrator.py
# (add a11y server startup)
```

### 4. Test Integration

```bash
# Start Anthony
cd ~/anthony
./orchestrator.py --ptt

# Press Enter and speak:
# "scan example.com for accessibility"
```

## Troubleshooting

### "a11y-agent MCP server not found"

- Check path in `orchestrator.py` matches actual location
- Verify `a11y-mcp-server.js` exists and is executable
- Run manually: `node ~/dev/1-workspace/a11y-agent/src/a11y-mcp-server.js`

### "Tool not found: scan_accessibility"

- Verify `config/tool_schemas.py` includes the tool schema
- Check `commands/a11y.py` is imported in `commands/__init__.py`
- Restart orchestrator: `./orchestrator.py --restart-server`

### "ANTHROPIC_API_KEY not set"

- Export key: `export ANTHROPIC_API_KEY="sk-..."`
- Add to `~/.bashrc` for persistence
- AI fixes require valid API key

### Voice command not recognized

- Check microphone: `arecord -l`
- Test VAD: `./orchestrator.py --debug --ptt`
- View registered patterns: `grep @step commands/a11y.py`

## References

- **Anthony Repository**: https://github.com/g0dd4rd/anthony
- **Anthony Article**: https://developers.redhat.com/articles/2026/07/29/anthony-voice-driven-desktop
- **MCP Specification**: https://modelcontextprotocol.io/
- **A11Y Agent**: `/home/dspohn/dev/1-workspace/a11y-agent/README.md`
- **axe-core Rules**: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/

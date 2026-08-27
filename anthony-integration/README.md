# Anthony Integration for A11Y Agent

Voice-driven accessibility testing using Anthony + a11y-agent.

## Overview

This integration enables **hands-free accessibility testing** using Anthony's voice control system. Speak natural commands to scan web pages, explain violations, and generate AI-powered fix suggestions.

### Features

- **Voice-activated scanning**: "scan example.com for accessibility"
- **Natural language commands**: No memorized syntax required
- **Multi-step workflows**: "scan and suggest fixes"
- **Context-aware**: Scan clipboard URLs, focused windows
- **AI-powered fixes**: Claude generates code-level solutions
- **Command chaining**: Combine multiple actions in one phrase

## Architecture

```
Anthony (Voice AI)           A11Y Agent (Node.js)
┌──────────────────┐        ┌─────────────────────┐
│ Whisper STT      │        │ MCP Server          │
│   ↓              │        │ (a11y-mcp-server.js)│
│ Gemma 4 LLM      │──JSON──│                     │
│   ↓              │  RPC   │ ├─ scan()           │
│ commands/a11y.py │        │ ├─ explain()        │
│   ↓              │        │ ├─ get_fix()        │
│ Piper TTS        │        │ └─ list()           │
└──────────────────┘        │                     │
                            │ Playwright + axe    │
                            │ Claude AI           │
                            └─────────────────────┘
```

## Installation

### Prerequisites

1. **Anthony** installed and running
   - Repository: https://github.com/g0dd4rd/anthony
   - Requires: GNOME desktop, Python 3.10+, AT-SPI

2. **A11Y Agent** installed
   ```bash
   cd ~/dev/1-workspace/a11y-agent
   npm install
   ```

3. **Claude API key** in environment
   ```bash
   export ANTHROPIC_API_KEY="sk-ant-..."
   ```

### Setup Steps

#### 1. Copy Integration Files

```bash
# Copy command module to Anthony
cp anthony-integration/a11y.py ~/anthony/commands/

# Ensure MCP server is in a11y-agent directory
# (anthony-integration/a11y-mcp-server.js is already in place)
```

#### 2. Install Dependencies

```bash
# Install a11y-agent dependencies (if not already done)
cd ~/dev/1-workspace/a11y-agent
npm install

# Verify Anthony has MCP client support
# (Built into Anthony >= v1.0)
```

#### 3. Restart Anthony

```bash
# Stop Anthony
pkill -f anthony

# Start Anthony
cd ~/anthony
python main.py
```

#### 4. Test Voice Commands

```bash
# Wake Anthony
"Hey Anthony"

# Test accessibility scan
"scan example.com for accessibility"

# Expected output: TTS speaks violation summary
```

## Usage

### Voice Commands

| Command | What It Does |
|---------|--------------|
| "scan [URL] for accessibility" | Scan a website for WCAG violations |
| "check [file] for WCAG violations" | Scan a local HTML file |
| "explain [violation-id]" | Get detailed explanation of a violation |
| "suggest fix for [violation-id]" | Generate AI fix suggestions |
| "list accessibility violations" | Show violations from last scan |
| "scan clipboard for accessibility" | Scan URL from clipboard |
| "scan [URL] and suggest fixes" | Multi-step: scan + generate fixes |

### Examples

#### Basic Scan

```
You: "Hey Anthony, scan example.com for accessibility"

Anthony: "Scanning example.com... Found 12 violations: 2 critical, 
          5 serious, 3 moderate, 2 minor."
```

#### Explain Violation

```
You: "Explain color-contrast"

Anthony: "Elements must meet minimum color contrast ratios. 
          Impact: serious. WCAG criterion 1.4.3. 
          Affects 8 elements."
```

#### Get Fix Suggestions

```
You: "Suggest fix for image-alt"

Anthony: "Generating fix suggestions with Claude AI... 
          Fix suggestions generated. See output for details."

[Terminal displays detailed code-level fixes]
```

#### Command Chaining

```
You: "Scan github.com and suggest fixes"

Anthony: [Scans page]
         "Found 5 violations: 1 serious, 4 moderate."
         [Generates AI fixes]
         "Fix suggestions generated."
```

#### Context-Aware Scanning

```
# Copy URL to clipboard first (Ctrl+C)

You: "Scan clipboard for accessibility"

Anthony: "Scanning https://example.com..."
```

## Integration Methods

This integration provides **two methods** for Anthony to call a11y-agent:

### 1. MCP Server (Recommended)

**Pros:**
- Standard protocol (JSON-RPC over stdio)
- Stateful (remembers last scan)
- Rich API (4 tools: scan, explain, fix, list)
- Language-agnostic

**Files:**
- `anthony-integration/a11y-mcp-server.js` — MCP server implementation
- `anthony-integration/a11y.py` — Anthony command module (uses MCP client)

**How it works:**
```python
# In commands/a11y.py
client = MCPClient(server_command=["node", "a11y-mcp-server.js"])
result = client.call_tool("scan_accessibility", {"target": "example.com"})
```

### 2. Shell Wrapper (Alternative)

**Pros:**
- Simple bash script
- No MCP protocol overhead
- Direct CLI invocation

**Cons:**
- Stateless (each call is independent)
- Limited API (no explain/list commands)

**Files:**
- `anthony-integration/a11y-tool.sh` — Standalone wrapper script

**How it works:**
```python
# In commands/a11y.py (alternative implementation)
import subprocess
result = subprocess.run(["a11y-tool.sh", "scan", "example.com"], capture_output=True)
```

## Available Tools (MCP API)

### `scan_accessibility`

Scan a URL or HTML file for WCAG violations.

**Input:**
```json
{
  "target": "https://example.com",
  "tags": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]
}
```

**Output:**
```json
{
  "target": "https://example.com",
  "violations": [...],
  "summary": {
    "critical": 2,
    "serious": 5,
    "moderate": 3,
    "minor": 2,
    "total": 12
  }
}
```

### `explain_violation`

Get detailed explanation of a specific violation.

**Input:**
```json
{
  "violation_id": "color-contrast"
}
```

**Output:**
```json
{
  "id": "color-contrast",
  "impact": "serious",
  "description": "...",
  "help": "Elements must meet minimum color contrast ratios",
  "wcagCriteria": ["wcag143"],
  "affectedElements": 8
}
```

### `get_fix_suggestion`

Generate AI-powered fix suggestions using Claude.

**Input:**
```json
{
  "violation_id": "image-alt"  // Optional: defaults to all violations
}
```

**Output:**
```json
{
  "target": "https://example.com",
  "violationId": "image-alt",
  "fixSuggestions": "## Fix: image-alt\n\n..."
}
```

### `list_violations`

List violations from the most recent scan.

**Input:**
```json
{
  "impact": "critical"  // Optional: filter by impact level
}
```

**Output:**
```json
{
  "target": "https://example.com",
  "total": 12,
  "violations": [...]
}
```

## Configuration

### Environment Variables

```bash
# A11Y Agent path (default: ~/dev/1-workspace/a11y-agent)
export A11Y_AGENT_PATH="/path/to/a11y-agent"

# Claude API key (required for fix suggestions)
export ANTHROPIC_API_KEY="sk-ant-..."

# Speech rate (words per minute, default: 175)
export A11Y_VOICE_RATE="175"
```

### Anthony Configuration

Edit `~/anthony/config/tool_schemas.py` to customize tool behavior:

```python
# Add a11y-agent to tool schemas
TOOL_SCHEMAS = {
    # ... existing tools ...

    "scan_accessibility": {
        "description": "Scan for WCAG accessibility violations",
        "parameters": {
            "type": "object",
            "properties": {
                "target": {"type": "string", "description": "URL or file path"},
            },
            "required": ["target"],
        },
    },
}
```

## Troubleshooting

### "MCP server not found"

**Problem:** Anthony can't find `a11y-mcp-server.js`

**Solution:**
```bash
# Verify file exists
ls ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js

# Update path in a11y.py if needed
vim ~/anthony/commands/a11y.py
# Change: A11Y_AGENT_PATH = os.path.expanduser("~/dev/1-workspace/a11y-agent")
```

### "No scan results available"

**Problem:** Trying to run `explain` or `get_fix` before scanning

**Solution:** Always run `scan_accessibility` first:
```
You: "scan example.com for accessibility"
You: "explain color-contrast"  # Now this works
```

### "Voice command not recognized"

**Problem:** Anthony doesn't understand your command

**Solution:**
1. Check command patterns in `a11y.py` (`@step` decorators)
2. Ensure command matches a registered pattern
3. Try rephrasing: "check X for violations" → "scan X for accessibility"

### "Fix suggestions failed"

**Problem:** Claude API key not configured

**Solution:**
```bash
# Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Add to shell profile
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
```

## Advanced Usage

### Custom Voicecommand Patterns

Add new patterns to `anthony-integration/a11y.py`:

```python
@step(
    "find accessibility issues in {target}",
    "test {target} for a11y",
    category="accessibility"
)
def custom_scan(target: str) -> str:
    return scan_accessibility(target)
```

### Context Passing

Access Anthony's context in command handlers:

```python
from tools.at_spi import get_focused_window

@step("scan current window", category="accessibility")
def scan_focused_window() -> str:
    window = get_focused_window()
    title = window.get_name()

    # Note: AT-SPI can't get browser URL from window title
    # Use clipboard workaround instead
    speak(f"Please copy the URL and say 'scan clipboard'")
    return "Awaiting clipboard URL..."
```

### Multi-Step Workflows

Create complex workflows with command chaining:

```python
@step(
    "scan {target} fix it and rescan",
    category="accessibility"
)
def scan_fix_rescan(target: str) -> str:
    # Step 1: Initial scan
    scan_accessibility(target)

    # Step 2: Generate fixes
    suggest_fix("all")

    # Step 3: Prompt user to apply fixes
    speak("Please apply the fixes and press Enter to rescan.")
    input()

    # Step 4: Rescan to verify
    speak("Rescanning to verify fixes...")
    return scan_accessibility(target)
```

## Integration with Other Anthony Tools

### Chain with Browser Control

```python
@step("open {url} and scan it", category="accessibility")
def open_and_scan(url: str) -> str:
    # Step 1: Open Firefox (uses Anthony's apps module)
    from commands import apps
    apps.open("firefox")

    # Step 2: Wait for browser to load
    import time
    time.sleep(3)

    # Step 3: Scan the URL
    return scan_accessibility(url)
```

### Chain with Screenshot

```python
@step("screenshot and scan it", category="accessibility")
def screenshot_and_scan() -> str:
    # Step 1: Take screenshot (uses Anthony's vision module)
    from commands import vision
    screenshot_path = vision.screenshot()

    # Step 2: Note: a11y-agent scans HTML, not images
    speak("Note: Screenshots cannot be scanned for accessibility.")
    speak("Please provide a URL or HTML file instead.")
    return "Screenshot saved but cannot be scanned."
```

## Next Steps

1. **Test voice commands** in your workflow
2. **Customize command patterns** for your phrasing style
3. **Integrate with browser automation** for seamless testing
4. **Add keyboard shortcuts** in Anthony for quick access

## Resources

- **A11Y Agent**: https://github.com/yourusername/a11y-agent
- **Anthony**: https://github.com/g0dd4rd/anthony
- **MCP Protocol**: https://modelcontextprotocol.io/
- **axe-core**: https://github.com/dequelabs/axe-core
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

## Contributing

Found a bug or want to add a feature?

1. Open an issue in the a11y-agent repository
2. Submit a PR with your changes
3. Add tests for new voice command patterns
4. Update this README with new usage examples

## License

MIT License - See main a11y-agent repository for details.

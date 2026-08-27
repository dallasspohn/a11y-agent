# A11Y Agent + Anthony Quick Reference

## Installation Checklist

```bash
# 1. Install a11y-agent
cd ~/dev/1-workspace/a11y-agent
npm install

# 2. Set Claude API key
export ANTHROPIC_API_KEY="sk-ant-..."
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc

# 3. Copy command module to Anthony
cp anthony-integration/a11y.py ~/anthony/commands/

# 4. Verify MCP server works
node anthony-integration/a11y-mcp-server.js
# Press Ctrl+C after it starts listening

# 5. Restart Anthony
pkill -f anthony
cd ~/anthony
python main.py
```

## Voice Commands

### Basic Scan
```
"scan [URL] for accessibility"
"check [URL] for WCAG violations"
"test [file] for accessibility"
```

**Examples:**
- "scan example.com for accessibility"
- "check localhost 8080 for WCAG violations"
- "test my-page.html for accessibility"

### Get Details
```
"explain [violation-id]"
"what is [violation-id]"
"tell me about [violation-id]"
```

**Examples:**
- "explain color-contrast"
- "what is image-alt"

### Generate Fixes
```
"suggest fix for [violation-id]"
"how to fix [violation-id]"
"fix [violation-id]"
```

**Examples:**
- "suggest fix for color-contrast"
- "how to fix image-alt"
- "fix all" (generates fixes for all violations)

### List Results
```
"list accessibility violations"
"show violations"
"what violations were found"
```

### Command Chaining
```
"scan [URL] and suggest fixes"
"check [URL] and show fixes"
```

### Clipboard Scanning
```
"scan clipboard for accessibility"
"check clipboard URL"
```

## MCP API Reference

### scan_accessibility
```json
{
  "method": "tools/call",
  "params": {
    "name": "scan_accessibility",
    "arguments": {
      "target": "https://example.com"
    }
  }
}
```

### explain_violation
```json
{
  "method": "tools/call",
  "params": {
    "name": "explain_violation",
    "arguments": {
      "violation_id": "color-contrast"
    }
  }
}
```

### get_fix_suggestion
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_fix_suggestion",
    "arguments": {
      "violation_id": "image-alt"
    }
  }
}
```

### list_violations
```json
{
  "method": "tools/call",
  "params": {
    "name": "list_violations",
    "arguments": {
      "impact": "critical"
    }
  }
}
```

## Common Violation IDs

| ID | Description | Impact |
|----|-------------|--------|
| `color-contrast` | Insufficient color contrast | Serious |
| `image-alt` | Images missing alt text | Critical/Serious |
| `html-has-lang` | Missing lang attribute | Serious |
| `label` | Form inputs missing labels | Critical/Serious |
| `button-name` | Buttons missing accessible names | Serious |
| `link-name` | Links missing discernible text | Serious |
| `aria-*` | Invalid ARIA attributes | Varies |
| `landmark-*` | Page structure issues | Moderate |
| `heading-order` | Heading hierarchy problems | Moderate |
| `duplicate-id` | Duplicate ID attributes | Minor |

## Troubleshooting

### "MCP server not found"
```bash
# Verify file exists
ls ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js

# Update path in ~/anthony/commands/a11y.py if needed
```

### "No scan results available"
```bash
# Always scan first before explain/fix
> "scan example.com for accessibility"
> "explain color-contrast"  # Now works
```

### "Fix suggestions failed"
```bash
# Set API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Voice not recognized
```bash
# Speak slowly with pauses
"Scan... example.com... for accessibility"

# Check recognized text in terminal
[You said: "scan example.com for accessibility"]
```

## File Locations

| File | Location |
|------|----------|
| MCP Server | `~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js` |
| Command Module | `~/anthony/commands/a11y.py` |
| Tool Schemas | `~/anthony/config/tool_schemas.py` (merge `tool_schemas.py`) |
| Shell Wrapper | `~/dev/1-workspace/a11y-agent/anthony-integration/a11y-tool.sh` |

## Environment Variables

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional
export A11Y_AGENT_PATH="~/dev/1-workspace/a11y-agent"  # Default
export A11Y_VOICE_RATE="175"  # Speech rate (WPM)
```

## Testing

### Test MCP Server
```bash
# Start server (should listen on stdin)
node ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js

# Send test message
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | \
  node ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js
```

### Test Voice Commands
```
User: "Hey Anthony, scan example.com for accessibility"
Expected: Violation summary spoken via TTS
```

### Test Shell Wrapper
```bash
~/dev/1-workspace/a11y-agent/anthony-integration/a11y-tool.sh scan https://example.com
```

## Performance

| Operation | Duration |
|-----------|----------|
| Basic scan | 2-3 sec |
| Complex scan | 5-8 sec |
| Explain violation | <1 sec |
| Generate fixes (all) | 10-15 sec |
| Generate fixes (one) | 5-8 sec |

## Resources

- **Full Documentation**: [README.md](README.md)
- **Demo Workflow**: [demo-workflow.md](demo-workflow.md)
- **A11Y Agent**: https://github.com/yourusername/a11y-agent
- **Anthony**: https://github.com/g0dd4rd/anthony
- **WCAG Reference**: https://www.w3.org/WAI/WCAG21/quickref/

## Quick Demo

```
1. "Hey Anthony"
2. "Scan example.com for accessibility"
3. "Explain color-contrast"
4. "Suggest fix for color-contrast"
5. "Done"
```

Expected: ~30 seconds, demonstrates full workflow

# A11Y Agent + Anthony Demo Workflow

End-to-end demonstration of voice-driven accessibility testing.

## Demo Scenario: Fixing Color Contrast Issues

This workflow demonstrates the complete cycle from initial scan to fix verification using only voice commands.

### Prerequisites

- Anthony running and listening
- a11y-agent installed with Anthony integration
- Test page: `http://localhost:8080/test.html` (with known violations)

---

## Part 1: Initial Discovery

### Command 1: Scan Test Page

```
User: "Hey Anthony"

Anthony: "Listening."

User: "Scan localhost 8080 slash test dot html for accessibility"

Anthony: [Scanning...]
         "Scanning http://localhost:8080/test.html... 
          Found 8 violations: 1 critical, 4 serious, 2 moderate, 1 minor."
```

**Terminal Output:**
```
======================================================
A11Y SCAN: http://localhost:8080/test.html
======================================================

Found 8 violations: 1 critical, 4 serious, 2 moderate, 1 minor

Top violations:
  [CRITICAL] color-contrast
    Elements must meet minimum color contrast ratios
    Affected: 5 element(s)

  [SERIOUS] image-alt
    Images must have alternate text
    Affected: 3 element(s)

  [SERIOUS] html-has-lang
    <html> element must have a lang attribute
    Affected: 1 element(s)

  [MODERATE] link-name
    Links must have discernible text
    Affected: 2 element(s)
```

---

## Part 2: Deep Dive into Critical Issue

### Command 2: Explain Critical Violation

```
User: "Explain color-contrast"

Anthony: "Elements must meet minimum color contrast ratios. 
          Impact: serious. 
          WCAG criterion 1.4.3. 
          Affects 5 elements."
```

**Terminal Output:**
```
======================================================
VIOLATION: color-contrast
======================================================

Elements must meet minimum color contrast ratios

Impact: serious
WCAG: wcag143, wcag2aa

Affects 5 element(s).

Examples:
  1. Target: .hero-text
     HTML: <p class="hero-text">Welcome to our site</p>
     Issue: Element has insufficient color contrast of 2.5:1 
            (foreground color: #999999, background color: #eeeeee, 
            expected contrast ratio: 4.5:1)

  2. Target: .secondary-btn
     HTML: <button class="secondary-btn">Learn More</button>
     Issue: Element has insufficient color contrast of 3.1:1
            (foreground color: #888888, background color: #dddddd,
            expected contrast ratio: 4.5:1)
```

---

## Part 3: Get AI Fix Suggestions

### Command 3: Generate Fixes

```
User: "Suggest fix for color-contrast"

Anthony: "Generating fix suggestions with Claude AI...
          Fix suggestions generated. See output for details."
```

**Terminal Output:**
```
======================================================
FIX SUGGESTIONS: color-contrast
======================================================

## Fix: Color Contrast (WCAG 2.1 Level AA)

### Why It Matters
Users with low vision, color blindness, or viewing content on low-quality 
displays need sufficient contrast between text and background colors to 
read content. WCAG 2.1 requires a minimum contrast ratio of:
- **4.5:1** for normal text
- **3:1** for large text (18pt+)

### Issue 1: Hero Text (contrast ratio: 2.5:1 ❌)

**Before:**
```css
.hero-text {
  color: #999999;          /* Light gray */
  background-color: #eeeeee; /* Very light gray */
}
```

**After:**
```css
.hero-text {
  color: #595959;          /* Darker gray - 4.6:1 ratio ✓ */
  background-color: #eeeeee; /* Unchanged */
}
```

**Alternative Fix (better for readability):**
```css
.hero-text {
  color: #333333;          /* Dark gray - 10.6:1 ratio ✓✓ */
  background-color: #ffffff; /* Pure white */
}
```

### Issue 2: Secondary Button (contrast ratio: 3.1:1 ❌)

**Before:**
```css
.secondary-btn {
  color: #888888;
  background-color: #dddddd;
}
```

**After:**
```css
.secondary-btn {
  color: #4a4a4a;          /* 4.5:1 ratio ✓ */
  background-color: #dddddd;
}
```

### Quick Fix: Use a Contrast Checker

Use these tools to validate your fixes:
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Chrome DevTools: Inspect > Color Picker > Contrast Ratio

### Validation

After applying fixes, rerun the scan:
```bash
node src/scan.js --url http://localhost:8080/test.html
```
```

---

## Part 4: Apply Fixes and Verify

### Command 4: Open File in Editor

*Note: This requires integration with Anthony's editor commands*

```
User: "Open test dot html in VS Code"

Anthony: "Opening test.html in VS Code."

[VS Code opens to test.html]
```

### Manual Step: Apply CSS Changes

User manually applies the fix suggestions to the CSS file.

### Command 5: Rescan to Verify

```
User: "Scan localhost 8080 slash test dot html for accessibility"

Anthony: [Scanning...]
         "Found 3 violations: 0 critical, 1 serious, 1 moderate, 1 minor."
```

**Terminal Output:**
```
======================================================
A11Y SCAN: http://localhost:8080/test.html
======================================================

Found 3 violations: 0 critical, 1 serious, 1 moderate, 1 minor

Top violations:
  [SERIOUS] image-alt
    Images must have alternate text
    Affected: 3 element(s)

  [MODERATE] link-name
    Links must have discernible text
    Affected: 2 element(s)

  [MINOR] landmark-one-main
    Document should have one main landmark
    Affected: 1 element(s)
```

**Success!** Color contrast violations are now fixed.

---

## Part 5: Command Chaining

### Command 6: One-Shot Scan + Fix

```
User: "Scan localhost 8080 slash test dot html and suggest fixes"

Anthony: [Scans page]
         "Found 3 violations: 0 critical, 1 serious, 1 moderate, 1 minor."
         [Generates AI fixes]
         "Fix suggestions generated. See output for details."

[Terminal displays combined scan + fix suggestions]
```

---

## Alternative Workflow: Clipboard-Based

### Setup

1. Navigate to the page in Firefox
2. Copy URL from address bar (Ctrl+L, Ctrl+C)

### Scan from Clipboard

```
User: "Scan clipboard for accessibility"

Anthony: "Scanning http://localhost:8080/test.html..."
         "Found 8 violations: 1 critical, 4 serious, 2 moderate, 1 minor."
```

---

## Advanced Workflow: Batch Testing

### Test Multiple Pages

```python
# Create custom command in anthony-integration/a11y.py

@step(
    "test all pages in {directory}",
    category="accessibility"
)
def batch_scan(directory: str) -> str:
    import os
    from pathlib import Path
    
    html_files = Path(directory).glob("**/*.html")
    results = []
    
    for file in html_files:
        speak(f"Scanning {file.name}")
        result = scan_accessibility(str(file))
        results.append((file.name, result))
    
    # Summary
    total_violations = sum(
        int(r.split("violations")[0].split()[-1]) 
        for _, r in results 
        if "violations" in r
    )
    
    speak(f"Batch scan complete. {total_violations} total violations across {len(results)} files.")
    return f"Tested {len(results)} files, {total_violations} violations"
```

**Usage:**
```
User: "Test all pages in /var/www/html"

Anthony: [Scans each HTML file]
         "Batch scan complete. 42 total violations across 12 files."
```

---

## Interactive Conversation Mode

### Enable Interactive Mode

```
User: "Check example.com for WCAG violations in interactive mode"

Anthony: [Scans page]
         "Found 5 violations. What would you like to do?
          - Say 'next' to review violations one by one
          - Say 'critical' to see critical issues only
          - Say 'fix all' to generate fix suggestions
          - Say 'done' to exit"

User: "Critical"

Anthony: "1 critical violation found: color-contrast. 
          Elements must meet minimum color contrast ratios.
          Affects 3 elements. What would you like to do?"

User: "Fix it"

Anthony: "Generating fix suggestions..."
         [Displays Claude's fix suggestions]
         "Fixes generated. Say 'next' to continue or 'done' to exit."

User: "Done"

Anthony: "Exiting accessibility review."
```

---

## Error Handling

### Invalid URL

```
User: "Scan not-a-real-url for accessibility"

Anthony: "Accessibility scan failed: Invalid URL 'not-a-real-url'"
```

### Missing API Key

```
User: "Suggest fix for color-contrast"

Anthony: "Fix suggestion failed: ANTHROPIC_API_KEY environment variable not set"
```

### No Prior Scan

```
User: "List accessibility violations"

Anthony: "List violations failed: No scan results available. 
          Run scan_accessibility first."
```

---

## Performance Benchmarks

Typical response times on test hardware (Fedora 44, Ryzen 9):

| Command | Duration |
|---------|----------|
| Basic scan (simple page) | 2-3 seconds |
| Basic scan (complex page) | 5-8 seconds |
| Explain violation | <1 second |
| Generate AI fixes (all violations) | 10-15 seconds |
| Generate AI fixes (single violation) | 5-8 seconds |
| List violations | <1 second |

---

## Tips for Effective Voice Control

### 1. Be Specific with URLs

**Good:**
- "Scan example dot com for accessibility"
- "Check localhost 8080 for WCAG violations"

**Avoid:**
- "Scan example.com" (period might be misheard)
- "Test the website" (too vague)

### 2. Use Natural Pauses

```
Good: "Scan... example.com... for accessibility"
      (Gives STT time to parse)

Avoid: "Scanexampledotcomforaccessibility"
       (Too fast, likely misrecognized)
```

### 3. Confirm Recognition

Anthony will display recognized text:
```
[You said: "scan example.com for accessibility"]
```

If misrecognized, say "cancel" and try again.

### 4. Chain Commands for Efficiency

**Instead of:**
```
User: "Scan example.com for accessibility"
[Wait for results]
User: "Suggest fix for color-contrast"
```

**Use:**
```
User: "Scan example.com and suggest fixes"
```

---

## Troubleshooting Commands

### Check MCP Server Status

```bash
# Verify MCP server can start
node ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js

# Should start listening on stdin (no errors)
# Press Ctrl+C to stop
```

### Test MCP Directly

```bash
# Send test message to MCP server
echo '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | \
  node ~/dev/1-workspace/a11y-agent/anthony-integration/a11y-mcp-server.js

# Expected output:
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}
```

### Test Voice Recognition

```
User: "Hey Anthony, repeat after me: scan example.com for accessibility"

Anthony: "scan example.com for accessibility"
```

If Anthony can't repeat it, the STT model may need retraining or the phrase is too complex.

---

## Next Steps

1. **Practice voice commands** with test pages
2. **Customize command patterns** in `a11y.py` to match your speech patterns
3. **Integrate with your workflow** (CI/CD, pre-commit hooks, etc.)
4. **Share feedback** on what works and what doesn't

---

## Full Demo Script (Copy-Paste)

For a quick demo, speak these commands in order:

```
1. "Hey Anthony"
2. "Scan example.com for accessibility"
3. "List accessibility violations"
4. "Explain color-contrast"
5. "Suggest fix for color-contrast"
6. "Done"
```

Expected duration: ~30 seconds

---

## Real-World Use Cases

### Use Case 1: Rapid Prototyping

Developer is building a new feature in VS Code:

```
[Writing HTML/CSS]
User: "Scan localhost for accessibility"
[Reviews violations]
User: "Fix color-contrast"
[Applies suggested fixes]
User: "Rescan"
[Confirms fixes work]
```

### Use Case 2: Accessibility Audit

Team lead reviewing a sprint's work:

```
User: "Test all pages in /var/www/sprint-23"
[Batch scan completes]
User: "Show critical violations only"
[Reviews critical issues]
User: "Generate report"
[Creates PDF of all violations]
```

### Use Case 3: Learn by Doing

New developer learning WCAG:

```
User: "Scan example.com for accessibility"
User: "Explain each violation"
[Iterates through violations]
User: "What is WCAG 1.4.3?"
[Anthony explains criterion]
User: "Show me an example fix"
[Reviews Claude's suggestions]
```

---

## Resources

- **WCAG Quick Reference**: https://www.w3.org/WAI/WCAG21/quickref/
- **axe-core Rules**: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- **Anthony Documentation**: https://github.com/g0dd4rd/anthony
- **A11Y Agent Guide**: ../README.md

# A11Y Agent - AI-Powered Accessibility Testing Prototype

> Working plan and commands: see `README.md`. This file is the original prototype notes.

**Project:** Red Hat Innovation Days 2026 Global AI Challenge  
**Challenge:** Accessibility in Software Development at Scale  
**Deadline:** September 15, 2026  
**Location:** `~/dev/1-workspace/a11y-agent/`

---

## Overview

A11Y Agent is an AI-enhanced accessibility testing tool that combines **axe-core** (industry-standard automated testing) with **Claude AI** to provide:

1. **Automated Detection** — axe-core catches ~50-60% of WCAG violations automatically
2. **AI-Powered Fix Suggestions** — Claude analyzes violations in context and provides specific, copy-pasteable code fixes
3. **Developer Education** — Explanations of WHY violations matter and their impact on users with disabilities

**Innovation Angle:** Most accessibility tools stop at detection. A11Y Agent bridges the gap between "what's broken" and "how to fix it" using AI to understand context and generate actionable solutions.

---

## Installation

```bash
cd ~/dev/1-workspace/a11y-agent
npm install
```

**Dependencies:**
- `playwright` — Headless browser automation
- `@axe-core/playwright` — Accessibility testing engine
- `@anthropic-ai/sdk` — Claude AI integration
- `commander` — CLI argument parsing
- `chalk` — Terminal color output

**Environment:**
Requires `ANTHROPIC_API_KEY` environment variable for AI fix suggestions.

---

## Usage

### Basic Scan (Detection Only)

```bash
# Scan a live URL
node src/scan.js --url https://example.com

# Scan a local HTML file
node src/scan.js --file samples/bad-page.html

# Using npm scripts
npm run scan -- --file samples/bad-page.html
npm run demo  # Preconfigured for localhost:8080
```

### AI-Enhanced Scan (Detection + Fix Suggestions)

```bash
node src/scan.js --file samples/bad-page.html --fix
```

This will:
1. Run axe-core analysis
2. Display violations with impact levels (critical → minor)
3. Send violations + source HTML to Claude
4. Display AI-generated fix suggestions with before/after code

### JSON Output (for CI/CD)

```bash
node src/scan.js --url https://example.com --json > report.json
```

---

## How It Works

### Architecture

```
┌─────────────┐
│   CLI       │  commander parses args (--url, --file, --fix, --json)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Playwright │  Launches headless Chromium
│   Browser   │  Navigates to URL or file://path
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  axe-core   │  Analyzes page against WCAG 2.0/2.1 A/AA + best practices
│   Scanner   │  Returns violations array with impact, help, nodes, HTML snippets
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Display   │  Colorized terminal output (critical=red, serious=orange, etc.)
│   Results   │  Shows violation ID, help text, affected elements, summary counts
└──────┬──────┘
       │
       ▼ (if --fix)
┌─────────────┐
│   Claude    │  Receives: violations JSON + full source HTML
│     AI      │  Analyzes context and generates:
│             │  - WHY it matters (user impact)
│             │  - EXACT code fix (before → after)
│             │  - WCAG criterion addressed
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Display   │  Markdown-formatted fix suggestions
│    Fixes    │  Copy-pasteable code examples
└─────────────┘
```

### Key Code Flow

1. **scanPage()** (src/scan.js:37-59)
   - Launches browser
   - Navigates to target
   - Runs AxeBuilder with WCAG tags
   - Captures page HTML
   - Returns {results, html}

2. **printResults()** (src/scan.js:61-102)
   - Sorts violations by impact (critical first)
   - Colorizes output using chalk
   - Shows target selectors + HTML snippets
   - Displays summary counts

3. **getFixSuggestions()** (src/scan.js:104-146)
   - Builds violation summary (strips verbose data)
   - Sends to Claude Sonnet 4 with structured prompt
   - Prompt asks for: WHY, EXACT FIX, WCAG mapping
   - Returns AI-generated markdown text

4. **main()** (src/scan.js:148-166)
   - Orchestrates the flow
   - Handles --json vs. human-readable output
   - Conditionally calls getFixSuggestions if --fix

---

## Current Features

✅ **Multi-source scanning** — URLs or local HTML files  
✅ **WCAG 2.0/2.1 Level A/AA coverage** — Industry standard compliance  
✅ **Impact-based prioritization** — Critical → Serious → Moderate → Minor  
✅ **Colorized terminal output** — Easy visual parsing of severity  
✅ **HTML snippet extraction** — See exactly which elements are affected  
✅ **AI context-aware fixes** — Claude analyzes full page context, not just isolated violations  
✅ **Developer education** — Explanations tie violations to real user impact  
✅ **JSON export** — Machine-readable for CI/CD integration  

---

## Sample Test Page

`samples/bad-page.html` contains intentional violations:

1. **Missing `lang` attribute** on `<html>` — Screen reader language detection
2. **Skipped heading levels** — h3 without h1/h2 breaks document outline
3. **Low contrast text** — `.low-contrast` fails WCAG contrast ratios
4. **Images without alt text** — `<img>` with no alt blocks screen readers
5. **Form inputs without labels** — `<input>` and `<select>` lack associated `<label>`
6. **Icon-only links** — `<a>` with emoji/image but no accessible name
7. **Table without headers** — `<table>` uses `<td>` instead of `<th>`
8. **Non-interactive click handlers** — `<div onclick>` instead of `<button>`
9. **Auto-playing video** — `<video autoplay>` with no pause control

**Expected violations:** 9+ (some rules catch multiple instances)

---

## Innovation Days Submission Angle

### The Problem
- Automated tools (axe-core, Lighthouse) catch 50-60% of WCAG issues
- Manual testing is expensive and requires specialized expertise
- Developers often don't understand WHY violations matter or HOW to fix them
- Fixing accessibility post-development is 10x more costly than building it in

### Our Solution
- **Detection:** axe-core provides reliable, fast automated detection
- **Understanding:** AI explains user impact (e.g., "Screen reader users can't navigate past this section")
- **Action:** AI generates exact code fixes by analyzing the full page context
- **Scale:** Can be integrated into CI/CD pipelines for continuous compliance

### Differentiation
- Not just another scanner — we close the loop from detection → education → fix
- AI understands context (e.g., fixes preserve existing CSS classes, respect framework patterns)
- Developer-friendly UX (CLI, colorized output, copy-paste fixes)
- Extensible architecture (can add more AI capabilities later)

### Judging Criteria Alignment

**Innovation:** First tool to combine axe-core with LLM for contextual fix generation  
**Feasibility:** Built on proven open-source tools (axe-core, Playwright), scales via CI/CD  
**User Experience:** Developers get actionable fixes in seconds, not documentation links  
**Technical Excellence:** Clean architecture, pragmatic AI use (not AI for AI's sake)  

---

## Future Enhancements (Post-MVP)

### High Priority
- [ ] **Batch scanning** — Scan entire site maps or multiple URLs
- [ ] **Fix validation** — Re-scan after applying fixes to verify resolution
- [ ] **Interactive mode** — Apply fixes directly to files with user approval
- [ ] **HTML/PDF reports** — Shareable compliance reports for stakeholders
- [ ] **CI/CD integration** — GitHub Actions, GitLab CI examples

### Medium Priority
- [ ] **Framework awareness** — Detect React/Vue/Angular and suggest component-level fixes
- [ ] **Custom rule sets** — User-defined accessibility policies beyond WCAG
- [ ] **Historical tracking** — Track violations over time, show trends
- [ ] **Screenshot annotations** — Visual markup of violation locations
- [ ] **Slack/email notifications** — Alert teams when new violations are introduced

### Ambitious (Stretch Goals)
- [ ] **Browser extension** — Real-time scanning while browsing
- [ ] **Web dashboard** — Team-wide visibility into accessibility debt
- [ ] **Auto-fix PR generation** — AI creates PRs with fixes for approval
- [ ] **Manual test guidance** — AI suggests manual tests for the 40-50% axe-core can't catch
- [ ] **Training mode** — Gamified learning for developers new to accessibility

---

## Technical Notes

### Why Playwright vs. Puppeteer?
- Better multi-browser support (Chromium, Firefox, WebKit)
- Cleaner async API
- Better maintained axe-core integration (@axe-core/playwright)

### Why Claude Sonnet 4?
- Excellent at code generation (better than GPT-4 for exact syntax)
- Strong instruction following (follows "EXACT fix" prompt reliably)
- Good WCAG knowledge from training data
- Fast enough for interactive use (~2-5 sec response time)

### Why Not Fine-Tune a Model?
- axe-core already has excellent violation descriptions
- WCAG guidelines are well-documented and stable
- LLM general knowledge is sufficient — no need for domain-specific fine-tuning
- Fine-tuning would add complexity and maintenance burden

### AI Prompt Engineering Notes

Current prompt (src/scan.js:124-141) works well but could be improved:

**What works:**
- "Be concise and practical" → Reduces verbose explanations
- "Copy-paste your fixes" → Encourages exact code examples
- Structured format (WHY/EXACT FIX/WCAG) → Consistent output

**Potential improvements:**
- Add few-shot examples for complex violations (e.g., ARIA patterns)
- Request diff format (`- old / + new`) for clarity
- Ask for multiple fix approaches when trade-offs exist
- Include severity filtering ("focus on critical/serious only")

---

## Testing the Prototype

### Quick Test
```bash
cd ~/dev/1-workspace/a11y-agent
node src/scan.js --file samples/bad-page.html
```

**Expected output:**
- Multiple violations detected (9+)
- Color-coded by severity
- Summary counts at bottom

### Full Test (with AI)
```bash
export ANTHROPIC_API_KEY="your-key-here"  # If not already set
node src/scan.js --file samples/bad-page.html --fix
```

**Expected output:**
- All of the above, plus:
- "Generating AI fix suggestions..." message
- Detailed fix suggestions with code examples
- Explanations of user impact

### Test Against Real Sites
```bash
# Test against Red Hat's site
node src/scan.js --url https://www.redhat.com

# Test against PatternFly (should be very accessible)
node src/scan.js --url https://www.patternfly.org

# Test against a known-bad example
node src/scan.js --url https://www.ling.upenn.edu/~beatrice/humor/web-accessibility.html
```

---

## Demo Script (for Innovation Days)

### 1. Show the Problem (30 sec)
"Most accessibility tools tell you WHAT'S broken, but not HOW to fix it. Developers waste time googling WCAG docs and Stack Overflow."

[Show standard axe-core output — violations with links]

### 2. Show Our Solution (60 sec)
"A11Y Agent uses AI to give you the fix directly."

[Run: `node src/scan.js --file samples/bad-page.html --fix`]

"Notice:
- **Detection** — Same reliable axe-core engine Red Hat already trusts
- **Education** — AI explains WHY it matters (e.g., screen reader users can't...)
- **Action** — Exact code fix, copy-paste ready"

### 3. Show Before/After (30 sec)
[Have a fixed version of bad-page.html ready]

"After applying the fixes..."
[Run scan on fixed version — show 0 violations or minimal violations]

### 4. Scale Story (30 sec)
"This works on:
- Local files during development
- Live sites in staging
- CI/CD pipelines (--json output)
- Entire sitemaps (future: batch mode)"

### 5. The Ask (15 sec)
"We're making accessibility fixes as easy as running a linter. Imagine every developer having an accessibility expert in their terminal."

**Total: ~2.5 minutes**

---

## Submission Checklist

- [ ] **Video demo** (required) — 2-3 minute walkthrough
- [ ] **Code repository** — GitHub with clear README
- [ ] **Architecture diagram** — Visual explanation of components
- [ ] **Usage examples** — Screenshots/GIFs of CLI in action
- [ ] **Impact statement** — How this scales accessibility at Red Hat
- [ ] **Team roster** — 3-10 people (who else is on the team?)
- [ ] **Test against Red Hat properties** — Show real-world applicability
- [ ] **Comparison to existing tools** — axe DevTools, Lighthouse, Wave
- [ ] **Roadmap slide** — What's next if we win funding/resources

---

## Questions to Answer Before Submission

1. **Who is the target user?**
   - Primary: Red Hat developers (Ansible, OpenShift, RHEL docs, PatternFly)
   - Secondary: QE teams, accessibility SMEs, product managers

2. **What problem does this solve that existing tools don't?**
   - Existing: Detection only (axe, Lighthouse) or expensive manual audits
   - Ours: Detection + contextual fixes + education in one tool

3. **How does this scale across Red Hat?**
   - CLI: Developers run locally during development
   - CI/CD: Automated checks on every PR
   - Dashboard (future): Leadership visibility into accessibility debt

4. **What's the maintenance burden?**
   - Low: Built on stable open-source (axe-core, Playwright)
   - AI model: Cloud API (Anthropic), no model hosting needed
   - Updates: Mainly prompt tuning as WCAG evolves

5. **How do we measure success?**
   - Reduction in accessibility bugs found in production
   - Increase in accessibility compliance scores (Lighthouse, axe)
   - Developer survey: "Did this help you fix violations faster?"
   - Time-to-fix metrics: Before (hours/days) vs. After (minutes)

---

## Related Resources

- **axe-core docs:** https://github.com/dequelabs/axe-core
- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **Red Hat accessibility policy:** (internal link needed)
- **PatternFly accessibility:** https://www.patternfly.org/accessibility/
- **Innovation Days portal:** (submission link needed)

---

## Contact

**Lead:** Dallas Spohn (PTL Team)  
**Project repo:** `~/dev/1-workspace/a11y-agent/`  
**Status:** Prototype functional, ready for demo iteration  
**Next steps:** Refine AI prompts, add batch scanning, record demo video

# Vale Integration for AsciiDoc Files

**Added:** 2026-09-01  
**Purpose:** Extend a11y-agent to lint Red Hat Training content (.adoc files)

---

## Quick Start

```bash
# Lint a single .adoc file
node src/lint-adoc.js --file samples/bad-lecture.adoc

# Lint with AI fix suggestions
node src/lint-adoc.js --file samples/bad-lecture.adoc --fix

# Lint entire directory
node src/lint-adoc.js --dir content/

# Fail on warnings or higher (for CI/CD)
node src/lint-adoc.js --file lecture.adoc --fail-on warning

# Using npm scripts
npm run lint:adoc -- --file samples/bad-lecture.adoc
npm run demo:lint-adoc
```

---

## How It Works

### 1. Uses Your Existing Vale Config
- Reads `~/.vale.ini` by default
- Uses your Red Hat style guides (rht, redhat, Microsoft, Google)
- Respects your IgnoredClasses and TokenIgnores
- Can override with `--config` flag

### 2. Vale Severity Mapping
```
vale error     → serious  (red)
vale warning   → moderate (yellow)
vale suggestion → minor    (dim)
```

### 3. Integrates with Pipeline
- Same `--fail-on` threshold as lint.js
- Same `--fix` AI suggestions
- Same report format as HTML linting
- Works with watch.js (coming soon)

---

## Common Vale Rules Caught

From your `~/.vale.ini` config:

### Red Hat Styles
- **redhat.contractions** — Don't use "you'll", "we'll", etc.
- **redhat.politeness** — Avoid "please"
- **rht.master-slave-errors** — Use inclusive language
- **rht.spelling** — Spelling errors (currently disabled in your config)

### Microsoft & Google Styles
- Passive voice warnings
- Word choice recommendations
- Capitalization rules

---

## Example Output

```bash
$ node src/lint-adoc.js --file samples/bad-lecture.adoc

Linting samples/bad-lecture.adoc with vale...

A11Y AGENT SCAN RESULTS

14 violations found

!  [SERIOUS] redhat.contractions
   Remove contraction 'you'll'.
   target: samples/bad-lecture.adoc
   html:   you'll

!  [SERIOUS] rht.master-slave-errors
   Consider 'primary' or 'controller' instead of 'master'.
   target: samples/bad-lecture.adoc
   html:   master

Summary:
0 critical  7 serious 5 moderate 2 minor
```

---

## Use Cases

### 1. Linting AU457 Lectures
```bash
# Lint a single lecture
node src/lint-adoc.js --file ~/courses/au457/content/01/lecture.adoc

# Lint entire chapter
node src/lint-adoc.js --dir ~/courses/au457/content/01/

# Fail on serious issues (for pre-commit hook)
node src/lint-adoc.js --file lecture.adoc --fail-on serious
```

### 2. Pre-commit Hook for .adoc Files
Update `scripts/pre-commit`:
```bash
#!/bin/bash
# Check both HTML and AsciiDoc files

# HTML violations
node src/lint.js --file *.html --fail-on serious || exit 1

# AsciiDoc violations
node src/lint-adoc.js --file *.adoc --fail-on warning || exit 1
```

### 3. CI/CD for Course Repos
Add to `.github/workflows/a11y.yml`:
```yaml
- name: Lint AsciiDoc files
  run: node src/lint-adoc.js --dir content/ --fail-on warning
```

### 4. AI-Powered Fix Suggestions
```bash
$ node src/lint-adoc.js --file lecture.adoc --fix

Linting lecture.adoc with vale...

14 violations found
[... violations listed ...]

Generating AI fix suggestions for vale violations...

=== Fix Suggestions ===

1. redhat.contractions (Line 5)
   WHY: Contractions make technical writing less formal and harder to translate.
   
   BEFORE:
   In this lecture you'll learn about Kubernetes.
   
   AFTER:
   In this lecture you will learn about Kubernetes.
   
   WCAG: N/A (style guide compliance)

2. rht.master-slave-errors (Line 27)
   WHY: Inclusive language improves accessibility and professionalism.
   
   BEFORE:
   Kubernetes uses a master-slave architecture.
   
   AFTER:
   Kubernetes uses a primary-secondary architecture.
   
   WCAG: N/A (inclusive language)
```

---

## Integration with Watch.js (Future)

```bash
# Watch .adoc files and auto-lint on save
node src/watch.js --dir content/ --format adoc

# Save lecture.adoc → automatically runs vale → shows violations
```

---

## Differences from HTML Linting

| Feature | HTML (lint.js) | AsciiDoc (lint-adoc.js) |
|---------|---------------|-------------------------|
| **Engine** | Custom static rules | Vale CLI |
| **Speed** | ~100ms | ~200-500ms |
| **Rules** | axe-core accessibility | Red Hat style guides |
| **Config** | Built-in | ~/.vale.ini |
| **Offline** | Yes | Yes |
| **AI Fixes** | Yes | Yes |

---

## Troubleshooting

### "vale: command not found"
```bash
# Install vale
go install github.com/errata-ai/vale/v3@latest

# Or download binary from https://vale.sh
```

### "No vale config found"
Vale looks for `.vale.ini` in:
1. Current directory
2. Home directory (`~/.vale.ini`)
3. Custom path with `--config`

Your config is at: `/home/dspohn/.vale.ini` ✅

### "No violations found but I see issues"
Check which rules are enabled in your `.vale.ini`:
```ini
[*.adoc]
BasedOnStyles = rht,redhat,Microsoft,Google

# Some rules disabled:
rht.spelling = NO
rht.oxford-comma = NO
```

---

## Next Steps

- [ ] Add .adoc support to watch.js
- [ ] Create pre-commit hook for .adoc files
- [ ] Test on real AU457 content
- [ ] Benchmark dataset for vale rules
- [ ] Voice output for vale violations (James persona for content reviews)

---

## File Structure

```
a11y-agent/
├── src/
│   ├── lint.js          ← HTML linting (static rules)
│   ├── lint-adoc.js     ← AsciiDoc linting (vale) ✨ NEW
│   ├── scan.js          ← HTML scanning (axe-core)
│   └── lib/
│       ├── ai-fixes.js  ← Works with both HTML & AsciiDoc
│       └── report.js    ← Works with both
└── samples/
    ├── bad-page.html    ← 11 HTML violations
    └── bad-lecture.adoc ← 14 vale violations ✨ NEW
```

---

## Why This Matters

**Meeting Decision (Aug 27):** Expand document scope to include AsciiDoc

**Use Case:** Red Hat Training content (AU457 courses) written in AsciiDoc needs:
- Real-time style guide checking
- AI-powered fix suggestions
- Pre-commit validation
- CI/CD integration

**Result:** Same pipeline for HTML accessibility AND AsciiDoc style compliance!

---

## Demo Integration

**Priya's workflow now includes:**
1. Write HTML → lint.js catches accessibility issues
2. Write AsciiDoc lecture → lint-adoc.js catches style issues
3. Both use same --fix AI suggestions
4. Both block commits via pre-commit hook
5. Both run in CI/CD pipeline

**Complete shift-left coverage for Red Hat Training content!**

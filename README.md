# A11Y Agent — Shift-Left Accessibility

**Red Hat Innovation Days 2026 — Challenge 4: Accessibility in Software Development at Scale**

> *"We built an accessibility testing tool — and then made it accessible."*

![A11Y Agent — Priya and James personas](docs/images/a11y-personas.jpg)

---

## The Problem

Accessibility is checked **too late** — after code ships, after the PR merges, after the damage is done. And the irony: most accessibility checkers aren't accessible themselves. A visually impaired developer can't open browser DevTools, run axe, and read the results.

## The Solution: Two Personas, One Tool

**A11Y Agent** catches WCAG violations at every stage of development — **while you write code**, not after — and makes the tool itself fully accessible via voice.

### 👩‍💻 Priya — sighted engineer writing HTML

She wants real-time feedback: *"Tell me what's wrong the moment I save the file, and show me how to fix it."*

### 🎤 James — visually impaired developer testing a product interface

He can't read a terminal. He needs to **hear** violations and **speak** commands: *"Scan the bad page. Fix all critical issues."*

**James needs zero sighted assistance.** The entire flow is hands-free.

---

## Pipeline

![A11Y Agent Pipeline — Priya's shift-left gates and James's voice conversation](docs/images/a11y-pipeline.jpg)

**Key design principle:** Detection is deterministic (axe-core + static rules). AI only explains and suggests fixes — it never detects. Applied fixes are validated against the real source and verified by a re-scan.

## Features

- 🔍 **Automated Detection** — Industry-standard WCAG 2.0/2.1 A/AA violation detection via axe-core
- 🤖 **AI-Powered Fixes** — Context-aware, copy-pasteable code fixes using local or cloud models
- 🎯 **Cherry-Picked Auto-Fix** — *"fix all critical"* / *"fix issue one and three"* → validated edits written to disk
- ✅ **Verified Results** — Every applied fix is proven by a re-scan, not asserted
- 📚 **Developer Education** — Explanations of WHY violations matter and their impact on users with disabilities
- 🎤 **Voice I/O** — Neural TTS output and offline STT input for visually impaired developers
- 👁️ **Real-time Feedback** — File watcher auto-lints on save with instant visual feedback
- 🚫 **Git Integration** — Pre-commit hooks and CI/CD gates prevent regressions
- 🦙 **Local Models** — Ollama by default (Llama 3.1, Qwen, etc.) — no API key, no token cost

## Quick Start

### For James (Voice Workflow)

```bash
# One-time voice setup
./setup-voice.sh          # Downloads Vosk model (~50MB)

# The full loop — resets the demo fixture, then starts listening
npm run demo:agent

# Same flow over the keyboard (no microphone needed)
npm run agent:text
```

**What happens:**

```
  A11Y AGENT
  Agent at the ready.

  What should I scan? > scan bad page

  ISSUES FOUND
  [1]  critical  Images must have alternative text          (image-alt, 2 elements)
  [2]  critical  Select element must have an accessible name (select-name, 1 element)
  [3]  serious   Elements must meet minimum color contrast   (color-contrast, 1 element)
  ...

  What should I fix? > fix issue one

  [1] image-alt
      why:  Images without alt text can't be described by screen readers.
      wcag: 1.1.1 Non-text Content
      - <img src="logo.png">
      + <img src="logo.png" alt="Company Logo">

  Apply them? > yes

  Applied 2 edits to samples/bad-page.html
  Backup: samples/bad-page.html.bak

  Re-scanning to verify...
  1 of 1 selected issue resolved. 1 more issue resolved as a knock-on
  effect. 7 violations remain.
```

**Selection grammar** — number words and digits both work, since STT never emits digits:

| Say | Meaning |
| --- | --- |
| `fix all critical` | every critical violation |
| `fix critical and serious` | two severity bands |
| `fix issue one and three` | specific issues |
| `fix issues one through four` | a range |
| `fix the first three` | first N in the list |
| `fix everything` | all of them |
| `done` / `quit` / `stop` | exit the loop |

### For Priya (Visual Workflow)

**In the editor** — violations as squiggles while you type, no terminal:

> Open this repo in VS Code and press **F5**, then pick *Run A11Y Agent
> extension*. It builds on the way up and opens a second window with
> `samples/bad-page.html` already squiggled.

See [vscode-extension/README.md](vscode-extension/README.md) for the CLI
equivalent and settings. It runs the static rules only — contrast and focus
order need a rendered page, so those stay with `scan.js`.

**In a terminal:**

```bash
# Install dependencies
npm install

# Start the file watcher (auto-lint on save)
node src/watch.js --dir samples/

# In another terminal, edit samples/bad-page.html
# Save the file → violations appear instantly in the watcher terminal

# Get AI fix suggestions (uses Ollama by default, free & local)
node src/lint.js --file samples/bad-page.html --fix

# Install pre-commit hook (blocks bad commits)
npm run install-hooks
```

### Universal Commands (Both Workflows)

```bash
# Scan a local HTML file
node src/scan.js --file samples/bad-page.html

# Scan a live URL
node src/scan.js --url https://example.com

# Get AI fix suggestions
node src/scan.js --file samples/bad-page.html --fix

# JSON output (for CI/CD) — clean stdout, progress goes to stderr
node src/scan.js --url https://example.com --json > report.json

# Slow site? Navigation timeout defaults to 60s
node src/scan.js --url https://redhat.com --timeout 90000

# Use a different AI model
A11Y_AI_MODEL=llama3.1:70b node src/scan.js --file samples/bad-page.html --fix
```

## Configuration

### AI provider

The CLI talks to **any OpenAI-compatible endpoint** and defaults to a local Ollama. No API key needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `A11Y_AI_URL` | `http://localhost:11434/v1` | Endpoint |
| `A11Y_AI_MODEL` | `llama3.1` | Model name |
| `A11Y_AI_KEY` | `ollama` | API key (if needed) |

### Voice

See [docs/voice.md](docs/voice.md) for full voice setup, mic config, and troubleshooting. Key defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `A11Y_VOICE_ENGINE` | `edge` | `edge` (neural) · `piper` · `espeak` (offline fallback) |
| `A11Y_VOICE_NAME` | `en-US-GuyNeural` | edge-tts voice |

Edge TTS falls back to espeak-ng automatically if the network is unavailable.

## Supported Inputs

- ✅ HTML files (web UIs)
- ✅ Live URLs (production sites)
- 🚧 React/JSX components (planned)

## Benchmark Results

Evaluated against 24 test pages including the [W3C WAI Before/After Demo](https://www.w3.org/WAI/demos/bad/) (gold-standard external dataset):

| Metric | Score |
| --- | --- |
| True Positive Rate (rule recall) | **100%** |
| False Positive Rate (clean pages) | **0%** |

```bash
node evaluation/run-eval.js    # run the benchmark
```

See [evaluation/README.md](evaluation/README.md) for details.

## Test It Out

`samples/bad-page.html` produces exactly **9 axe violations** —
2 critical, 3 serious, 4 moderate:

| # | Impact | Rule |
| --- | --- | --- |
| 1 | critical | `image-alt` — images without alternative text (2 elements) |
| 2 | critical | `select-name` — select with no accessible name |
| 3 | serious | `color-contrast` — text below the contrast threshold |
| 4 | serious | `html-has-lang` — missing `lang` attribute |
| 5 | serious | `link-name` — icon-only link with no discernible text |
| 6 | moderate | `heading-order` — skipped heading levels |
| 7 | moderate | `landmark-one-main` — no main landmark |
| 8 | moderate | `page-has-heading-one` — no `<h1>` |
| 9 | moderate | `region` — content outside landmarks (10 elements) |

```bash
npm run demo          # scan and print
npm run demo:lint     # static lint only, no browser
npm run demo:agent    # reset fixture + full voice loop
npm test              # 18 unit tests + a clean-page regression check
```

> ⚠️ **`npm run demo:reset` before every rehearsal.** Auto-apply edits the real
> `samples/bad-page.html`, so one practice run consumes the fixture and
> `tests/lint-html.test.js` starts failing. `npm run demo:agent` does the reset
> for you.

## Key Dependencies

| Layer | Packages |
| --- | --- |
| Detection | `playwright`, `@axe-core/playwright` |
| AI fixes | `openai` (compatible with Ollama, OpenAI, Groq, vLLM) |
| Voice | `edge-tts` (pip), `vosk`, `mic` (optional) |
| Automation | `chokidar`, Git hooks, GitHub Actions |

## Project Status

✅ Voice triage loop with cherry-picked auto-fix (`agent.js`)  
✅ Edge TTS neural voice with espeak fallback  
✅ Vosk STT offline speech recognition  
✅ Static HTML linter + axe-core browser scanner  
✅ Model-agnostic AI fixes (Ollama by default)  
✅ File watcher, pre-commit hook, GitHub Actions CI  
✅ Benchmark evaluation (24 pages, 100% TPR, 0% FPR)  
✅ Architecture diagrams  
🔄 VS Code extension — live diagnostics on save ([PR #9](https://github.com/dallasspohn/a11y-agent/pull/9))

### Roadmap
- Batch scanning (multiple URLs / sitemaps)
- HTML/PDF report generation
- JSX/Vue component linting
- Wake word support ("hey a11y")

## Known Issues

- **Auto-fix quality varies by rule.** `image-alt` and `html-has-lang` are reliable. Structural rules can produce imperfect edits on small local models — review the diff, and prefer a larger model for structural fixes. `.bak` backup is always created.
- **Fix generation is slow locally** — ~30s per violation on `llama3.1`. Select one or two issues during a live demo.
- **Auto-apply only works on local files**, not URLs.

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Red Hat, Inc.

Third-party content redistributed here is listed in [NOTICE](NOTICE); the one
item is the W3C WAI Before/After Demonstration under `evaluation/pages/w3c-bad/`.

## References

- [docs/voice.md](docs/voice.md) — Voice setup, mic config, troubleshooting
- [evaluation/README.md](evaluation/README.md) — Benchmark dataset and results
- [anthony-integration/](anthony-integration/) — GNOME voice desktop (design sketch, not wired up)

## Team

**Team:** Shift Left A11y  
**Leads:** Dallas Spohn (PTL Team), Surya Pathak  
**Looking for:** 3rd team member (deadline Sept 15)

**Red Hat Innovation Days 2026 Global AI Challenge**  
**Challenge 4:** Accessibility in Software Development at Scale

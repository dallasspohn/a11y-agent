# A11Y Agent — Shift-Left Accessibility

**Red Hat Innovation Days 2026 — Challenge 4: Accessibility in Software Development at Scale**

> *"We built an accessibility testing tool — and then made it accessible."*

![A11Y Agent — Priya and James personas](docs/images/a11y-personas.jpg)

---

## The Problem

Accessibility is checked **too late** — after code ships, after the damage is done. And most accessibility tools aren't accessible themselves — a developer who is blind can't open DevTools and read the results.

## The Solution

**A11Y Agent** catches WCAG violations **while you code** and makes the tool itself fully usable via voice.

| | Priya — sighted engineer | James — developer who is blind |
|---|---|---|
| **Wants** | Real-time feedback as she writes HTML | Scan and fix a page without sighted help |
| **Uses** | Terminal, editor, VS Code squiggles | Voice commands, spoken results |
| **Flow** | Save → lint → commit gate → PR gate | Speak → scan → hear → fix → verify |

---

## Pipeline

![A11Y Agent Pipeline](docs/images/a11y-pipeline.jpg)

**Design principle:** Detection is deterministic (axe-core + static rules). AI only suggests fixes — it never decides what's broken. Every fix is verified by a re-scan.

---

## Features

### Detection

- **Static HTML linter** — 12 rules, ~100ms, no browser needed. Catches missing alt, missing lang, heading order, form labels, keyboard traps, table headers.
- **axe-core browser scanner** — Industry-standard WCAG 2.0/2.1 A/AA engine via headless Chromium. Catches color contrast, computed roles, focus order.
- **Local files and live URLs** — scan `samples/bad-page.html` or `https://redhat.com`.

### AI-Powered Fixes

- **Model-agnostic** — works with any OpenAI-compatible API. Ollama (free, local) by default. Also works with OpenAI, Groq, or any compatible endpoint.
- **Concrete edits** — not vague advice. Each fix shows a before/after code snippet you can copy-paste.
- **Validated** — every edit's `before` string must exist verbatim in the source. No hallucinated patches.
- **Verified** — a re-scan after applying proves the fix worked.

### Voice Workflow (James)

- **Voice triage loop** — speak commands, hear violations, select fixes by number or severity.
- **Natural grammar** — *"fix all critical"*, *"fix issue one and three"*, *"fix the first three"*.
- **Neural TTS** — Edge TTS for natural voice, espeak-ng offline fallback.
- **Offline STT** — Vosk speech recognition. No audio leaves the machine.

### Editor Integration

- **VS Code extension** — violations as squiggly underlines while you type. Install from `.vsix` or launch with F5. See [vscode-extension/](vscode-extension/).
- **File watcher** — auto-lint on save, instant feedback in the terminal.

### Browser Extension

- **Chrome extension** — auto-fixes WCAG violations on any page as it loads. No commands, no scanning — fixes happen at parse time. See [a11y-agent-chrome-plugin](https://github.com/dallasspohn/a11y-agent-chrome-plugin).

### Shift-Left Gates

- **Pre-commit hook** — blocks commits with violations.
- **GitHub Actions CI** — lint, scan, unit tests, and benchmark gate on every PR.
- **Benchmark evaluation** — 24-page test suite including the W3C WAI Before/After Demo.

---

## Quick Start

```bash
git clone https://github.com/dallasspohn/a11y-agent.git
cd a11y-agent
npm install --ignore-scripts    # skip native voice deps
npx playwright install chromium # for browser scanning
```

### Scan a file

```bash
node src/lint.js --file samples/bad-page.html         # static lint (~100ms)
node src/scan.js --file samples/bad-page.html         # browser scan (axe-core)
node src/scan.js --url https://redhat.com             # scan a live URL
node src/lint.js --file samples/bad-page.html --fix   # AI fix suggestions
```

### Voice workflow

```bash
./setup-voice.sh       # one-time: download Vosk model (~50MB)
npm run demo:agent     # reset fixture + start voice loop
npm run agent:text     # same loop, keyboard input (no mic needed)
```

### VS Code extension

```bash
# Option A: download .vsix from GitHub Releases (no clone needed)
# https://github.com/dallasspohn/a11y-agent/releases
code --install-extension a11y-agent-vscode-0.1.0.vsix

# Option B: build from source
cd vscode-extension && npm install && npm run vsix
code --install-extension a11y-agent-vscode-0.1.0.vsix

# Option C: press F5 in VS Code with the repo open (dev mode)
```

### Chrome extension

```bash
# Option A: download dist zip from GitHub Releases (no clone needed)
# https://github.com/dallasspohn/a11y-agent-chrome-plugin/releases
# Unzip → chrome://extensions → Developer mode → Load unpacked → select dist/

# Option B: build from source
git clone https://github.com/dallasspohn/a11y-agent-chrome-plugin.git
cd a11y-agent-chrome-plugin && npm install --legacy-peer-deps && npm run build
# chrome://extensions → Developer mode → Load unpacked → select dist/
```

---

## Configuration

### AI provider

Any OpenAI-compatible endpoint. Defaults to local Ollama — no API key needed.

| Variable | Default | Purpose |
|---|---|---|
| `A11Y_AI_URL` | `http://localhost:11434/v1` | Endpoint |
| `A11Y_AI_MODEL` | `llama3.1` | Model name |
| `A11Y_AI_KEY` | `ollama` | API key (if needed) |

```bash
# Use a different model
A11Y_AI_MODEL=qwen3:14b node src/lint.js --file page.html --fix

# Use OpenAI instead
A11Y_AI_URL=https://api.openai.com/v1 A11Y_AI_KEY=sk-... node src/scan.js --file page.html --fix
```

### Voice

See [docs/voice.md](docs/voice.md) for setup and troubleshooting.

| Variable | Default | Purpose |
|---|---|---|
| `A11Y_VOICE_ENGINE` | `edge` | `edge` (neural) · `piper` · `espeak` (offline fallback) |
| `A11Y_VOICE_NAME` | `en-US-GuyNeural` | Edge TTS voice |

---

## Benchmark Results

Evaluated against 24 test pages including the [W3C WAI Before/After Demo](https://www.w3.org/WAI/demos/bad/):

| Metric | Score |
|---|---|
| True Positive Rate (rule recall) | **100%** |
| False Positive Rate (clean pages) | **0%** |

```bash
npm run eval         # full benchmark report
npm run eval:check   # CI threshold gate (TPR ≥ 95%, FPR ≤ 5%)
```

See [evaluation/README.md](evaluation/README.md) for details.

---

## Project Status

✅ Static HTML linter + axe-core browser scanner  
✅ Model-agnostic AI fix suggestions (Ollama default)  
✅ Voice triage loop with cherry-picked auto-fix  
✅ Edge TTS neural voice + Vosk offline STT  
✅ File watcher, pre-commit hook, GitHub Actions CI  
✅ VS Code extension — squiggles while you type  
✅ Chrome extension — auto-fix any page you browse  
✅ Benchmark evaluation (24 pages, 100% TPR, 0% FPR)  

### Known Issues

- **AI fix quality varies by model.** `image-alt` and `html-has-lang` are reliable. Structural rules may produce imperfect edits on small models — use `qwen3:14b` or larger. `.bak` backup is always created.
- **Fix generation is slow locally** — ~30s per violation on `llama3.1`. Select one or two issues during a live demo.
- **Auto-apply only works on local files**, not URLs.

---

## References

- [Demo site](https://dallasspohn.github.io/a11y-agent/) — Hands-on tutorial
- [vscode-extension/](vscode-extension/) — VS Code extension
- [a11y-agent-chrome-plugin](https://github.com/dallasspohn/a11y-agent-chrome-plugin) — Chrome extension
- [evaluation/README.md](evaluation/README.md) — Benchmark dataset and results
- [docs/voice.md](docs/voice.md) — Voice setup and troubleshooting

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Red Hat, Inc.  
Third-party content listed in [NOTICE](NOTICE).

## Team

**Team:** Shift Left A11y  
**Leads:** Dallas Spohn (PTL Team), Surya Pathak

**Red Hat Innovation Days 2026 Global AI Challenge**  
**Challenge 4:** Accessibility in Software Development at Scale

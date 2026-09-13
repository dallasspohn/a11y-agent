---
title: "Demo Tutorial"
layout: default
nav_order: 2
---

# Hands-On Demo: From Zero to Accessible
{: .fs-8 }

Follow along step by step. By the end, you'll have scanned a real Red Hat product page, generated AI-powered fixes using a free open-source model, and seen how a visually impaired developer can do the same thing entirely by voice.
{: .fs-5 .fw-300 }

---

## Chapter 1: Setup
{: .text-purple-300 }

### Clone and install

```bash
git clone https://github.com/dallasspohn/a11y-agent.git
cd a11y-agent
npm install --ignore-scripts
```

{: .note }
> `--ignore-scripts` skips building native voice dependencies (Vosk/ffi-napi). The scanner and linter work perfectly without them. Add voice later if you want the full James experience.

### Start a local AI model (optional but recommended)

A11Y Agent uses **any OpenAI-compatible API** for fix suggestions. The default is [Ollama](https://ollama.com) — free, local, private. No API key, no token cost, no data leaving your machine.

```bash
# Install Ollama (if you haven't)
# https://ollama.com/download

ollama serve &             # start the server
ollama pull qwen3:14b      # fast, high-quality open model (~9GB)
```

{: .important }
> **No Ollama? No problem.** Scanning and linting work without any AI. You can also point to OpenAI, Groq, or any OpenAI-compatible endpoint:
>
> ```bash
> export A11Y_AI_URL=https://api.openai.com/v1
> export A11Y_AI_MODEL=gpt-4o
> export A11Y_AI_KEY=sk-...
> ```

### Install Chromium for browser scanning

```bash
npx playwright install chromium
```

You're ready. Let's find some bugs.

---

## Chapter 2: Your First Scan
{: .text-purple-300 }

The repo includes `samples/bad-page.html` — a product dashboard page with **intentional accessibility violations**. Think of it as the "before" state of a real project.

### Static lint (fast, no browser)

```bash
node src/lint.js --file samples/bad-page.html
```

**Output:**

```
  A11Y AGENT LINT RESULTS
  11 violations found

  !! [CRITICAL] image-alt
     Images must have an alt attribute (use alt="" only if decorative).
     target: samples/bad-page.html, img
     html:   <img src="logo.png">

  !! [CRITICAL] image-alt
     Images must have an alt attribute (use alt="" only if decorative).
     target: samples/bad-page.html, img
     html:   <img src="banner.jpg" width="800" height="200">

  !! [CRITICAL] label
     Form controls must have an associated label, aria-label, or aria-labelledby.
     target: samples/bad-page.html, input
     html:   <input type="text" placeholder="Search...">

  !! [CRITICAL] label
     Form controls must have an associated label, aria-label, or aria-labelledby.
     target: samples/bad-page.html, select
     html:   <select>...

  !  [SERIOUS] html-has-lang
  !  [SERIOUS] link-name
  !  [SERIOUS] media-controls
  !  [SERIOUS] click-handler
  !  [SERIOUS] table-headers
  ~  [MODERATE] heading-order (×2)

  Summary: 4 critical  5 serious  2 moderate  0 minor
```

**11 issues in under 100ms** — no browser launched. This is what powers the file watcher and pre-commit hook. Each violation links to the exact WCAG success criterion it violates.

### Browser scan (catches rendering-dependent issues)

```bash
node src/scan.js --file samples/bad-page.html
```

This launches headless Chromium, renders the page, and runs [axe-core](https://github.com/dequelabs/axe-core) — the industry-standard accessibility engine used by Google, Microsoft, and the US government.

```
  A11Y AGENT SCAN RESULTS
  18 rules passed · 9 violations found

  !! [CRITICAL] image-alt — Images must have alternative text (2 elements)
  !! [CRITICAL] select-name — Select element must have an accessible name
  !  [SERIOUS]  color-contrast — Elements must meet minimum color contrast
  !  [SERIOUS]  html-has-lang — <html> must have a lang attribute
  !  [SERIOUS]  link-name — Links must have discernible text
  ~  [MODERATE] heading-order — Heading levels should increase by one
  ~  [MODERATE] landmark-one-main — Document should have one main landmark
  ~  [MODERATE] page-has-heading-one — Page should contain an h1
  ~  [MODERATE] region — All content should be in landmarks (10 elements)

  Summary: 2 critical  3 serious  4 moderate  0 minor
```

{: .note }
> The linter found 11 issues; the browser scanner found 9 different ones. They overlap on some (like `image-alt`) but each catches things the other misses. The linter catches `click-handler` and `table-headers`; the scanner catches `color-contrast` (needs rendering). **Together, they cover more ground.**

---

## Chapter 3: Scanning a Real Red Hat Product Page
{: .text-purple-300 }

Sample pages are useful for learning, but let's test something real. Here's the Red Hat Enterprise Linux product page — a production website serving millions of users:

```bash
node src/scan.js --url https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux
```

**Output (actual results):**

```
  Scanning https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux...

  50 rules passed · 5 violations found

  !! [CRITICAL] button-name
     Buttons must have discernible text
     html: <button class="call"></button>

  !! [CRITICAL] image-alt
     Images must have alternative text
     (4 images missing alt text)

  !  [SERIOUS]  tabindex
     Elements should not have tabindex greater than zero

  ~  [MODERATE] heading-order
     Heading levels should only increase by one

  ~  [MODERATE] region
     All page content should be contained by landmarks
     (20 elements outside landmarks)

  Summary: 2 critical  1 serious  2 moderate  0 minor
```

**5 violations on a real production page** — including 2 critical issues that affect screen reader users right now. A button with no text is completely invisible to someone using a screen reader. Images without alt text can't be described.

This isn't a contrived demo. These are real issues on a real website.

{: .highlight }
> Try scanning any URL you like:
>
> ```bash
> node src/scan.js --url https://access.redhat.com
> node src/scan.js --url https://developers.redhat.com
> node src/scan.js --url https://your-staging-server.com
> ```

---

## Chapter 4: AI-Powered Fix Suggestions
{: .text-purple-300 }

Finding violations is step one. **Fixing them** is where developers actually need help. A11Y Agent sends the violation context and surrounding source code to an LLM and gets back concrete, copy-pasteable fixes.

```bash
node src/lint.js --file samples/bad-page.html --fix
```

The AI processes each violation and suggests a targeted edit:

```
Generating AI fix suggestions...

  image-alt
  ─────────
  WHY:   Screen readers cannot describe images without alt text.
         A user who is blind hears nothing for this element.
  WCAG:  1.1.1 Non-text Content

  - <img src="logo.png">
  + <img src="logo.png" alt="Company logo">

  html-has-lang
  ─────────────
  WHY:   Without a lang attribute, screen readers may use the wrong
         pronunciation rules, making the page unintelligible.
  WCAG:  3.1.1 Language of Page

  - <html>
  + <html lang="en">

  click-handler
  ─────────────
  WHY:   A div with onclick is not keyboard-focusable and has no
         ARIA role. Keyboard and screen reader users can't activate it.
  WCAG:  2.1.1 Keyboard

  - <div onclick="showDetails()" style="cursor: pointer; color: blue; text-decoration: underline;">
  + <button onclick="showDetails()" style="cursor: pointer; color: blue; text-decoration: underline;">
```

### Choose your model

The AI layer is **model-agnostic**. It talks to any OpenAI-compatible endpoint:

| Provider | Command | Cost |
|---|---|---|
| **Ollama** (default) | `ollama pull qwen3:14b` | Free, local |
| **Ollama** (larger) | `ollama pull llama3.1:70b` | Free, local, better quality |
| **OpenAI** | `export A11Y_AI_URL=https://api.openai.com/v1` | ~$0.01/scan |
| **Groq** | `export A11Y_AI_URL=https://api.groq.com/openai/v1` | Free tier available |

{: .important }
> **AI never decides what's broken.** Detection is deterministic — axe-core and static HTML rules. AI only explains violations and suggests fixes. This means you get consistent, reproducible results regardless of which model you use (or if you use one at all).

---

## Chapter 5: Automation — Make It Impossible to Ship Bad Code
{: .text-purple-300 }

Priya doesn't want to remember to run the scanner. She wants violations caught **automatically** at every stage.

### Auto-lint on save

Open two terminals:

**Terminal 1:**
```bash
node src/watch.js --dir samples/
```

**Terminal 2:**
```bash
# Open samples/bad-page.html in your editor
# Make a change, save the file
# → Terminal 1 instantly shows the updated violation list
```

Fix an issue, save, watch the count drop. This is the fastest feedback loop — faster than switching to a browser.

### Pre-commit hook

```bash
npm run install-hooks
```

Now try to commit code with violations:

```bash
git add samples/bad-page.html
git commit -m "ship it"
```

```
  ❌ A11Y lint found violations in samples/bad-page.html
  Commit blocked. Fix the issues or use --no-verify to bypass.
```

The commit is **rejected**. Bad code never reaches the branch.

### CI/CD gate (GitHub Actions)

Every push and pull request runs the full pipeline:

```yaml
# Already configured in .github/workflows/a11y.yml
- Static lint — zero violations allowed
- Browser scan — axe-core on sample pages
- Unit tests — covering linter, scanner, AI, and extension
- Benchmark gate — TPR ≥ 95%, FPR ≤ 5%
```

**The shift-left timeline:**

```
 Write + Save          Commit              Push PR             Merge
     │                   │                   │                   │
     ▼                   ▼                   ▼                   ▼
 ┌─────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
 │ Watcher │      │ Pre-commit│      │  GitHub   │      │  Clean    │
 │ re-lints│ ───▶ │   hook    │ ───▶ │  Actions  │ ───▶ │   main   │
 │ on save │      │  blocks   │      │   CI/CD   │      │  branch  │
 └─────────┘      └───────────┘      └───────────┘      └───────────┘
     ↓                  ↓                  ↓
   "Fix now"      "Can't commit"     "PR blocked"
```

By the time code reaches `main`, it's been checked **three times**. Accessibility regressions don't ship.

---

## Chapter 6: VS Code Extension — Squiggles While You Type
{: .text-purple-300 }

Terminal workflows are great, but most developers live in their editor. The A11Y Agent VS Code extension brings accessibility diagnostics **directly into VS Code** — violations appear as squiggly underlines the moment you type, just like ESLint or TypeScript errors.

### Install the extension

**Option A — download from GitHub Releases (no clone needed):**

Download the `.vsix` from [Releases](https://github.com/dallasspohn/a11y-agent/releases), then:

```bash
code --install-extension a11y-agent-vscode-0.1.0.vsix
```

**Option B — build from source:**

```bash
cd vscode-extension
npm install && npm run vsix        # builds a11y-agent-vscode-0.1.0.vsix
code --install-extension a11y-agent-vscode-0.1.0.vsix
```

**Option C — Extension Development Host (F5):**

1. Open the repo root in VS Code
2. Press **F5** → select **Run A11Y Agent extension**
3. A new window opens with the extension loaded

### What you'll see

Open `samples/bad-page.html` in the extension-enabled window:

- **Yellow squiggles** on `<img src="logo.png">` — missing alt text
- **Yellow squiggles** on `<select>` — missing label
- **Blue info marks** on `<h5>` — heading level skip
- **Hover** any squiggle → see the WCAG explanation and why it matters
- **Click the rule ID** → opens the W3C success criterion page

Check the **Problems panel** (Ctrl+Shift+M / Cmd+Shift+M) for the full list.

### Settings

| Setting | Default | What it does |
|---|---|---|
| `a11yAgent.run` | `onType` | When to lint: `onType` (300ms debounce), `onSave`, or `manual` |
| `a11yAgent.debounceMs` | `300` | Idle time before linting (onType mode) |
| `a11yAgent.minimumImpact` | `minor` | Hide violations below this impact level |

Command palette: **A11Y Agent: Scan This Document** — manual trigger with a result count notification.

### What it catches vs what it doesn't

The extension runs the **static linter** (`lint-html.js`) — the same 12 rules behind `npm run demo:lint`. It catches structural issues (missing alt, missing lang, heading order, form labels, keyboard traps).

It does **not** catch rendering-dependent issues like color contrast or computed focus order — those need a real browser. Run `node src/scan.js` for the full axe-core pass. The extension is the fast inner loop, not a replacement.

{: .highlight }
> **Scale story:** Install this extension org-wide and every HTML file gets real-time accessibility feedback. No training, no extra steps — just squiggles as you type.

---

## Chapter 7: James's Voice Workflow — Hands-Free, Zero Sighted Assistance
{: .text-purple-300 }


Everything above was Priya's workflow — visual, terminal-based. Now meet James.

James is a visually impaired developer. He's testing the same product page, but he has trouble reading the terminal output we just saw. He needs to **hear** violations and **speak** commands.

### Start the agent

```bash
npm run demo:agent    # resets the fixture + launches voice loop
```

{: .note }
> **No microphone?** Use `npm run agent:text` — same workflow, typed instead of spoken. Everything below works identically.

### The conversation

Here's what a session sounds like. The agent speaks every response aloud using a neural voice (Edge TTS).

**Agent:** *"A11Y Agent at the ready. What should I scan?"*

**James:** *"Scan the bad page."*

**Agent:** *"9 violations found."*
```
  [1]  critical  Images must have alternative text           (image-alt)
  [2]  critical  Select element must have an accessible name (select-name)
  [3]  serious   Elements must meet minimum color contrast   (color-contrast)
  [4]  serious   Document must have a lang attribute         (html-has-lang)
  [5]  serious   Links must have discernible text            (link-name)
  ...
  What should I fix?
```

**James:** *"Fix issue one."*

**Agent:** *"Image alt. Screen readers cannot describe images without alt text. Edit one of two: img src logo dot png, add alt Company Logo. Edit two of two: img src banner dot jpg, add alt Hero banner image. Apply these fixes?"*

**James:** *"Yes."*

**Agent:** *"Applied 2 edits. Re-scanning to verify... 1 of 1 selected issue resolved. 1 more issue resolved as a knock-on effect. 7 violations remain. What should I fix?"*

**James:** *"Fix all critical."*

**Agent:** *(generates, validates, and applies fixes for remaining critical issues)*

**James:** *"Done."*

**Agent:** *"Session complete. Goodbye."*

### What makes this special

- **Numbered violations** — James refers to issues by number, not by reading CSS selectors
- **Natural selection grammar** — "fix all critical", "fix issues one through four", "fix the first three"
- **Validated edits** — every `before` string is checked against the real source before applying
- **Re-scan verification** — the agent **proves** each fix worked, doesn't just assert it
- **Offline STT** — Vosk runs locally, no audio leaves the machine
- **Neural TTS** — Edge TTS sounds natural, falls back to espeak-ng if offline

{: .highlight }
> **James never needed sighted assistance.** He scanned, triaged, selected fixes, confirmed, and verified — all by voice. The same violations, the same fixes, the same verification — just a different I/O layer.

---

## Chapter 8: Chrome Extension — Auto-Fix Any Page You Browse
{: .text-purple-300 }

The CLI scans files. The VS Code extension catches issues while you code. But what about **testing existing websites** — yours or anyone else's?

The [A11Y Agent Chrome Extension](https://github.com/dallasspohn/a11y-agent-chrome-plugin) auto-repairs WCAG violations in the live DOM **as pages load**. No scanning, no commands — it fixes issues before you even see them.

### Install

**Option A — download from GitHub Releases (no clone needed):**

Download `a11y-autofix-chrome-0.1.0.zip` from [Releases](https://github.com/dallasspohn/a11y-agent-chrome-plugin/releases), unzip it, then:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the unzipped `dist/` directory
4. Done — the extension is active on every page

**Option B — build from source:**

```bash
git clone https://github.com/dallasspohn/a11y-agent-chrome-plugin.git
cd a11y-agent-chrome-plugin
npm install --legacy-peer-deps
npm run build          # bundles into dist/
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`.

### What it does

Open any page — say, `samples/bad-page.html` or a real website. The extension:

1. **Streams fixes at parse time** — a MutationObserver patches DOM nodes before their first paint
2. **Runs axe-core** at DOMContentLoaded to catch anything the streaming pass missed
3. **Patches remaining violations** by rule ID
4. **Validates** with a second axe run and reports anything still failing

All fixes are **deterministic** — no AI, no network calls, no API keys. Just DOM patches.

### The badge

Look at the extension icon in your toolbar:

| Badge | Meaning |
|---|---|
| **Green** number | All detected violations were fixed |
| **Orange** number | Some violations remain unfixed |
| **Gray** | Extension disabled on this site |

### The popup

Click the extension icon to see:

- **Found / Fixed / Unfixed** counts
- A collapsible **per-rule list** showing before/after for each fix
- **Revert all** — undo every fix (originals preserved in `data-a11y-orig-*`)
- **Re-run** — recheck the page
- **Copy JSON** — export the report (CI integration)
- **Disable on this site** — add to blocklist

### What it fixes

| Rule | Fix |
|---|---|
| `html-has-lang` | Sets `lang` from meta tags or navigator |
| `image-alt` | Derives alt from title, figcaption, filename |
| `color-contrast` | Steps foreground color until 4.5:1 ratio |
| `label` | Adds `aria-label` from placeholder or field name |
| `link-name` | Adds `aria-label` from title, child img, or href |
| `heading-order` | Sets `role="heading"` + corrected `aria-level` |
| `click-events` | Adds `role="button"` + keyboard handler |
| `video-autoplay` | Adds `controls` and `muted` |
| `table headers` | Adds `scope` and `role` to header cells |

Every fix is tagged with `data-a11y-fixed` — inspect any element to see what was changed.

### Optional: AI-powered alt text

By default, image alt text is derived deterministically (filename, figcaption, etc.). For better descriptions, enable AI alt text in the extension Options:

1. Click extension icon → **Options**
2. Toggle **AI alt text** on
3. Enter an Anthropic API key
4. Only `{src, surrounding-text, page-title}` is sent — **never the image bytes**

{: .highlight }
> **Scale story:** Roll this out to QA teams, product managers, or content writers. Every page they visit gets auto-repaired. They see the badge count, click for details, and file bugs with the JSON export. No technical setup needed beyond "Load unpacked."

---

## Chapter 9: What's Under the Hood
{: .text-purple-300 }

| Layer | Technology | Why |
|---|---|---|
| Static linting | Custom HTML parser | Fast (~100ms), no browser, catches structural issues |
| Browser scanning | axe-core via Playwright | Industry standard, catches rendering-dependent issues |
| AI fixes | OpenAI-compatible API (Ollama default) | Model-agnostic, local-first, no vendor lock-in |
| Voice output | Edge TTS (neural) → espeak-ng (fallback) | Natural voice with guaranteed offline fallback |
| Voice input | Vosk (offline STT) | No audio leaves the machine |
| File watching | chokidar | Re-lint on every save |
| Git integration | Pre-commit hooks + GitHub Actions | Block violations at commit and PR |
| Benchmarking | 24-page evaluation suite + W3C WAI dataset | Proven accuracy: 100% TPR, 0% FPR |

### The principle that ties it all together

> **Detection is deterministic. AI only suggests. Fixes are verified.**
>
> axe-core and static rules find violations — consistently, every time. The AI model suggests how to fix them, but never decides what's broken. And every applied fix is proven by a re-scan, not assumed to be correct.

---

## Quick Reference

| Command | What it does |
|---|---|
| `node src/lint.js --file FILE` | Static lint (fast, no browser) |
| `node src/lint.js --file FILE --fix` | Lint + AI fix suggestions |
| `node src/scan.js --file FILE` | Browser scan (axe-core) |
| `node src/scan.js --url URL` | Scan any live URL |
| `node src/scan.js --file FILE --fix` | Scan + AI fix suggestions |
| `node src/scan.js --url URL --json` | JSON output for CI/CD |
| `node src/watch.js --dir DIR` | Auto-lint on save |
| `npm run demo:agent` | Voice triage loop (reset + start) |
| `npm run agent:text` | Same loop, keyboard input |
| `npm run install-hooks` | Install pre-commit hook |
| `npm run eval` | Run the benchmark suite |
| `npm test` | Run all unit tests |
| `cd vscode-extension && npm run vsix` | Build `.vsix` for VS Code |
| `code --install-extension *.vsix` | Install the VS Code extension |

---

[← Back to Home]({{ site.baseurl }}{% link index.md %}){: .btn }

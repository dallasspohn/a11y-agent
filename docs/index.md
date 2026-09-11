---
title: Home
layout: default
nav_order: 1
---

# A11Y Agent
{: .fs-9 }

We built an accessibility testing tool — and then made it accessible.
{: .fs-6 .fw-300 }

[Follow the Demo →]({% link tutorial.md %}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[GitHub Repo](https://github.com/dallasspohn/a11y-agent){: .btn .fs-5 .mb-4 .mb-md-0 }

---

![A11Y Agent — Two personas, one tool](images/a11y-personas.jpg)

## Why This Exists

Accessibility bugs are caught **after code ships** — in audits, in lawsuits, in angry user feedback. By then the fix is 10× more expensive and the damage is done.

And here's the irony: most accessibility tools require you to **see** the screen. A developer who is blind can't open browser DevTools, run a scanner, and read the colored output.

**A11Y Agent** solves both problems:

1. **Shift-left** — catch violations while you write code, not after you deploy
2. **Accessible by design** — the tool itself works entirely through voice

---

## Meet the Personas

### 👩‍💻 Priya — a sighted front-end engineer

Priya is shipping a new product page. She wants her editor to flag accessibility issues **the moment she saves**, her commits blocked if violations exist, and her PR gated by CI. She works visually — terminal output, color-coded severity, copy-paste fixes.

### 🎤 James — a developer who is blind

James is testing Priya's product page for accessibility. He can't read a terminal. He needs to **hear** the violations, **speak** commands to fix them, and **verify** the fixes — all without sighted assistance.

**One tool serves both.** The detection engine, AI fix generation, and validation pipeline are shared. Only the I/O layer differs.

---

## The Pipeline

![A11Y Agent Pipeline](images/a11y-pipeline.jpg)

**Design principle:** Detection is deterministic (axe-core + static HTML rules). AI only explains and suggests fixes — it never decides what's broken. Every applied fix is verified by a re-scan, not asserted.

---

## What You'll See in the Demo

The [tutorial]({% link tutorial.md %}) walks you through a complete hands-on session:

1. **Setup** — clone, install, start a local AI model
2. **Scan a local file** — find 11 violations in a sample page
3. **Scan a real Red Hat product page** — find real issues on redhat.com
4. **Get AI fix suggestions** — using a free, local open-source model
5. **Automate** — file watcher, pre-commit hooks, CI/CD gates
6. **Voice workflow** — hear violations and fix them by speaking

Everything runs locally. No API keys, no cloud costs, no data leaving your machine.

[Start the Tutorial →]({% link tutorial.md %}){: .btn .btn-primary }

---

## Benchmark Results

Tested against 24 pages including the [W3C WAI Before/After Demo](https://www.w3.org/WAI/demos/bad/) (external gold standard):

| Metric | Score |
|---|---|
| True Positive Rate (rule recall) | **100%** |
| False Positive Rate (clean pages) | **0%** |

---

## Team

**Team:** Shift Left A11y — Red Hat Innovation Days 2026, Challenge 4  
**Built by:** Dallas Spohn & Surya Pathak

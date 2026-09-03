# Evaluation — A11Y Agent Benchmark Dataset

This folder contains benchmark HTML pages and a runner to measure how accurately a11y-agent detects real accessibility violations — using both the static linter and the browser scanner.

## What we measure

| Metric | What it means |
|---|---|
| **True Positive Rate (TPR)** | % of expected violation rules detected on bad pages |
| **False Positive Rate (FPR)** | % of clean pages incorrectly flagged |
| **Per-rule detection** | Which specific rules are caught vs missed |
| **Tools compared** | `lint.js` (static) vs `scan.js` (axe-core browser) |

A rule is considered "detected" if **either** `lint.js` or `scan.js` reports it. This reflects real usage — developers use both tools together.

## Dataset

```
evaluation/
├── run-eval.js               ← runner script
├── manifest.json             ← test cases with expected rules per page
├── pages/
│   ├── w3c-bad/              ← external gold-standard dataset (W3C WAI)
│   │   ├── before/           ← 4 inaccessible pages (authored by WCAG experts)
│   │   └── after/            ← 4 accessible pages
│   ├── bad/                  ← 8 hand-crafted pages, one violation type each
│   │   ├── 01-missing-alt.html       → image-alt, link-name, html-has-lang
│   │   ├── 02-no-form-labels.html    → label (x5 controls)
│   │   ├── 03-heading-chaos.html     → heading-order
│   │   ├── 04-keyboard-traps.html    → click-handler (div/span as buttons)
│   │   ├── 05-table-no-headers.html  → table-headers
│   │   ├── 06-contrast-and-lang.html → html-has-lang, color-contrast
│   │   ├── 07-media-no-controls.html → media-controls
│   │   └── 08-mixed-issues.html      → all of the above combined
│   └── good/                 ← 8 fixed versions (false-positive test)
└── README.md
```

### Why two datasets?

- **W3C WAI BAD pages** — pages we did *not* author. Written by WCAG experts with documented violations. This tests whether our tool works on real-world HTML we've never seen.
- **Hand-crafted pages** — isolate one rule at a time, so we can pinpoint exactly which rules work and which don't.

## How to run

```bash
# From the project root
node evaluation/run-eval.js

# Get raw JSON (for analysis or CI)
node evaluation/run-eval.js --json
```

Sample output:

```
✅ PASS  w3c-bad/before/home.html  [TPR 100%]  lint:44 scan:7
         ✓ detected: image-alt, html-has-lang, link-name, table-headers

✅ PASS  good/01-proper-alt.html  [lint 0 | scan 0]  expected 0 each

── Per-rule Detection Rate ──

██████████  100%  image-alt
██████████  100%  html-has-lang
██████████  100%  label
...

True Positive Rate:  100.0%
False Positive Rate:  0.0%
```

## Results

| Tool | TPR | FPR |
|---|---|---|
| `lint.js` only | 100% | 0% |
| `scan.js` only | partial (misses structural rules, catches contrast) |  0% |
| **Combined** | **100%** | **0%** |

**Key insight:** The two tools are complementary:
- `lint.js` catches structural issues fast (no browser needed) — missing alt, labels, heading order, keyboard traps
- `scan.js` catches rendered issues — color contrast, ARIA validity, focus order

## External benchmark references

These datasets are too large to include locally but are useful for comparison:

| Dataset | Size | Notes |
|---|---|---|
| [A11YBench](https://huggingface.co/datasets/LLM4APR/A11YBench) | 147 pages, 8,886 violations | Uses IBM Accessibility Checker (different rule names) |
| [AccessGuru](https://github.com/NadeenAhmad/AccessGuruLLM) | 3,524 violations, 448 sites | HTML snippets with 94 violation types |
| [W3C WAI BAD](https://www.w3.org/WAI/demos/bad/) | 8 pages | ✅ Included here in `pages/w3c-bad/` |

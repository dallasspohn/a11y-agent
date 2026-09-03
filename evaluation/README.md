# Evaluation — A11Y Agent Benchmark Dataset

This folder contains benchmark HTML pages and a runner script to measure how well a11y-agent's linter and scanner detect real accessibility issues.

## What's here

```
evaluation/
├── manifest.json         # All test cases with expected results
├── run-eval.js           # Runner script — tests lint + scan on all pages
├── pages/
│   ├── bad/              # 8 pages with known accessibility violations
│   │   ├── 01-missing-alt.html       — images without alt text
│   │   ├── 02-no-form-labels.html    — form controls without labels
│   │   ├── 03-heading-chaos.html     — skipped heading levels
│   │   ├── 04-keyboard-traps.html    — div/span used as buttons
│   │   ├── 05-table-no-headers.html  — data table without th
│   │   ├── 06-contrast-and-lang.html — poor contrast + missing lang
│   │   ├── 07-media-no-controls.html — autoplay without controls
│   │   └── 08-mixed-issues.html      — real-world page, many issues
│   └── good/             # 8 fixed versions (expect 0 violations)
│       ├── 01-proper-alt.html
│       ├── 02-labeled-forms.html
│       ├── 03-correct-headings.html
│       ├── 04-keyboard-accessible.html
│       ├── 05-table-with-headers.html
│       ├── 06-good-contrast.html
│       ├── 07-media-with-controls.html
│       └── 08-clean-portal.html
└── README.md
```

## Quick start

```bash
# Run evaluation on all local pages (lint + scan)
node evaluation/run-eval.js

# Also test live URLs (W3C WAI demo, GOV.UK, spohnz.com)
node evaluation/run-eval.js --urls

# Get raw JSON output for further analysis
node evaluation/run-eval.js --json
```

## How it works

1. **Bad pages** — the runner expects violations. If our tools find at least 1 issue, it's a PASS (true positive).
2. **Good pages** — the runner expects 0 violations. If our tools report 0 issues, it's a PASS (no false positives).
3. **Live URLs** — scanned with axe-core via `scan.js`. Bad URLs should have violations; good URLs should be clean.

The final score is `passed / total` — representing how accurately our tools detect and correctly classify pages.

## Violation categories covered

| Category | Bad page | What's tested |
|---|---|---|
| Image alt text | 01 | Missing alt, decorative images, linked images |
| Form labels | 02 | input, textarea, select, checkbox without labels |
| Heading order | 03 | Skipped levels, wrong starting heading |
| Keyboard access | 04 | onclick on div/span instead of button/a |
| Table headers | 05 | Data table using td instead of th |
| Color contrast | 06 | Light text on light background |
| Media controls | 07 | Autoplay video/audio without controls |
| Mixed (real-world) | 08 | Combines all above in a realistic page |

## Data sources

- **Local pages**: Hand-crafted to cover specific WCAG violation types
- **W3C WAI BAD Demo**: Official inaccessible/accessible demo pair — [w3.org/WAI/demos/bad](https://www.w3.org/WAI/demos/bad/)
- **A11YBench**: 60 real-world projects, 8,886 violations — [Hugging Face dataset](https://huggingface.co/datasets/LLM4APR/A11YBench)
- **AccessGuru**: 3,500 violations from 448 sites — [GitHub](https://github.com/NadeenAhmad/AccessGuruLLM)

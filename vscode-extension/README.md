# A11Y Agent — VS Code extension

Accessibility violations as squiggles, while you type. This is the "from the
start" half of Challenge 4: the feedback arrives before the file is saved,
never mind before review.

## Try it

```bash
cd vscode-extension
npm install
npm run build
```

Then open this folder in VS Code and press **F5**. A second window opens with
`samples/bad-page.html` loaded and squiggles already on it.

## What it reports

The static rules from `src/lib/lint-html.js` — the same ones behind
`npm run demo:lint`:

`html-has-lang` · `document-title` · `image-alt` · `label` · `frame-title` ·
`link-name` · `button-name` · `heading-order` · `tabindex` · `media-controls` ·
`click-handler` · `table-headers`

Each diagnostic's rule id links to the WCAG page explaining *why* it matters.

## What it does not report

Anything needing a rendered page: **colour contrast, focus order, computed
roles.** Those need a real browser, and launching Chromium on every keystroke
is not viable. Run `npm run scan` for the full axe-core pass — the extension is
the fast inner loop, not a replacement.

Roughly: the extension catches the structural half, `scan.js` catches the rest.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `a11yAgent.run` | `onType` | `onType` · `onSave` · `manual` |
| `a11yAgent.debounceMs` | `300` | Idle time before linting, for `onType` |
| `a11yAgent.minimumImpact` | `minor` | Hide anything below this impact |

Command: **A11Y Agent: Scan This Document**.

## Severity

Nothing maps to Error. Critical and serious are Warnings, moderate is
Information, minor is a Hint — an accessibility violation should not shout
louder than a syntax error in the same file.

## Tests

```bash
npm test
```

14 tests, run against the **built bundle** rather than `src/`. That is
deliberate: the interesting failure mode is the ESM-to-CJS conversion esbuild
performs on `lint-html.js` (the scanner is ESM, the extension host wants CJS).
Importing the source directly would test everything except the part most likely
to break.

They cover range accuracy, malformed input, the impact filter, and the
lifecycle handlers — but they stub the editor API, so they prove the logic, not
the integration. Press F5 before trusting a release.

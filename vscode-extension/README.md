# A11Y Agent — VS Code extension

Accessibility violations as squiggles, while you type. This is the "from the
start" half of Challenge 4: the feedback arrives before the file is saved,
never mind before review.

## Install

### From GitHub Releases (no clone needed)

Download the `.vsix` from [Releases](https://github.com/dallasspohn/a11y-agent/releases), then:

```bash
code --install-extension a11y-agent-vscode-0.1.0.vsix
```

Restart VS Code, open any `.html` file — squiggles appear automatically.

### Build from source

```bash
cd vscode-extension
npm install
npm run vsix               # → a11y-agent-vscode-0.1.0.vsix
code --install-extension a11y-agent-vscode-0.1.0.vsix
```

### Development mode (F5)

Open the **repo root** in VS Code and press **F5** — pick *Run A11Y Agent
extension*. The build runs automatically; a second window opens with
`samples/bad-page.html` and squiggles already on it.

There is a second launch config in `vscode-extension/.vscode/` for when you
have this folder open on its own.

### Verify

```bash
npm test                 # 14 unit tests (~1s)
npm run test:integration # real VS Code host (~30s, needs a display)
```

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
npm test                 # 14 unit tests, stubbed editor  (~1s)
npm run test:integration # 7 tests in a real VS Code       (~30s, needs a display)
npm run test:all         # both
```

The **unit** tests run against the built bundle rather than `src/`. That is
deliberate: the interesting failure mode is the ESM-to-CJS conversion esbuild
performs on `lint-html.js` (the scanner is ESM, the extension host wants CJS).
Importing the source directly would test everything except the part most likely
to break. They cover range accuracy, malformed input, the impact filter, and
the lifecycle handlers.

The **integration** tests download a real VS Code, install the extension into
it, and assert on the actual Problems panel. They exist because the unit tests
stub `vscode` entirely, so they cannot catch a bad manifest, a failed
activation, or a launch config that never worked — all of which are invisible
until someone presses F5.

Both run in CI; the integration job wraps them in `xvfb-run`.

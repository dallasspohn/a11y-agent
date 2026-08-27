---
name: a11y-reviewer
description: Review HTML, JSX, Vue, or CSS for WCAG accessibility issues and suggest exact fixes. Use when editing UI, forms, images, buttons, or when the user mentions a11y, accessibility, WCAG, ARIA, screen reader, keyboard, alt text, or contrast.
---

# A11Y Reviewer

Shift-left accessibility review for this repo. Catch issues while code is written, then verify with a real scan.

## What to do

1. Review the file the user is editing (or the path they name).
2. Report issues in this format, critical first:

   - **Severity:** critical | serious | moderate | minor
   - **Why it matters:** one sentence, user impact (screen reader, keyboard, low vision)
   - **Fix:** exact before → after code

3. If the file is HTML, run the repo tools and treat their output as ground truth for detection:

   ```bash
   node src/lint.js --file <path>
   node src/scan.js --file <path>
   ```

   `lint.js` is static (no browser). `scan.js` renders the page with axe-core.
   Explain and fix. Do not invent extra axe rule IDs.

4. If `--fix` is useful and `ANTHROPIC_API_KEY` is set:

   ```bash
   node src/lint.js --file <path> --fix
   node src/scan.js --file <path> --fix
   ```

## Check for

- Missing `lang` on `<html>`
- Images without a meaningful `alt` (`alt=""` only if decorative)
- Form controls without a `<label>`, `aria-label`, or `aria-labelledby`
- Icon-only links/buttons with no accessible name
- Heading order (no skipped levels; page should have one `h1`)
- Click handlers on `<div>` / `<span>` instead of `<button>` or `<a>`
- Keyboard access (focusable controls, no positive `tabindex`)
- Tables without `<th>`
- Autoplaying media without `controls`
- Generic link text (`click here`, `view`, `read more` with no context)
- Obvious contrast problems (light gray on white)

## Rules

- Be concise. Developers should be able to paste the fix.
- Prefer native HTML before ARIA.
- Do not claim the page is fully accessible after a scan. axe-core covers roughly half of WCAG.
- Voice control (Anthony / STT / TTS) is out of scope for this skill.

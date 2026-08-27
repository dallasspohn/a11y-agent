import { parse } from 'node-html-parser';

function attr(el, name) {
  return el.getAttribute(name);
}

function hasAttr(el, name) {
  return el.getAttribute(name) !== undefined && el.getAttribute(name) !== null;
}

function snippet(el) {
  return el.toString().replace(/\s+/g, ' ').slice(0, 160);
}

function accessibleName(el) {
  const aria = attr(el, 'aria-label');
  if (aria && aria.trim()) return aria.trim();
  const labelledBy = attr(el, 'aria-labelledby');
  if (labelledBy) return labelledBy.trim();
  const title = attr(el, 'title');
  if (title && title.trim()) return title.trim();
  const text = (el.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const img = el.querySelector('img');
  if (img && hasAttr(img, 'alt') && attr(img, 'alt').trim()) return attr(img, 'alt').trim();
  return '';
}

function isHiddenInput(el) {
  const type = (attr(el, 'type') || 'text').toLowerCase();
  return type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image';
}

function hasLabel(el, root) {
  if (attr(el, 'aria-label')?.trim()) return true;
  if (attr(el, 'aria-labelledby')?.trim()) return true;
  if (attr(el, 'title')?.trim()) return true;
  const id = attr(el, 'id');
  if (id && root.querySelector(`label[for="${id}"]`)) return true;
  let parent = el.parentNode;
  while (parent && parent.tagName) {
    if (parent.tagName === 'LABEL') return true;
    parent = parent.parentNode;
  }
  return false;
}

function isInteractive(el) {
  const tag = el.tagName?.toLowerCase();
  if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(el.tagName)) return true;
  const role = attr(el, 'role');
  return ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch'].includes(role);
}

export function lintHtml(html, filePath = 'document') {
  const root = parse(html, { comment: false });
  const violations = [];

  const add = (id, impact, help, helpUrl, el, extra = {}) => {
    violations.push({
      id,
      impact,
      help,
      helpUrl,
      tags: extra.tags || [],
      nodes: [{
        target: extra.target || [filePath, el.tagName?.toLowerCase() || 'element'],
        html: snippet(el),
        failureSummary: extra.failureSummary || help,
      }],
    });
  };

  const htmlEl = root.querySelector('html') || root;
  if (!attr(htmlEl, 'lang')?.trim()) {
    add(
      'html-has-lang',
      'serious',
      'The html element must have a lang attribute so screen readers use the correct language.',
      'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html',
      htmlEl,
      { tags: ['wcag2a', 'wcag312'], target: ['html'] },
    );
  }

  const titleEl = root.querySelector('title');
  if (!titleEl || !titleEl.text.trim()) {
    add(
      'document-title',
      'serious',
      'The page must have a non-empty title.',
      'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
      titleEl || htmlEl,
      { tags: ['wcag2a', 'wcag242'], target: ['title'] },
    );
  }

  for (const img of root.querySelectorAll('img')) {
    if (!hasAttr(img, 'alt')) {
      add(
        'image-alt',
        'critical',
        'Images must have an alt attribute (use alt="" only if decorative).',
        'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
        img,
        { tags: ['wcag2a', 'wcag111'] },
      );
    }
  }

  for (const el of root.querySelectorAll('input, select, textarea')) {
    if (el.tagName === 'INPUT' && isHiddenInput(el)) continue;
    if (!hasLabel(el, root)) {
      add(
        'label',
        'critical',
        'Form controls must have an associated label, aria-label, or aria-labelledby.',
        'https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html',
        el,
        { tags: ['wcag2a', 'wcag332'] },
      );
    }
  }

  for (const iframe of root.querySelectorAll('iframe')) {
    if (!attr(iframe, 'title')?.trim()) {
      add(
        'frame-title',
        'serious',
        'iframes must have a title that describes their content.',
        'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
        iframe,
        { tags: ['wcag2a', 'wcag412'] },
      );
    }
  }

  for (const link of root.querySelectorAll('a')) {
    if (!accessibleName(link)) {
      add(
        'link-name',
        'serious',
        'Links must have an accessible name (text, aria-label, or image alt).',
        'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html',
        link,
        { tags: ['wcag2a', 'wcag244'] },
      );
    }
  }

  for (const button of root.querySelectorAll('button')) {
    if (!accessibleName(button)) {
      add(
        'button-name',
        'critical',
        'Buttons must have an accessible name.',
        'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
        button,
        { tags: ['wcag2a', 'wcag412'] },
      );
    }
  }

  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let prevLevel = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName[1]);
    if (prevLevel === 0 && level > 1) {
      add(
        'heading-order',
        'moderate',
        'The first heading on a page should be an h1.',
        'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        heading,
        { tags: ['best-practice'], failureSummary: `First heading is h${level}` },
      );
    } else if (prevLevel && level > prevLevel + 1) {
      add(
        'heading-order',
        'moderate',
        'Heading levels should not skip (e.g. h1 then h3).',
        'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        heading,
        { tags: ['best-practice'], failureSummary: `h${prevLevel} followed by h${level}` },
      );
    }
    prevLevel = level;
  }

  for (const el of root.querySelectorAll('[tabindex]')) {
    const value = Number(attr(el, 'tabindex'));
    if (!Number.isNaN(value) && value > 0) {
      add(
        'tabindex',
        'serious',
        'Positive tabindex values disrupt keyboard order. Use 0 or -1.',
        'https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html',
        el,
        { tags: ['best-practice'] },
      );
    }
  }

  for (const media of root.querySelectorAll('video, audio')) {
    if (hasAttr(media, 'autoplay') && !hasAttr(media, 'controls')) {
      add(
        'media-controls',
        'serious',
        'Autoplaying media must have controls so users can pause it.',
        'https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html',
        media,
        { tags: ['wcag2a', 'wcag222'] },
      );
    }
  }

  for (const el of root.querySelectorAll('[onclick]')) {
    if (!isInteractive(el)) {
      add(
        'click-handler',
        'serious',
        'Click handlers on non-interactive elements are not keyboard accessible. Use a button or link.',
        'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html',
        el,
        { tags: ['wcag2a', 'wcag211'] },
      );
    }
  }

  for (const table of root.querySelectorAll('table')) {
    if (table.querySelector('td') && !table.querySelector('th')) {
      add(
        'table-headers',
        'serious',
        'Data tables must have header cells (th).',
        'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        table,
        { tags: ['wcag2a', 'wcag131'] },
      );
    }
  }

  return violations;
}

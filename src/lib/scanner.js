/**
 * Shared page scanner.
 *
 * Extracted so the CLI (src/scan.js) and the voice agent (src/agent.js) run
 * the exact same scan instead of the agent shelling out and re-parsing JSON.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Scan a URL or local file and return axe results plus the page source.
 *
 * @param {object} target
 * @param {string} [target.url]     URL to scan
 * @param {string} [target.file]    Local HTML file to scan
 * @param {number} [target.timeout] Navigation timeout in ms
 * @param {(msg: string) => void} [target.onProgress] Status callback
 */
export async function scanTarget({ url, file, timeout = 60000, onProgress } = {}) {
  if (!url && !file) {
    throw new Error('scanTarget requires a url or file');
  }

  const browser = await chromium.launch({ headless: true });

  // finally, not a trailing close() — a goto timeout would otherwise leak the browser
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (file) {
      await page.goto(`file://${resolve(file)}`, { timeout });
    } else {
      // Heavy marketing sites blow past the default 'load' wait on trackers and
      // third-party assets. Get the DOM up first — that's what axe needs — then
      // give the rest a bounded, best-effort chance to settle.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {
        onProgress?.('page still loading — scanning current DOM');
      });
    }

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const html = file ? await readFile(resolve(file), 'utf-8') : await page.content();

    return { results, html };
  } finally {
    await browser.close();
  }
}

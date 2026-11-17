/**
 * The Chromium a browser test drives. `RI_REVIEW_CHROMIUM` names one (CI sets it to
 * Playwright's, `RI_TEST_CHROMIUM` is its older name). Otherwise Chrome or Brave where
 * macOS keeps them, and then Playwright's own when it's installed, so a test runs the
 * same on a Mac with a browser and on Linux with `playwright-core install chromium`.
 */
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const MAC_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

export function testChromiumPath(): string | undefined {
  const named = process.env.RI_REVIEW_CHROMIUM || process.env.RI_TEST_CHROMIUM;
  if (named) return named;
  return [...MAC_BROWSERS, chromium.executablePath()].find(file => fs.existsSync(file));
}

import type { Page } from 'playwright-core';

/**
 * Loading a test page parses a development bundle of several megabytes. On
 * the slowest CI runner (macos-15-intel) with every worker busy, that took
 * over 6 seconds, past the short limits tests keep for what they check.
 * Loading isn't what they check, so it gets its own limit.
 */
export const PAGE_LOAD_MS = 30_000;

/** A test's limit for what it waits on, and room for the page itself to load. */
export function testTimeouts<T extends Pick<Page, 'setDefaultTimeout' | 'setDefaultNavigationTimeout'>>(page: T, ms: number): T {
  page.setDefaultTimeout(ms);
  page.setDefaultNavigationTimeout(Math.max(ms, PAGE_LOAD_MS));
  return page;
}

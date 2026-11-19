import type { Page } from 'playwright-core';

/** A packaged app's first start stages its bundled release before its Home
 * opens: copying and hashing over 4 GB, which took about 4 minutes on CI's
 * Apple-chip Mac and up to 14 on its Intel one when the copy was new. */
export const FIRST_START_MS = 15 * 60_000;

/**
 * Where a new installation lands: there's no setup wizard any more, so a
 * fresh Home opens straight on the dashboard, and first-run setup is a
 * conversation in its main chat (docs/main-chat-onboarding.md). Waiting for
 * the rail rather than the chat's greeting keeps this independent of
 * whether a harness is installed on the machine running the smoke.
 */
export async function waitForHome(page: Page, timeout = 240_000): Promise<void> {
  await page.waitForURL((url) => url.protocol === 'https:' && url.pathname === '/', { timeout });
  await page.locator('aside:visible').first().waitFor({ timeout: 60_000 });
}

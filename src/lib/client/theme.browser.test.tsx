import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

// The head script, the drawing component and the shared settings control, as a page loads them.
let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {APPEARANCE_SCRIPT} from '@/lib/client/appearance-script';
    import {ClientAppearance,useDocumentTheme} from '@/lib/client/theme';
    import {ThemeSettings} from '@/components/settings/sections/theme-settings';
    import {TipProvider} from '@/components/ui/tip';
    new Function(APPEARANCE_SCRIPT)();
    window.__beforeReact = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    function Editor(){return <output aria-label="Editor theme">{useDocumentTheme()}</output>;}
    createRoot(document.getElementById('root')).render(<TipProvider><ClientAppearance/><ThemeSettings/><Editor/></TipProvider>);
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

const drawn = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
const choice = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name, exact: true });

it('follows the device on Automatic, keeps a chosen theme across reloads, and returns to the device', async () => {
  const page = await fixture.browser.newPage();
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(fixture.url);
    await expect.poll(() => choice(page, 'Automatic').getAttribute('aria-checked')).toBe('true');
    expect(await drawn(page)).toBe('light');
    expect(await page.getByLabel('Editor theme').textContent()).toBe('light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => drawn(page)).toBe('dark');
    await expect.poll(() => page.getByLabel('Editor theme').textContent()).toBe('dark');

    await choice(page, 'Light').click();
    await expect.poll(() => drawn(page)).toBe('light');
    await page.reload();
    expect(await page.evaluate(() => (window as unknown as { __beforeReact: string }).__beforeReact)).toBe('light');
    await expect.poll(() => choice(page, 'Light').getAttribute('aria-checked')).toBe('true');
    expect(await drawn(page)).toBe('light');

    // Arrow keys move along the choice, as in every other rounded switch.
    // Radix moves focus on a timer, so hold the arrow through it, as real input does.
    await choice(page, 'Light').focus();
    await page.keyboard.down('ArrowRight');
    try { await expect.poll(() => choice(page, 'Dark').getAttribute('aria-checked')).toBe('true'); }
    finally { await page.keyboard.up('ArrowRight'); }
    await expect.poll(() => drawn(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await drawn(page)).toBe('dark');

    await choice(page, 'Automatic').click();
    await expect.poll(() => drawn(page)).toBe('light');
    expect(await page.evaluate(key => localStorage.getItem(key), 'ri.client.theme')).toBe('system');
  } finally { await page.close(); }
}, 60_000);

it('fits the settings control on a phone in both themes', async () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const page = await fixture.browser.newPage({ viewport: { width: 320, height: 640 } });
    try {
      await page.emulateMedia({ colorScheme });
      await page.goto(fixture.url);
      await choice(page, 'Dark').waitFor();
      expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      for (const name of ['Automatic', 'Light', 'Dark']) expect(await choice(page, name).isVisible()).toBe(true);
    } finally { await page.close(); }
  }
}, 60_000);

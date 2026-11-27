/**
 * Use Ri on your phone, at the end of first-run setup, in a real browser on a
 * phone-sized screen. The home is played by routed tRPC answers: its devices,
 * its remote address, and a new pairing. With an https address the offer
 * opens Settings' own pairing form and draws its QR code and link here. Without
 * one it explains Set up phone access. Neither spills past a narrow screen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {PhoneOffer} from './src/components/chat/onboarding/onboarding-phone';
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={client}><TipProvider>
        <main className="bg-background text-foreground"><div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 pt-4 pb-8"><PhoneOffer/></div></main>
      </TipProvider></QueryClientProvider>);
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

const home = { id: 'home', name: 'Mac mini', kind: 'computer', platform: 'darwin', hostname: 'mac', status: 'active', isHome: true, isThisDevice: true, runsAgents: true, lastSeenAt: null, worker: null, keys: [] };
const phone = { ...home, id: 'phone-1', name: 'My phone', kind: 'phone', isHome: false, isThisDevice: false, runsAgents: false, keys: [{ id: 'key-1', name: 'My phone', prefix: 'ri_', suffix: 'abcd', env: 'live', createdAt: '2026-11-26T00:00:00.000Z', lastUsedAt: null as string | null, expiresAt: null, revokedAt: null, role: 'sign_in', current: false }] };

/** Open the offer at `width`, with the home answering for `tunnel` and the devices given. */
async function open(width: number, tunnel: string | null, state: { paired: boolean } = { paired: false }, theme = 'light'): Promise<Page> {
  const page = await fixture.browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
  const data = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify({ result: { data: body } }) });
  await page.route('**/api/trpc/devices.list**', route => route.fulfill(data(state.paired
    ? [home, { ...phone, keys: [{ ...phone.keys[0]!, lastUsedAt: '2026-11-26T09:00:00.000Z' }] }]
    : [home])));
  await page.route('**/api/trpc/settings.baseUrlGet**', route => route.fulfill(data({ tunnel, lan: 'http://192.168.1.20:4224', local: 'http://localhost:4224', autoTunnel: false, tunnelName: null, effectiveTunnelName: 'ri', defaultTunnelName: 'ri', tunnelNameLocked: false, tunnelNameEnvVar: 'RI_TUNNEL_NAME' })));
  await page.route('**/api/trpc/devices.create**', route => route.fulfill(data({ device: { ...phone, keys: [] }, key: phone.keys[0], plaintext: 'ri_live_pairingtoken' })));
  await page.goto(`${fixture.url}/?theme=${theme}`);
  return page;
}

const fits = async (page: Page, width: number) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  const overflow = await page.locator('section[aria-label="Use Ri on your phone"] *').evaluateAll((nodes, max) =>
    nodes.filter(node => node.getBoundingClientRect().right > max + 0.5).map(node => node.outerHTML.slice(0, 80)), width);
  expect(overflow).toEqual([]);
};

describe('Use Ri on your phone', () => {
  for (const width of [360, 390]) for (const theme of ['light', 'dark']) {
    it(`pairs with Settings' QR code and link when the home has an https address (${width}px, ${theme})`, async () => {
      const page = await open(width, 'https://ri.example.com', { paired: false }, theme);
      try {
        await page.getByRole('button', { name: 'Use Ri on your phone' }).click();
        const name = page.getByRole('textbox', { name: 'Name' });
        expect(await name.inputValue()).toBe('My phone');
        expect(await page.getByRole('combobox').count()).toBe(0);
        await fits(page, width);

        await page.getByRole('button', { name: 'Create pairing link' }).click();
        await page.getByText('Pairing link for My phone').waitFor();
        // The remote address first, as Settings does for a phone.
        expect(await page.getByRole('textbox', { name: 'Pairing link' }).first().inputValue()).toBe('https://ri.example.com/#token=ri_live_pairingtoken');
        const qr = page.locator('section[aria-label="Use Ri on your phone"] img').first();
        await expect.poll(() => qr.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect(await page.getByText('Waiting for your phone to open the link').isVisible()).toBe(true);
        await fits(page, width);
      } finally { await page.close(); }
    });
  }

  it('explains Set up phone access without an https address, and fits a narrow phone', async () => {
    const page = await open(360, 'http://mac.tail-scale.ts.net:4224');
    try {
      await page.getByRole('button', { name: 'Use Ri on your phone' }).click();
      await page.getByRole('button', { name: 'Set up phone access' }).waitFor();
      expect(await page.getByText(/microphone/).isVisible()).toBe(true);
      expect(await page.getByRole('button', { name: 'Create pairing link' }).count()).toBe(0);
      await fits(page, 360);
    } finally { await page.close(); }
  });

  it('is not offered once a phone has paired', async () => {
    const page = await open(390, 'https://ri.example.com', { paired: true });
    try {
      await page.waitForResponse(response => response.url().includes('devices.list'));
      await page.waitForTimeout(200);
      expect(await page.getByRole('button', { name: 'Use Ri on your phone' }).count()).toBe(0);
      expect(await page.locator('section[aria-label="Use Ri on your phone"]').count()).toBe(0);
    } finally { await page.close(); }
  });
});

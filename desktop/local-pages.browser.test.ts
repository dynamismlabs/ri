/** Offline HTML builders in the same Chromium used by the app's browser tests. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testChromiumPath } from '../src/test/fixtures/test-chromium';
import { companionPage } from './companion-page';
import { maintenancePage } from './maintenance-page';
import { localPageStyle, startingPage } from './local-page-style';
import { findBarPage } from './find-page';

let browser: Browser;
let server: http.Server;
let base: string;
const themeCss = fs.readFileSync('src/styles/theme.css', 'utf8');
const fontDataUrl = `data:font/woff2;base64,${fs.readFileSync('public/fonts/inter-latin.woff2').toString('base64')}`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const q = new URL(req.url!, 'http://fixture');
    const theme = q.searchParams.get('theme') === 'light' ? 'light' : 'dark';
    const platform = q.searchParams.get('platform') ?? process.platform;
    const options = { theme, platform, themeCss, fontDataUrl } as const;
    const html = q.pathname === '/find' ? findBarPage('nonce', options)
      : q.pathname === '/maintenance' ? maintenancePage('nonce', { ...options, chooseInstallation: true })
      : q.pathname === '/loading' ? startingPage('nonce', options)
      : q.pathname === '/field' ? `<!doctype html><html class="${theme}"><head>${localPageStyle('nonce', options).head}</head><body><main><label>Value<input aria-label="Value" aria-invalid="true"></label></main></body></html>`
      : companionPage('nonce', { ...options, view: q.pathname === '/connect' ? 'connect' : 'auto' });
    res.setHeader('content-type', 'text/html'); res.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ executablePath: testChromiumPath(), headless: true });
});
afterAll(async () => {
  await browser?.close(); server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});
async function open(view: string, theme: string, platform = process.platform): Promise<Page> {
  const page = await browser.newPage({ viewport: view === 'find' ? { width: 380, height: 56 } : { width: 900, height: 1000 } });
  await page.addInitScript({ content: `window.riLocal={onTheme(){}};window.riCompanion={request:async()=>({role:'first-run',homeSelected:false,preferences:{},desktop:'1.0'})};window.riMaintenance={request:async()=>({phase:'failed',failure:'Recovery is available',identity:{root:'home',database:'data.db',config:'config',work:'work'}})};` });
  await page.goto(`${base}/${view}?theme=${theme}&platform=${platform}`);
  await page.locator('main,form').waitFor();
  return page;
}
async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluate(el => {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const backgrounds: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement) backgrounds.unshift(getComputedStyle(p).backgroundColor);
    const rgb = (...layers: string[]) => { ctx.clearRect(0, 0, 1, 1); for (const color of layers) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); } return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
    const lum = (a: number[]) => a.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
    const bg = rgb('white', ...backgrounds); const fg = rgb(`rgb(${bg.join(' ')})`, getComputedStyle(el).color);
    return (Math.max(lum(bg), lum(fg)) + .05) / (Math.min(lum(bg), lum(fg)) + .05);
  });
}
for (const theme of ['light', 'dark']) {
  it(`uses capsule buttons, including disabled choices, with readable hover and keyboard focus (${theme})`, async () => {
    const page = await open('companion', theme);
    try {
      const button = page.locator('#choose-connect');
      await button.waitFor({ state: 'visible' }); await button.hover(); await page.waitForTimeout(200);
      expect(await button.evaluate(el => {
        const style = getComputedStyle(el);
        return [el.getBoundingClientRect().height, style.fontSize, style.fontWeight];
      })).toEqual([40, '15px', '500']);
      expect(await button.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');
      expect(await contrast(page, '#choose-connect')).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab'); await button.focus();
      expect(await button.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      await button.evaluate(el => { (el as HTMLButtonElement).disabled = true; });
      expect(await button.evaluate(el => [getComputedStyle(el).borderRadius, getComputedStyle(el).opacity])).toEqual(['999px', '0.5']);
    } finally { await page.close(); }
  });
  it(`uses the role scale for local main and secondary actions (${theme})`, async () => {
    const page = await open('maintenance', theme);
    try {
      const main = page.locator('button:not(.secondary, .link)').first();
      const secondary = page.locator('#refresh');
      for (const [button, height, font] of [[main, 40, '15px'], [secondary, 32, '13px']] as const) {
        await button.waitFor({ state: 'visible' });
        expect(await button.evaluate(el => {
          const style = getComputedStyle(el);
          return [el.getBoundingClientRect().height, style.fontSize, style.borderRadius];
        })).toEqual([height, font, '999px']);
      }
    } finally { await page.close(); }
  });
  it(`uses 10px fields, invalid ink and one clear field focus treatment (${theme})`, async () => {
    const page = await open('field', theme);
    try {
      const input = page.getByRole('textbox'); await input.focus();
      const state = await input.evaluate(el => { const s = getComputedStyle(el); const p = document.createElement('span'); p.style.color = 'var(--danger)'; el.after(p); const danger = getComputedStyle(p).color; p.remove(); return { radius: s.borderRadius, border: s.borderTopColor, danger, outline: s.outlineWidth }; });
      expect(state.radius).toBe('10px'); expect(state.border).toBe(state.danger); expect(state.outline).toBe('2px');
    } finally { await page.close(); }
  });
  it(`uses 14px raised maintenance sections without outlines (${theme})`, async () => {
    const page = await open('maintenance', theme);
    try {
      const state = await page.locator('.maintenance > section').first().evaluate(el => { const s = getComputedStyle(el); const p = document.createElement('span'); p.style.backgroundColor = 'var(--raised)'; el.after(p); const fill = getComputedStyle(p).backgroundColor; p.remove(); return { radius: s.borderRadius, border: s.borderTopWidth, background: s.backgroundColor, fill }; });
      expect(state.radius).toBe('14px'); expect(state.border).toBe('0px'); expect(state.background).toBe(state.fill);
    } finally { await page.close(); }
  });
  it(`keeps the find bar field and buttons focused inside its small window (${theme})`, async () => {
    const page = await open('find', theme);
    try {
      const input = page.getByRole('textbox'); await input.fill('Ri'); await input.focus();
      expect(await page.locator('form').evaluate(el => [getComputedStyle(el).borderRadius, getComputedStyle(el).outlineWidth])).toEqual(['10px', '2px']);
      const button = page.locator('#close'); await page.keyboard.press('Tab'); await button.focus();
      expect(await button.evaluate(el => [getComputedStyle(el).borderRadius, getComputedStyle(el).outlineOffset])).toEqual(['999px', '-2px']);
      expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
    } finally { await page.close(); }
  });
  for (const view of ['companion', 'connect', 'maintenance', 'loading', 'find']) {
    it(`renders ${view} with the shared platform font and usable system-ui fallback (${theme})`, async () => {
      const page = await open(view, theme, 'linux');
      try {
        const state = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, width: document.body.scrollWidth, viewport: innerWidth }));
        expect(state.font).toContain('system-ui'); expect(state.font.startsWith('Inter')).toBe(false); expect(state.width).toBeLessThanOrEqual(state.viewport);
        const folder = process.env.RI_ARTIFACT_SCREENSHOTS ?? path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'ri-native-system');
        fs.mkdirSync(folder, { recursive: true });
        await page.screenshot({ path: path.join(folder, `${process.platform}-local-${view}-${theme}.png`), fullPage: true });
      } finally { await page.close(); }
    });
  }
}

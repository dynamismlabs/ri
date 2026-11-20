/**
 * The new look (src/styles/edge.css) against the real stylesheet in Chromium.
 * The look draws its own fills and shadows over components built for classic,
 * so what can go wrong is a cascade mistake no unit test sees: a focus ring
 * replaced by a fill, a hover that loses its contrast, a scroller that moves
 * from the element that watches it. Each case is one a review found.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testChromiumPath } from '@/test/fixtures/test-chromium';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

let server: http.Server;
let browser: Browser;
let base: string;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
  const css = await postcss([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {TooltipProvider} from '@/components/ui/tooltip';
      import {SegmentedTabs, toolbarButtonClass} from '@/components/shared/list-toolbar';
      const LANES=[{value:'progress',label:'In progress',count:9},{value:'todo',label:'Todo',count:4},{value:'waiting',label:'Waiting',count:2},{value:'done',label:'Done',count:30}];
      function Fixture(){
        const [lane,setLane]=useState('progress');
        return <div className="flex flex-col items-start gap-3 p-4">
          <div data-narrow className="flex" style={{width:210}}><SegmentedTabs ariaLabel="Lanes" value={lane} onChange={setLane} options={LANES}/></div>
          <button data-case="toolbar" className={toolbarButtonClass()}>Filter</button>
          <button data-case="card" className="w-64 rounded-lg border border-border bg-card p-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">A board card</button>
          {/* The review bar's solid action, with execution-review-bar.tsx's classes. */}
          <button data-case="solid" data-slot="review-action" data-tone="emerald-solid" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 bg-emerald-600 text-white hover:bg-emerald-700">Accept & complete</button>
        </div>;
      }
      createRoot(document.getElementById('root')).render(<TooltipProvider><Fixture/></TooltipProvider>);
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
  });
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (url.pathname === '/fixture.css') { res.setHeader('content-type', 'text/css'); res.end(css.css); return; }
    const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : '';
    const look = url.searchParams.get('look') === 'edge' ? ' data-look="edge"' : '';
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html class="${theme}"${look}><head><link rel="stylesheet" href="/fixture.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const executablePath = testChromiumPath();
  if (!executablePath) throw new Error('Chromium is required for the new look checks');
  browser = await chromium.launch({ executablePath, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close(); server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});

async function open(look: 'edge' | 'classic', theme: 'light' | 'dark'): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 520, height: 360 } });
  testTimeouts(page, 5_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?look=${look}&theme=${theme}`);
  await page.locator('[data-case="solid"]').waitFor();
  return { page, errors };
}

/** WCAG contrast between an element's text and its fill as seen, laid over the page (a fill can be translucent), in any CSS color syntax. */
async function contrast(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const page = getComputedStyle(document.body).backgroundColor;
    const rgb = (...layers: string[]) => {
      ctx.clearRect(0, 0, 1, 1);
      for (const color of layers) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (c: number[]) => {
      const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fill = rgb(page, style.backgroundColor);
    const text = rgb(`rgb(${fill.join(' ')})`, style.color);
    const [a, b] = [luminance(text), luminance(fill)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps a visible focus ring on the controls it restyles (${theme})`, async () => {
    const { page, errors } = await open('edge', theme);
    try {
      const seen: string[] = [];
      // Focus the page (an empty corner), then move by keyboard so :focus-visible applies.
      await page.mouse.click(2, 2);
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const style = getComputedStyle(el);
          return { name: el.dataset.case ?? el.textContent?.trim() ?? '', outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
        });
        seen.push(focused.name);
        expect(focused.outline, `${focused.name} shows its focus`).toBe('solid');
        expect(focused.width, `${focused.name} shows its focus`).toBeGreaterThanOrEqual(2);
      }
      expect(seen).toEqual(['In progress9', 'Todo4', 'Waiting2', 'Done30', 'toolbar', 'card', 'solid']);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });

  it(`keeps Accept & complete readable on hover (${theme})`, async () => {
    for (const look of ['edge', 'classic'] as const) {
      const { page } = await open(look, theme);
      try {
        await page.locator('[data-case="solid"]').hover();
        await page.waitForTimeout(250); // transition-colors
        expect(await contrast(page, '[data-case="solid"]'), `${look} on hover`).toBeGreaterThan(3);
      } finally { await page.close(); }
    }
  });
}

it('scrolls a narrow lane switch where its edge fades look', async () => {
  const { page } = await open('edge', 'light');
  try {
    const state = await page.evaluate(() => {
      const scroller = document.querySelector('[role="group"][aria-label="Lanes"]') as HTMLElement;
      const track = document.querySelector('[data-narrow] [data-slot="segmented"]') as HTMLElement;
      return { trackOverflow: getComputedStyle(track).overflowX, overflows: scroller.scrollWidth > scroller.clientWidth, mask: scroller.style.maskImage || scroller.style.webkitMaskImage };
    });
    // The track doesn't scroll on its own. The wrapper SegmentedTabs measures does, and fades its edge.
    expect(state.trackOverflow).toBe('visible');
    expect(state.overflows).toBe(true);
    expect(state.mask).toContain('gradient');
  } finally { await page.close(); }
});

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
      import {Button} from '@/components/ui/button';
      import {ButtonGroup} from '@/components/ui/button-group';
      import {PERMISSION_MODE_META} from '@/lib/permission-modes';
      import {SegmentedTabs, toolbarButtonClass} from '@/components/shared/list-toolbar';
      import {ChatLenses, ChatLensBar} from '@/components/workspaces/chat-lens-bar';
      import {FileChip} from '@/components/chat-ui/artifacts/file-chip';
      import {MessageFileChip} from '@/components/chat-ui/artifacts/message-file-chip';
      const LENSES=[{value:'all',label:'All'},{value:'unread',label:'Unread',count:2,tone:'attention'},{value:'working',label:'Working'}];
      const LANES=[{value:'progress',label:'In progress',count:9},{value:'todo',label:'Todo',count:4},{value:'waiting',label:'Waiting',count:2},{value:'done',label:'Done',count:30}];
      function Fixture(){
        const [lane,setLane]=useState('progress');
        return <div className="flex flex-col items-start gap-3 p-4">
          <div data-narrow className="flex" style={{width:210}}><SegmentedTabs ariaLabel="Lanes" value={lane} onChange={setLane} options={LANES}/></div>
          <button data-case="toolbar" className={toolbarButtonClass()}>Filter</button>
          <button data-case="card" className="w-64 rounded-lg border border-border bg-card p-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">A board card</button>
          {/* The review bar's solid action, with execution-review-bar.tsx's classes. */}
          <button data-case="solid" data-slot="review-action" data-tone="emerald-solid" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 bg-emerald-600 text-white hover:bg-emerald-700">Accept & complete</button>
          <span data-case="small-label" className="text-[8.5px] uppercase tracking-widest">Recent chats</span>
          <div data-slot="status-strip" className="inline-flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-1">
            <span>2 commits ahead</span><button data-focus data-case="git-action" data-slot="action-button" data-variant="primary" className="rounded-md border bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 focus-visible:outline-none">Push</button>
          </div>
          <button data-focus data-case="mode" data-slot="chip-button" data-mode="auto_all" className={["rounded-md border px-2 py-1 hover:brightness-110",...Object.values(PERMISSION_MODE_META.auto_all.classes)].join(" ")}>Auto</button>
          <div data-slot="split-button" className="inline-flex items-stretch">
            <button data-focus data-case="finder" className="rounded-l-md border border-r-0 bg-background px-2 py-1 text-muted-foreground hover:bg-muted/40">Finder</button>
            <button data-focus data-case="finder-more" aria-label="More open options" className="rounded-r-md border bg-background px-2 text-muted-foreground hover:bg-muted/40">⌄</button>
          </div>
          <div data-slot="row-actions" className="opacity-0"><button data-focus data-case="row-action" aria-label="More task actions" className="rounded p-1 text-muted-foreground hover:bg-muted">…</button></div>
          <div data-slot="settings-nav"><button data-focus data-case="settings-nav" aria-current="page" className="rounded-lg bg-background px-3 py-2 shadow-sm ring-1 ring-border">General</button></div>
          <div data-slot="settings-body" className="space-y-2">
            <section data-case="settings-section" className="rounded-lg border border-border bg-background p-3">
              <input data-focus data-case="settings-field" aria-label="Timezone" className="rounded-md border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring" defaultValue="America/Denver" />
              <button data-focus data-case="settings-action" className="rounded border border-border bg-background px-2.5 py-1.5 text-foreground hover:bg-muted">Save</button>
              <button data-focus data-case="settings-solid" className="rounded border border-border bg-foreground px-2.5 py-1.5 text-background hover:bg-foreground/90">Connect</button>
            </section>
          </div>
          <button data-focus data-case="choice" data-slot="choice-row" aria-pressed="true" className="w-64 rounded border border-primary/60 bg-primary/5 p-3 text-left ring-1 ring-primary/20 focus:outline-none">Continue this chat</button>
          <div data-slot="calendar-navigation" className="flex"><button data-focus data-case="previous" aria-label="Previous week" className="rounded-md p-1 text-muted-foreground hover:bg-muted/50">‹</button><button data-focus data-case="today" className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted/50">Today</button></div>
          <div data-slot="chat-tabs" className="flex h-9 w-64 items-center gap-0.5 border-b px-1.5">
            <button data-focus data-case="all-chats" className="h-7 shrink-0 rounded px-1.5">≡ 3</button>
            <div data-slot="chat-tabs-scroll" className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto">
              {['First chat','Second chat','Third chat'].map((name,i)=><div data-slot="chat-tab" data-current={i===0?'true':undefined} className="flex h-7 shrink-0 rounded bg-muted" key={name}><button data-focus data-case={'chat-'+i} className="h-full whitespace-nowrap px-2">{name}</button><button data-focus data-case={'close-'+i} aria-label={'Close '+name} className="mr-1 size-4 rounded">×</button></div>)}
            </div>
            <button data-focus data-case="new-chat" className="size-6 shrink-0 rounded">+</button>
          </div>
          <div data-slot="calendar-toolbar" data-case="calendar-small" className="flex w-72 items-center gap-2">
            <span className="w-32 min-w-0 truncate">November 16 to 22</span>
            <div data-slot="segmented" className="flex overflow-hidden rounded-md border"><button>Calendar</button><button>List</button><button>Report</button></div>
          </div>
          {['auto_edits','ask','plan'].map(mode=><button key={mode} data-case={'mode-'+mode} data-slot="chip-button" data-mode={mode} className={['rounded-md border px-2 py-1 hover:brightness-110',...Object.values(PERMISSION_MODE_META[mode].classes)].join(' ')}>{PERMISSION_MODE_META[mode].shortTitle}</button>)}
          <div data-slot="settings-body" data-case="settings-segments" style={{width:360}}>
            <div data-slot="segmented" className="flex gap-1">
              {['All','Local','Cloud','Browser'].map((label,i)=><button key={label} aria-pressed={i===0} className={'rounded-full border px-3 py-1 text-[11px] font-medium transition-all '+(i===0?'border-primary bg-primary/5 text-primary':'border-border text-muted-foreground hover:text-foreground')}>{label}</button>)}
            </div>
            <div data-slot="segmented" role="radiogroup" className="flex flex-wrap gap-1.5">
              <button role="radio" aria-checked="true" className="rounded-full border border-primary/60 bg-primary/10 px-2.5 py-1">Normal</button>
              <button role="radio" aria-checked="false" className="rounded-full border border-border px-2.5 py-1">Fast</button>
            </div>
            <ButtonGroup aria-label="Show at"><Button aria-pressed={false} variant="outline" size="xs">&gt;0%</Button><Button data-case="usage-toggle" aria-pressed size="xs">50%</Button><Button aria-pressed size="xs">80%</Button></ButtonGroup>
          </div>
          <div data-slot="settings-nav"><input data-case="settings-search" aria-label="Search settings" className="rounded-lg border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring" /></div>
          {/* The agent page's chat lenses (compact) and the phone's (touch), as they render. */}
          <div data-case="lenses"><ChatLenses value="all" onChange={()=>{}}><ChatLensBar label="Chats" options={LENSES}/></ChatLenses></div>
          <div data-case="lenses-touch" style={{width:360}}><ChatLenses value="all" onChange={()=>{}}><ChatLensBar label="Phone chats" size="touch" options={LENSES}/></ChatLenses></div>
          <div data-case="tail" className="flex w-72 flex-col items-start gap-3">
            <button data-tail-focus data-slot="content-card" className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2">A saved reference<br/>With a description</button>
            <button data-tail-focus data-slot="image-picker" aria-label="Choose image" className="size-16 rounded-xl border-2 border-dashed border-border">Image</button>
            <button data-tail-focus data-slot="calendar-event" className="w-full rounded-md border bg-muted p-2 text-left" style={{boxShadow:'inset 3px 0 0 rgb(30, 120, 200)'}}>Design review</button>
            <button data-tail-focus data-slot="menu-action" className="w-full rounded-md border-t border-border px-2 py-1.5 text-left hover:bg-muted">Do not repeat</button>
            <button data-tail-focus data-slot="completion-control" aria-label="Complete task" className="size-4 rounded-full border border-border" />
            <input data-tail-focus data-case="invalid-field" data-slot="field" aria-invalid="true" aria-label="Invalid value" className="rounded-md border border-destructive bg-background p-2 focus:outline-none focus:ring-1" />
            <button data-tail-focus data-case="warning-action" data-slot="action-button" data-tone="warning" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-600 dark:text-amber-400">Reconnect</button>
            <div data-case="file-chip"><FileChip path="/work/review.md" /></div>
            <div data-case="bubble" className="rounded-xl p-3" style={{background:'var(--user-bubble)',color:'var(--user-bubble-foreground)'}}>
              <MessageFileChip tone="bubble" attachment={{fileName:'example.bin',originalName:'Design archive.zip',mimeType:'application/octet-stream',size:2048,uploadedAt:'2026-11-20'}} />
            </div>
            <button data-tail-focus data-case="floating-action" data-slot="action-button" data-variant="floating" className="rounded-full border bg-background px-3 py-1 text-muted-foreground shadow-sm">More models below</button>
            <div data-case="filter-scroll" data-slot="segmented" data-scroll className="flex flex-wrap gap-1.5">
              {['All sources','Built into Ri','Connected apps','Installed skills'].map((label,i)=><button key={label} aria-pressed={i===0} className="rounded-full border px-3 py-1">{label}</button>)}
            </div>
          </div>
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
    const backgrounds: string[] = [];
    for (let parent: Element | null = el; parent; parent = parent.parentElement) backgrounds.unshift(getComputedStyle(parent).backgroundColor);
    const rgb = (...layers: string[]) => {
      ctx.clearRect(0, 0, 1, 1);
      for (const color of layers) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (c: number[]) => {
      const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fill = rgb(...backgrounds);
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

for (const theme of ['light', 'dark'] as const) {
  it(`shows keyboard focus on phase 3 controls, including clipped tabs (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      await page.locator('[data-case="solid"]').focus();
      const controls = await page.locator('[data-focus]').count();
      for (let i = 0; i < controls; i++) {
        await page.keyboard.press('Tab');
        const state = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const s = getComputedStyle(el);
          return { name: el.dataset.case, style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) };
        });
        expect(state.name).toBeTruthy();
        expect(state.style, state.name).toBe('solid');
        expect(state.width, state.name).toBeGreaterThanOrEqual(2);
        if (state.name === 'row-action') expect(await page.locator('[data-slot="row-actions"]').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
        if (state.name?.startsWith('chat-') || state.name?.startsWith('close-')) expect(state.offset).toBeLessThan(0);
      }
    } finally { await page.close(); }
  });

  it(`keeps filled actions and status controls readable on hover (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      for (const name of ['git-action','mode','mode-auto_edits','mode-ask','mode-plan','finder','settings-action','settings-solid','choice','today']) {
        const selector = `[data-case="${name}"]`;
        await page.locator(selector).hover();
        await page.waitForTimeout(250);
        expect(await contrast(page, selector), name).toBeGreaterThan(4.5);
        if (name === 'choice') expect(await page.locator(selector).evaluate(el => getComputedStyle(el).borderRadius)).toBe('8px');
      }
    } finally { await page.close(); }
  });
}

it('keeps split controls joined, content rectangular and chat tabs on their existing scroller', async () => {
  const { page } = await open('edge', 'light');
  try {
    const state = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const split = document.querySelector('[data-slot="split-button"]')!.getBoundingClientRect();
      const first = document.querySelector('[data-case="finder"]')!.getBoundingClientRect();
      const second = document.querySelector('[data-case="finder-more"]')!.getBoundingClientRect();
      const scroller = document.querySelector('[data-slot="chat-tabs-scroll"]')!;
      return {
        splitRadius: parseFloat(style('[data-slot="split-button"]').borderRadius),
        contiguous: first.right === second.left && first.left === split.left && second.right === split.right,
        divider: parseFloat(style('[data-case="finder-more"]').borderLeftWidth),
        fieldRadius: style('[data-case="settings-field"]').borderRadius,
        choiceRadius: style('[data-case="choice"]').borderRadius,
        settingsShadow: style('[data-case="settings-nav"]').boxShadow,
        scrolls: scroller.scrollWidth > scroller.clientWidth,
        overflow: style('[data-slot="chat-tabs-scroll"]').overflowX,
        tabRadius: parseFloat(style('[data-slot="chat-tab"]').borderRadius),
        labelSize: style('[data-case="small-label"]').fontSize,
      };
    });
    expect(state.splitRadius).toBeGreaterThan(100);
    expect(state.contiguous).toBe(true);
    expect(state.divider).toBe(1);
    expect(state.fieldRadius).toBe('10px');
    expect(state.choiceRadius).toBe('8px');
    expect(state.settingsShadow).toBe('none');
    expect(state.scrolls).toBe(true);
    expect(state.overflow).toBe('auto');
    expect(state.tabRadius).toBeGreaterThan(100);
    expect(state.labelSize).toBe('11px');
  } finally { await page.close(); }
});

it('keeps all Calendar view labels visible when the date needs to truncate', async () => {
  const { page } = await open('edge', 'light');
  try {
    const state = await page.locator('[data-case="calendar-small"]').evaluate(el => {
      const track = el.querySelector('[data-slot="segmented"]')!;
      const bounds = track.getBoundingClientRect();
      const last = track.lastElementChild!.getBoundingClientRect();
      return { fits: track.scrollWidth <= track.clientWidth, lastFits: last.right <= bounds.right, toolbarFits: bounds.right <= el.getBoundingClientRect().right };
    });
    expect(state).toEqual({ fits: true, lastFits: true, toolbarFits: true });
  } finally { await page.close(); }
});

for (const theme of ['light', 'dark'] as const) {
  it(`keeps Settings segments fitted and their selected thumb visible, including hover (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      const expected = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--edge-thumb)';
        document.body.append(probe);
        const thumb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return thumb;
      });
      const tracks = page.locator('[data-case="settings-segments"] [data-slot="segmented"]');
      for (const track of await tracks.all()) {
        const selected = track.locator('[aria-pressed="true"], [aria-checked="true"]');
        expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(expected);
        expect(await track.evaluate(el => el.getBoundingClientRect().width < el.parentElement!.getBoundingClientRect().width)).toBe(true);
        await selected.hover();
        await page.waitForTimeout(250);
        expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(expected);
        const off = track.locator('[aria-pressed="false"], [aria-checked="false"]').first();
        await off.hover();
        await page.waitForTimeout(250);
        expect(await off.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      }
    } finally { await page.close(); }
  });

  it(`uses a soft fill for independent Settings toggles (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      const expected = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--edge-selected)';
        probe.style.color = 'var(--edge-t1)';
        document.body.append(probe);
        const style = getComputedStyle(probe);
        const result = { background: style.backgroundColor, color: style.color };
        probe.remove();
        return result;
      });
      const toggle = page.locator('[data-case="usage-toggle"]');
      await toggle.hover();
      await page.waitForTimeout(250);
      expect(await toggle.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }))).toEqual(expected);
    } finally { await page.close(); }
  });

  it(`keeps the Settings search ring without a second outline (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      await page.keyboard.press('Tab');
      await page.locator('[data-case="settings-search"]').focus();
      const search = await page.locator('[data-case="settings-search"]').evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
      expect(search.outline).toBe('none');
      expect(search.shadow).not.toBe('none');
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`draws the agent page's chat lenses as one segmented control (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      const lenses = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--edge-thumb)';
        document.body.append(probe);
        const thumb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const read = (selector: string) => {
          const list = document.querySelector(`${selector} [role="tablist"]`) as HTMLElement;
          const tabs = Array.from(list.querySelectorAll('[role="tab"]')) as HTMLElement[];
          const chosen = tabs.find(t => t.getAttribute('aria-selected') === 'true')!;
          return {
            trackRadius: parseFloat(getComputedStyle(list).borderTopLeftRadius),
            chosenFill: getComputedStyle(chosen).backgroundColor,
            chosenRadius: parseFloat(getComputedStyle(chosen).borderTopLeftRadius),
            heights: tabs.map(t => t.getBoundingClientRect().height),
            fill: tabs.reduce((sum, t) => sum + t.getBoundingClientRect().width, 0) / list.getBoundingClientRect().width,
          };
        };
        return { thumb, compact: read('[data-case="lenses"]'), touch: read('[data-case="lenses-touch"]') };
      });
      for (const bar of [lenses.compact, lenses.touch]) {
        expect(bar.trackRadius).toBeGreaterThan(100);
        expect(bar.chosenRadius).toBeGreaterThan(100);
        expect(bar.chosenFill).toBe(lenses.thumb);
      }
      // The phone keeps its touch height and its full-width tabs.
      expect(lenses.touch.heights.every(h => h >= 36)).toBe(true);
      expect(lenses.touch.fill).toBeGreaterThan(0.9);
      expect(lenses.compact.heights.every(h => h <= 26)).toBe(true);
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps long-tail content shapes, event stripes and keyboard focus (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      await page.locator('[data-case="tail"] button').first().focus();
      for (const control of await page.locator('[data-tail-focus]').all()) {
        await control.focus();
        const state = await control.evaluate(el => {
          const s = getComputedStyle(el);
          return { slot: el.getAttribute('data-slot'), radius: s.borderRadius, outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
        });
        expect(state.outline, state.slot!).toBe('solid');
        expect(state.width, state.slot!).toBe('2px');
        if (state.slot === 'content-card' || state.slot === 'image-picker') expect(state.radius).toBe('14px');
        if (state.slot === 'calendar-event') {
          expect(state.radius).toBe('8px');
          expect(state.shadow).toContain('inset');
          expect(state.shadow).toContain('30, 120, 200');
        }
        if (state.slot === 'completion-control') expect(parseFloat(state.radius)).toBeGreaterThan(100);
      }
      const invalid = await page.locator('[data-case="invalid-field"]').evaluate(el => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--destructive)';
        el.after(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(el).borderColor, expected };
      });
      expect(invalid.border).toBe(invalid.expected);
    } finally { await page.close(); }
  });

  it(`keeps actual file chips readable on the pane and inverted bubble (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      for (const selector of ['[data-case="file-chip"] button', '[data-case="bubble"] a', '[data-case="warning-action"]']) {
        const chip = page.locator(selector);
        // A capsule even where the source classes still say rounded-md.
        expect(parseFloat(await chip.evaluate(el => getComputedStyle(el).borderRadius))).toBeGreaterThan(100);
        await chip.hover();
        await page.waitForTimeout(250);
        expect(await contrast(page, selector)).toBeGreaterThan(4.5);
        await page.keyboard.press('Tab');
        await chip.focus();
        expect(await chip.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
      }
      const bubbleInk = await page.locator('[data-case="bubble"]').evaluate(el => getComputedStyle(el).color);
      expect(await page.locator('[data-case="bubble"] a').evaluate(el => getComputedStyle(el).color)).toBe(bubbleInk);
    } finally { await page.close(); }
  });

  it(`keeps floating actions opaque and a narrow filter track scrollable (${theme})`, async () => {
    const { page } = await open('edge', theme);
    try {
      const floating = page.locator('[data-case="floating-action"]');
      for (const hover of [false, true]) {
        if (hover) await floating.hover();
        await page.waitForTimeout(250);
        const state = await floating.evaluate(el => {
          const style = getComputedStyle(el);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return { alpha: ctx.getImageData(0, 0, 1, 1).data[3], shadow: style.boxShadow };
        });
        expect(state.alpha).toBe(255);
        expect(state.shadow).not.toBe('none');
        expect(await contrast(page, '[data-case="floating-action"]')).toBeGreaterThan(4.5);
      }
      const track = page.locator('[data-case="filter-scroll"]');
      expect(await track.evaluate(el => ({ overflow: getComputedStyle(el).overflowX, overflows: el.scrollWidth > el.clientWidth, fits: el.getBoundingClientRect().width <= el.parentElement!.clientWidth }))).toEqual({ overflow: 'auto', overflows: true, fits: true });
      const last = track.locator('button').last();
      await last.focus();
      const state = await last.evaluate(el => {
        const r = el.getBoundingClientRect();
        const parent = el.parentElement!.getBoundingClientRect();
        return { visible: r.left >= parent.left && r.right <= parent.right, outline: getComputedStyle(el).outlineStyle, inset: parseFloat(getComputedStyle(el).outlineOffset) < 0 };
      });
      expect(state).toEqual({ visible: true, outline: 'solid', inset: true });
    } finally { await page.close(); }
  });
}

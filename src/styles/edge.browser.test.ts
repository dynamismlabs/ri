/**
 * The product system (theme.css and edge.css) against the real stylesheet in Chromium.
 * Compatibility rules draw fills and shadows over hand-built utility classes,
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
      import {Button} from '@/components/system/button';
import {Field} from '@/components/system/field';
import {ChipButton} from '@/components/system/chip-button';
import {IconButton} from '@/components/system/icon-button';
      import {ButtonGroup} from '@/components/system/button-group';
      import {Card} from '@/components/system/card';import {ChoiceRow} from '@/components/system/choice-row';import {MenuAction} from '@/components/system/menu-action';
      import {Callout} from '@/components/system/callout';import {StatusBadge} from '@/components/system/status-badge';import {Meta,MetaItem} from '@/components/system/meta';
      import {StatusPill} from '@/components/dashboard/status-pill';
      import {Command} from 'cmdk';
      import {PERMISSION_MODE_META} from '@/lib/permission-modes';
      import {SegmentedControl,SegmentedRoot,SegmentedList} from '@/components/system/segmented-control';
      import {useViewportTier} from '@/hooks/use-viewport-tier';
      import {ChatLenses, ChatLensBar} from '@/components/workspaces/chat-lens-bar';
      import {WorkbenchToggles} from '@/components/executions/workbench/workbench-toggles';
      import {FileChip} from '@/components/chat-ui/artifacts/file-chip';
      import {MessageFileChip} from '@/components/chat-ui/artifacts/message-file-chip';
      const LENSES=[{value:'all',label:'All'},{value:'unread',label:'Unread',count:2,tone:'attention'},{value:'working',label:'Working'}];
      const LANES=[{value:'progress',label:'In progress',count:9},{value:'todo',label:'Todo',count:4},{value:'waiting',label:'Waiting',count:2},{value:'done',label:'Done',count:30}];
      function Fixture(){
        const [lane,setLane]=useState('progress');
        const touch=useViewportTier()==='phone';
        return <div className="flex flex-col items-start gap-3 p-4">
          <div data-narrow className="flex" style={{width:210}}><SegmentedControl mode="choice" grow ariaLabel="Lanes" value={lane} onChange={setLane} options={LANES}/></div>
          <ChipButton data-case="toolbar">Filter</ChipButton>
          <Card as="button" data-case="card" className="w-64" shadow>A board card</Card>
          {/* The review bar's solid action, with execution-review-bar.tsx's classes. */}
          <Button data-case="solid" variant="primary" size="sm" tone="success">Accept & complete</Button>
          <span data-case="small-label" className="text-[8.5px] uppercase tracking-widest">Recent chats</span>
          <div data-slot="status-strip" className="inline-flex items-center gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-1">
            <span>2 commits ahead</span><Button data-focus data-case="git-action" variant="primary" size="sm">Push</Button>
          </div>
          <ChipButton data-focus data-case="mode" variant="secondary" size="compact" tone="mode" mode="auto_all">Auto</ChipButton>
          <ButtonGroup variant="joined">
            <Button data-focus data-case="finder" variant="secondary" size="sm">Finder</Button>
            <Button data-focus data-case="finder-more" aria-label="More open options" variant="secondary" size="sm">⌄</Button>
          </ButtonGroup>
          <div data-slot="row-actions" className="opacity-0"><button data-focus data-case="row-action" aria-label="More task actions" className="rounded p-1 text-muted-foreground hover:bg-muted">…</button></div>
          <div data-slot="settings-nav"><MenuAction data-focus data-case="settings-nav" aria-current="page">General</MenuAction></div>
          <div data-slot="settings-body" className="space-y-2">
            <Card as="section" data-case="settings-section">
              <Field data-focus data-case="settings-field" aria-label="Timezone" defaultValue="America/Denver" />
              <Button data-focus data-case="settings-action" variant="secondary" size="sm">Save</Button>
              <Button data-focus data-case="settings-solid" variant="primary" size="sm">Connect</Button>
            </Card>
          </div>
          <ChoiceRow data-focus data-case="choice" aria-pressed="true" className="w-64">Continue this chat</ChoiceRow>
          <div data-slot="calendar-navigation" className="flex"><button data-focus data-case="previous" aria-label="Previous week" className="rounded-md p-1 text-muted-foreground hover:bg-muted/50">‹</button><button data-focus data-case="today" className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted/50">Today</button></div>
          <div data-slot="chat-tabs" className="flex h-9 w-64 items-center gap-0.5 border-b px-1.5">
            <Button data-focus data-case="all-chats" size="sm" focus="inside">≡ 3</Button>
            <div data-slot="chat-tabs-scroll" className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto">
              {['First chat','Second chat','Third chat'].map((name,i)=><div data-slot="chat-tab" data-current={i===0?'true':undefined} className="flex h-7 shrink-0 rounded bg-muted" key={name}><button data-focus data-case={'chat-'+i} className="h-full whitespace-nowrap px-2">{name}</button><IconButton data-focus data-case={'close-'+i} label={'Close '+name} size="xs" focus="inside" className="mr-1">×</IconButton></div>)}
            </div>
            <IconButton data-focus data-case="new-chat" label="New chat" size="xs" focus="inside">+</IconButton>
          </div>
          <div data-slot="calendar-toolbar" data-case="calendar-small" className="flex w-72 items-center gap-2">
            <span className="w-32 min-w-0 truncate">November 16 to 22</span>
            <SegmentedControl mode="choice" className="shrink-0" ariaLabel="Calendar view" value="calendar" onChange={()=>{}} options={[{value:"calendar",label:"Calendar"},{value:"list",label:"List"},{value:"report",label:"Report"}]} />
          </div>
          {['auto_edits','ask','plan'].map(mode=><ChipButton key={mode} data-case={'mode-'+mode} variant="secondary" size="compact" tone="mode" mode={mode}>{PERMISSION_MODE_META[mode].shortTitle}</ChipButton>)}
          <div data-slot="settings-body" data-case="settings-segments" style={{width:360}}>
<SegmentedControl mode="choice" ariaLabel="Voice provider" value="All" onChange={()=>{}} options={["All","Local","Cloud","Browser"].map(value=>({value,label:value}))}/>
<SegmentedControl mode="choice" selection="radio" ariaLabel="Speed" value="normal" onChange={()=>{}} options={[{value:"normal",label:"Normal"},{value:"fast",label:"Fast"}]}/>
            <ButtonGroup aria-label="Show at"><Button aria-pressed={false} variant="secondary" size="xs">&gt;0%</Button><Button data-case="usage-toggle" aria-pressed size="xs">50%</Button><Button aria-pressed size="xs">80%</Button></ButtonGroup>
          </div>
          <div data-slot="settings-nav"><Field data-case="settings-search" aria-label="Search settings" /></div>
          {/* The agent page's chat lenses (compact) and the phone's (touch), as they render. */}
          <div data-case="lenses"><ChatLenses value="all" onChange={()=>{}}><ChatLensBar label="Chats" options={LENSES}/></ChatLenses></div>
          <div data-case="lenses-touch" style={{width:360}}><ChatLenses value="all" onChange={()=>{}}><ChatLensBar label="Phone chats" size="touch" options={LENSES}/></ChatLenses></div>
<SegmentedRoot mode="tabs" value="chat" onChange={()=>{}}><div data-case="agent-pane" className="flex w-72 gap-1 px-4 pb-2"><SegmentedList ariaLabel="Agent panes" size="touch" stretch options={[{value:"chat",label:"Chat"},{value:"tools",label:"Tools"}]}/></div></SegmentedRoot>
          <div data-case="workbench-toggle"><WorkbenchToggles tools={{open:true,onToggle(){},showLabel:"Files"}} fold={{label:"",kbd:""}} /></div>
          <div data-case="tail" className="flex w-72 flex-col items-start gap-3">
            <Card as="button" data-tail-focus className="w-full" shadow>A saved reference<br/>With a description</Card>
            <button data-tail-focus data-slot="image-picker" aria-label="Choose image" className="size-16 rounded-xl border-2 border-dashed border-border">Image</button>
            <button data-tail-focus data-slot="calendar-event" className="w-full rounded-md border bg-muted p-2 text-left" style={{boxShadow:'inset 3px 0 0 rgb(30, 120, 200)'}}>Design review</button>
            <MenuAction data-tail-focus density="compact" separator className="w-full">Do not repeat</MenuAction>
            <button data-tail-focus data-slot="completion-control" aria-label="Complete task" className="size-4 rounded-full border border-border" />
            <Field data-tail-focus data-case="invalid-field" aria-invalid="true" aria-label="Invalid value" />
            <Button data-tail-focus data-case="warning-action" variant="secondary" size="sm" tone="warning">Reconnect</Button>
            <div data-case="file-chip"><FileChip path="/work/review.md" /></div>
            <div data-case="bubble" className="rounded-xl p-3" style={{background:'var(--user-bubble)',color:'var(--user-bubble-foreground)'}}>
              <MessageFileChip tone="bubble" attachment={{fileName:'example.bin',originalName:'Design archive.zip',mimeType:'application/octet-stream',size:2048,uploadedAt:'2026-11-20'}} />
            </div>
            <Button data-tail-focus data-case="floating-action" variant="secondary" size="sm" floating>More models below</Button>
<div data-case="filter-scroll" className="max-w-full min-w-0"><SegmentedControl mode="choice" ariaLabel="Sources" value="All sources" onChange={()=>{}} options={["All sources","Built into Ri","Connected apps","Installed skills"].map(value=>({value,label:value}))}/></div>
          </div>
          <section data-case="default-audit" className="flex w-full flex-col items-start gap-3">
            <StatusPill label="Working" tone="success" count={2} icon={<svg/>} accentClass="text-blue-500" countBgClass="bg-blue-500/10 text-blue-500">{()=> <span>Working chats</span>}</StatusPill>
            <ChipButton  variant="secondary" size="compact"><span><span data-case="usage-percent" className="font-mono text-[10px]">80%</span></span></ChipButton>
            <ChipButton data-audit-focus data-case="history" variant="secondary" size="compact">History</ChipButton>
            {[false,true].map(disabled=><Button key={String(disabled)} data-audit-focus={!disabled||undefined} data-case={disabled?'send-disabled':'send-enabled'} aria-label={disabled?'Send disabled':'Send enabled'} disabled={disabled} variant="primary" size="sm">↑</Button>)}
            <Meta>
              <MetaItem as="button" data-audit-focus data-case="energy-light" kind="energy" energy="light">Light</MetaItem>
              <MetaItem as="button" data-audit-focus data-case="energy-deep" kind="energy" energy="deep">Deep</MetaItem>
              <MetaItem as="button" data-audit-focus data-case="progress" kind="status" tone="status-progress">In progress</MetaItem>
              {['consider','todo','done'].map(status=><MetaItem as="button" key={status} data-case={'status-'+status} kind="status" tone={'status-'+status}>{status}</MetaItem>)}
              <MetaItem data-case="due-today" urgency="today">Today</MetaItem>
            </Meta>
            <Command><Command.Group heading="Recent" className="[&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"><Command.Item>Recent chat</Command.Item></Command.Group></Command>
            <div data-slot="search-footer" className="text-[9px]">↑↓ navigate <kbd className="text-[8px]">Esc</kbd></div>
<div data-case="plugins"><SegmentedControl mode="choice" ariaLabel="Plugins line replacement" value="installed" onChange={()=>{}} options={[{value:"installed",label:"Installed"},{value:"discover",label:"Discover"}]}/></div>
            {['rounded-[26px]','rounded-lg','rounded-xl'].map((radius,i)=><div key={radius} data-case={'dialog-'+i} data-slot="dialog-content" className={radius+' border bg-card p-2'}>Dialog</div>)}
            {['bg-black/80','bg-background/80 backdrop-blur-sm'].map((fill,i)=><div key={fill} data-case={'overlay-'+i} data-slot="dialog-overlay" className={fill+' h-2 w-2'}/>)}
<div data-case="responsive-tabs"><SegmentedControl mode="choice" ariaLabel="Library" size={touch?"touch":"compact"} value="all" onChange={()=>{}} options={[{value:"all",label:"All"},{value:"apps",label:"Apps"}]}/></div>
            <div data-slot="dialog-content" data-kind="wrapped"><div data-case="wrapped-dialog" className="rounded-xl border bg-card p-2 shadow-2xl">New chat</div></div>
<div data-case="responsive-segments"><SegmentedControl mode="choice" ariaLabel="Filter" size={touch?"touch":"compact"} value="all" onChange={()=>{}} options={[{value:"all",label:"All"},{value:"active",label:"Active"}]}/></div>
            <Card as="a" data-audit-focus data-case="audit-run" href="#" shadow className="flex w-full flex-wrap items-center gap-3 md:flex-nowrap">
              <StatusBadge>Scheduled</StatusBadge><StatusBadge>Completed</StatusBadge>
              <span data-run-summary className="order-first basis-full flex-1 whitespace-normal text-[12px] md:order-none md:basis-auto md:truncate">Prepared the weekly operations review for the whole team</span><span className="whitespace-nowrap text-[11px] md:text-[10px]">Nov 20, 10:30 AM</span>
            </Card>
            <div data-slot="calendar-toolbar" data-case="calendar-phone" className="flex w-full items-center gap-2 border p-3">
              <span className="text-sm font-semibold">Calendar</span>
              <SegmentedControl mode="choice" className="shrink-0" ariaLabel="Period" value="week" onChange={()=>{}} options={[{value:"week",label:"Week"},{value:"day",label:"Day"}]}/>
              <div data-slot="calendar-navigation" className="flex"><button>‹</button><button>Today</button><button>›</button></div>
              <span data-slot="calendar-date" className="truncate">November 16 to 22</span><div data-slot="calendar-spacer" className="flex-1"/>
              <SegmentedControl mode="choice" className="shrink-0" ariaLabel="Show" value="calendar" onChange={()=>{}} options={[{value:"calendar",label:"Calendar"},{value:"list",label:"List"},{value:"report",label:"Report"}]}/>
              <label data-slot="calendar-work-toggle">Agent work</label><IconButton aria-label="Refresh" variant="secondary" size="sm" label="Refresh">↻</IconButton><IconButton data-kind="close" aria-label="Close calendar" variant="secondary" size="sm" label="Close calendar">×</IconButton>
            </div>
            <dl data-slot="work-chain" className="flex w-full min-w-[min(100%,30rem)] gap-3 rounded-lg border p-3">
              {['Your time','Agent time','Human time for the same work'].map((label,i)=><React.Fragment key={label}>{i>0&&<div data-slot="work-chain-arrow" className="flex min-w-10 flex-1 flex-col pt-3.5"><span>{i===1?'0.5×':'1×'}</span><span>→</span></div>}<div data-slot="work-chain-step" className="shrink-0"><dt>{label}</dt><dd>1h 9m</dd></div></React.Fragment>)}
            </dl>
            <div data-slot="pairing"><div data-slot="pairing-mark" className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner"/><Callout><Field data-audit-focus aria-label="Pairing token" trailing={<Button size="sm">Connect</Button>}/></Callout></div>
          </section>
          <div data-case="canvas-token" className="bg-canvas text-t1">Canvas</div>
          <div className="dark"><div data-case="nested-pane-token" className="bg-pane text-t1">Nested dark pane</div></div>
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
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html class="${theme}"><head><link rel="stylesheet" href="/fixture.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/fixture.js"></script></body></html>`);
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

async function open(theme: 'light' | 'dark'): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 520, height: 360 } });
  testTimeouts(page, 5_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?theme=${theme}`);
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
    const { page, errors } = await open(theme);
    try {
      const seen: string[] = [];
      // Focus the page (an empty corner), then move by keyboard so :focus-visible applies.
      await page.mouse.click(2, 2);
      for (let i = 0; i < 4; i++) {
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
      expect(seen).toEqual(['In progress9', 'toolbar', 'card', 'solid']);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });

  it(`keeps Accept & complete readable on hover (${theme})`, async () => {
    {
      const { page } = await open(theme);
      try {
        await page.locator('[data-case="solid"]').hover();
        await page.waitForTimeout(250); // transition-colors
        expect(await contrast(page, '[data-case="solid"]'), 'on hover').toBeGreaterThan(3);
      } finally { await page.close(); }
    }
  });
}

it('scrolls a narrow lane switch where its edge fades look', async () => {
  const { page } = await open('light');
  try {
    const state = await page.evaluate(() => {
      const scroller = document.querySelector('[data-narrow] .ri-segment-scroller') as HTMLElement;
      const track = document.querySelector('[data-narrow] .ri-segment-track') as HTMLElement;
      return { trackOverflow: getComputedStyle(track).overflowX, overflows: scroller.scrollWidth > scroller.clientWidth, mask: getComputedStyle(scroller).maskImage };
    });
    // The track doesn't scroll on its own. The wrapper SegmentedControl measures does, and fades its edge.
    expect(state.trackOverflow).toBe('visible');
    expect(state.overflows).toBe(true);
    expect(state.mask).toContain('gradient');
  } finally { await page.close(); }
});

for (const theme of ['light', 'dark'] as const) {
  it(`shows keyboard focus on phase 3 controls, including clipped tabs (${theme})`, async () => {
    const { page } = await open(theme);
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
    const { page } = await open(theme);
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
  const { page } = await open('light');
  try {
    const state = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const split = document.querySelector('[data-slot="button-group"].ri-button-group--joined')!.getBoundingClientRect();
      const first = document.querySelector('[data-case="finder"]')!.getBoundingClientRect();
      const second = document.querySelector('[data-case="finder-more"]')!.getBoundingClientRect();
      const scroller = document.querySelector('[data-slot="chat-tabs-scroll"]')!;
      return {
        splitRadius: parseFloat(style('[data-slot="button-group"].ri-button-group--joined').borderRadius),
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
  const { page } = await open('light');
  try {
    const state = await page.locator('[data-case="calendar-small"]').evaluate(el => {
      const track = el.querySelector('.ri-segment-track')!;
      const bounds = track.getBoundingClientRect();
      const last = track.lastElementChild!.getBoundingClientRect();
      return { fits: track.scrollWidth <= track.clientWidth, lastFits: last.right <= bounds.right, toolbarFits: bounds.right <= el.getBoundingClientRect().right };
    });
    expect(state).toEqual({ fits: true, lastFits: true, toolbarFits: true });
  } finally { await page.close(); }
});

for (const theme of ['light', 'dark'] as const) {
  it(`keeps Settings segments fitted and their selected thumb visible, including hover (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const expected = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--thumb)';
        document.body.append(probe);
        const thumb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return thumb;
      });
      const tracks = page.locator('[data-case="settings-segments"] .ri-segment-track');
      for (const track of await tracks.all()) {
        const selected = track.locator('[aria-pressed="true"], [aria-checked="true"]');
        expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(expected);
        expect(await track.evaluate(el => el.getBoundingClientRect().width < el.closest('[data-case="settings-segments"]')!.getBoundingClientRect().width)).toBe(true);
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
    const { page } = await open(theme);
    try {
      const expected = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--selected)';
        probe.style.color = 'var(--t1)';
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

  it(`gives Settings search one field outline (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      await page.keyboard.press('Tab');
      await page.locator('[data-case="settings-search"]').focus();
      const search = await page.locator('[data-case="settings-search"]').evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
      expect(search.outline).toBe('solid');
      expect(search.shadow).toBe('none');
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`draws the agent page's chat lenses as one segmented control (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const lenses = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--thumb)';
        document.body.append(probe);
        const thumb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const read = (selector: string) => {
          const list = document.querySelector(`${selector} [role="group"]`) as HTMLElement;
          const tabs = Array.from(list.querySelectorAll('[aria-pressed]')) as HTMLElement[];
          const chosen = tabs.find(t => t.getAttribute('aria-pressed') === 'true')!;
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
    const { page } = await open(theme);
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
        if (state.slot === 'card' || state.slot === 'image-picker') expect(state.radius).toBe('14px');
        if (state.slot === 'calendar-event') {
          expect(state.radius).toBe('8px');
          expect(state.shadow).toContain('inset');
          expect(state.shadow).toContain('30, 120, 200');
        }
        if (state.slot === 'field-control') expect(state.shadow).toBe('none');
        if (state.slot === 'completion-control') expect(parseFloat(state.radius)).toBeGreaterThan(100);
      }
      await page.locator('[data-case="invalid-field"]').focus();
      const invalid = await page.locator('[data-case="invalid-field"]').evaluate(el => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--destructive)';
        el.after(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { outline: getComputedStyle(el).outlineColor, expected };
      });
      expect(invalid.outline).toBe(invalid.expected);
    } finally { await page.close(); }
  });

  it(`keeps actual file chips readable on the pane and inverted bubble (${theme})`, async () => {
    const { page } = await open(theme);
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
    const { page } = await open(theme);
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
      const track = page.locator('[data-case="filter-scroll"] .ri-segment-scroller');
      expect(await track.evaluate(el => ({ display: getComputedStyle(el).display, overflow: getComputedStyle(el).overflowX, overflows: el.scrollWidth > el.clientWidth, fits: el.getBoundingClientRect().width <= el.parentElement!.clientWidth }))).toEqual({ display: 'block', overflow: 'auto', overflows: true, fits: true });
      const last = track.locator('button').last();
      await last.focus();
      const state = await last.evaluate(el => {
        const r = el.getBoundingClientRect();
        const parent = el.closest('.ri-segment-scroller')!.getBoundingClientRect();
        return { visible: r.left >= parent.left && r.right <= parent.right, outline: getComputedStyle(el).outlineStyle, inset: parseFloat(getComputedStyle(el).outlineOffset) < 0 };
      });
      expect(state).toEqual({ visible: true, outline: 'solid', inset: true });
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps the common Tools toggle rounded, selected and focusable (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const button = page.locator('[data-case="workbench-toggle"] button');
      await page.keyboard.press('Tab');
      await button.focus();
      const state = await button.evaluate(el => {
        const s = getComputedStyle(el);
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--selected)'; el.after(probe);
        const selected = getComputedStyle(probe).backgroundColor; probe.remove();
        return { radius: parseFloat(s.borderRadius), outline: s.outlineStyle, fill: s.backgroundColor, selected };
      });
      expect(state.radius).toBeGreaterThan(100);
      expect(state.outline).toBe('solid');
      expect(state.fill).toBe(state.selected);
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps the narrow agent switch inside its existing header gutters (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const state = await page.locator('[data-case="agent-pane"]').evaluate(el => {
        const row = el.getBoundingClientRect();
        const track = el.firstElementChild!.getBoundingClientRect();
        const buttons = Array.from(el.querySelectorAll('button')).map(button => button.getBoundingClientRect());
        return { left: track.left - row.left, right: row.right - track.right, full: buttons[0].width + buttons[1].width, width: track.width, height: buttons[0].height };
      });
      expect(state.left).toBe(16);
      expect(state.right).toBe(16);
      expect(state.full).toBe(state.width - 4);
      expect(state.height).toBe(36);
    } finally { await page.close(); }
  });
}



for (const theme of ['light', 'dark'] as const) {
  it(`default audit keeps both Send states and header actions as readable capsules (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      for (const selector of ['[aria-label="Working: 2"]','[data-case="history"]','[data-case="send-enabled"]','[data-case="send-disabled"]']) {
        const state = await page.locator(selector).evaluate(el => { const s=getComputedStyle(el); return {radius:parseFloat(s.borderRadius),size:parseFloat(s.fontSize)}; });
        expect(state.radius,selector).toBeGreaterThan(100);
        if (!selector.includes('send-')) expect(state.size,selector).toBeGreaterThanOrEqual(12);
      }
      expect(await page.locator('[data-case="usage-percent"]').evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px');
      await page.keyboard.press('Tab');
      await page.locator('[aria-label="Working: 2"]').focus();
      expect(await page.locator('[aria-label="Working: 2"]').evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
    } finally { await page.close(); }
  });
  it(`default audit metadata has at least 4.5 contrast at 12px (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      for (const name of ['energy-light','energy-deep','progress','status-consider','status-todo','status-done','due-today']) {
        const selector='[data-case="'+name+'"]';
        expect(await contrast(page,selector),name).toBeGreaterThanOrEqual(4.5);
        await page.locator(selector).hover();
        expect(await contrast(page,selector),name+' hovered').toBeGreaterThanOrEqual(4.5);
        expect(await page.locator(selector).evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px');
      }
    } finally { await page.close(); }
  });
  it(`default audit search headings escape descendant capitals and footer stays readable (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const heading=await page.locator('[cmdk-group-heading]').evaluate(el=>{const s=getComputedStyle(el);return {size:parseFloat(s.fontSize),weight:s.fontWeight,transform:s.textTransform,spacing:s.letterSpacing};});
      expect(heading).toEqual({size:12,weight:'500',transform:'none',spacing:'normal'});
      expect(await page.locator('[data-slot="search-footer"]').evaluate(el=>getComputedStyle(el).fontSize)).toBe('12px');
    } finally { await page.close(); }
  });
  it(`default audit Plugins line tabs have a thumb without an underline (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      const tab=page.locator('[data-case="plugins"] [aria-pressed="true"]');
      expect(await tab.evaluate(el=>getComputedStyle(el,'::after').content)).toBe('none');
      expect(await tab.evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
    } finally { await page.close(); }
  });
  it(`default audit centered dialogs share corners and an unblurred scrim (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      for (let i=0;i<3;i++) expect(await page.locator('[data-case="dialog-'+i+'"]').evaluate(el=>getComputedStyle(el).borderRadius)).toBe('20px');
      expect(await page.locator('[data-case="wrapped-dialog"]').evaluate(el=>{const s=getComputedStyle(el);return [s.borderRadius,s.boxShadow];})).toEqual(['20px','none']);
      for (let i=0;i<2;i++) expect(await page.locator('[data-case="overlay-'+i+'"]').evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.backdropFilter];})).toEqual(['rgba(0, 0, 0, 0.4)','none']);
    } finally { await page.close(); }
  });
  it(`default audit phone filters, run summaries and calendar stay usable (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      await page.setViewportSize({width:390,height:844});
      for (const selector of ['[data-case="responsive-segments"] button','[data-case="responsive-tabs"] button']) expect(await page.locator(selector).first().evaluate(el=>el.getBoundingClientRect().height)).toBe(36);
      const run=await page.locator('[data-case="audit-run"]').evaluate(el=>{const summary=el.querySelector('[data-run-summary]')!;const badge=el.querySelector('.ri-status-badge')!;return {summary:summary.getBoundingClientRect().bottom,badge:badge.getBoundingClientRect().top,wrap:getComputedStyle(summary).whiteSpace};});
      expect(run.wrap).toBe('normal');expect(run.badge).toBeGreaterThanOrEqual(run.summary);
      expect(await page.locator('[data-slot="work-chain-arrow"]').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().width>0&&getComputedStyle(el).display!=='none'))).toBe(true);
      for (const selector of ['[data-case="calendar-phone"]','[data-slot="work-chain"]']) {
        const overflow=await page.locator(selector).evaluate(el=>{const bounds=el.getBoundingClientRect();return (()=>{const boxes=(node:Element):Element[]=>Array.from(node.children).flatMap(child=>{const display=getComputedStyle(child).display;return display==='none'?[]:display==='contents'?boxes(child):[child];});return boxes(el).map(child=>({left:child.getBoundingClientRect().left-bounds.left,right:bounds.right-child.getBoundingClientRect().right}));})();});
        for (const item of overflow) {expect(item.left,selector).toBeGreaterThanOrEqual(0);expect(item.right,selector).toBeGreaterThanOrEqual(0);}
      }
      await page.setViewportSize({width:1024,height:844});
      await expect.poll(()=>page.locator('[data-case="responsive-segments"] button').first().evaluate(el=>el.getBoundingClientRect().height)).toBe(24);
    } finally { await page.close(); }
  });
  it(`default audit pairing is quiet and every new control retains keyboard focus (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      for (const selector of ['[data-slot="pairing-mark"]','[data-slot="pairing"] .ri-callout','[data-slot="pairing"] [data-slot="field-shell"]']) expect(await page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return [s.boxShadow,s.backdropFilter];})).toEqual(['none','none']);
      expect(await page.locator('[data-slot="pairing-mark"]').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe('none');
      await page.keyboard.press('Tab');
      for (const control of await page.locator('[data-audit-focus]').all()) {
        await control.focus();
        expect(await control.evaluate(el=>{let s=getComputedStyle(el);if(el.tagName==='INPUT')s=getComputedStyle(el.parentElement!);return [s.outlineStyle,s.outlineWidth];})).toEqual(['solid','2px']);
      }
    } finally { await page.close(); }
  });
}


for (const theme of ['light', 'dark'] as const) {
  it(`uses registered product tokens without a look attribute, including nested dark (${theme})`, async () => {
    const { page } = await open(theme);
    try {
      expect(await page.locator('html').getAttribute('data-look')).toBeNull();
      expect(await page.locator('[data-case="canvas-token"]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(theme === 'dark' ? 'oklch(0.145 0.0028 264)' : 'oklch(0.985 0.0012 264)');
      expect(await page.locator('[data-case="nested-pane-token"]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('oklch(0.183 0.0028 264)');
      expect(await page.locator('[data-case="nested-pane-token"]').evaluate(el => getComputedStyle(el).color)).toBe('oklch(0.955 0.003 264)');
    } finally { await page.close(); }
  });
  for (const nested of [false, true]) {
    it(`semantic ink and fill pairs reach 4.5 contrast at 12px (${theme}, nested dark ${nested})`, async () => {
      const { page } = await open(theme);
      try {
        const tones = ['attention','danger','success','working','info','energy-light','energy-deep','mode-auto','mode-edits','mode-ask','mode-plan','warning-ink'];
        await page.evaluate(({ tones, nested }) => {
          const host = document.createElement('div'); host.id = 'tone-probes'; host.className = nested ? 'dark' : ''; host.style.backgroundColor = 'var(--raised)';
          for (const tone of tones) {
            const probe = document.createElement('span'); probe.dataset.tone = tone;
            const fill = tone === 'warning-ink' ? 'warning-fill' : tone + '-fill';
            probe.style.cssText = 'display:inline-block;font-size:12px;color:var(--' + tone + ');background-color:var(--' + fill + ');'; probe.textContent = tone;
            host.append(probe);
          }
          document.body.append(host);
        }, { tones, nested });
        for (const tone of tones) {
          const selector = '#tone-probes [data-tone="' + tone + '"]';
          expect(await page.locator(selector).evaluate((el, tone) => getComputedStyle(el).getPropertyValue('--' + tone).trim(), tone), tone + ' is defined').not.toBe('');
          expect(await contrast(page, selector), tone).toBeGreaterThanOrEqual(4.5);
        }
      } finally { await page.close(); }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  it(`lets shared chat actions own their ink and inset focus (${theme})`, async () => {
    const {page}=await open(theme);
    try {
      const all=page.locator('[data-case="all-chats"]');
      const ink=await page.evaluate(()=>{const probe=document.createElement('span');probe.style.color='var(--t2)';document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;});
      expect(await all.evaluate(el=>getComputedStyle(el).color)).toBe(ink);
      await page.keyboard.press('Tab');
      for(const action of [all,page.locator('[data-case="close-0"]')]) {
        await action.focus();
        expect(await action.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
        expect(await action.evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-2px');
      }
      expect((await page.locator('[data-case="close-0"]').boundingBox())!.height).toBe(24);
    } finally { await page.close(); }
  });
}

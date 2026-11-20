/** The schedule form and window in Chromium, with fixture data and chat. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

interface FixtureWindow extends Window {
  changes: Record<string, unknown>[];
  failSave: boolean;
  refreshTrigger: () => void;
}

let server: http.Server;
let browser: Browser;
let base: string;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
  const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
  const css = await postcss([require('@tailwindcss/postcss')()]).process(
    fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') },
  );
  const fixture = `
    import React, {createContext, useContext, useState} from 'react';
    const Context=createContext(null);
    export function FixtureProvider({children}) {
      const kind=new URLSearchParams(location.search).get('kind') || 'cron';
      const targetKind=new URLSearchParams(location.search).get('target') || 'workspace';
      const [trigger,setTrigger]=useState({id:'fixture-job',name:'Daily briefing',kind,description:null,
        prompt:'Keep my instructions',enabled:false,timezone:'America/Denver',targetKind,workspaceId:'agent-id',
        targetSessionId:targetKind==='session'?'target-chat':null,
        provider:'codex',harness:'codex',model:'gpt-5.5',effort:null,serviceTier:null,timeoutSeconds:null,
        concurrencyPolicy:'coalesce_if_active',activeHoursStart:null,activeHoursEnd:null,
        cronExpression:kind==='cron'?'0 9 * * *':null,intervalSeconds:kind==='every'?90:null,
        runAt:kind==='at'?(location.search.includes('fold')?'2030-11-03T08:30:45.000Z':'2030-10-20T15:30:00.000Z'):null,nextRunAt:null});
      const triggers=Array.from({length:30},(_,i)=>({...trigger,id:'schedule-'+(i+1),name:'Briefing '+(i+1),enabled:true,consecutiveFailures:3}));
      window.refreshTrigger=()=>setTrigger(t=>({...t,prompt:'New instructions from another viewer'}));
      return <Context.Provider value={{trigger,triggers,setTrigger}}>{children}</Context.Provider>;
    }
    export const useFixture=()=>useContext(Context);
    export const useTriggers=()=>({data:useFixture().triggers});
    export const useTrigger=(id)=>({data:useFixture().triggers.find(trigger=>trigger.id===id)});
    export const useRuns=()=>({data:[
      {id:'failed-run',status:'failed',errorMessage:'Could not finish'},
      {id:'completed-run',status:'completed',chatSessionId:'run-chat',summary:'Briefing delivered'},
    ]});
    export const useRunTrigger=()=>({});
    export const useDeleteTrigger=()=>({});
    export const useResetTriggerFailures=()=>({});
    export const useSession=()=>({data:{label:'Briefing chat'}});
    export const useLaptopHome=()=>null;
    export const useScheduleChat=()=>({});
    export const useAdoptMovedScheduleChat=()=>()=>{};
    export const ScheduleChatPanel=()=>null;
    export const RunActivityBadge=()=>null;
    export function useUpdateTrigger() {
      const {setTrigger}=useFixture();
      const [error,setError]=useState(null);
      return {isPending:false,error,mutate:(input,options)=>{
        if(window.failSave){setError(new Error('Schedule could not be saved'));return;}
        window.changes.push(input);setTrigger(t=>({...t,...input}));options?.onSuccess?.(input);
      }};
    }
    export const useCreateTrigger=()=>({isPending:false,error:null,mutate:(input,options)=>{
      window.changes.push(input);options.onSuccess({trigger:{id:'created',...input}});
    }});
    export const useWorkspaces=()=>({data:[{id:'agent-id',name:'Briefing agent',emoji:null}]});
    export const useUserState=()=>({data:{defaultHarness:'codex',defaultModel:'gpt-5.5'}});
    export const useHarnessModels=()=>({models:[{id:'gpt-5.5',label:'GPT-5.5'}]});
    export const ModelControl=()=>null;
    export const EffortControl=()=>null;
  `;
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import {RouterContext} from 'next/dist/shared/lib/router-context.shared-runtime';
      import {FixtureProvider,useFixture} from 'fixture-hooks';
      import {TriggerForm} from '@/components/triggers/trigger-form';
      import {TriggersModal} from '@/components/triggers/triggers-modal';
      import {openSchedulesWindow} from '@/lib/client/schedules-window';
      window.changes=[];
      const router={push:(href)=>history.pushState(null,'',href),prefetch:async()=>{}};
      function App(){const {trigger}=useFixture();
        if(new URLSearchParams(location.search).has('modal')) return <>
          <button onClick={()=>openSchedulesWindow()}>Open schedules</button>
          <TriggersModal/>
        </>;
        return <main className="mx-auto max-w-xl p-6">
        {location.search.includes('create')?<TriggerForm onCreated={()=>{}} onCancel={()=>{}}/>:<TriggerForm trigger={trigger}/>}
      </main>;}
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><RouterContext.Provider value={router}><FixtureProvider><App/></FixtureProvider></RouterContext.Provider></QueryClientProvider>);
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
    plugins: [{ name: 'fixture-data', setup(api: {
      onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
      onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: string; resolveDir: string }): void;
    }) {
      api.onResolve({ filter: /^(?:fixture-hooks|@\/hooks\/use-(?:triggers|workspaces|user-state|harness-models|devices|execution)|@\/components\/(?:workspaces\/launcher\/launch-controls|runs\/run-activity-badge)|\.\/(?:schedule-chat-panel|use-schedule-chat))$/ },
        () => ({ path: 'fixture-hooks', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'tsx', resolveDir: process.cwd() }));
    } }],
  });
  server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0]!.text); return; }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({
    executablePath: process.env.RI_REVIEW_CHROMIUM,
    headless: true,
  });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function open(query = ''): Promise<Page> {
  const page = await browser.newPage({ timezoneId: 'Asia/Tokyo', viewport: { width: 680, height: 1000 } });
  testTimeouts(page, 3_000);
  await page.goto(base + query);
  return page;
}

const changes = (page: Page) => page.evaluate(() => (window as unknown as FixtureWindow).changes);

const save = (page: Page) => page.getByRole('button', { name: 'Save changes' });

it('edits cron through presets or a raw expression, validates input, and merges a change made elsewhere', async () => {
  const page = await open();
  try {
    expect(await save(page).isDisabled()).toBe(true);
    expect(await page.getByLabel('Frequency').inputValue()).toBe('daily');
    await page.getByLabel('Frequency').selectOption('weekly');
    // Weekly starts on Monday. Friday instead:
    await page.getByRole('button', { name: 'Friday' }).click();
    await page.getByRole('button', { name: 'Monday' }).click();
    await page.getByLabel('Time', { exact: true }).fill('16:45');
    // The builder chat or another screen changes the message meanwhile: the
    // untouched message takes it, the schedule being edited keeps the draft.
    await page.evaluate(() => (window as unknown as FixtureWindow).refreshTrigger());
    // A change from outside an event renders in a later task, so wait for it to land.
    await expect.poll(() => page.getByLabel('Message').inputValue()).toBe('New instructions from another viewer');
    expect(await page.getByLabel('Time', { exact: true }).inputValue()).toBe('16:45');
    await save(page).click();
    expect(await changes(page)).toEqual([{ id: 'fixture-job', cronExpression: '45 16 * * 5', timezone: 'America/Denver' }]);
    expect(await save(page).isDisabled()).toBe(true);
    await page.getByLabel('Frequency').selectOption('custom');
    await page.getByLabel('Cron expression').fill('bad cron');
    expect(await save(page).isDisabled()).toBe(true);
    expect(await page.getByRole('alert').textContent()).toContain('Expected 5 fields');
    await page.getByLabel('Cron expression').fill('*/15 9-17 * * 1-5');
    await page.getByLabel('Timezone').fill('Bad/Zone');
    expect(await save(page).isDisabled()).toBe(true);
    await page.getByLabel('Timezone').fill('Europe/London');
    await save(page).click();
    expect((await changes(page))[1]).toEqual({ id: 'fixture-job', cronExpression: '*/15 9-17 * * 1-5', timezone: 'Europe/London' });
  } finally { await page.close(); }
});

it('edits a one-time calendar date in its saved timezone and keeps failures retryable', async () => {
  const page = await open('?kind=at');
  try {
    expect(await page.getByLabel('Date', { exact: true }).inputValue()).toBe('2030-10-20');
    expect(await page.getByLabel('Time', { exact: true }).inputValue()).toBe('09:30');
    await page.getByLabel('Date', { exact: true }).fill('2020-01-01');
    expect(await save(page).isDisabled()).toBe(true);
    await page.getByLabel('Date', { exact: true }).fill('2030-12-20');
    await page.getByLabel('Time', { exact: true }).fill('14:15');
    await page.evaluate(() => { (window as unknown as FixtureWindow).failSave = true; });
    await save(page).click();
    expect(await page.getByRole('alert').textContent()).toContain('could not be saved');
    expect(await page.getByLabel('Date', { exact: true }).inputValue()).toBe('2030-12-20');
    await page.evaluate(() => { (window as unknown as FixtureWindow).failSave = false; });
    await save(page).click();
    expect(await changes(page)).toEqual([{ id: 'fixture-job', cronExpression: null, runAt: '2030-12-20T21:15:00.000Z', timezone: 'America/Denver' }]);
  } finally { await page.close(); }
});

it('discards without saving, edits intervals in their unit, and switches how a job is timed', async () => {
  const page = await open('?kind=every');
  try {
    // 90 seconds isn't whole minutes, so it shows in seconds.
    expect(await page.getByLabel('Every', { exact: true }).inputValue()).toBe('90');
    expect(await page.getByLabel('Unit').inputValue()).toBe('1');
    await page.getByLabel('Every', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    expect(await changes(page)).toEqual([]);
    expect(await page.getByLabel('Every', { exact: true }).inputValue()).toBe('90');
    await page.getByLabel('Unit').selectOption({ label: 'minutes' });
    await page.getByLabel('Every', { exact: true }).fill('30');
    await save(page).click();
    expect(await changes(page)).toEqual([{ id: 'fixture-job', cronExpression: null, intervalSeconds: 1800, timezone: 'America/Denver' }]);
    await page.getByLabel('Frequency').selectOption('daily');
    await page.getByLabel('Time', { exact: true }).fill('07:15');
    await save(page).click();
    expect((await changes(page))[1]).toEqual({ id: 'fixture-job', kind: 'cron', cronExpression: '15 7 * * *', timezone: 'America/Denver' });
  } finally { await page.close(); }
});

it('never re-sends an unchanged one-time instant, even in a repeated daylight saving hour', async () => {
  const page = await open('?kind=at&fold');
  try {
    expect(await page.getByLabel('Time', { exact: true }).inputValue()).toBe('01:30');
    expect(await page.getByText(/Sun, Nov 3, 2030, 1:30 AM MST/).isVisible()).toBe(true);
    await page.getByLabel('Time', { exact: true }).fill('02:30');
    await page.getByLabel('Time', { exact: true }).fill('01:30');
    expect(await save(page).isDisabled()).toBe(true);
    await page.getByLabel('Message').fill('Prepare the notes');
    await save(page).click();
    expect(await changes(page)).toEqual([{ id: 'fixture-job', prompt: 'Prepare the notes' }]);
  } finally { await page.close(); }
});

it('creates a one-time job using the calendar and time picker, and fits a narrow screen', async () => {
  const page = await open('?create');
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Name', { exact: false }).fill('One-time briefing');
    await page.getByPlaceholder("Check my calendar for today's meetings", { exact: false }).fill('Prepare the briefing.');
    await page.getByLabel('Frequency').selectOption('once');
    await page.getByLabel('Date', { exact: true }).fill('2030-10-20');
    await page.getByLabel('Time', { exact: true }).fill('09:30');
    await page.getByLabel('Timezone').fill('America/Denver');
    expect(await page.getByText('Runs once', { exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.RI_SCHEDULE_SCREENSHOT) await page.screenshot({ path: process.env.RI_SCHEDULE_SCREENSHOT, fullPage: true });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // The description is optional.
    expect(await changes(page)).toEqual([expect.objectContaining({
      name: 'One-time briefing', description: null, kind: 'at', runAt: '2030-10-20T15:30:00.000Z',
      cronExpression: null, intervalSeconds: null, timezone: 'America/Denver', workspaceId: 'agent-id',
    })]);
  } finally { await page.close(); }
});

it('says a one-time message to a chat waits for it, where a repeating one skips', async () => {
  const page = await open('?kind=at&target=session');
  try {
    await page.getByRole('button', { name: 'Advanced' }).click();
    const skip = page.getByLabel('If the last run is still going').locator('option[value="skip_if_running"]');
    expect(await skip.textContent()).toBe('Wait until the chat is free');
    await page.getByLabel('Frequency').selectOption('daily');
    expect(await skip.textContent()).toBe('Skip this run');
  } finally { await page.close(); }
});

it('opens a schedule in the window and returns to the same scroll position and row', async () => {
  const page = await open('?modal');
  try {
    await page.getByRole('button', { name: 'Open schedules' }).click();
    const dialog = page.getByRole('dialog', { name: 'Schedules and Triggers' });
    const row = dialog.getByRole('button', { name: /Briefing 24/ });
    await row.scrollIntoViewIfNeeded();
    const list = dialog.locator('.overflow-y-auto').first();
    const scrollTop = await list.evaluate(el => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);

    await row.press('Enter');
    await dialog.getByRole('heading', { name: 'Briefing 24' }).waitFor();
    expect(page.url()).toBe(base + '/?modal');
    const back = dialog.getByRole('button', { name: 'All schedules' });
    expect(await back.evaluate(el => el === document.activeElement)).toBe(true);
    await back.press('Enter');

    expect(await row.evaluate(el => el === document.activeElement)).toBe(true);
    expect(await list.evaluate(el => el.scrollTop)).toBe(scrollTop);
    await dialog.getByRole('button', { name: /Briefing 25/ }).click();
    await dialog.getByRole('heading', { name: 'Briefing 25' }).waitFor();
  } finally { await page.close(); }
});

it.each([
  ['Briefing delivered', '/?session=run-chat'],
  ['Could not finish', '/runs/failed-run'],
  ['View last failed run', '/runs/failed-run'],
  ['Briefing chat', '/?session=target-chat'],
])('closes the window when navigating through %s in the current tab', async (name, destination) => {
  const page = await open('?modal&target=session');
  try {
    await page.getByRole('button', { name: 'Open schedules' }).click();
    const dialog = page.getByRole('dialog', { name: 'Schedules and Triggers' });
    await dialog.getByRole('button', { name: /Briefing 24/ }).click();
    const link = dialog.getByRole('link', { name });

    await link.click({ modifiers: ['ControlOrMeta'] });
    expect(await dialog.isVisible()).toBe(true);
    expect(page.url()).toBe(base + '/?modal&target=session');

    await link.click();
    await page.waitForURL(base + destination);
    await dialog.waitFor({ state: 'hidden' });
  } finally { await page.close(); }
});


for (const theme of ['light', 'dark'] as const) {
  it(`default look Schedules shares the dialog scrim and corners (${theme})`, async () => {
    const page = await open('?modal');
    try {
      await page.evaluate(theme => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, theme);
      await page.getByRole('button', { name: 'Open schedules' }).click();
      const dialog = page.getByRole('dialog', { name: 'Schedules and Triggers' });
      expect(await dialog.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.backdropFilter]; })).toEqual(['rgba(0, 0, 0, 0.4)', 'none']);
      expect(await dialog.locator('[data-slot="dialog-content"]').evaluate(el => getComputedStyle(el).borderRadius)).toBe('20px');
    } finally { await page.close(); }
  });
}

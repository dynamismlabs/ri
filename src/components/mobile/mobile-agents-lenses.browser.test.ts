/**
 * The chat tabs (docs/chat-lenses.md) against an isolated fixture: the real
 * phone Agents tab (`MobileAgentsView`) over the real tab bar, and the real
 * agent Chats tab (`AgentOverview`), with the real data hooks over a seeded
 * query cache and only the dashboard context stubbed.
 *
 * Checks that the Agents tab opens on Unread, with what wants you first and
 * each chat's status line, that its counts and the tab bar's badge agree,
 * that Working lists what's running and only that, that Agents lists every
 * agent with its own state and counts and its chats one tap away, that the
 * picked tab is remembered across a reload, and that an agent's Chats tab
 * opens on All (pins, then every chat newest first) with Unread and Working
 * a tap away, remembered the same way.
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

let server: http.Server;
let browser: Browser;
let base: string;

const dashboard = `
  const record=(kind,value)=>window.actions.push({kind,value});
  const activity={
    streamingSessionIds:new Set(['ri-1','fin-3','web-1','res-main']),
    pendingInputSessionIds:new Set(['web-1']),
    backgroundSessionIds:new Set(),
  };
  export const DashboardProvider=({children})=>children;
  export function useDashboard(){
    return {
      ...activity,
      activeView:{kind:'home'},
      activeSessionId:null,
      activeExecutionId:null,
      mobileTab:'agents',
      setMobileTab:(tab)=>record('tab',tab),
      setActiveView:(next)=>record('navigate',next),
      setMobileCreateOpen:()=>{},
      openAgent:(id)=>record('openAgent',id),
    };
  }
  export const useOptionalDashboard=useDashboard;
`;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
  const css = await postcss([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import {trpc} from '@/lib/trpc/client';
      import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import {TooltipProvider} from '@/components/ui/tooltip';
      import {ConfirmProvider} from '@/components/ui/confirm-dialog';
      import {WorkContext} from '@/contexts/work-context';
      import {MobileAgentsView} from '@/components/mobile/mobile-agents-view';
      import {MobileTabBar} from '@/components/mobile/mobile-tab-bar';
      import {AgentOverview} from '@/components/agents/agent-overview';
      window.actions=[];
      const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
      const at=(minutesAgo)=>new Date(Date.now()-minutesAgo*60_000).toISOString();
      const agent=(id,name,emoji,purpose)=>({id,name,emoji,purpose,attachments:[],areaId:null,collapsed:false,isGit:true,status:'active',sessionCount:0});
      const workspaces=[
        agent('ri','Ri','🛠️','Builds Ri'),
        agent('web','Website','🌐','Runs the marketing site'),
        agent('fin','Finances','💵','Keeps the books'),
        agent('res','Research','🔬','Reads papers'),
      ];
      const chat=(id,workspaceId,label,{unread=false,pinnedAt=null,minutesAgo=5,turnStatus=null,waitingOn}={})=>({
        id,label,status:'active',harness:'claude',workspaceId,workspaceName:workspaces.find(w=>w.id===workspaceId).name,
        workspaceAttachments:[],workspaceEmoji:null,workspaceIsGit:true,branchName:null,location:null,
        startedAt:at(minutesAgo+55),lastActivityAt:at(minutesAgo),lastOutcomeEventAt:at(minutesAgo),
        lastViewedAt:unread?at(minutesAgo+5):at(minutesAgo-4),unreadMarkerAt:null,
        executionId:id,execution:{label,pinnedAt},turnStatus,...(waitingOn?{waitingOn}:{}),
      });
      const ask=(line,effort)=>({line,needsYou:true,effort,unblocks:null,at:at(5)});
      const report=(line)=>({line,needsYou:false,effort:null,unblocks:null,at:at(5)});
      const main=(id,workspaceId,preview,{unread=false}={})=>({
        id,workspaceId,preview,waitingOn:null,lastOutcomeEventAt:at(5),unreadMarkerAt:null,lastViewedAt:unread?at(10):at(1),
      });
      const sessions=[
        // Mid-turn: Working. Its last outcome is unread, but a fresh one is coming.
        chat('ri-1','ri','Rail agents-only trial',{unread:true,minutesAgo:1}),
        chat('ri-2','ri','Fix flaky gallery smoke',{minutesAgo:40,turnStatus:report('Fixed the flaky smoke, nothing needed')}),
        // Blocked on a permission prompt, though already looked at.
        chat('web-1','web','Fix login bug',{minutesAgo:3,waitingOn:'Allow Bash: pnpm db:migrate?'}),
        chat('web-2','web','Update pricing copy',{minutesAgo:90}),
        chat('fin-1','fin','Reconcile Amex',{unread:true,minutesAgo:8,turnStatus:ask('Pick a category for the two Amex refunds','quick')}),
        chat('fin-2','fin','Import Chase CSV',{unread:true,minutesAgo:20}),
        chat('fin-3','fin','Tax estimate',{pinnedAt:at(30),minutesAgo:2}),
        // Unread, but untouched past the week: folds.
        chat('web-3','web','Audit old landing pages',{unread:true,minutesAgo:12*24*60}),
      ];
      client.setQueryData(['workspaces',{status:'active'}],workspaces);
      client.setQueryData(['sessions','rail'],{sessions,pendingSessionIds:['web-1'],runningSessionIds:[],backgroundSessionIds:[],backgroundChats:[],resultReviewAttention:[],homeChat:null,mainChats:[
        main('ri-main','ri','Merged the schedules fix. Want me to restart dev?',{unread:true}),
        main('web-main','web','Deployed the preview build.'),
        main('fin-main','fin','Categorized October.'),
        main('res-main','res','Reading the three papers now.'),
      ]});
      // The server's unread list, newest first.
      client.setQueryData(['sessions','needs-review'],['ri-1','fin-1','fin-2','web-3'].map(id=>sessions.find(s=>s.id===id)));
      client.setQueryData(trpc.userState.list.queryKey({}),{executionInactiveAfterDays:7});
      const noop=()=>{};
      const navigation={
        openAgent:(id,tab)=>window.actions.push({kind:'openAgent',value:tab?id+':'+tab:id}),
        openExecution:(id)=>window.actions.push({kind:'openExecution',value:id}),
        openTask:noop,openNote:noop,goHome:noop,
      };
      const activity={streamingSessionIds:new Set(['ri-1','fin-3','web-1','res-main']),backgroundSessionIds:new Set(),pendingInputSessionIds:new Set(['web-1']),activeSessionId:null,activeExecutionId:null,setActiveExecutionId:noop,setSessionStreaming:noop};
      const panel=new URLSearchParams(location.search).get('panel');
      createRoot(document.getElementById('root')).render(
        <QueryClientProvider client={client}><TooltipProvider><ConfirmProvider>
          <WorkContext navigation={navigation} activity={activity}>
            {panel==='chats'
              ? <div data-chats-tab className="flex h-screen flex-col bg-background"><AgentOverview workspace={workspaces.find(w=>w.id==='fin')} onSelectTab={noop}/></div>
              : <div className="flex h-screen flex-col bg-background">
                  <div className="flex flex-1 min-h-0 flex-col overflow-hidden"><MobileAgentsView/></div>
                  <MobileTabBar/>
                </div>}
          </WorkContext>
        </ConfirmProvider></TooltipProvider></QueryClientProvider>);
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
    plugins: [{
      name: 'fixture-dashboard',
      setup(api) {
        api.onResolve({ filter: /^@\/contexts\/dashboard-context$/ }, () => ({ path: 'dashboard', namespace: 'fixture' }));
        api.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: args.path === 'dashboard'
            ? dashboard
            : 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(){},replace(){},back(){},prefetch(){}});',
        }));
      },
    }],
  });
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0]!.text); return; }
    if (url.pathname === '/fixture.css') { res.setHeader('content-type', 'text/css'); res.end(css.css); return; }
    // Writes (folding an agent) stay unanswered, so their optimistic patch holds.
    if (url.pathname.startsWith('/api/') && req.method === 'POST') return;
    if (url.pathname.startsWith('/api/')) { res.statusCode = 404; res.end(); return; }
    const theme = url.searchParams.get('theme') === 'light' ? '' : 'dark';
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html class="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="bg-background"><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const executablePath = testChromiumPath();
  browser = await chromium.launch({ executablePath, headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A phone, its storage shared across reloads of the same page. */
async function phone(query = '', theme: 'dark' | 'light' = 'dark'): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?theme=${theme}${query}`);
  await page.getByRole('tablist').waitFor().catch((error) => { throw new Error(`${error.message}\n${errors.join('\n')}`); });
  return { page, errors };
}

const tabs = (page: Page) => page.getByRole('tab').allTextContents();
const selected = (page: Page) => page.getByRole('tab', { selected: true }).textContent();
const panel = (page: Page) => page.getByRole('tabpanel');
/** Each row's first line (its title or agent), top to bottom. */
const rowTitles = (page: Page) =>
  panel(page).locator('button[data-chat-row], button[aria-label*=": "]').evaluateAll((rows) =>
    rows.map((row) => row.querySelector('span.truncate')?.textContent ?? ''),
  );
const actions = (page: Page) => page.evaluate(() => (window as unknown as { actions: { kind: string; value: string }[] }).actions);

it('opens on Unread with what wants you first, and counts agree with the tab bar', async () => {
  const { page, errors } = await phone();
  try {
    // Counts sit in the tabs: 4 want you (a reply from Ri, a blocked chat,
    // two unread), 2 are running. Agents carries none.
    expect(await tabs(page)).toEqual(['Unread4', 'Working2', 'Agents']);
    expect(await selected(page)).toBe('Unread4');
    // Something is blocked on you, so Unread's count pulses.
    expect(await page.locator('[data-lens="unread"] [data-lens-count]').getAttribute('class')).toContain('animate-pulse');

    // Ri's own reply, the blocked chat, then the unread ones newest first.
    // The chat mid-turn waits for its outcome, under Working.
    expect(await rowTitles(page)).toEqual(['Ri', 'Fix login bug', 'Reconcile Amex', 'Import Chase CSV']);
    const blocked = panel(page).locator('[data-chat-row="web-1"]');
    expect(await blocked.innerText()).toContain('needs input');
    expect(await blocked.innerText()).toContain('Allow Bash: pnpm db:migrate?');
    expect(await blocked.innerText()).toContain('Website');
    // What its agent said at the end of its turn, and the size of the ask.
    const amex = panel(page).locator('[data-chat-row="fin-1"]');
    expect(await amex.locator('[data-chat-status="needs-you"]').innerText()).toBe('Pick a category for the two Amex refunds');
    expect(await amex.locator('[data-chat-ask-size]').innerText()).toBe('Quick for you');
    // The week-old unread one folds, by the one rule every list hides by.
    expect(await panel(page).getByText('1 inactive hidden').count()).toBe(1);
    expect(await panel(page).locator('[data-chat-row="web-3"]').count()).toBe(0);

    // The tab bar's badge: one blocked on you outranks the rest.
    expect(await page.getByRole('navigation', { name: 'Home' }).getByText('1', { exact: true }).count()).toBe(1);

    await amex.click();
    expect(await actions(page)).toContainEqual({ kind: 'openExecution', value: 'fin-1' });
    await panel(page).getByRole('button', { name: 'Ri: New reply' }).click();
    expect(await actions(page)).toContainEqual({ kind: 'openAgent', value: 'ri' });
    await page.screenshot({ path: '/tmp/ri-phone-agents-unread.png' });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

it('lists only running chats under Working, each naming its agent', async () => {
  const { page, errors } = await phone();
  try {
    await page.getByRole('tab', { name: /^Working/ }).tap();
    expect(await selected(page)).toBe('Working2');
    const rows = panel(page).locator('[data-chat-row]');
    expect(await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-chat-row')))).toEqual(['ri-1', 'fin-3']);
    expect(await rows.nth(0).innerText()).toContain('working');
    expect(await rows.nth(0).innerText()).toContain('Ri');
    expect(await rows.nth(1).innerText()).toContain('Finances');
    // The blocked chat is still a running process, but it waits on you: Unread has it.
    expect(await panel(page).locator('[data-chat-row="web-1"]').count()).toBe(0);
    await page.screenshot({ path: '/tmp/ri-phone-agents-working.png' });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

it('lists every agent with its own state and counts, its chats one tap away', async () => {
  const { page, errors } = await phone();
  try {
    await page.getByRole('tab', { name: 'Agents' }).tap();
    // The agent's own line: its reply, what it's doing, or what it last said.
    expect(await panel(page).getByRole('button', { name: 'Ri: New reply' }).innerText()).toContain('Merged the schedules fix. Want me to restart dev?');
    expect(await panel(page).getByRole('button', { name: 'Research: Thinking' }).innerText()).toContain('Thinking…');
    expect(await panel(page).getByRole('button', { name: 'Open Finances' }).innerText()).toContain('Categorized October.');
    // Its chats that need you (amber) and are working (green). Inactive ones don't count.
    const counts = await panel(page).locator('[data-count]').evaluateAll((els) =>
      els.map((el) => `${el.closest('.rounded-xl')?.querySelector('span.block')?.textContent}:${el.getAttribute('data-count')}:${el.textContent}`),
    );
    expect(counts).toEqual(['Ri:working:1', 'Website:needs-you:1', 'Finances:needs-you:2', 'Finances:working:1']);
    // No "executions" left in what people read.
    expect(await panel(page).innerText()).not.toMatch(/execution/i);

    // Every agent starts folded on the phone, whatever the desktop rail
    // keeps open, and its chats are a tap away.
    expect(await panel(page).locator('[data-chat-row]').count()).toBe(0);
    await panel(page).getByRole('button', { name: 'Show chats in Finances' }).tap();
    await panel(page).locator('[data-chat-row="fin-3"]').waitFor();
    const shown = () => panel(page).locator('[data-chat-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-chat-row')));
    expect(await shown()).toEqual(['fin-3', 'fin-1', 'fin-2']);
    await page.screenshot({ path: '/tmp/ri-phone-agents-agents.png' });
    // Opened stays opened on this phone, so coming back finds it as left.
    await page.reload();
    await panel(page).locator('[data-chat-row="fin-3"]').waitFor();
    expect(await shown()).toEqual(['fin-3', 'fin-1', 'fin-2']);
    await panel(page).getByRole('button', { name: 'Hide chats in Finances' }).tap();
    expect(await panel(page).locator('[data-chat-row]').count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

it('remembers the picked tab across a reload', async () => {
  const { page, errors } = await phone();
  try {
    await page.getByRole('tab', { name: /^Working/ }).tap();
    await page.reload();
    await page.getByRole('tablist').waitFor();
    expect(await selected(page)).toBe('Working2');
    await page.getByRole('tab', { name: 'Agents' }).tap();
    await page.reload();
    await page.getByRole('tablist').waitFor();
    expect(await selected(page)).toBe('Agents');
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

it("opens an agent's Chats tab on All, with Unread and Working a tap away", async () => {
  const { page, errors } = await phone('&panel=chats', 'light');
  try {
    expect(await tabs(page)).toEqual(['All', 'Unread2', 'Working1']);
    expect(await selected(page)).toBe('All');
    // Pins, then every chat newest first, each with its state.
    const all = panel(page);
    expect(await all.locator('h3').allTextContents()).toEqual(['Pinned1', 'Recent']);
    expect(await all.locator('[role="button"]').evaluateAll((rows) => rows.map((r) => r.querySelector('.truncate')?.textContent)))
      .toEqual(['Tax estimate', 'Reconcile Amex', 'Import Chase CSV']);
    expect(await all.locator('[role="button"]', { hasText: 'Tax estimate' }).innerText()).toContain('working');

    await page.getByRole('tab', { name: /^Unread/ }).click();
    expect(await panel(page).locator('[role="button"]').evaluateAll((rows) => rows.map((r) => r.querySelector('.truncate')?.textContent)))
      .toEqual(['Reconcile Amex', 'Import Chase CSV']);
    await page.getByRole('tab', { name: /^Working/ }).click();
    expect(await panel(page).locator('[role="button"]').evaluateAll((rows) => rows.map((r) => r.querySelector('.truncate')?.textContent)))
      .toEqual(['Tax estimate']);
    await page.screenshot({ path: '/tmp/ri-agent-chats-working.png' });

    // Remembered, for every agent.
    await page.reload();
    await page.getByRole('tablist').waitFor();
    expect(await selected(page)).toBe('Working1');
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

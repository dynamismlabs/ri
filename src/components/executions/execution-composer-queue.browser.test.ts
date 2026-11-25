/**
 * The composer's message queue in a real browser (docs/message-queue.md).
 * While the chat works, Enter queues and ⌘Enter sends now: straight into the
 * turn on a harness that takes messages mid-turn, through the queue (which
 * stops the turn first) on one that doesn't. Idle, both send as before. The
 * queue shows above the box, says it's paused once the chat has stayed idle,
 * and Edit brings a message back into the box. The home is played by routed
 * tRPC responses.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page, Request } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';
import { DEFAULT_COMPOSER_PLACEHOLDER } from './execution-composer';

let fixture: Awaited<ReturnType<typeof browserFixture>>;

beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {WorkContext} from './src/contexts/work-context';
    import {trpc} from './src/lib/trpc/client';
    import {ExecutionComposer} from './src/components/executions/execution-composer';
    const params=new URLSearchParams(location.search);
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const queued=JSON.parse(params.get('queued')??'[]');
    client.setQueryData(trpc.messageQueue.list.queryKey({sessionId:'chat-queue'}),queued);
    window.__sends=[];
    const navigation={openAgent(){},openExecution(){},openTask(){},openNote(){},goHome(){}};
    const activity={activeSessionId:null,streamingSessionIds:new Set(),backgroundSessionIds:new Set(),pendingInputSessionIds:new Set(),setActiveExecutionId(){},setSessionStreaming(){}};
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={client}><TipProvider><WorkContext navigation={navigation} activity={activity}>
        <main className="bg-background text-foreground p-4" style={{paddingTop:200}}><div style={{width:720}}>
          <ExecutionComposer sessionId="chat-queue" autoFocus={false} permissionMode="auto_all" harness={params.get('harness')} model={null} effort={null}
            isRunning={params.get('running')==='1'} onStop={()=>{}} onSend={(text)=>{window.__sends.push(text);}}/>
        </div></main>
      </WorkContext></TipProvider></QueryClientProvider>);
  `, [], { css: true });
}, 120_000);

afterAll(async () => { await fixture?.close(); });

interface Home { adds: Record<string, unknown>[]; removes: Record<string, unknown>[] }

/** Open the composer with the home's queue procedures answered, recording what was asked. */
async function open(options: { harness: string; running: boolean; queued?: unknown[] }): Promise<{ page: Page; home: Home }> {
  const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 700 } });
  const home: Home = { adds: [], removes: [] };
  const body = (request: Request) => JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
  await page.route('**/api/trpc/messageQueue.add**', async (route) => {
    const input = body(route.request());
    home.adds.push(input);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { data: { queued: { id: input.id, content: input.content, attachments: [], draft: input.draft, createdAt: '2026-11-24T00:00:00.000Z' }, sent: null } } }) });
  });
  await page.route('**/api/trpc/messageQueue.remove**', async (route) => {
    const input = body(route.request());
    home.removes.push(input);
    const message = (options.queued as { id: string }[] | undefined)?.find((item) => item.id === input.id) ?? null;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { data: message } }) });
  });
  const queued = encodeURIComponent(JSON.stringify(options.queued ?? []));
  await page.goto(`${fixture.url}/?harness=${options.harness}&running=${options.running ? 1 : 0}&queued=${queued}`);
  await page.locator('.ProseMirror').waitFor();
  return { page, home };
}

const placeholder = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.ProseMirror p.is-editor-empty')!, '::before').content);
const sends = (page: Page) => page.evaluate(() => (window as unknown as { __sends: string[] }).__sends);
const modEnter = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter';

async function type(page: Page, text: string) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.type(text);
}

it('queues on Enter while the chat works, and names the key for Send now', async () => {
  const { page, home } = await open({ harness: 'claude', running: true });
  try {
    expect(await placeholder(page)).toBe(JSON.stringify('Queue a follow-up, ⌘↩ to send now'));
    await type(page, 'then write the tests');
    await page.keyboard.press('Enter');
    await expect.poll(() => home.adds.length).toBe(1);
    expect(home.adds[0]).toMatchObject({ sessionId: 'chat-queue', content: 'then write the tests', attachments: [] });
    expect(home.adds[0]!.sendNow).toBeFalsy();
    // The composer's own document goes with it, for Edit.
    expect(home.adds[0]!.draft).toMatchObject({ type: 'doc' });
    expect(await sends(page)).toEqual([]);
    // Shown in the queue above the box, and the box is empty again.
    await expect.poll(() => page.locator('[data-slot="message-queue"]').textContent()).toContain('then write the tests');
    expect(await page.locator('.ProseMirror').textContent()).toBe('');
  } finally { await page.close(); }
});

it('sends now on ⌘Enter, straight into the turn on a harness that takes messages mid-turn', async () => {
  const { page, home } = await open({ harness: 'claude', running: true });
  try {
    await type(page, 'actually use the other file');
    await page.keyboard.press(modEnter);
    await expect.poll(() => sends(page)).toEqual(['actually use the other file']);
    expect(home.adds).toEqual([]);
  } finally { await page.close(); }
});

it('sends now on ⌘Enter through the queue where the harness takes one message at a time', async () => {
  const { page, home } = await open({ harness: 'opencode', running: true });
  try {
    await type(page, 'stop and do this');
    await page.keyboard.press(modEnter);
    await expect.poll(() => home.adds.length).toBe(1);
    expect(home.adds[0]).toMatchObject({ content: 'stop and do this', sendNow: true });
    expect(await sends(page)).toEqual([]);
  } finally { await page.close(); }
});

it('sends as before when the chat is idle', async () => {
  const { page, home } = await open({ harness: 'claude', running: false });
  try {
    expect(await placeholder(page)).toBe(JSON.stringify(DEFAULT_COMPOSER_PLACEHOLDER));
    await type(page, 'start the work');
    await page.keyboard.press('Enter');
    await expect.poll(() => sends(page)).toEqual(['start the work']);
    expect(home.adds).toEqual([]);
  } finally { await page.close(); }
});

it('shows both ways to send, with their keys, on the send button while the chat works', async () => {
  const { page } = await open({ harness: 'claude', running: true });
  try {
    await type(page, 'one more thing');
    await page.getByRole('button', { name: 'Queue message' }).hover();
    const menu = page.locator('[data-slot="hover-preview"]');
    await menu.waitFor();
    const text = await menu.textContent();
    expect(text).toContain('Queue');
    expect(text).toContain('↩');
    expect(text).toContain('Send now');
    expect(text).toContain('⌘↩');
    expect(text).toContain('The agent reads it at its next step in this turn');
  } finally { await page.close(); }
});

const QUEUED = [
  { id: '01a210d0-0000-7000-8000-000000000001', content: 'then write the tests', attachments: [], draft: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'then write the tests' }] }] }, createdAt: '2026-11-24T00:00:00.000Z' },
  { id: '01a210d0-0000-7000-8000-000000000002', content: 'and update the guide', attachments: [], draft: null, createdAt: '2026-11-24T00:00:01.000Z' },
];

it('says the queue is paused once the chat has stayed idle, never in the gap between turns', async () => {
  const { page } = await open({ harness: 'claude', running: false, queued: QUEUED });
  try {
    const strip = page.locator('[data-slot="message-queue"]');
    await strip.waitFor();
    expect(await strip.textContent()).not.toContain('Paused');
    await expect.poll(() => strip.textContent()).toContain('Paused. Send one now, and the rest follow.');
    expect(await strip.getByRole('button', { name: 'Send now' }).count()).toBe(2);
  } finally { await page.close(); }
});

it('brings a queued message back into the box to edit, after what is typed there', async () => {
  const { page, home } = await open({ harness: 'claude', running: true, queued: QUEUED });
  try {
    await type(page, 'first this');
    await page.getByRole('button', { name: 'Edit queued message' }).first().click();
    await expect.poll(() => home.removes.length).toBe(1);
    expect(home.removes[0]).toMatchObject({ sessionId: 'chat-queue', id: QUEUED[0]!.id });
    // Its own paragraph after the typed one: sent, that's one line each.
    await expect.poll(() => page.locator('.ProseMirror p').allTextContents()).toEqual(['first this', 'then write the tests']);
    expect(await page.locator('[data-slot="message-queue"]').textContent()).not.toContain('then write the tests');
  } finally { await page.close(); }
});

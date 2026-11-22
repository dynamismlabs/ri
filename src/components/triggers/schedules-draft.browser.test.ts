/** Real Schedules shell, builder session, execution composer and draft storage. Only Home records and live delivery are synthetic. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { browserFixture } from '@/test/fixtures/browser-fixture';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {WorkContext} from '@/contexts/work-context';
    import {TriggersModal} from '@/components/triggers/triggers-modal';
    import {openSchedulesWindow} from '@/lib/client/schedules-window';
    import {scheduleChatQueryKey} from '@/components/triggers/use-schedule-chat';
    import {NEW_SCHEDULE_REF} from '@/lib/triggers/schedule-chat';
    import {trpc} from '@/lib/trpc/client';
    const session={id:'schedule-builder',type:'content',surfaceKind:'trigger',surfaceRef:'new',workspaceId:null,status:'active',permissionMode:'auto_all',harness:'codex',model:null,effort:null};
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
    client.setQueryData(scheduleChatQueryKey(NEW_SCHEDULE_REF),session);
    client.setQueryData(['session',session.id],session);
    client.setQueryData(['session',session.id,'events'],[]);
    client.setQueryData(['triggers',undefined],[]);
    client.setQueryData(trpc.sessions.runtimeStatusGet.queryKey({params:{id:session.id}}),{running:false,backgroundTasks:false,backgroundTaskIds:[]});
    const navigation={openAgent(){},openExecution(){},openTask(){},openNote(){},goHome(){}};
    const activity={activeSessionId:null,streamingSessionIds:new Set(),backgroundSessionIds:new Set(),pendingInputSessionIds:new Set(),setActiveExecutionId(){},setSessionStreaming(){}};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TipProvider><WorkContext navigation={navigation} activity={activity}>
      <button onClick={()=>openSchedulesWindow()}>Open schedules</button><TriggersModal/>
    </WorkContext></TipProvider></QueryClientProvider>);
  `, [{ name: 'schedule-delivery', setup(build) {
    build.onResolve({ filter: /hooks\/use-session-(stream|reconcile)$/ }, args => ({ path: args.path, namespace: 'delivery' }));
    build.onLoad({ filter: /.*/, namespace: 'delivery' }, () => ({ loader: 'ts', contents: 'export const useSessionStream=()=>{};export const useSessionReconcile=()=>({reconciling:false});' }));
    if (process.env.RI_OVERLAY_BASELINE === '1') build.onLoad({ filter: /triggers-modal\.tsx$/ }, args => ({ loader: 'tsx', resolveDir: path.dirname(args.path), contents: execFileSync('git', ['show', '4bf74a32:src/components/triggers/triggers-modal.tsx'], { encoding: 'utf8' }) }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  it(`keeps the same builder draft through Escape and reopen at ${width}px (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      testTimeouts(page, 4000);
      await page.goto(fixture.url);
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      const opener = page.getByRole('button', { name: 'Open schedules', exact: true });
      await opener.click();
      await page.getByRole('button', { name: 'New scheduled task', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Schedules and Triggers' });
      const editor = dialog.locator('.ProseMirror[contenteditable=true]');
      await editor.click();
      const draft = 'Prepare my weekly review without losing this draft';
      await page.keyboard.type(draft);
      expect(await editor.innerText()).toBe(draft);
      expect(await page.locator('.slash-command-popup').count()).toBe(0);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await expect.poll(() => opener.evaluate(el => el === document.activeElement)).toBe(true);
      await opener.click();
      await page.getByRole('button', { name: 'New scheduled task', exact: true }).click();
      await expect.poll(() => editor.innerText()).toBe(draft);
      expect(await page.getByText('Set it up by chat', { exact: true }).count()).toBe(1);
      const savedKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('ri:chat-draft:exec:')));
      expect(savedKeys).toEqual(['ri:chat-draft:exec:schedule-builder']);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });
}

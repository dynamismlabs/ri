import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';
let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
 import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
 import{VoiceSentBadge}from'@/components/chat-ui/messages/voice-sent-badge';import{MainChatHistoryMenu}from'@/components/chat/main-chat-history-menu';import{DeckDayBar}from'@/components/deck/deck-day-bar';import{Dialog,DialogContent,DialogTitle}from'@/components/system/dialog';import{TipProvider}from'@/components/ui/tip';
 document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');window.calls=[];
 const routine={id:'walk',title:'Go for a walk',completedCount:0,targetCount:1,period:'day',streak:3};
 createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TipProvider><Dialog defaultOpen><DialogContent aria-describedby={undefined}><DialogTitle>Actual popup hosts</DialogTitle><VoiceSentBadge/><MainChatHistoryMenu scope={null}/><DeckDayBar items={[]} routines={[routine]} onRoutineComplete={id=>window.calls.push(id)}/></DialogContent></Dialog></TipProvider></QueryClientProvider>);
 `,
    [
      {
        name: 'popup-home-data',
        setup(build) {
          const modules: Record<string, string> = {
            '@/hooks/use-user-state': `export const useUserState=()=>({data:{voiceAutoSend:true}});export const useUpdateUserState=()=>({mutate:input=>window.calls.push(input)});`,
            '@/hooks/use-main-chat': `export const useMainChat=()=>({data:{session:{id:'current'}}});export const useMainChatHistory=()=>({data:{sessions:[{id:'current',label:'Current chat',startedAt:'2026-11-22T12:00:00Z'},{id:'previous',label:'Previous chat',startedAt:'2026-11-21T12:00:00Z'}]},isLoading:false});export const useResumeMainChat=()=>({isPending:false,mutate:(id,options)=>{window.calls.push(id);options.onSuccess();}});`,
            '@/hooks/use-day-shape': `export const useDayShape=()=>({data:null,isLoading:false});`,
          };
          for (const name of Object.keys(modules))
            build.onResolve(
              {
                filter: new RegExp(
                  '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
                ),
              },
              () => ({ path: name, namespace: 'popup-data' }),
            );
          build.onLoad({ filter: /.*/, namespace: 'popup-data' }, (args) => ({
            contents: modules[args.path],
            loader: 'tsx',
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
    { css: true },
  );
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});
for (const theme of ['light', 'dark'])
  for (const width of [390, 1440])
    for (const kind of ['voice', 'history', 'habits'])
      it(`keeps real ${kind} popup actions and one-layer Escape at ${width}px (${theme})`, async () => {
        const page = await fixture.browser.newPage({
            viewport: { width, height: 844 },
          }),
          errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        try {
          await page.goto(fixture.url + '/?theme=' + theme);
          const parent = page.getByRole('dialog', {
            name: 'Actual popup hosts',
          });
          await parent.waitFor();
          const trigger = page.getByRole('button', {
            name:
              kind === 'voice'
                ? 'Sent with voice'
                : kind === 'history'
                  ? 'History'
                  : '0/1 habits',
            exact: true,
          });
          await trigger.click();
          const action =
            kind === 'voice'
              ? page.getByRole('switch', { name: 'Auto-send voice' })
              : kind === 'history'
                ? page.getByRole('button', { name: /Previous chat/ })
                : page.getByRole('button', { name: 'Mark Go for a walk done' });
          await action.waitFor();
          await page.keyboard.press('Escape');
          await action.waitFor({ state: 'detached' });
          expect(await parent.isVisible()).toBe(true);
          await expect
            .poll(() => trigger.evaluate((el) => el === document.activeElement))
            .toBe(true);
          await trigger.click();
          await action.click();
          expect(
            await page.evaluate(
              () => (window as unknown as { calls: unknown[] }).calls,
            ),
          ).toEqual([
            kind === 'voice'
              ? { voiceAutoSend: false }
              : kind === 'history'
                ? 'previous'
                : 'walk',
          ]);
          expect(errors).toEqual([]);
        } finally {
          await page.close();
        }
      });

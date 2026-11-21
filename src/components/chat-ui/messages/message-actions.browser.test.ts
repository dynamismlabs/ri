/** Actual message, email and sharing controls retain the caller's input-device size. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {CopyMessageButton} from './src/components/chat-ui/messages/copy-message-button';
    import {EmailComposer} from './src/components/chat-ui/email/email-composer';
    import {ModelControl} from './src/components/workspaces/launcher/model-controls';
    import {useTouchFirst} from './src/hooks/use-touch-first';
    import {trpc} from './src/lib/trpc/client';
    const params=new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
    client.setQueryData(trpc.email.accounts.queryKey(),[{id:'account',provider:'google',label:'Alex'}]);
    client.setQueryData(['coordination-targets','','','chat'],[]);
    const initial={id:'draft',sessionId:'chat',revision:1,status:'draft',connectionId:'account',fromLabel:'Alex',to:'hello@example.com',cc:'',bcc:'',subject:'Review',body:'A short email',error:null,sentAt:null,createdAt:'2026-11-20',updatedAt:'2026-11-20'};
    function App(){const touch=useTouchFirst();return <main className="bg-background text-foreground p-2">
      <CopyMessageButton text="A message" eventId="event" sessionId="chat" alwaysVisible/>
      <EmailComposer id="draft" sessionId="chat" initial={initial}/>
      <ModelControl size={touch?'touch':'compact'} selection={{harness:'claude',model:'opus'}} label="Opus" effort="medium" serviceTier="fast" onChange={()=>{}} onEffortChange={()=>{}}/>
    </main>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TipProvider><App/></TipProvider></QueryClientProvider>);
  `, [{ name: 'model-catalog', setup(build) {
    build.onResolve({ filter: /use-harness-models$/ }, args => ({ path: args.path, namespace: 'catalog' }));
    build.onLoad({ filter: /.*/, namespace: 'catalog' }, () => ({ loader: 'ts', resolveDir: process.cwd(), contents: `import {modelsForProvider} from '@/lib/harness/options';export const useHarnessModels=()=>({models:modelsForProvider('claude')});` }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [360, 390, 900]) {
  it(`sizes message and email actions by role and input device (${width}px, ${theme})`, async () => {
    const touch = width < 900;
    const page = await fixture.browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const copy = page.getByRole('button', { name: 'Copy message', exact: true });
      await expect.poll(() => copy.getAttribute('data-size')).toBe(touch ? 'touch' : 'xs');
      const height = (name: string) => page.getByRole('button', { name, exact: true }).evaluate(el => el.getBoundingClientRect().height);
      expect(await height('Copy message')).toBe(touch ? 40 : 24);
      expect(await height('Send to chat')).toBe(touch ? 40 : 24);
      expect(await height('Copy email body')).toBe(touch ? 40 : 24);
      expect(await height('Send')).toBe(touch ? 40 : 32);
      expect(await height('Discard email draft')).toBe(touch ? 40 : 32);
      const model = page.getByRole('button', { name: /^Model and settings:/ });
      expect(await model.innerText()).toContain('Opus');
      expect(await model.getAttribute('aria-label')).toContain('Medium effort');
      expect(await model.getAttribute('aria-label')).toContain('Fast');
      if (touch) expect(await model.innerText()).toBe('Opus');
      await page.getByRole('button', { name: 'Send to chat', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
      expect(await cancel.evaluate(el => el.getBoundingClientRect().height)).toBe(touch ? 40 : 32);
      expect(await dialog.getByRole('button', { name: 'Send to chat', exact: true }).evaluate(el => el.getBoundingClientRect().height)).toBe(touch ? 40 : 32);
      await page.keyboard.press('Tab');await cancel.focus();
      expect(await cancel.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await cancel.click();await expect.poll(() => dialog.count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    } finally { await page.close(); }
  });
}

/** Real composer, with speech available even on a runner without a microphone. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {WorkContext} from './src/contexts/work-context';
    import {ExecutionComposer} from './src/components/executions/execution-composer';
    const params=new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const navigation={openAgent(){},openExecution(){},openTask(){},openNote(){},goHome(){}};
    const activity={activeSessionId:null,streamingSessionIds:new Set(),backgroundSessionIds:new Set(),pendingInputSessionIds:new Set(),setActiveExecutionId(){},setSessionStreaming(){}};
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={client}><TipProvider><WorkContext navigation={navigation} activity={activity}>
        <main className="bg-background text-foreground">
          <ExecutionComposer sessionId="chat-a" autoFocus={false} permissionMode="auto_all" harness="claude" model={params.has('long')?'a-very-long-model-name-for-a-custom-provider':'opus'} effort="medium" onSend={()=>{}}/>
        </main>
      </WorkContext></TipProvider></QueryClientProvider>);
  `, [{ name: 'speech-available', setup(build) {
    build.onResolve({ filter: /use-(voice-input|harness-models)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'ts', resolveDir: process.cwd(), contents: args.path.endsWith('use-harness-models') ? `import {modelsForProvider} from '@/lib/harness/options';export const useHarnessModels=()=>({models:[...modelsForProvider('claude'),{id:'a-very-long-model-name-for-a-custom-provider',label:'A very long model name for a custom provider'}]});` : `export const useVoiceInput=()=>({isSupported:true,isRecording:false,isTranscribing:false,transcript:'',clearTranscript(){},toggleRecording(){},cancelRecording(){},stream:null,error:null,provider:'web',unsupportedReason:null});` }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [360, 390]) {
  it(`keeps Send with every 40px target on one row, including the mic (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const row = page.locator('[data-composer-controls]');
      const send = page.getByRole('button', { name: 'Send message', exact: true });
      const mic = page.getByRole('button', { name: 'Voice input', exact: true });
      await mic.waitFor();
      await expect.poll(() => send.getAttribute('data-size')).toBe('touch');
      const mode = page.getByRole('button', { name: 'Auto', exact: true });
      expect(await mode.getAttribute('aria-label')).toBe('Auto');
      const model = page.getByRole('button', { name: /^Model and settings:/ });
      const check = async () => {
        const boxes = await row.locator('button').evaluateAll(buttons => buttons.map(el => { const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}; }));
        expect(boxes.length).toBeGreaterThanOrEqual(5);
        for (const box of boxes) { expect(box.h).toBe(40);expect(box.w).toBeGreaterThanOrEqual(40);expect(box.y).toBe(boxes[0].y);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width); }
        expect(await row.evaluate(el => getComputedStyle(el).flexWrap)).toBe('nowrap');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      };
      await check();
      expect(await model.innerText()).toBe('Opus');
      expect(await model.getAttribute('aria-label')).toContain('Medium effort');
      await page.keyboard.press('Tab');await mode.focus();
      expect(await mode.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
      await page.keyboard.press('Enter');await page.getByText('Permission mode',{exact:true}).waitFor();await page.keyboard.press('Escape');
      await page.goto(`${fixture.url}/?theme=${theme}&long`);await mic.waitFor();await expect.poll(() => send.getAttribute('data-size')).toBe('touch');
      await check();
      const truncates = await page.getByRole('button', { name: /^Model and settings:/ }).locator('span').evaluateAll(spans => spans.some(el => getComputedStyle(el).textOverflow==='ellipsis' && el.scrollWidth>el.clientWidth));
      expect(truncates).toBe(true);
    } finally { await page.close(); }
  });
}

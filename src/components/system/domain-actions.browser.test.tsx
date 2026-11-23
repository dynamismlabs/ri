/** Domain helpers retain named sizes and floating behavior instead of drawing classes. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {PluginsSection} from './src/components/settings/sections/plugins-section';
    import {SlideoutChat} from './src/components/ai-elements/slideout-chat';
    import {ConversationScrollButton} from './src/components/ai-elements/conversation';
    const params=new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TipProvider>
      <main className="mx-2 bg-background text-foreground p-5" data-slot="settings-body"><PluginsSection/>
        <div className="relative h-32"><SlideoutChat slideoutWidth={340} contextLabel="this note" chat={{status:'ready'}} disabled={false}/></div>
        <div style={{pointerEvents:'none'}}><ConversationScrollButton className="static"/></div>
      </main>
    </TipProvider></QueryClientProvider>);
  `, [{ name: 'unrelated-domain-state', setup(build) {
    build.onResolve({ filter: /^\.\/(?:integrations-section|plugins\/(?:mcp-servers-section|interactive-examples))$/ }, args => args.importer.endsWith('plugins-section.tsx') ? { path: args.path, namespace: 'catalog-content' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'catalog-content' }, () => ({ loader: 'js', contents: 'export const IntegrationsSection=()=>null;export const McpServersSection=()=>null;export const InteractiveExamples=()=>null;' }));
    build.onResolve({ filter: /(?:use-start-skill$|^use-stick-to-bottom$)/ }, args => ({ path: args.path, namespace: 'action-state' }));
    build.onLoad({ filter: /.*/, namespace: 'action-state' }, args => ({ loader: 'js', contents: args.path === 'use-stick-to-bottom' ? 'export const StickToBottom={};export const useStickToBottomContext=()=>({isAtBottom:false,scrollToBottom(){window.scrolled=(window.scrolled||0)+1;}});' : 'export const useStartSkill=()=>({isPending:false,start(){}});' }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [360, 390, 900]) {
  it(`keeps full Plugins labels and touch targets inside the toolbar (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 945 }, hasTouch: width < 900 });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const height = width < 900 ? 40 : 28;
      const toolbar = page.locator('[data-plugin-actions] > div').first();
      const bounds = await toolbar.boundingBox();
      for (const name of ['Connect a service', 'New skill', 'Add MCP server']) {
        const action = page.getByRole('button', { name, exact: true });
        await expect.poll(() => action.evaluate(el => el.getBoundingClientRect().height)).toBe(height);
        expect(await action.innerText()).toBe(name);
        const box = await action.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + .5);
        await page.keyboard.press('Tab');await action.focus();
        expect(await action.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      }
      expect(await page.locator('[data-plugin-actions]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    } finally { await page.close(); }
  });
  it(`retains the document chat toggle's phone target and focus (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 945 }, hasTouch: width < 900 });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const bubble = page.getByRole('button', { name: 'Toggle AI chat', exact: true });
      await expect.poll(() => bubble.evaluate(el => el.getBoundingClientRect().height)).toBe(width < 900 ? 40 : 32);
      await page.keyboard.press('Tab');await bubble.focus();
      expect(await bubble.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
}
for (const theme of ['light', 'dark']) {
  it(`keeps the actual scroll-to-latest helper clickable over its shield (${theme})`, async () => {
    const page = await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.getByRole('button', { name: 'Scroll to latest', exact: true }).click({ timeout: 3000 });
      expect(await page.evaluate(() => Reflect.get(window, 'scrolled'))).toBe(1);
    } finally { await page.close(); }
  });
}

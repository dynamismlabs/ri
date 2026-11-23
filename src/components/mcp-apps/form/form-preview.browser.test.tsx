import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';
let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{FormPreview}from'@/components/mcp-apps/form/form-preview';import{TipProvider}from'@/components/ui/tip';
const params=new URLSearchParams(location.search),kind=params.get('kind');document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
const option={uri:'example://record',name:'Details',preview:kind==='app'?{type:'mcp_app_tool',name:'show',arguments:{}}:kind==='resource'?{type:'resource_link',uri:'example://record',name:'Details'}:undefined};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TipProvider><FormPreview formId="form" chatId={null} option={option} onClose={()=>{}}/></TipProvider></QueryClientProvider>);
`, [{ name: 'preview-delivery', setup(build) {
    build.onResolve({ filter: /^@\/lib\/trpc\/client$/ }, () => ({ path: 'client', namespace: 'preview-delivery' }));
    build.onLoad({ filter: /.*/, namespace: 'preview-delivery' }, () => ({ loader: 'js', contents: `export const trpc={connectedApps:{forms:{preview:{queryOptions:()=>({queryKey:['preview'],queryFn:async()=>({contents:[{text:'A short resource preview'}]}),initialData:{contents:[{text:'A short resource preview'}]}})}}}};export const trpcClient={connectedApps:{forms:{openPreview:{mutate:async()=>({kind:'open',captureId:'view'})}},cancel:{mutate:async()=>{}}}};` }));
    build.onResolve({ filter: /^\.\.\/view$/ }, args => args.importer.endsWith('form-preview.tsx') ? ({ path: 'view', namespace: 'synthetic-view' }) : undefined);
    build.onLoad({ filter: /.*/, namespace: 'synthetic-view' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: `import React from'react';export const ConnectedView=()=> React.createElement('div',null,'Connected app content');` }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });
for (const theme of ['light', 'dark']) for (const width of [390, 1440]) for (const kind of ['plain', 'resource', 'app']) {
  it(`keeps ${kind} preview's original height role at ${width}px (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?kind=${kind}&theme=${theme}`);
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      if (kind === 'app') await page.getByText('Connected app content', { exact: true }).waitFor();
      if (kind === 'resource') await page.getByText('A short resource preview', { exact: true }).waitFor();
      const height = await dialog.evaluate(el => el.getBoundingClientRect().height);
      if (kind === 'app') expect(height).toBeCloseTo(844 * .85, 1);
      else expect(height).toBeLessThan(300);
      expect(await dialog.getByRole('heading', { name: 'Details', exact: true }).count()).toBe(1);
    } finally { await page.close(); }
  });
}

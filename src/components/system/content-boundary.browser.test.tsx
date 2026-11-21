/** Content rows keep their natural height until the ChoiceRow stage. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import RunsPage from './src/app/runs/page';
    import {VerbRow,ThingTile,SetupRow} from './src/components/mobile/mobile-create-sheet';import {MessageSquarePlus,CheckSquare} from 'lucide-react';
    const params=new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><TipProvider>{params.has('create')?<main><VerbRow icon={MessageSquarePlus} label="New chat" hint="Put an agent to work" onClick={()=>{}}/><ThingTile icon={CheckSquare} label="Task" onClick={()=>{}}/><div className="grid"><SetupRow label="Connect a service" onClick={()=>{}}/></div></main>:<RunsPage/>}</TipProvider></QueryClientProvider>);
  `, [{ name: 'synthetic-page-data', setup(build) {
    // Expose the existing presentation helpers without mounting unrelated data hooks.
    build.onLoad({ filter: /mobile-create-sheet\.tsx$/ }, args => ({ loader: 'tsx', resolveDir: path.dirname(args.path), contents: fs.readFileSync(args.path, 'utf8') + '\nexport {VerbRow, ThingTile, SetupRow};' }));
    build.onResolve({ filter: /(?:^next\/navigation$|use-triggers$|contexts\/dashboard-context$)/ }, args => ({ path: args.path, namespace: 'page-data' }));
    build.onLoad({ filter: /.*/, namespace: 'page-data' }, args => ({ loader: 'ts', contents: args.path === 'next/navigation' ? `export const useRouter=()=>({push(){}});export const usePathname=()=>'/runs';export const useSearchParams=()=>new URLSearchParams();` : args.path.endsWith('use-triggers') ? `export const useRuns=()=>({data:[{id:'run',status:'completed',triggerKind:'cron',summary:'Prepared the weekly operations review for the whole team, including delivery notes and the next steps for every account.',startedAt:'2026-11-20T10:30:00Z',costUsd:0.2}]});` : `export const useOptionalDashboard=()=>null;export const useDashboard=()=>({mobileCreateOpen:true,setMobileCreateOpen(){},openNote(){},openTask(){},setQuickCaptureOpen(){}});` }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [360, 900]) {
  it(`keeps run summaries and their metadata inside the content row (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 360 });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.getByRole('heading', { name: 'Runs', exact: true }).waitFor({ timeout: 5000 });
      const row = page.getByRole('link').filter({ hasText: 'Prepared the weekly operations review' });
      expect(await row.count()).toBe(1);
      const geometry = await row.evaluate(el => {
        const rect = el.getBoundingClientRect(), summary = el.querySelector('span.order-first')!.getBoundingClientRect();
        const meta = [...el.querySelectorAll('.ri-status-badge')].map(el => el.getBoundingClientRect());
        return { height: rect.height, summaryBottom: summary.bottom, metaTop: Math.min(...meta.map(r => r.top)), contained: [...el.children].every(child => { const r=child.getBoundingClientRect();return r.top>=rect.top && r.bottom<=rect.bottom && r.left>=rect.left && r.right<=rect.right; }) };
      });
      expect(geometry.contained).toBe(true);
      expect(geometry.height).toBeGreaterThan(40);
      if (width === 360) expect(geometry.summaryBottom).toBeLessThanOrEqual(geometry.metaTop);
      await page.keyboard.press('Tab');await row.focus();
      expect(await row.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
  it(`keeps both lines and the icon inside Create choices (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&create`);
      const choice = page.getByRole('button', { name: 'New chat Put an agent to work', exact: true });
      await choice.waitFor({ timeout: 5000 });
      expect(await choice.evaluate(el => {
        const r=el.getBoundingClientRect();return [...el.querySelectorAll('span')].every(child => {const c=child.getBoundingClientRect();return c.top>=r.top && c.bottom<=r.bottom;});
      })).toBe(true);
      expect(await choice.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(60);
      expect(await page.getByRole('button', { name: 'Connect a service', exact: true }).evaluate(el => Math.round(el.querySelector('svg')!.getBoundingClientRect().left - el.getBoundingClientRect().left))).toBe(16);
      await page.keyboard.press('Tab');await choice.focus();
      expect(await choice.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
}

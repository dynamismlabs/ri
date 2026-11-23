/** Product groups keep their resting drawing, navigation scale and icon spacing. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {Plus} from 'lucide-react';
    import {TipProvider} from '@/components/ui/tip';
    import {HomePhoneBar} from '@/components/mobile/mobile-tab-bar';
    import {CreateMenu} from '@/components/dashboard/create-menu';
    import {StreamList} from '@/components/stream/stream-list';
    const theme=new URLSearchParams(location.search).get('theme');
    document.documentElement.classList.toggle('dark',theme==='dark');
    createRoot(document.getElementById('root')).render(<TipProvider><main className="bg-background text-foreground">
      <div id="menu-fixture"><CreateMenu/></div><StreamList/><HomePhoneBar tabs={[{id:'create',label:'',icon:Plus,onClick(){window.created=true}}]}/>
    </main></TipProvider>);
  `, [{ name: 'group-data', setup(build) {
    build.onResolve({ filter: /^@\/(?:contexts\/dashboard-context|hooks\/use-(?:stream|tasks|notes|agents-tab-work|start-skill)|components\/(?:team\/team-context|home\/home-context))$/ }, args => ({ path: args.path, namespace: 'group-data' }));
    build.onLoad({ filter: /.*/, namespace: 'group-data' }, () => ({ loader: 'js', contents: `
      export const useAgentsTabWork=()=>({counts:{blocked:0,working:0,unread:0}});
      export const useOptionalTeam=()=>null;export const useTeamNav=()=>({show(){}});export const useOptionalHomeContext=()=>null;
      export const useDashboard=()=>({theme:'light',openTask(){},openNote(){}});
      export const useStartSkill=()=>({});export const useCreateNote=()=>({});export const useCreateTask=()=>({});export const useTasks=()=>({data:[]});export const useNotes=()=>({data:[]});
      export const useStream=()=>({data:[{id:'capture',status:'pending',source:'capture',media:'text',rawText:'Call the printer about the proof',createdAt:'2026-11-20T10:00:00Z',outcomes:[],attachments:[]}]});
      export const useProposedDecisions=()=>({data:[]});
      export const useTriageDecide=()=>({mutate(){}});export const useReopenStream=()=>({mutate(){}});export const useRetryStream=()=>({mutate(){}});export const useStartTriageSweep=()=>({mutate(){}});
    ` }));
    build.onResolve({ filter: /^\.\/area-create-modal$/ }, () => ({ path: 'area', namespace: 'unrelated-area' }));
    build.onLoad({ filter: /.*/, namespace: 'unrelated-area' }, () => ({ loader: 'js', contents: 'export const AreaCreateModal=()=>null;' }));
    build.onResolve({ filter: /^\.\/(?:stream-triage|stream-digest|stream-attachments)$/ }, args => args.importer.endsWith('stream-list.tsx') ? { path: args.path, namespace: 'unrelated-stream' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'unrelated-stream' }, () => ({ loader: 'js', contents: 'export const StreamTriage=()=>null;export const StreamDigest=()=>null;export const StreamAttachments=()=>null;' }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) {
  it(`retains the navigation Create drawing and keyboard outline (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const create = page.getByRole('navigation', {name:'Home',exact:true}).getByRole('button', { name: 'Create', exact: true });
      await expect.poll(() => create.evaluate(el => el.getBoundingClientRect().height)).toBe(48);
      expect(await create.evaluate(el => el.getBoundingClientRect().width)).toBe(48);
      expect(await create.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');
      expect(await create.locator('svg').evaluate(el => el.getBoundingClientRect().width)).toBe(22);
      expect(await create.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
      await page.keyboard.press('Tab');await create.focus();
      expect(await create.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      await create.click();expect(await page.evaluate(() => Reflect.get(window, 'created'))).toBe(true);
    } finally { await page.close(); }
  });
  it(`preserves the real Create menu's content inset (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.locator('#menu-fixture').getByRole('button', { name: 'Create', exact: true }).click();
      const popup = page.getByRole('dialog');
      await popup.waitFor();
      expect(await popup.evaluate(el => getComputedStyle(el).padding)).toBe('6px');
      expect(await popup.getByText('Type or speak. Sort later', { exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(() => popup.count()).toBe(0);
    } finally { await page.close(); }
  });
  it(`keeps Stream sibling icons quiet with room for each menu chevron (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const names = ['Create task', 'Create note', 'Keep as a thought', 'Set aside'];
      for (const name of names) {
        const action = page.getByRole('button', { name, exact: true });
        await action.waitFor();
        expect(await action.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        await page.keyboard.press('Tab');await action.focus();
        expect(await action.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      }
      const task = page.getByRole('button', { name: 'Create task', exact: true });
      const note = page.getByRole('button', { name: 'Create note', exact: true });
      const taskChevron = await task.locator('svg').last().boundingBox();
      const noteIcon = await note.locator('svg').first().boundingBox();
      const taskBox = await task.boundingBox();
      expect(taskChevron!.x + taskChevron!.width).toBeLessThanOrEqual(taskBox!.x + taskBox!.width - 6);
      expect(noteIcon!.x - taskChevron!.x - taskChevron!.width).toBeGreaterThanOrEqual(14);
      await task.click();
      expect(await task.getAttribute('aria-expanded')).toBe('true');
      expect(await task.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await page.keyboard.press('Escape');
    } finally { await page.close(); }
  });
}

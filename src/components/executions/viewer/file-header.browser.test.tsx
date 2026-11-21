/** Preserve the real header's fixed-width mode track beside its actions. */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {TipProvider} from '@/components/ui/tip';
    import {FileViewerHeader} from '@/components/executions/viewer/file-viewer';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    function App(){const [mode,setMode]=useState('current');return <main style={{background:'var(--pane)',color:'var(--t1)'}}><div id="file-pane" style={{marginLeft:location.search.includes('whole')?0:167,width:innerWidth-(location.search.includes('whole')?0:167),overflow:'hidden'}}><FileViewerHeader source={{kind:'workspace',workspaceId:'agent'}} path="README.md" isMarkdown mode={mode} onModeChange={setMode} onClose={()=>{}} dirty={location.search.includes('dirty')} saving={false} onDiscard={()=>{window.discarded=true}}/></div></main>}
    createRoot(document.getElementById('root')).render(<TipProvider><App/></TipProvider>);
  `,
    [
      {
        name: 'header-domain-boundaries',
        setup(build) {
          // Export the existing private header in the test bundle, without a product API.
          build.onLoad({ filter: /\/file-viewer\.tsx$/ }, (args) => ({
            loader: 'tsx',
            resolveDir: path.dirname(args.path),
            contents: fs.readFileSync(args.path, 'utf8') + '\nexport {FileViewerHeader};',
          }));
          build.onResolve(
            {
              filter:
                /^@\/(?:hooks\/use-(?:folder|opener)|lib\/client\/editor-preference|components\/mcp-apps\/open-with)$/,
            },
            (args) => ({ path: args.path, namespace: 'header-domain-boundaries' }),
          );
          build.onLoad({ filter: /.*/, namespace: 'header-domain-boundaries' }, () => ({
            loader: 'js',
            resolveDir: process.cwd(),
            contents: `
      export const useFolderBaseFile=()=>({});export const useFolderFile=()=>({});export const useResolveFileConflict=()=>({});export const useFolderRoot=()=>'/project';export const useFolderTree=()=>({data:[]});export const useWriteFile=()=>({});
      export const useOpener=()=>({opener:{open:async()=>{window.revealed=true;return {ok:true}}}});
      export const useOpenInPreferredEditor=()=>({label:'Editor',openInEditor:async()=>{window.edited=true;return {ok:true}}});
      import React from 'react';import {DropdownMenuItem} from '@/components/ui/dropdown-menu';
      export const useOpenWithApp=()=>({apps:(location.search.includes('whole')||location.search.includes('apps'))?[{}]:[],busy:false,approval:null});
      export const OpenWithAppActions=({controller,menu})=>!controller.apps.length?null:menu?React.createElement(DropdownMenuItem,{onSelect:()=>{window.appOpened=true}},'Open with Viewer'):React.createElement('button',null,'Open with Viewer');
      export const OpenWithAppApproval=()=>null;
    `,
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
  for (const width of [360, 390]) {
    it(`keeps the real file mode track from collapsing beside fixed actions (${theme}, ${width})`, async () => {
      const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
      try {
        await page.goto(`${fixture.url}/?theme=${theme}`);
        const group = page.getByRole('group', { name: 'File view' }),
          scroller = group.locator('xpath=..');
        const track = await group.boundingBox(),
          visible = await scroller.boundingBox();
        expect(visible!.width).toBeGreaterThanOrEqual(track!.width - 1);
        for (const name of ['Current', 'Render']) {
          const option = group.getByRole('button', { name, exact: true });
          expect((await option.boundingBox())!.height).toBe(36);
          expect(
            await option.locator('.ri-segment-label').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          ).toBe(true);
        }
        const current = group.getByRole('button', { name: 'Current', exact: true });
        await page.keyboard.press('Tab');
        await current.focus();
        await current.press('ArrowRight');
        const render = group.getByRole('button', { name: 'Render', exact: true });
        await render.press('Space');
        expect(await render.getAttribute('aria-pressed')).toBe('true');
        expect(await render.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
      } finally {
        await page.close();
      }
    });
  }

for (const theme of ['light', 'dark'])
  for (const width of [340, 360]) {
    it(`folds trailing actions into More before clipping the mode or Close (${theme}, ${width})`, async () => {
      const page = await fixture.browser.newPage({ viewport: { width, height: 700 } });
      try {
        await page.goto(`${fixture.url}/?theme=${theme}&whole`);
        const header = page.locator('#file-pane > div');
        const clip = await header.boundingBox();
        for (const button of await header.getByRole('button').all()) {
          const rect = await button.boundingBox();
          expect(rect!.x).toBeGreaterThanOrEqual(clip!.x);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(clip!.x + clip!.width);
        }
        expect(await header.getByRole('button', { name: /Reveal/ }).count()).toBe(0);
        expect(await header.getByRole('button', { name: 'Open in Editor', exact: true }).count()).toBe(0);
        expect(await header.getByRole('button', { name: 'Close file', exact: true }).isVisible()).toBe(true);
        for (const label of ['Current', 'Render'])
          expect(
            await header
              .getByRole('button', { name: label, exact: true })
              .locator('.ri-segment-label')
              .isVisible(),
          ).toBe(true);
        await header.getByRole('button', { name: 'File actions', exact: true }).click();
        await page.getByRole('menuitem', { name: /Reveal/ }).click();
        await expect
          .poll(() => page.evaluate(() => !!(window as unknown as { revealed: boolean }).revealed))
          .toBe(true);
        await header.getByRole('button', { name: 'File actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Open in Editor', exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => !!(window as unknown as { edited: boolean }).edited))
          .toBe(true);
        await header.getByRole('button', { name: 'File actions', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Open with Viewer', exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => !!(window as unknown as { appOpened: boolean }).appOpened))
          .toBe(true);
      } finally {
        await page.close();
      }
    });
  }

for (const theme of ['light', 'dark'])
  for (const dirty of [false, true]) {
    it(`keeps mode, More and Close visible in the real phone 360 tree layout (${theme}, dirty=${dirty})`, async () => {
      const page = await fixture.browser.newPage({
        viewport: { width: 360, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      try {
        await page.goto(`${fixture.url}/?theme=${theme}&apps=1${dirty ? '&dirty' : ''}`);
        const header = page.locator('#file-pane > div');
        const clip = await header.boundingBox();
        expect(clip!.width).toBe(193);
        for (const name of ['Current', 'Render']) {
          const option = header.getByRole('button', { name, exact: true });
          await expect.poll(() => option.locator('.ri-segment-label').isVisible()).toBe(false);
          const rect = await option.boundingBox();
          expect(rect!.height).toBe(36);
          expect(rect!.x).toBeGreaterThanOrEqual(clip!.x);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(clip!.x + clip!.width);
        }
        for (const name of ['File actions', 'Close file']) {
          const rect = await header.getByRole('button', { name, exact: true }).boundingBox();
          expect(rect!.x).toBeGreaterThanOrEqual(clip!.x);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(clip!.x + clip!.width);
        }
        const current = header.getByRole('button', { name: 'Current', exact: true });
        expect(await current.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          'rgba(0, 0, 0, 0)',
        );
        const render = header.getByRole('button', { name: 'Render', exact: true });
        await render.click();
        expect(await render.getAttribute('aria-pressed')).toBe('true');
        await header.getByRole('button', { name: 'File actions', exact: true }).click();
        expect(await page.getByRole('menuitem', { name: /Reveal/ }).isVisible()).toBe(true);
        expect(await page.getByRole('menuitem', { name: 'Open in Editor', exact: true }).isVisible()).toBe(
          true,
        );
        expect(await page.getByRole('menuitem', { name: 'Open with Viewer', exact: true }).isVisible()).toBe(
          true,
        );
        if (dirty) {
          await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
          await expect
            .poll(() => page.evaluate(() => !!(window as unknown as { discarded: boolean }).discarded))
            .toBe(true);
        }
      } finally {
        await page.close();
      }
    });
  }

for (const theme of ['light', 'dark'])
  it(`measures the header rather than a viewport breakpoint (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 900, height: 600 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&whole`);
      const pane = page.locator('#file-pane'),
        current = page.getByRole('button', { name: 'Current', exact: true });
      await pane.evaluate((el) => (el.style.width = '340px'));
      await expect.poll(() => current.locator('.ri-segment-label').isVisible()).toBe(true);
      await pane.evaluate((el) => (el.style.width = '193px'));
      await expect.poll(() => current.locator('.ri-segment-label').isVisible()).toBe(false);
      const clip = await pane.boundingBox();
      for (const label of ['Current', 'Render', 'File actions', 'Close file']) {
        const rect = await page.getByRole('button', { name: label, exact: true }).boundingBox();
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(clip!.x + clip!.width);
      }
      await pane.evaluate((el) => (el.style.width = '360px'));
      await expect.poll(() => current.locator('.ri-segment-label').isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

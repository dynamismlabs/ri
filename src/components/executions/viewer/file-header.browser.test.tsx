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
    function App(){const [mode,setMode]=useState('current');return <main style={{background:'var(--pane)',color:'var(--t1)'}}><div id="file-pane" style={{marginLeft:167,width:innerWidth-167,overflow:'hidden'}}><FileViewerHeader source={{kind:'workspace',workspaceId:'agent'}} path="README.md" isMarkdown mode={mode} onModeChange={setMode} onClose={()=>{}} dirty={false} saving={false}/></div></main>}
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
            contents: `
      export const useFolderBaseFile=()=>({});export const useFolderFile=()=>({});export const useResolveFileConflict=()=>({});export const useFolderRoot=()=>'/project';export const useFolderTree=()=>({data:[]});export const useWriteFile=()=>({});
      export const useOpener=()=>({opener:{open:async()=>({ok:true})}});
      export const useOpenInPreferredEditor=()=>({label:'Editor',openInEditor:async()=>({ok:true})});
      export const OpenWithApp=()=>null;
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
          expect((await option.boundingBox())!.height).toBe(24);
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

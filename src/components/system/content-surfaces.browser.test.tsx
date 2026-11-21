/** Real content hosts keep their frames conditional and their list rows quiet. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from './src/components/ui/tip';
    import {NoteRow} from './src/components/notes/note-row';
    import {ExecutionEvent} from './src/components/chat-ui/activity/execution-event';
    import {ConnectedFormFrame} from './src/components/mcp-apps/form/connected-form';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    const note={id:'note',title:'Prepare the release notes',bodyExcerpt:'Collect the changes and explain what people can do.',bodyLen:60,createdAt:'2026-11-21T12:00:00Z',areaId:null,taskId:null,kind:'note'};
    const event={id:'message',sessionId:'chat',source:'user',content:'Keep the existing inverted user bubble.',createdAt:'2026-11-21T12:00:00Z',raw:null,attachments:[],senderSessionId:null};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TipProvider><main style={{width:340,padding:8}}>
      <section aria-label="Notes"><NoteRow note={note} onUpdate={()=>{}} onArchive={()=>{}} onOpen={()=>{}}/></section>
      <section aria-label="Transcript"><ExecutionEvent event={event}/></section>
      <div data-case="bare"><ConnectedFormFrame bare><p>The host already has a frame.</p></ConnectedFormFrame></div>
      <div data-case="framed"><ConnectedFormFrame bare={false}><p>A form in the transcript.</p></ConnectedFormFrame></div>
    </main></TipProvider></QueryClientProvider>);
  `, [{ name: 'content-surface-data', setup(build) {
    // Exercise the production frame without a server request or a second copy of its markup.
    build.onLoad({ filter: /connected-form\.tsx$/ }, args => ({ loader: 'tsx', resolveDir: path.dirname(args.path), contents: fs.readFileSync(args.path, 'utf8') + '\nexport {Frame as ConnectedFormFrame};' }));
    build.onResolve({ filter: /hooks\/use-(areas|tasks|slash-commands)$/ }, args => ({ path: args.path, namespace: 'content-data' }));
    build.onLoad({ filter: /.*/, namespace: 'content-data' }, args => ({ loader: 'ts', contents: args.path.endsWith('use-areas') ? 'export const useAreas=()=>({data:[]});' : args.path.endsWith('use-tasks') ? 'export const useTasks=()=>({data:[]});' : 'export const useSlashCommands=()=>({data:{commands:[]}});' }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) {
  it(`keeps Notes rows unframed until hover (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 360, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const row = page.getByRole('region', { name: 'Notes' }).locator(':scope > div');
      await row.waitFor();
      expect(await row.evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow, radius: getComputedStyle(el).borderRadius }))).toEqual({ fill: 'rgba(0, 0, 0, 0)', shadow: 'none', radius: '8px' });
      await row.hover();
      expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await page.getByRole('button', { name: 'More note actions' }).click();
      expect(await page.getByRole('menuitem', { name: 'Archive' }).isVisible()).toBe(true);
    } finally { await page.close(); }
  });
  it(`keeps ordinary user messages free of a second frame (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 360, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const message = page.getByRole('region', { name: 'Transcript' }).locator(':scope > div');
      await message.waitFor();
      expect(await message.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    } finally { await page.close(); }
  });
  it(`lets a connected form use its host frame (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 360, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.locator('[data-case="bare"] section').waitFor();
      const bare = page.locator('[data-case="bare"] section');
      expect(await bare.evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, padding: getComputedStyle(el).padding, shadow: getComputedStyle(el).boxShadow }))).toEqual({ fill: 'rgba(0, 0, 0, 0)', padding: '0px', shadow: 'none' });
      expect(await page.locator('[data-case="framed"] section').evaluate(el => parseFloat(getComputedStyle(el).padding))).toBeGreaterThan(0);
    } finally { await page.close(); }
  });

}

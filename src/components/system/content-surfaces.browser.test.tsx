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
    import {QuestionCard} from './src/components/chat-ui/questions/question-card';
    import {SetupChoice} from './src/components/agents/setup-agent-dialog';
    import {Field} from './src/components/system/field';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    const note={id:'note',title:'Prepare the release notes',bodyExcerpt:'Collect the changes and explain what people can do.',bodyLen:60,createdAt:'2026-11-21T12:00:00Z',areaId:'work',taskId:null,kind:'decision'};
    const event={id:'message',sessionId:'chat',source:'user',content:'Keep the existing inverted user bubble.',createdAt:'2026-11-21T12:00:00Z',raw:null,attachments:[],senderSessionId:null};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TipProvider><main style={{width:Math.min(innerWidth,680),padding:8}}>
      <section aria-label="Notes"><NoteRow note={note} onUpdate={()=>{}} onArchive={()=>{}} onOpen={()=>{}}/></section>
      <section aria-label="Transcript"><ExecutionEvent event={event}/></section>
      <div data-case="bare"><ConnectedFormFrame bare><p>The host already has a frame.</p></ConnectedFormFrame></div>
      <div data-case="framed"><ConnectedFormFrame bare={false}><p>A form in the transcript.</p></ConnectedFormFrame></div>
      <section aria-label="Question"><QuestionCard sessionId="chat" pending={{requestId:'question',questions:[{question:'What belongs in the release?',multiSelect:true,options:[{label:'Notes',description:'Include the notes improvements'},{label:'Tasks',description:'Include the task improvements'}]}]}}/></section>
      <section aria-label="Agent setup"><SetupChoice title="Use an existing folder" selected={false} onSelect={()=>{window.setupSelections=(window.setupSelections??0)+1}}><Field aria-label="Existing folder" defaultValue="My"/></SetupChoice></section>
    </main></TipProvider></QueryClientProvider>);
  `, [{ name: 'content-surface-data', setup(build) {
    // Exercise the production frame without a server request or a second copy of its markup.
    build.onLoad({ filter: /connected-form\.tsx$/ }, args => ({ loader: 'tsx', resolveDir: path.dirname(args.path), contents: fs.readFileSync(args.path, 'utf8') + '\nexport {Frame as ConnectedFormFrame};' }));
    build.onLoad({ filter: /setup-agent-dialog\.tsx$/ }, args => ({ loader: 'tsx', resolveDir: path.dirname(args.path), contents: fs.readFileSync(args.path, 'utf8') + '\nexport {Choice as SetupChoice};' }));
    build.onResolve({ filter: /hooks\/use-execution$/ }, args => args.importer.endsWith('question-card.tsx') ? ({ path: 'question', namespace: 'question-data' }) : undefined);
    build.onLoad({ filter: /.*/, namespace: 'question-data' }, () => ({ loader: 'ts', contents: 'export const useResolvePendingInput=()=>({isPending:false,mutateAsync:async input=>{window.questionAnswer=input;}});' }));
    build.onResolve({ filter: /hooks\/use-(areas|tasks|slash-commands)$/ }, args => ({ path: args.path, namespace: 'content-data' }));
    build.onLoad({ filter: /.*/, namespace: 'content-data' }, args => ({ loader: 'ts', contents: args.path.endsWith('use-areas') ? 'export const useAreas=()=>({data:[{id:"work",name:"Work"}]});' : args.path.endsWith('use-tasks') ? 'export const useTasks=()=>({data:[]});' : 'export const useSlashCommands=()=>({data:{commands:[]}});' }));
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

  it(`keeps question selections, Other text and submitted answers intact (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 360, height: 1000 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const question = page.getByRole('region', { name: 'Question', exact: true });
      const notes = question.getByRole('button', { name: /Notes Include/ });
      const submit = question.getByRole('button', { name: 'Submit', exact: true });
      await notes.waitFor(); expect(await submit.isDisabled()).toBe(true);
      await notes.click(); expect(await notes.getAttribute('aria-pressed')).toBe('true');
      await notes.click(); expect(await notes.getAttribute('aria-pressed')).toBe('false');
      await question.getByRole('button', { name: /Tasks Include/ }).click();
      await question.getByRole('button', { name: /Other Type/ }).click();
      const input = question.getByRole('textbox', { name: 'Your answer' });
      await expect.poll(() => input.evaluate(el => el === document.activeElement)).toBe(true);
      await input.fill('Calendar'); await submit.click();
      expect(await page.evaluate(() => Reflect.get(window, 'questionAnswer'))).toEqual({requestId:'question',body:{allow:true,answers:{'What belongs in the release?':'Tasks, Calendar'}}});
    } finally { await page.close(); }
  });
  it(`does not select a compound setup choice while typing in its field (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 360, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const input = page.getByRole('textbox', { name: 'Existing folder' });
      await input.fill('My'); await input.press('End'); await input.press('Space');
      expect(await input.inputValue()).toBe('My ');
      expect(await page.evaluate(() => Reflect.get(window, 'setupSelections') ?? 0)).toBe(0);
      await page.getByRole('radio', { name: /Use an existing folder/ }).focus();
      await page.keyboard.press('Space');
      expect(await page.evaluate(() => Reflect.get(window, 'setupSelections'))).toBe(1);
    } finally { await page.close(); }
  });

}

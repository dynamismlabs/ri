import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '../src/test/fixtures/browser-fixture';
import { testTimeouts } from '../src/test/fixtures/browser-timeouts';
import { noteTitleField } from './renderer-locators';

let fixture: Awaited<ReturnType<typeof browserFixture>>;

beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {NoteEditor} from '@/components/editor/rich-editor';
    window.titleWrites=[];
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={new QueryClient()}><TipProvider>
        <NoteEditor title="Saved note title" body="Saved body." onTitleChange={value=>window.titleWrites.push(value)}/>
      </TipProvider></QueryClientProvider>
    );
  `);
}, 60_000);

afterAll(async () => {
  await fixture?.close();
});

it('lets packaged acceptance flows find and edit the real note title', async () => {
  const page = await fixture.browser.newPage();
  testTimeouts(page, 5000);
  try {
    await page.goto(fixture.url);
    await page.getByRole('textbox', { name: 'Note title', exact: true }).waitFor();
    const title = noteTitleField(page);
    expect(await title.count()).toBe(1);
    expect(await title.inputValue()).toBe('Saved note title');
    await title.fill('Retained desktop edit');
    expect(await title.inputValue()).toBe('Retained desktop edit');
    expect(await page.evaluate(() => (window as unknown as { titleWrites: string[] }).titleWrites))
      .toContain('Retained desktop edit');
  } finally {
    await page.close();
  }
});

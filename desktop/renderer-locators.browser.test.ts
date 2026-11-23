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
    import {Dialog,DialogContent,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
    import {NoteEditor} from '@/components/editor/rich-editor';
    window.titleWrites=[];
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={new QueryClient()}><TipProvider>
        <main data-note><NoteEditor title="Saved note title" body="Saved body." onTitleChange={value=>window.titleWrites.push(value)}/></main>
        <textarea hidden aria-label="Note title" defaultValue="Inactive editor"/>
        <Dialog><DialogTrigger asChild><button>Quick Capture</button></DialogTrigger>
          <DialogContent><DialogTitle>Quick Capture</DialogTitle><input aria-label="Capture draft"/></DialogContent>
        </Dialog>
      </TipProvider></QueryClientProvider>
    );
  `);
}, 60_000);

afterAll(async () => {
  await fixture?.close();
});

it('reads the retained note under a modal without matching an inactive editor', async () => {
  const page = await fixture.browser.newPage();
  testTimeouts(page, 5000);
  try {
    await page.goto(fixture.url);
    await page.getByRole('button', { name: 'Quick Capture', exact: true }).click();
    await page.getByRole('dialog', { name: 'Quick Capture', exact: true }).waitFor();
    expect(await page.locator('[data-note] textarea').evaluate(el => !!el.closest('[aria-hidden="true"]')))
      .toBe(true);
    const title = noteTitleField(page);
    expect(await title.count()).toBe(1);
    expect(await title.inputValue()).toBe('Saved note title');
    expect(await page.getByRole('dialog', { name: 'Quick Capture', exact: true }).isVisible()).toBe(true);
  } finally {
    await page.close();
  }
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

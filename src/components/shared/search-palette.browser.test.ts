import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  // The palette as a Home uses it: the shared filter state, and results that a
  // filter narrows. Records come from a fixed list, not a server.
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {SearchPalette} from '@/components/shared/search-palette';
    import {keepsRecord,usePaletteQuery} from '@/lib/client/search-query';
    const filters=['all','task','note','decision','stream','command'];
    const records=[
      {id:'t1',entityType:'task',title:'Plan the offsite',createdAt:'2026-11-20'},
      {id:'n1',entityType:'note',kind:'note',title:'Offsite venues',body:'x',createdAt:'2026-11-20'},
      {id:'d1',entityType:'note',kind:'decision',title:'Offsite in March',body:'x',createdAt:'2026-11-20'},
      {id:'s1',entityType:'stream',rawText:'offsite idea from the walk',createdAt:'2026-11-20'},
    ];
    function App(){
      const palette=usePaletteQuery(filters);
      const words=palette.query.trim();
      const shown=palette.filter==='command'?[]:records.filter(r=>keepsRecord(palette.filter,r)&&JSON.stringify(r).toLowerCase().includes(words.toLowerCase()));
      return <SearchPalette open onOpenChange={()=>{}} query={palette.query} onQueryChange={palette.type}
        filters={filters} filter={palette.filter} onFilterChange={palette.setFilter}
        searchQuery={palette.filter==='command'?'':words} results={shown} searching={false} onSelect={()=>{}}
        beforeResults={palette.filter==='command'?<p>Command list</p>:null}/>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TipProvider><App/></TipProvider></QueryClientProvider>);
  `, [{ name: 'search-palette-data', setup(b) {
    // TeamLabel reads connected teams. No team here.
    b.onResolve({ filter: /\/space-selector$/ }, () => ({ path: 'space-selector', namespace: 'search-palette-data' }));
    b.onLoad({ filter: /^space-selector$/, namespace: 'search-palette-data' }, () => ({ contents: 'export const useConnectedTeams=()=>({data:[]});', loader: 'tsx', resolveDir: process.cwd() }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

const pressed = (page: Page) => page.getByRole('group', { name: 'Search in' }).locator('[aria-pressed="true"]').innerText();
const titles = async (page: Page) => (await page.locator('[cmdk-item]').allInnerTexts()).map((text) => text.split('\n')[0]);

it('lists every filter across the top and narrows the results to the one chosen', async () => {
  const page = await fixture.browser.newPage();
  testTimeouts(page, 8000);
  try {
    await page.goto(fixture.url);
    const row = page.getByRole('group', { name: 'Search in' });
    await row.waitFor();
    expect(await row.getByRole('button').allInnerTexts()).toEqual(['All', 'Tasks', 'Notes', 'Decisions', 'Stream', 'Commands']);
    expect(await pressed(page)).toBe('All');

    const search = page.getByRole('combobox');
    await search.fill('offsite');
    await expect.poll(() => titles(page)).toEqual(['Plan the offsite', 'Offsite venues', 'Offsite in March', 'offsite idea from the walk']);

    // A click picks the filter and puts the cursor back in the box, words kept.
    await row.getByRole('button', { name: 'Decisions' }).click();
    expect(await pressed(page)).toBe('Decisions');
    await expect.poll(() => titles(page)).toEqual(['Offsite in March']);
    expect(await search.evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await search.inputValue()).toBe('offsite');
    await row.getByRole('button', { name: 'Notes' }).click();
    // Decisions are notes, so Notes shows both.
    await expect.poll(() => titles(page)).toEqual(['Offsite venues', 'Offsite in March']);

    await row.getByRole('button', { name: 'Commands' }).click();
    await page.getByText('Command list').waitFor();
    expect(await search.getAttribute('placeholder')).toBe('Type a command...');
  } finally { await page.close(); }
}, 30_000);

it('moves along the filters with Tab and Shift+Tab, and Backspace at the start goes back to All', async () => {
  const page = await fixture.browser.newPage();
  testTimeouts(page, 8000);
  try {
    await page.goto(fixture.url);
    const search = page.getByRole('combobox');
    await search.waitFor();
    await search.focus();
    await page.keyboard.press('Tab');
    expect(await pressed(page)).toBe('Tasks');
    expect(await search.getAttribute('placeholder')).toBe('Search tasks...');
    await page.keyboard.press('Tab');
    expect(await pressed(page)).toBe('Notes');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await pressed(page)).toBe('All');
    // Wraps from the first to the last.
    await page.keyboard.press('Shift+Tab');
    expect(await pressed(page)).toBe('Commands');
    // Tab never leaves the box.
    expect(await search.evaluate((el) => el === document.activeElement)).toBe(true);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('plan');
    // Backspace deletes text as usual while there is text before the cursor.
    await page.keyboard.press('Backspace');
    expect(await search.inputValue()).toBe('pla');
    expect(await pressed(page)).toBe('Tasks');
    // The cursor at the start of the words (cmdk keeps Home for the list).
    await search.evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
    await page.keyboard.press('Backspace');
    expect(await pressed(page)).toBe('All');
    expect(await search.inputValue()).toBe('pla');
  } finally { await page.close(); }
}, 30_000);

it('turns a typed prefix into its filter, so the box holds only the words', async () => {
  const page = await fixture.browser.newPage();
  testTimeouts(page, 8000);
  try {
    await page.goto(fixture.url);
    const search = page.getByRole('combobox');
    await search.waitFor();
    await search.focus();
    await page.keyboard.type('task: plan');
    expect(await pressed(page)).toBe('Tasks');
    expect(await search.inputValue()).toBe('plan');
    await expect.poll(() => titles(page)).toEqual(['Plan the offsite']);
    await search.fill('');
    await page.keyboard.type('>');
    expect(await pressed(page)).toBe('Commands');
    expect(await search.inputValue()).toBe('');
  } finally { await page.close(); }
}, 30_000);

it('scrolls the filters sideways on a phone with touch-sized choices, inside the dialog', async () => {
  const page = await fixture.browser.newPage({ viewport: { width: 360, height: 740 } });
  testTimeouts(page, 8000);
  try {
    await page.goto(fixture.url);
    const row = page.getByRole('group', { name: 'Search in' });
    await row.waitFor();
    const layout = await page.evaluate(() => {
      const scroller = document.querySelector('[data-slot="search-filters"] .ri-segment-scroller')!;
      const dialog = document.querySelector('[data-slot="dialog-content"]')!.getBoundingClientRect();
      const option = document.querySelector('[data-slot="search-filters"] .ri-segment-option')!.getBoundingClientRect();
      const footer = getComputedStyle(document.querySelector('[data-slot="search-footer"]')!).display;
      return { overflows: scroller.scrollWidth > scroller.clientWidth, inside: dialog.right <= window.innerWidth && dialog.left >= 0, optionHeight: option.height, pageScrolls: document.documentElement.scrollWidth > window.innerWidth, footer };
    });
    // Key hints mean nothing on a touch screen, so they stay off.
    expect(layout).toEqual({ overflows: true, inside: true, optionHeight: 36, pageScrolls: false, footer: 'none' });
    // The last filter is still reachable by scrolling the row.
    await row.getByRole('button', { name: 'Commands' }).click();
    expect(await pressed(page)).toBe('Commands');
  } finally { await page.close(); }
}, 30_000);

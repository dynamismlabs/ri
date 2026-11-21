/** Real calendar shell and remembered view, with bounded synthetic range data. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {TipProvider} from '@/components/ui/tip';
    import {CalendarModal} from '@/components/calendar/calendar-modal';
    import {openCalendarModal} from '@/lib/client/calendar-modal';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    openCalendarModal();
    createRoot(document.getElementById('root')).render(<TipProvider><CalendarModal/></TipProvider>);
  `,
    [
      {
        name: 'calendar-range-data',
        setup(build) {
          build.onResolve(
            {
              filter:
                /^@\/(?:contexts\/dashboard-context|hooks\/use-(?:day-shape|tasks|work)|lib\/client\/(?:calendar-work|active-view))$/,
            },
            (args) => ({ path: args.path, namespace: 'calendar-range-data' }),
          );
          build.onLoad({ filter: /.*/, namespace: 'calendar-range-data' }, () => ({
            loader: 'js',
            contents: `
      export const useDashboard=()=>({activeView:{type:'home'},openTask(){},closeAllSlideouts(){}});
      export const viewKey=()=> 'home';
      export const useTasks=()=>({data:[]});
      export const useDayShape=()=>({data:{status:'ok',asOf:new Date().toISOString(),days:[]}});
      export const useRefreshDayShape=()=>async()=>{};
      export const useSaveWorkReport=()=>({mutateAsync:async()=>{}});
      export const useWorkRange=()=>({data:null,isPlaceholderData:false});
      export const useCalendarWork=()=>({on:true,setOn(){}});
    `,
          }));
          build.onResolve(
            { filter: /^\.\/(?:week-grid|week-view|day-view|day-list|calendar-connect-prompt)$/ },
            (args) =>
              args.importer.endsWith('calendar-modal.tsx')
                ? { path: args.path, namespace: 'calendar-body-data' }
                : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: 'calendar-body-data' }, () => ({
            loader: 'tsx',
            resolveDir: process.cwd(),
            contents: `
      import React from 'react';
      export const WeekGrid=()=> <p>Calendar range</p>;export const WeekView=()=> <p>Agenda range</p>;
      export const DayView=()=> <p>Calendar day</p>;export const DayList=()=> <p>Agenda day</p>;
      export const CalendarConnectPrompt=()=> <p>Connect a calendar</p>;
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
  for (const width of [360, 900]) {
    it(`uses tabs for whole calendar renderings and preserves the saved values (${width}px, ${theme})`, async () => {
      const page = await fixture.browser.newPage({
        viewport: { width, height: 844 },
        hasTouch: width === 360,
      });
      page.setDefaultTimeout(3000);
      try {
        await page.goto(`${fixture.url}/?theme=${theme}`);
        await page.getByRole('dialog').waitFor();
        const refresh = page.getByRole('button', { name: 'Refresh calendar' });
        expect(await refresh.evaluate((el) => el.getBoundingClientRect().width)).toBe(28);
        expect(await refresh.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        const show = page.getByRole('tablist', { name: 'Show' });
        const calendar = show.getByRole('tab', { name: 'Calendar', exact: true }),
          list = show.getByRole('tab', { name: 'List', exact: true });
        await calendar.waitFor();
        await page.keyboard.press('Tab');
        await calendar.focus();
        await calendar.press('ArrowRight');
        await expect.poll(() => list.getAttribute('aria-selected')).toBe('true');
        const panel = page.getByRole('tabpanel');
        expect(await list.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
        expect(await panel.getAttribute('aria-labelledby')).toBe(await list.getAttribute('id'));
        expect(await panel.innerText()).toBe('Agenda range');
        expect(await list.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
        await list.press('End');
        await expect
          .poll(() => show.getByRole('tab', { name: 'Report' }).getAttribute('aria-selected'))
          .toBe('true');
        expect(await page.evaluate(() => localStorage.getItem('ri.calendar.weekMode'))).toBe('report');
        const day = page
          .getByRole('group', { name: 'View' })
          .getByRole('button', { name: 'Day', exact: true });
        await day.click();
        expect(await day.getAttribute('aria-pressed')).toBe('true');
        await page.reload();
        await page.getByRole('dialog').waitFor();
        expect(await show.getByRole('tab', { name: 'Report' }).getAttribute('aria-selected')).toBe('true');
        expect(await day.getAttribute('aria-pressed')).toBe('true');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        const close = await page.getByRole('button', { name: 'Close calendar' }).boundingBox();
        expect(close!.x + close!.width).toBeLessThanOrEqual(width);
      } finally {
        await page.close();
      }
    });
  }

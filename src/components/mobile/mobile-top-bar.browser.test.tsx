/** The real phone search row keeps its paired action on the field's fill. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {TipProvider} from '@/components/ui/tip';
    import {MobileTopBar} from '@/components/mobile/mobile-top-bar';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    createRoot(document.getElementById('root')).render(<TipProvider><MobileTopBar/></TipProvider>);
  `, [{ name: 'phone-row-state', setup(build) {
    build.onResolve({ filter: /^@\/(?:components\/(?:spaces\/space-selector|home\/home-context|settings\/settings-destination))$/ }, args => ({ path: args.path, namespace: 'phone-row-state' }));
    build.onLoad({ filter: /.*/, namespace: 'phone-row-state' }, () => ({ loader: 'js', contents: `
      export const SpaceSelector=()=>null;
      export const useSettingsLink=()=>()=>{};
      export const useOptionalHomeContext=()=>({home:{kind:new URLSearchParams(location.search).get('team')==='true'?'team':'personal'},capabilities:{privatePlanning:true}});
      export const useHomeStorageScope=()=>null;
    ` }));
    build.onResolve({ filter: /^\.\/scratchpad-pad$/ }, () => ({ path: 'pad-content', namespace: 'phone-pad-content' }));
    build.onLoad({ filter: /.*/, namespace: 'phone-pad-content' }, () => ({ loader: 'js', contents: 'export const ScratchpadPad=()=>null;' }));
  } }], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [360, 390]) for (const team of [false, true]) {
  it(`pairs the field and ${team ? 'Settings' : 'Scratchpad'} fill with touch targets (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(3000);
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&team=${team}`);
      const field = page.getByRole('button', { name: 'Search tasks, notes, areas', exact: true });
      const action = page.getByRole('button', { name: team ? 'Settings' : 'Scratchpad', exact: true });
      await action.waitFor();
      const fill = await field.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(fill).not.toBe('rgba(0, 0, 0, 0)');
      expect(await action.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(fill);
      for (const control of [field, action]) {
        expect(await control.evaluate(el => el.getBoundingClientRect().height)).toBe(40);
        await page.keyboard.press('Tab');await control.focus();
        expect(await control.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      }
      const bounds = await action.boundingBox();
      expect(bounds!.width).toBe(40);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    } finally { await page.close(); }
  });
}

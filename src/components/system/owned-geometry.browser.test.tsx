import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';
let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
import React from 'react';import{createRoot}from'react-dom/client';
import{OverlaySurface}from'@/components/system/overlay';import{DialogBody,DialogFooter}from'@/components/system/dialog';
import{FormActions,FormFooterHost}from'@/components/system/form-actions';
import{Card}from'@/components/system/card';import{MenuAction}from'@/components/system/menu-action';import{InlineAction}from'@/components/system/inline-action';
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
createRoot(document.getElementById('root')).render(<main>
{['chat','document','form','application','settings','fit','window','search'].map(height=><OverlaySurface key={height} id={height} height={height}>Frame</OverlaySurface>)}
<FormActions id="standalone-actions" separated>Standalone actions</FormActions><FormFooterHost><FormActions id="hosted-actions" separated>Hosted actions</FormActions></FormFooterHost>
<DialogBody id="body" padding="panel" compact>Content</DialogBody><DialogFooter id="footer" padding="panel">Actions</DialogFooter>
<Card as="button" id="dimmed" dimmed>Unavailable reference</Card><Card as="button" id="disabled" dimmed disabled>Disabled reference</Card><Card id="dragging" dragging>Dragging task</Card>
<MenuAction id="muted" muted>Inactive chat</MenuAction><MenuAction id="reveal" reveal>Hide items below</MenuAction><MenuAction id="disabled-menu" muted disabled>Unavailable</MenuAction>
<div style={{fontSize:12,lineHeight:'16px'}}><InlineAction id="control" appearance="control">Nobody</InlineAction><button id="original" style={{font:'inherit',padding:'4px 6px',border:0,borderRadius:6,background:'transparent'}}>Nobody</button></div>
</main>);
`, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });
for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  it(`preserves frame, inset and state geometry at ${width}px (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.locator('#control').waitFor();
      expect(await page.locator('#chat').evaluate(el => el.getBoundingClientRect().height)).toBe(440);
      expect(await page.locator('#document').evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(844 * .9, 1);
      expect(await page.locator('#form').evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(844 * .85, 1);
      expect(await page.locator('#application').evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(844 * .92, 1);
      expect(await page.locator('#settings').evaluate(el => el.getBoundingClientRect().height)).toBe(800);
      expect(await page.locator('#window').evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(844 * .88, 1);
      expect(await page.locator('#search').evaluate(el => el.getBoundingClientRect().height)).toBe(width < 768 ? 844 : 21);
      expect(await page.locator('#body').evaluate(el => { const s = getComputedStyle(el); return [s.padding, s.fontSize]; })).toEqual(['20px', '12.5px']);
      expect(await page.locator('#footer').evaluate(el => getComputedStyle(el).padding)).toBe('12px 20px');
      for (const id of ['standalone-actions', 'hosted-actions']) expect(await page.locator('#'+id).evaluate(el => getComputedStyle(el).paddingTop)).toBe('8px');
      for (const [id, opacity] of [['dimmed', '.7'], ['dragging', '.4'], ['muted', '.6'], ['disabled', '.5'], ['disabled-menu', '.5'], ['reveal', '0']]) {
        expect(Number(await page.locator('#' + id).evaluate(el => getComputedStyle(el).opacity)), id).toBe(Number(opacity));
      }
      await page.locator('#reveal').hover();
      expect(await page.locator('#reveal').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
      const sizes = await page.locator('#control, #original').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
      expect(sizes[0]).toEqual(sizes[1]);
      await page.locator('#control').hover();
      expect(await page.locator('#control').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    } finally { await page.close(); }
  });
}

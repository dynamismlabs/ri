import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
const tones = ['neutral', 'info', 'warning', 'error', 'success', 'working', 'energy-light', 'energy-deep', 'status-consider', 'status-todo', 'status-progress', 'status-done', 'mode-auto', 'mode-edits', 'mode-ask', 'mode-plan'];
beforeAll(async () => {
  fixture = await browserFixture(`
    import React,{useState,useRef,useEffect} from 'react';import{createRoot}from'react-dom/client';
    import{InlineAction}from'./src/components/system/inline-action';import{Card}from'./src/components/system/card';import{Callout}from'./src/components/system/callout';
    import{ChoiceRow,ChoiceGroup}from'./src/components/system/choice-row';import{MenuAction}from'./src/components/system/menu-action';
    import{StatusBadge}from'./src/components/system/status-badge';import{Meta,MetaItem}from'./src/components/system/meta';
    import{DropdownMenu,DropdownMenuTrigger,DropdownMenuContent}from'./src/components/ui/dropdown-menu';
    import{Button}from'./src/components/system/button';import{TipProvider}from'./src/components/ui/tip';
    const theme=new URLSearchParams(location.search).get('theme');document.documentElement.classList.toggle('dark',theme==='dark');
    function Fixture(){const[value,setValue]=useState('read'),[clicks,setClicks]=useState(0),[checked,setChecked]=useState(false),ref=useRef(null);useEffect(()=>{window.rowRef=ref.current},[]);return <main className="bg-pane text-t1 p-4 space-y-3">
      <div style={{fontSize:15,lineHeight:'24px'}}><InlineAction id="inline-summary" className="w-full text-left"><span className="block">A summary title</span><span className="block">The second line stays below</span></InlineAction></div>
      <div style={{fontSize:15}}><InlineAction id="caption" purpose="caption">Supporting reasoning</InlineAction><InlineAction id="heading" purpose="heading">A content title</InlineAction></div>
      <ChoiceRow asChild><div id="nested-content" className="flex items-center"><button aria-label="Drag within content"><svg width="12" height="12"/></button><span>Content with its own controls</span></div></ChoiceRow>
      <ChoiceRow asChild><div id="stacked-content"><p>Stacked title</p><div>Content below the title</div></div></ChoiceRow>
      <ChoiceRow id="checkbox-choice" indicator="checkbox" aria-pressed={checked} onClick={()=>setChecked(v=>!v)}>Include this project</ChoiceRow><MenuAction id="compact-menu" density="compact" size="compact">Compact menu action</MenuAction><MenuAction id="auto-menu" density="compact">Automatic phone action</MenuAction><MenuAction id="touch-menu" size="touch">Phone menu action</MenuAction>
      <Card id="content">A content panel</Card><Card as="button" id="card-action" onClick={()=>setClicks(c=>c+1)}>Open a summary</Card><Card as="button" disabled id="card-disabled" onClick={()=>setClicks(c=>c+1)}>Unavailable summary</Card>
      <div className="flex gap-2"><ChoiceRow ref={ref} id="row-action" title="Use this agent" description="Continue its existing work" onClick={()=>setClicks(c=>c+1)}/><ChoiceRow id="row-selected" aria-pressed={true}>Chosen agent</ChoiceRow><ChoiceRow id="row-disabled" disabled onClick={()=>setClicks(c=>c+1)}>Unavailable agent</ChoiceRow></div>
      <ChoiceRow id="row-invalid" title="Invalid choice" aria-invalid="true"/><ChoiceRow id="row-touch" size="touch" title="Phone option" description="Supporting text wraps without clipping"/>
      <form id="access-form"><ChoiceGroup aria-label="Access" name="app-access" value={value} onValueChange={setValue}><ChoiceRow selection="radio" value="read" title="Read" description="Read the selected account"/><ChoiceRow selection="radio" value="write" title="Read and write" description="Make changes to the selected account"/></ChoiceGroup><Button type="submit">Inspect form</Button></form>
      <DropdownMenu><DropdownMenuTrigger asChild><Button id="menu-trigger">Actions</Button></DropdownMenuTrigger><DropdownMenuContent><MenuAction kind="menu" onSelect={()=>setClicks(c=>c+1)}>Open item</MenuAction><MenuAction kind="menu" asChild><a href="#details">Open details</a></MenuAction><MenuAction kind="menu" disabled>Unavailable item</MenuAction><MenuAction kind="menu" tone="error" onSelect={()=>setClicks(c=>c+1)}>Delete item</MenuAction></DropdownMenuContent></DropdownMenu>
      <Meta className="max-w-52" id="metadata"><StatusBadge id="metadata-fact">Shared</StatusBadge><MetaItem>Added today</MetaItem><MetaItem as="button" id="energy-light" kind="energy" energy="light" onClick={()=>setClicks(c=>c+1)}>Light</MetaItem><MetaItem as={InlineAction} appearance="link" tone="success" id="toned-meta">Open a task</MetaItem><MetaItem id="energy-deep" kind="energy" energy="deep">Deep</MetaItem><MetaItem as="button" id="due" urgency="today">Due today</MetaItem></Meta>
      <output id="clicks">{clicks}</output><div id="tones" className="space-y-2">{${JSON.stringify(tones)}.map(tone=><div key={tone}><StatusBadge id={'badge-'+tone} tone={tone}>{tone}</StatusBadge><Callout id={'callout-'+tone} tone={tone}>A readable notice</Callout></div>)}</div>
    </main>};createRoot(document.getElementById('root')).render(<TipProvider><Fixture/></TipProvider>);
    document.addEventListener('submit',e=>{e.preventDefault();window.submitted=Object.fromEntries(new FormData(e.target));});
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });
async function open(theme: string, width = 900) {
  const page = await fixture.browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
  await page.goto(`${fixture.url}/?theme=${theme}`);
  await page.locator('#row-action').waitFor();
  return page;
}
async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const backgrounds: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement) backgrounds.unshift(getComputedStyle(p).backgroundColor);
    const rgb = (...layers: string[]) => { ctx.clearRect(0, 0, 1, 1); for (const c of layers) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); } return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = (c: number[]) => { const [r, g, b] = c.map(v => { const s = v / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const fill = rgb(...backgrounds), ink = rgb('rgb(' + fill.join(' ') + ')', getComputedStyle(el).color);
    const [a, b] = [luminance(fill), luminance(ink)].sort((x, y) => y - x); return (a + .05) / (b + .05);
  });
}
for (const theme of ['light', 'dark']) {
  it(`owns content corners, hover, disabled behavior, refs and keyboard focus (${theme})`, async () => {
    const page = await open(theme);
    try {
      for (const id of ['content', 'card-action', 'card-disabled']) expect(await page.locator('#' + id).evaluate(el => getComputedStyle(el).borderRadius)).toBe('14px');
      await page.keyboard.press('Tab');
      for (const id of ['card-action', 'row-action', 'row-invalid']) {
        const target = page.locator('#' + id); await target.focus();
        expect(await target.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
        expect(await contrast(page, '#' + id)).toBeGreaterThanOrEqual(4.5);
        await target.hover(); expect(await contrast(page, '#' + id)).toBeGreaterThanOrEqual(4.5);
      }
      expect(await page.evaluate(() => Reflect.get(window, 'rowRef') === document.getElementById('row-action'))).toBe(true);
      await page.locator('#card-action').click(); await page.locator('#row-action').click();
      expect(await page.locator('#clicks').textContent()).toBe('2');
      for (const id of ['card-disabled', 'row-disabled']) {
        const target = page.locator('#' + id); expect(await target.isDisabled()).toBe(true);
        const fill = await target.evaluate(el => getComputedStyle(el).backgroundColor); await target.hover();
        expect(await target.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(fill);
        expect(await target.evaluate(el => getComputedStyle(el).opacity)).toBe('0.5');
      }
      expect(await page.locator('#row-selected').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await page.locator('#row-disabled').evaluate(el => getComputedStyle(el).backgroundColor));
    } finally { await page.close(); }
  });
  it(`preserves content flow and nested control dimensions without Button drawing (${theme})`, async () => {
    const page = await open(theme);
    try {
      const lines = await page.locator('#inline-summary > span').evaluateAll(els => els.map(el => ({top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom})));
      expect(lines[1].top).toBeGreaterThanOrEqual(lines[0].bottom);
      expect(await page.locator('#inline-summary').evaluate(el => getComputedStyle(el).fontSize)).toBe('15px');
      expect(await page.locator('#nested-content svg').evaluate(el => el.getBoundingClientRect().width)).toBe(12);
      const stacked = await page.locator('#stacked-content > *').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
      expect(stacked[1].top).toBeGreaterThanOrEqual(stacked[0].bottom);
    } finally { await page.close(); }
  });
  it(`keeps caption actions quiet and content titles distinct (${theme})`, async () => {
    const page = await open(theme);
    try {
      expect(await page.locator('#caption').evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
      expect(await page.locator('#heading').evaluate(el => getComputedStyle(el).fontSize)).toBe('14px');
      expect(await page.locator('#caption').evaluate(el => getComputedStyle(el).color)).not.toBe(await page.locator('#heading').evaluate(el => getComputedStyle(el).color));
      expect(await contrast(page, '#caption')).toBeGreaterThanOrEqual(4.5);
      await page.locator('#caption').hover();
      expect(await contrast(page, '#caption')).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab'); await page.locator('#caption').focus();
      expect(await page.locator('#caption').evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
  it(`owns a choice indicator and phone menu target without adding another control (${theme})`, async () => {
    const page = await open(theme, 360);
    try {
      const choice = page.getByRole('button', { name: 'Include this project', exact: true });
      expect(await choice.locator(':scope > span[aria-hidden="true"]').count()).toBe(1);
      expect(await choice.locator('button, input').count()).toBe(0);
      await page.keyboard.press('Tab'); await choice.focus(); await page.keyboard.press('Space');
      expect(await choice.getAttribute('aria-pressed')).toBe('true');
      expect(await choice.locator('svg').isVisible()).toBe(true);
      expect(await choice.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      await page.keyboard.press('Space'); expect(await choice.getAttribute('aria-pressed')).toBe('false');
      expect(await page.locator('#compact-menu').evaluate(el => el.getBoundingClientRect().height)).toBe(24);
      expect(await page.locator('#auto-menu').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
      expect(await page.locator('#touch-menu').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
    } finally { await page.close(); }
  });
  it(`associates choice title/help and preserves radio form values, arrows and focus (${theme})`, async () => {
    const page = await open(theme);
    try {
      const row = page.getByRole('button', { name: 'Use this agent', exact: true });
      expect(await row.getAttribute('aria-describedby')).toBeTruthy();
      expect(await row.evaluate(el => document.getElementById(el.getAttribute('aria-describedby')!)?.textContent)).toBe('Continue its existing work');
      await page.getByRole('button', { name: 'Inspect form' }).click();
      expect(await page.evaluate(() => Reflect.get(window, 'submitted'))).toEqual({ 'app-access': 'read' });
      const first = page.getByRole('radio', { name: 'Read', exact: true });
      // Radix selects on its queued focus event, while the arrow is held.
      await first.focus(); await page.keyboard.down('ArrowDown');

      const second = page.getByRole('radio', { name: 'Read and write', exact: true });
      await expect.poll(() => second.getAttribute('aria-checked')).toBe('true');
      await page.keyboard.up('ArrowDown');
      expect(await second.evaluate(el => el === document.activeElement && getComputedStyle(el).outlineWidth === '2px')).toBe(true);
      await page.getByRole('button', { name: 'Inspect form' }).click();
      expect(await page.evaluate(() => Reflect.get(window, 'submitted'))).toEqual({ 'app-access': 'write' });
    } finally { await page.close(); }
  });
  it(`keeps actual Radix menu dismissal, disabled items and destructive hover readable (${theme})`, async () => {
    const page = await open(theme);
    try {
      await page.locator('#menu-trigger').focus(); await page.keyboard.press('Enter');
      const action = page.getByRole('menuitem', { name: 'Open item', exact: true });
      await action.waitFor(); await page.keyboard.press('ArrowDown');
      expect(await page.getByRole('menuitem', { name: 'Unavailable item', exact: true }).getAttribute('data-disabled')).not.toBeNull();
      const danger = page.getByRole('menuitem', { name: 'Delete item', exact: true });
      await danger.hover(); expect(await contrast(page, '[role="menuitem"]:last-child')).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape'); await expect.poll(() => page.getByRole('menu').count()).toBe(0);
      await expect.poll(() => page.locator('#menu-trigger').evaluate(el => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });
  it(`preserves a menu link's native element, keyboard focus and dismissal (${theme})`, async () => {
    const page = await open(theme);
    try {
      await page.locator('#menu-trigger').click();
      const link = page.locator('a[href="#details"]'); await link.waitFor();
      expect(await link.getAttribute('role')).toBe('menuitem');
      await page.keyboard.press('ArrowDown'); await link.focus();
      // In a menu the highlight is the focus mark: a soft fill, no ring.
      expect(await link.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('0px');
      expect(await link.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await page.keyboard.press('Enter');
      await expect.poll(() => page.getByRole('menu').count()).toBe(0);
      expect(new URL(page.url()).hash).toBe('#details');
    } finally { await page.close(); }
  });
  it(`keeps semantic facts and callouts readable for every tone (${theme})`, async () => {
    const page = await open(theme);
    try {
      for (const tone of tones) for (const family of ['badge', 'callout']) {
        const selector = '#' + family + '-' + tone;
        expect(await contrast(page, selector), selector).toBeGreaterThanOrEqual(4.5);
        expect(await page.locator(selector).evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBe(family === 'badge' ? 999 : 14);
      }
    } finally { await page.close(); }
  });
  it(`keeps phone targets, wrapped metadata, dots and energy contrast (${theme})`, async () => {
    const page = await open(theme, 340);
    try {
      expect((await page.locator('#row-touch').boundingBox())!.height).toBeGreaterThanOrEqual(40);
      expect(await page.locator('#metadata').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const factInk = await page.locator('#toned-meta').evaluate(el => getComputedStyle(el).color);
      await page.locator('#toned-meta').hover();
      expect(await page.locator('#toned-meta').evaluate(el => getComputedStyle(el).color)).toBe(factInk);
      expect(await page.getByRole('button', { name: 'Light', exact: true }).count()).toBe(1);
      expect(await page.locator('#metadata-fact').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      expect(await page.locator('#energy-light').evaluate(el => getComputedStyle(el, '::before').content)).toContain('"·"');
      for (const id of ['energy-light', 'energy-deep', 'due']) expect(await contrast(page, '#' + id)).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab'); await page.locator('#energy-light').focus();
      expect(await page.locator('#energy-light').evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
}

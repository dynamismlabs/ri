import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { testChromiumPath } from '@/test/fixtures/test-chromium';
import { testTimeouts } from '@/test/fixtures/browser-timeouts';

const variants = ['primary', 'secondary', 'ghost', 'destructive', 'link'] as const;
const tones = ['neutral', 'attention', 'warning', 'danger', 'success', 'working', 'info', 'energy-light', 'energy-deep', 'mode-auto', 'mode-edits', 'mode-ask', 'mode-plan', 'status-consider', 'status-todo', 'status-progress', 'status-done'] as const;
let browser: Browser;
let server: http.Server;
let base: string;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
  const css = await postcss([require('@tailwindcss/postcss')()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React, {useState, useRef, useEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import {X} from 'lucide-react';
      import {Button} from '@/components/system/button';
      import {IconButton} from '@/components/system/icon-button';
      import {ChipButton} from '@/components/system/chip-button';
      import {ButtonGroup} from '@/components/system/button-group';
      import {TipProvider} from '@/components/ui/tip';
      import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover';
      const variants=${JSON.stringify(variants)}, tones=${JSON.stringify(tones)};
      function Fixture(){
        const [clicks,setClicks]=useState(0), ref=useRef(null);
        useEffect(()=>{window.refButton=ref.current},[]);
        return <>
          <div id="sizes">{['xs','sm','md','touch'].map(size=><React.Fragment key={size}><Button data-size-case={size} size={size}>Save</Button><IconButton label={'Close '+size} size={size}><X/></IconButton></React.Fragment>)}</div>
          <ChipButton asChild disabled id="chip-fact"><span>0 waiting</span></ChipButton><div id="chips"><ChipButton>Filter</ChipButton><ChipButton pressed>Selected filter</ChipButton><ChipButton disabled>Disabled filter</ChipButton><ChipButton size="touch">Phone filter</ChipButton><ChipButton tone="attention" pressed>Unread</ChipButton>{['success','working','danger','warning'].map(status=><ChipButton key={status} tone="status" status={status}>{status}</ChipButton>)}{['auto_all','auto_edits','ask','plan'].map(mode=><ChipButton key={mode} tone="mode" mode={mode}>{mode}</ChipButton>)}</div>
          <Button ref={ref} id="ref-button" onClick={()=>setClicks(c=>c+1)}>Ref and event</Button>
          <Button id="disabled-link" asChild disabled><a href="#wrong" onClick={()=>setClicks(c=>c+1)}>Unavailable link</a></Button>
          <Button id="invalid" aria-invalid="true">Invalid</Button><output id="clicks">{clicks}</output>
          <div style={{pointerEvents:'none'}}><Button id="floating-action" floating onClick={()=>setClicks(c=>c+1)}>Scroll choices</Button></div>
          <Popover><PopoverTrigger asChild><IconButton id="menu-trigger" label="More actions" tooltip="Actions for this task" shortcut="⌘K"><X/></IconButton></PopoverTrigger><PopoverContent>Task actions</PopoverContent></Popover>
          <span id="selected-color" className="bg-selected"/><span id="thumb-color" className="bg-thumb"/>
          <ButtonGroup id="toolbar-group" variant="toolbar"><IconButton label="Selected tool" pressed><X/></IconButton><IconButton label="Other tool"><X/></IconButton></ButtonGroup>
          <ButtonGroup id="joined-group" variant="joined"><Button>Finder</Button><IconButton label="Open options" variant="secondary"><X/></IconButton></ButtonGroup>
          <div id="reveal-group" className="group"><IconButton label="Hover action" reveal><X/></IconButton><IconButton label="Disabled hover action" reveal disabled><X/></IconButton></div>
          {['nav','tag','fold'].map(group=><div key={group} id={'reveal-'+group} className={'group/'+group}><IconButton label={'Hover '+group} reveal={group}><X/></IconButton></div>)}
          <IconButton label="Open action" reveal aria-expanded="true"><X/></IconButton>
          <IconButton label="Clipped preview" clip focus="inside"><span className="size-16 bg-working-fill"/></IconButton>
          <IconButton label="Disabled action" tooltip="Wait for the upload to finish" disabled><X/></IconButton>
          <div id="cases">{variants.flatMap(variant=>tones.map(tone=><div key={variant+tone} className="flex items-center gap-2 p-1" data-row={variant+'-'+tone}><Button id={variant+'-'+tone} variant={variant} tone={tone}>Action</Button><Button id={variant+'-'+tone+'-pressed'} variant={variant} tone={tone} pressed>Selected</Button><Button id={variant+'-'+tone+'-disabled'} variant={variant} tone={tone} disabled>Unavailable</Button></div>))}</div>
        </>;
      }
      createRoot(document.getElementById('root')).render(<TipProvider><Fixture/></TipProvider>);
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', logLevel: 'silent',
  });
  const script = bundle.outputFiles[0].text;
  server = http.createServer((request, response) => {
    if (request.url === '/fixture.js') { response.setHeader('content-type', 'application/javascript'); response.end(script); return; }
    const dark = request.url?.includes('dark');
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html class="${dark ? 'dark' : ''}"><head><style>${css.css}\nbody { background:var(--pane); color:var(--t1); font-family:var(--font-sans); padding:16px } .ri-button { transition:none } #sizes,#chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}</style></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({ executablePath: testChromiumPath() });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});

async function open(theme: string) {
  const page = testTimeouts(await browser.newPage({ viewport: { width: 1000, height: 700 } }), 10_000);
  await page.goto(base + '/' + theme);
  await page.locator('#ref-button').waitFor();
  return page;
}

/** Composite the actual computed CSS colors, including translucent fills. */
async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const backgrounds: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement) backgrounds.unshift(getComputedStyle(p).backgroundColor);
    const rgb = (...layers: string[]) => { ctx.clearRect(0, 0, 1, 1); for (const c of layers) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); } return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = (c: number[]) => { const [r,g,b] = c.map(v => { const s=v/255; return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4; }); return 0.2126*r+0.7152*g+0.0722*b; };
    const fill=rgb(...backgrounds), ink=rgb('rgb('+fill.join(' ')+')',getComputedStyle(el).color);
    const [a,b]=[luminance(fill),luminance(ink)].sort((x,y)=>y-x); return (a+0.05)/(b+0.05);
  });
}

for (const theme of ['light', 'dark']) {
  for (const variant of variants) {
    it(`Button ${variant} owns hover, pressed, disabled and tab focus for every tone (${theme})`, async () => {
      const page = await open(theme);
      try {
        await page.keyboard.press('Tab');
        for (const tone of tones) {
          const selector = '#'+variant+'-'+tone;
          const button = page.locator(selector);
          for (const state of ['base','hover','pressed'] as const) {
            const target = state === 'pressed' ? selector+'-pressed' : selector;
            if (state === 'hover') await button.hover();
            expect(await contrast(page,target), tone+' '+state).toBeGreaterThanOrEqual(4.5);
            expect(await page.locator(target).evaluate(el=>parseFloat(getComputedStyle(el).borderRadius)),tone).toBe(999);
          }
          await button.focus();
          expect(await button.evaluate(el=>({visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth}))).toEqual({visible:true,outline:'solid',width:'2px'});
          const disabled=page.locator(selector+'-disabled');
          const before=await disabled.evaluate(el=>({fill:getComputedStyle(el).backgroundColor,ink:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity}));
          await disabled.hover();
          expect(await disabled.evaluate(el=>({fill:getComputedStyle(el).backgroundColor,ink:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity}))).toEqual(before);
          expect(before.opacity).toBe('0.5');
          expect(await disabled.evaluate(el=>(el as HTMLButtonElement).disabled)).toBe(true);
        }
      } finally { await page.close(); }
    }, 60_000);
  }

  it(`Button and IconButton use the role scale, including touch (${theme})`, async () => {
    const page=await open(theme);
    try {
      for (const [size,height,font] of [['xs',24,12],['sm',28,12.5],['md',32,13],['touch',40,15]] as const) {
        const text=await page.locator('[data-size-case="'+size+'"]').evaluate(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize),weight:getComputedStyle(el).fontWeight}));
        expect(text).toEqual({height,font,weight:'500'});
        const icon=await page.getByRole('button',{name:'Close '+size,exact:true}).boundingBox();
        expect(icon?.width).toBe(height);expect(icon?.height).toBe(height);
      }
      for (const [name,height] of [['Filter',28],['Phone filter',40]] as const) expect((await page.getByRole('button',{name,exact:true}).boundingBox())?.height).toBe(height);
      await page.getByRole('button',{name:'Filter',exact:true}).focus();
      expect(await page.getByRole('button',{name:'Filter',exact:true}).evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });

  it(`ChipButton keeps contrast for each tone, selected and disabled (${theme})`, async () => {
    const page=await open(theme);
    try {
      await page.keyboard.press('Tab');
      for (const chip of await page.locator('#chips button:not(:disabled)').all()) {
        const id=await chip.evaluate(el=>{el.id='chip-case';return '#chip-case';});
        expect(await contrast(page,id)).toBeGreaterThanOrEqual(4.5);
        await chip.hover();expect(await contrast(page,id)).toBeGreaterThanOrEqual(4.5);
        await chip.focus();expect(await chip.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
        await chip.evaluate(el=>el.removeAttribute('id'));
      }
      expect(await page.getByRole('button',{name:'Selected filter'}).getAttribute('aria-pressed')).toBe('true');
      expect(await page.locator('#chip-fact').getAttribute('aria-disabled')).toBe('true');
      const disabled=page.getByRole('button',{name:'Disabled filter'});
      await disabled.hover();expect(await disabled.evaluate(el=>getComputedStyle(el).opacity)).toBe('0.5');
    } finally { await page.close(); }
  });

  it(`IconButton names its action, preserves trigger behavior and Button forwards refs and events (${theme})`, async () => {
    const page=await open(theme);
    try {
      await page.locator('#ref-button').click();
      expect(await page.locator('#clicks').textContent()).toBe('1');
      expect(await page.evaluate(()=>Reflect.get(window,'refButton')===document.querySelector('#ref-button'))).toBe(true);
      await page.locator('#disabled-link').click({force:true});
      expect(await page.locator('#clicks').textContent()).toBe('1');
      expect(new URL(page.url()).hash).toBe('');
      expect(await page.locator('#disabled-link').getAttribute('aria-disabled')).toBe('true');
      await page.locator('#floating-action').click();
      expect(await page.locator('#clicks').textContent()).toBe('2');
      await page.keyboard.press('Tab');
      await page.getByRole('button',{name:'More actions',exact:true}).focus();
      await expect.poll(()=>page.getByRole('tooltip').textContent()).toContain('Actions for this task');
      await page.keyboard.press('Enter');
      await page.getByText('Task actions',{exact:true}).waitFor();
      expect(await page.getByRole('button',{name:'More actions',exact:true}).getAttribute('aria-expanded')).toBe('true');
      await page.keyboard.press('Escape');
      await page.locator('#invalid').focus();
      expect(await page.locator('#invalid').evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
  it(`pressed ghost and grouped actions keep selection and inset focus (${theme})`, async () => {
    const page=await open(theme);
    try {
      const selected=await page.locator('#selected-color').evaluate(el=>getComputedStyle(el).backgroundColor);
      expect(await page.locator('#ghost-neutral-pressed').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(selected);
      const thumb=await page.locator('#thumb-color').evaluate(el=>getComputedStyle(el).backgroundColor);
      const active=page.getByRole('button',{name:'Selected tool'});
      expect(await active.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(thumb);
      expect(await active.evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
      await page.keyboard.press('Tab'); await active.focus();
      expect(await active.evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-2px');
      const parts=await page.locator('#joined-group').evaluate(el=>{
        const boxes=[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect()), outer=el.getBoundingClientRect();
        return {joined:boxes[0].right===boxes[1].left && boxes[0].left===outer.left && boxes[1].right===outer.right,divider:getComputedStyle(el.querySelectorAll('button')[1]).borderLeftWidth};
      });
      expect(parts).toEqual({joined:true,divider:'1px'});
      await page.getByRole('button',{name:'Open options'}).focus();
      expect(await page.getByRole('button',{name:'Open options'}).evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-2px');
    } finally { await page.close(); }
  });

  it(`hover actions reveal on the correct group, tab focus and touch (${theme})`, async () => {
    const page=await open(theme);
    try {
      await page.mouse.move(990,2);
      for (const [group,name] of [['group','Hover action'],['nav','Hover nav'],['tag','Hover tag'],['fold','Hover fold']]) {
        const action=page.getByRole('button',{name,exact:true});
        expect(await action.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
        await page.locator('#reveal-'+group).hover();
        expect(await action.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
        if (group === 'group') expect(await page.getByRole('button',{name:'Disabled hover action',exact:true}).evaluate(el=>getComputedStyle(el).opacity)).toBe('0.5');
        await page.mouse.move(990,2);
        await page.keyboard.press('Tab');await action.focus();
        expect(await action.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
        await page.locator('#ref-button').focus();
      }
      expect(await page.getByRole('button',{name:'Open action',exact:true}).evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
      const clipped=page.getByRole('button',{name:'Clipped preview',exact:true});await clipped.focus();expect(await clipped.evaluate(el=>({overflow:getComputedStyle(el).overflow,offset:getComputedStyle(el).outlineOffset}))).toEqual({overflow:'hidden',offset:'-2px'});
      const touch=await browser.newPage({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
      try { await touch.goto(base+'/'+theme);await touch.getByRole('button',{name:'Hover action',exact:true}).waitFor();expect(await touch.getByRole('button',{name:'Hover action',exact:true}).evaluate(el=>getComputedStyle(el).opacity)).toBe('1'); }
      finally { await touch.close(); }
    } finally { await page.close(); }
  });

  it(`disabled icon actions retain their explanatory tooltip (${theme})`, async () => {
    const page=await open(theme);
    try {
      const action=page.getByRole('button',{name:'Disabled action',exact:true});
      await action.hover();
      await expect.poll(()=>page.getByRole('tooltip').textContent()).toContain('Wait for the upload to finish');
      expect(await action.evaluate(el=>(el as HTMLButtonElement).disabled)).toBe(true);
    } finally { await page.close(); }
  });

}

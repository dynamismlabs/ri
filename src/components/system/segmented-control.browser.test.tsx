import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {TipProvider} from '@/components/ui/tip';
    import {SegmentedControl,SegmentedPanel,SegmentedRoot,SegmentedList} from '@/components/system/segmented-control';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    const options=[{value:'a',label:'First'},{value:'disabled',label:'Unavailable',disabled:true},{value:'b',label:'Second',count:2,countStyle:'badge',tone:'attention'},{value:'c',label:'Third'}];
    function App(){
      const [tab,setTab]=useState('a'),[choice,setChoice]=useState('a'),[radio,setRadio]=useState('a'),[nullable,setNullable]=useState('light'),[scroll,setScroll]=useState('0'),[long,setLong]=useState(false),[remount,setRemount]=useState('a');
      return <main style={{padding:16,background:'var(--pane)',color:'var(--t1)'}}>
        <SegmentedControl mode="tabs" value={tab} onChange={setTab} options={options} ariaLabel="Panels">
          <SegmentedPanel value="a" keepMounted className="flex"><input aria-label="Kept draft" defaultValue="Draft"/></SegmentedPanel>
          <SegmentedPanel value="b">Second panel</SegmentedPanel><SegmentedPanel value="c">Third panel</SegmentedPanel>
        </SegmentedControl>
        <SegmentedControl mode="choice" value={choice} onChange={setChoice} options={options} ariaLabel="Filter"/>
        <SegmentedControl mode="choice" selection="radio" value={radio} onChange={setRadio} options={options} ariaLabel="Value"/>
        <SegmentedControl mode="choice" allowEmpty value={nullable} onChange={setNullable} options={[{value:'light',label:'Light'},{value:'deep',label:'Deep'}]} ariaLabel="Energy"/>
        <SegmentedRoot mode="tabs" value={remount} onChange={setRemount}>
          {remount==='a'?<div><SegmentedList ariaLabel="Conditional header" options={options}/><SegmentedPanel value="a">First document</SegmentedPanel></div>
          :<section><SegmentedList ariaLabel="Conditional header" options={options}/><SegmentedPanel value={remount}>Other document</SegmentedPanel></section>}
        </SegmentedRoot>
        <output>{nullable===null?'Empty':nullable}</output>
        <SegmentedControl mode="choice" size="touch" value={choice} onChange={setChoice} options={options} ariaLabel="Phone filter"/>
        <SegmentedControl mode="choice" value="working" onChange={()=>{}} ariaLabel="Progress counts" options={[{value:'working',label:'Working',count:2,countStyle:'badge',tone:'working'}]}/>
        <SegmentedControl mode="choice" selection="radio" value="live" onChange={()=>{}} ariaLabel="Isolation" options={[{value:'worktree',label:'Worktree',disabled:true},{value:'live',label:'Live',selectedTone:'warning'}]}/>
        <div id="resize" style={{width:240}}><SegmentedControl mode="choice" value={scroll} onChange={setScroll} options={Array.from({length:10},(_,i)=>({value:String(i),label:i===0&&long?'A very long changed label':'Option '+i}))} ariaLabel="Scrolling"/></div>
        <button onClick={()=>setLong(true)}>Long label</button>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<TipProvider><App/></TipProvider>);
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

async function contrast(target: Locator) {
  return target.evaluate(el => {
    const canvas = document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    const layers:string[]=[];
    for(let p:Element|null=el;p;p=p.parentElement) layers.unshift(getComputedStyle(p).backgroundColor);
    const rgb=(colors:string[])=>{ctx.clearRect(0,0,1,1);for(const c of colors){ctx.fillStyle=c;ctx.fillRect(0,0,1,1);}return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
    const luminance=(colors:number[])=>colors.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const fill=rgb(layers),ink=rgb(['rgb('+fill.join(' ')+')',getComputedStyle(el).color]);
    const [a,b]=[luminance(fill),luminance(ink)].sort((x,y)=>y-x);return (a+.05)/(b+.05);
  });
}
for (const theme of ['light','dark']) {
  it(`tabs associate panels and support arrows, Home/End and disabled skipping (${theme})`, async () => {
    const page=await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const tabs=page.getByRole('tablist',{name:'Panels'}),first=tabs.getByRole('tab',{name:'First'}),second=tabs.getByRole('tab',{name:'Second 2'});
      await page.keyboard.press('Tab');await first.focus();await first.press('ArrowRight');
      await expect.poll(()=>second.getAttribute('aria-selected')).toBe('true');
      const panel=page.locator('[id="'+await second.getAttribute('aria-controls')+'"]');
      expect(await page.getByRole('textbox',{name:'Kept draft',includeHidden:true}).isVisible()).toBe(false);
      expect(await panel.innerText()).toBe('Second panel');
      expect(await second.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
      expect(await panel.getAttribute('aria-labelledby')).toBe(await second.getAttribute('id'));
      await second.press('End');await expect.poll(()=>tabs.getByRole('tab',{name:'Third'}).getAttribute('aria-selected')).toBe('true');
      await page.keyboard.press('Home');await expect.poll(()=>first.getAttribute('aria-selected')).toBe('true');
      expect(await page.getByRole('textbox',{name:'Kept draft'}).inputValue()).toBe('Draft');
      expect(await first.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await first.evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-2px');
    } finally { await page.close(); }
  });
  it(`keeps keyboard focus when a conditional header remounts its tabs (${theme})`, async () => {
    const page=await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const tabs=page.getByRole('tablist',{name:'Conditional header'});
      const first=tabs.getByRole('tab',{name:'First'}),second=tabs.getByRole('tab',{name:'Second 2'});
      await first.focus();await first.press('ArrowRight');
      await expect.poll(()=>second.getAttribute('aria-selected')).toBe('true');
      await expect.poll(()=>second.evaluate(el=>el===document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });
  it(`choices keep pressed semantics, nullable deselection and real radio values (${theme})`, async () => {
    const page=await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const group=page.getByRole('group',{name:'Filter',exact:true});
      expect(await group.getByRole('radio').count()).toBe(0);
      const first=group.getByRole('button',{name:'First'}),second=group.getByRole('button',{name:'Second 2'});
      await first.focus();await first.press('ArrowRight');
      await expect.poll(()=>second.evaluate(el=>el===document.activeElement)).toBe(true);
      expect(await first.getAttribute('aria-pressed')).toBe('true');
      await second.press('Space');expect(await second.getAttribute('aria-pressed')).toBe('true');
      expect(await second.getAttribute('aria-checked')).toBeNull();
      await second.click();expect(await second.getAttribute('aria-pressed')).toBe('true');
      const energy=page.getByRole('group',{name:'Energy'});await energy.getByRole('button',{name:'Light'}).click();
      expect(await page.locator('output').innerText()).toBe('Empty');
      await energy.getByRole('button',{name:'Deep'}).press('Enter');expect(await page.locator('output').innerText()).toBe('deep');
      const radio=page.getByRole('radiogroup',{name:'Value'});await radio.getByRole('radio',{name:'First'}).focus();
      // Radix moves focus on a timer. Keep the arrow held through that focus,
      // as real input does, before releasing its radio-selection modifier.
      await page.keyboard.down('ArrowRight');
      try { await expect.poll(()=>radio.getByRole('radio',{name:'Second 2'}).getAttribute('aria-checked')).toBe('true'); }
      finally { await page.keyboard.up('ArrowRight'); }
    } finally { await page.close(); }
  });
  it(`owns compact/touch dimensions, thumb, hover contrast and disabled states (${theme})`, async () => {
    const page=await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      for(const [label,height] of [['Filter',28],['Phone filter',40]] as const){
        const group=page.getByRole('group',{name:label,exact:true});
        expect(await group.evaluate(el=>el.getBoundingClientRect().height)).toBe(height);
        const selected=group.getByRole('button',{name:'First'}),other=group.getByRole('button',{name:'Third'});
        expect(await selected.evaluate(el=>el.getBoundingClientRect().height)).toBe(height-4);
        expect(await selected.getAttribute('data-state')).toBe('on');
        expect(await selected.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
        expect(await selected.evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
        expect(await selected.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await group.evaluate(el=>getComputedStyle(el).backgroundColor));
        expect(await contrast(selected)).toBeGreaterThanOrEqual(4.5);await other.hover();expect(await contrast(other)).toBeGreaterThanOrEqual(4.5);
        const disabled=group.getByRole('button',{name:'Unavailable'});expect(await disabled.isDisabled()).toBe(true);
        expect(await disabled.evaluate(el=>getComputedStyle(el).opacity)).toBe('0.5');
        await page.keyboard.press('Tab');await selected.focus();expect(await selected.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
        const badge=group.locator('.ri-segment-count');expect(await contrast(badge)).toBeGreaterThanOrEqual(4.5);
      }
      const working=page.getByRole('group',{name:'Progress counts'}).locator('.ri-segment-count');
      expect(await contrast(working)).toBeGreaterThanOrEqual(4.5);
      const live=page.getByRole('radiogroup',{name:'Isolation'}).getByRole('radio',{name:'Live'});
      expect(await contrast(live)).toBeGreaterThanOrEqual(4.5);await live.hover();expect(await contrast(live)).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab');await live.focus();expect(await live.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally { await page.close(); }
  });
  it(`keeps the selected option visible after its track narrows or labels grow (${theme})`, async () => {
    const page=await fixture.browser.newPage({viewport:{width:900,height:700}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const group=page.getByRole('group',{name:'Scrolling'}),last=group.getByRole('button',{name:'Option 9'});
      await last.click();
      await page.locator('#resize').evaluate(el=>{el.style.width='1500px'});
      await expect.poll(()=>group.locator('xpath=..').evaluate(el=>el.scrollLeft)).toBe(0);
      await page.locator('#resize').evaluate(el=>{el.style.width='160px'});
      const visible=()=>last.evaluate(el=>{
        const box=el.getBoundingClientRect(),viewport=el.closest('.ri-segment-scroller')!.getBoundingClientRect();
        return box.left>=viewport.left-1 && box.right<=viewport.right+1;
      });
      await expect.poll(visible).toBe(true);
      await page.getByRole('button',{name:'Long label'}).click();
      await expect.poll(visible).toBe(true);
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    }finally{await page.close();}
  });
  it(`measures scrolling, resizing and changed labels without moving the page (${theme})`, async () => {
    const page=await fixture.browser.newPage({viewport:{width:900,height:700}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const group=page.getByRole('group',{name:'Scrolling'}),wrapper=group.locator('xpath=../..');
      await expect.poll(()=>wrapper.getAttribute('data-edge-right')).toBe('true');
      expect(await wrapper.getAttribute('data-edge-left')).toBeNull();
      await group.getByRole('button',{name:'Option 0'}).focus();await page.keyboard.press('End');
      await expect.poll(()=>wrapper.getAttribute('data-edge-left')).toBe('true');
      await expect.poll(()=>wrapper.getAttribute('data-edge-right')).toBeNull();
      const last=await group.getByRole('button',{name:'Option 9'}).boundingBox(),viewport=await wrapper.boundingBox();
      expect(last!.x+last!.width).toBeLessThanOrEqual(viewport!.x+viewport!.width+1);
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      await page.locator('#resize').evaluate(el=>{el.style.width='1500px'});
      await expect.poll(()=>wrapper.getAttribute('data-edge-right')).toBeNull();
      await expect.poll(()=>wrapper.getAttribute('data-edge-left')).toBeNull();
      await page.locator('#resize').evaluate(el=>{el.style.width='240px'});
      await group.getByRole('button',{name:'Option 0'}).focus();await page.getByRole('button',{name:'Long label'}).click();
      await expect.poll(()=>wrapper.getAttribute('data-edge-right')).toBe('true');
    } finally { await page.close(); }
  });
}

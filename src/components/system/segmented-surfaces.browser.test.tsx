/** Actual entity controls and folded menu actions use the shared state contracts. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture=await browserFixture(`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {MoreHorizontal} from 'lucide-react';
    import {TipProvider} from '@/components/ui/tip';
    import {ChipButton} from '@/components/system/chip-button';
    import {SegmentedRoot,SegmentedPanel} from '@/components/system/segmented-control';
    import {EntityViewToggle} from '@/components/entities/entity-view-toggle';
    import {EntityDetailHeader} from '@/components/entities/entity-detail-header';
    import {TaskPlanningProperties} from '@/components/tasks/task-planning-properties';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    function App(){
      const [view,setView]=useState('agent'),[task,setTask]=useState({id:'task',energy:'light',effort:'small'});
      return <main style={{padding:16,background:'var(--pane)',color:'var(--t1)'}}>
        <div id="entity-frame" style={{width:800,maxWidth:'100%'}}><SegmentedRoot mode="tabs" value={view} onChange={setView}>
          <EntityDetailHeader><EntityViewToggle/></EntityDetailHeader>
          <SegmentedPanel value="agent">Agent panel</SegmentedPanel><SegmentedPanel value="editor">Document panel</SegmentedPanel>
        </SegmentedRoot></div>
        <div style={{width:310,display:'grid',gridTemplateColumns:'100px minmax(0,1fr)'}}><TaskPlanningProperties task={task} save={patch=>setTask(t=>({...t,...patch}))}/></div>
        <output>{JSON.stringify({energy:task.energy,effort:task.effort})}</output>
        <ChipButton label="More" aria-label="More tools" iconOnly disclosure variant="ghost"><MoreHorizontal/></ChipButton>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<TipProvider><App/></TipProvider>);
  `,[{name:'unrelated-task-fields',setup(build){
    build.onResolve({filter:/^\.\/task-(priority|date-field)$/},args=>args.importer.endsWith('task-planning-properties.tsx')?{path:args.path,namespace:'unrelated-task-fields'}:undefined);
    build.onLoad({filter:/.*/,namespace:'unrelated-task-fields'},()=>({loader:'js',contents:'export const TaskPriority=()=>null;export const TaskDateField=()=>null;'}));
  }}],{css:true});
},120_000);
afterAll(async()=>{await fixture?.close();});
for(const theme of ['light','dark']){
  it(`keeps actual Energy and Effort nullable with inset focus (${theme})`,async()=>{
    const page=await fixture.browser.newPage({viewport:{width:900,height:700}});
    try{
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const energy=page.getByRole('group',{name:'Energy'}),effort=page.getByRole('group',{name:'Effort'});
      await energy.getByRole('button',{name:'Light'}).click();
      await effort.getByRole('button',{name:'S: Small',exact:true}).click();
      expect(JSON.parse(await page.locator('output').innerText())).toEqual({energy:null,effort:null});
      const epic=effort.getByRole('button',{name:'XL: Epic'});
      await epic.focus();await epic.press('Enter');
      expect(JSON.parse(await page.locator('output').innerText()).effort).toBe('epic');
      const bounds=await epic.boundingBox(),viewport=await effort.locator('xpath=..').boundingBox();
      expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport!.x+viewport!.width+1);
      expect(await epic.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await epic.evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-2px');
    }finally{await page.close();}
  });
  it(`associates the real entity toggle and folds its labels with the header (${theme})`,async()=>{
    const page=await fixture.browser.newPage({viewport:{width:1000,height:700}});
    try{
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const tabs=page.getByRole('tablist',{name:'View'}),agent=tabs.getByRole('tab',{name:'Agent view'}),document=tabs.getByRole('tab',{name:'Document view'});
      await expect.poll(()=>agent.locator('.ri-segment-label').isVisible()).toBe(true);
      await page.keyboard.press('Tab');await agent.focus();await agent.press('ArrowRight');
      await expect.poll(()=>document.getAttribute('aria-selected')).toBe('true');
      expect(await page.getByRole('tabpanel').innerText()).toBe('Document panel');
      expect(await document.getAttribute('aria-controls')).toBe(await page.getByRole('tabpanel').getAttribute('id'));
      await page.locator('#entity-frame').evaluate(el=>{el.style.width='340px'});
      await expect.poll(()=>document.locator('.ri-segment-label').isVisible()).toBe(false);
      expect(await document.isVisible()).toBe(true);
      expect(await document.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
    }finally{await page.close();}
  });
  it(`keeps a folded More menu's icon and chevron inside its capsule (${theme})`,async()=>{
    const page=await fixture.browser.newPage();
    try{
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const button=page.getByRole('button',{name:'More tools'});
      const bounds=await button.boundingBox();expect(bounds!.height).toBe(28);
      expect(await button.locator('svg').count()).toBe(2);
      for(const icon of await button.locator('svg').all()){
        const box=await icon.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(bounds!.x+6);
        expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width-5.9);
      }
      expect(await button.locator('.ri-chip-label').isVisible()).toBe(false);
      await page.keyboard.press('Tab');await button.focus();expect(await button.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('2px');
    }finally{await page.close();}
  });
}

import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {SegmentedRoot,SegmentedPanel} from '@/components/system/segmented-control';
    import {SkillHeader} from '@/components/skills/skill-header';
    import {SkillChatPanel} from '@/components/skills/skill-chat-panel';
    import {SkillEditor} from '@/components/skills/skill-editor';
    const skill={ref:'ri:review',name:'review',location:{kind:'ri'},description:'Review shared work.',updatedAt:'2026-10-20',editable:true,linkedFrom:null,hasErrors:false,uncommitted:false,dir:'<home>/skills/review',content:'Original file',hash:'first',body:'Original instructions',otherKeys:[],frontmatterError:null,problems:[],files:[],git:null,canWriteGlobal:false};
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    function App(){const [pane,setPane]=useState('chat'),phone=innerWidth<600;
      return <main className="flex h-dvh flex-col bg-pane text-t1"><SegmentedRoot mode="tabs" value={pane} onChange={setPane}>
        <SkillHeader skill={skill} pane={phone?{value:pane,onChange:setPane}:undefined}/>
        {phone?<div className="relative min-h-0 flex-1">
          <SegmentedPanel value="chat" preserveLayout className="absolute inset-0"><SkillChatPanel skill={skill}/></SegmentedPanel>
          <SegmentedPanel value="skill" preserveLayout className="absolute inset-0"><SkillEditor skill={skill} aiWriting={false}/></SegmentedPanel>
        </div>:<div className="grid min-h-0 flex-1 grid-cols-2"><SkillChatPanel skill={skill}/><SkillEditor skill={skill} aiWriting={false}/></div>}
      </SegmentedRoot></main>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TipProvider><App/></TipProvider></QueryClientProvider>);
  `,
    [
      {
        name: 'skill-domain-adapters',
        setup(build) {
          const modules: Record<string, string> = {
            'use-skill-chat': `export const useSkillChat=(_ref,kind)=>({sessionId:kind,session:{createdAt:'2026-10-20'},isActive:false,newChat:{mutate(){},isPending:false}});`,
            'harness-chat': `import React from 'react';export const HarnessChatSession=({sessionId})=><div className="p-4"><textarea aria-label={sessionId+' draft'} defaultValue=""/></div>;`,
            'skill-navigation': `export const useSkillNavigation=()=>({goHome(){},openSkill(){},canManage:false,showSetupHelp:false});`,
            'use-skills': `export const SKILLS_KEY=['skills'];export const useArchiveSkill=()=>({mutateAsync:async()=>({})});export const useCommitSkill=()=>({mutate(){},isPending:false});`,
            'home-context': `export const useHomeStorageScope=()=>({homeId:'personal',viewerId:'owner'});`,
            'confirm-dialog': `export const useConfirm=()=>async()=>false;`,
            'setup-help-button': `export const PluginSetupHelpButton=()=>null;`,
            'skill-location-control': `export const SkillLocationControl=()=>null;`,
            'skill-files': `export const SkillFiles=()=>null;`,
            'skill-markdown-editor': `import React from 'react';export const SkillMarkdownEditor=({ariaLabel,value,onChange,readOnly})=><textarea aria-label={ariaLabel} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/>;`,
          };
          build.onResolve(
            {
              filter:
                /(?:^|\/)(?:use-skill-chat|harness-chat|skill-navigation|use-skills|home-context|confirm-dialog|setup-help-button|skill-location-control|skill-files|skill-markdown-editor)$/,
            },
            (args) => ({ path: args.path.split('/').pop()!, namespace: 'skill-domain-adapters' }),
          );
          build.onLoad({ filter: /.*/, namespace: 'skill-domain-adapters' }, (args) => ({
            loader: 'tsx',
            contents: modules[args.path],
            resolveDir: process.cwd(),
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
  for (const width of [390, 900]) {
    it(`keeps real skill tabs associated and visited chat drafts mounted (${theme}, ${width})`, async () => {
      const page = await fixture.browser.newPage({ viewport: { width, height: 844 } });
      try {
        await page.goto(`${fixture.url}/?theme=${theme}`);
        const build = page.getByRole('tablist', { name: 'Build or try' });
        await page.getByRole('textbox', { name: 'build draft' }).fill('Keep this draft');
        await build.getByRole('tab', { name: 'Build', exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        await expect
          .poll(() => build.getByRole('tab', { name: 'Try it', exact: true }).getAttribute('aria-selected'))
          .toBe('true');
        expect(await page.getByRole('textbox', { name: 'build draft' }).isVisible()).toBe(false);
        await page.getByRole('textbox', { name: 'try draft' }).fill('Separate try');
        await page.keyboard.press('Tab');
        await build.getByRole('tab', { name: 'Try it', exact: true }).focus();
        await page.keyboard.press('Home');
        expect(await page.getByRole('textbox', { name: 'build draft' }).inputValue()).toBe('Keep this draft');
        if (width === 390) {
          const panes = page.getByRole('tablist', { name: 'Chat or skill' });
          const skill = panes.getByRole('tab', { name: 'Skill', exact: true });
          expect((await skill.boundingBox())!.height).toBe(36);
          await skill.click();
          expect(await page.getByRole('textbox', { name: 'build draft' }).isVisible()).toBe(false);
        }
        const editor = page.getByRole('tablist', { name: 'Edit as' });
        const fields = editor.getByRole('tab', { name: 'Fields', exact: true });
        await fields.focus();
        await page.keyboard.press('End');
        const file = editor.getByRole('tab', { name: 'SKILL.md', exact: true });
        await expect.poll(() => file.getAttribute('aria-selected')).toBe('true');
        const panel = page
          .getByRole('tabpanel')
          .filter({ has: page.getByRole('textbox', { name: 'SKILL.md', exact: true }) })
          .last();
        expect(await file.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
        expect(await page.getByRole('textbox', { name: 'SKILL.md', exact: true }).inputValue()).toBe(
          'Original file',
        );
        expect(await file.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
        expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
      } finally {
        await page.close();
      }
    });
  }

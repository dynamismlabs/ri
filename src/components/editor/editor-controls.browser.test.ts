/** The editor's action components keep their existing gutter placement. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {EditorContent,useEditor} from '@tiptap/react';
    import StarterKit from '@tiptap/starter-kit';
    import {CollapsibleHeading} from './src/components/editor/collapsible-heading';
    import {Toggle,ToggleSummary,ToggleContent} from './src/components/editor/toggle-block';
    const params=new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.has('dark'));
    const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
    const doc={type:'doc',content:[{type:'collapsibleHeading',attrs:{level:2},content:[{type:'text',text:'Overview'}]},paragraph('Heading body'),{type:'toggle',attrs:{open:true},content:[{type:'toggleSummary',content:[{type:'text',text:'More detail'}]},{type:'toggleContent',content:[paragraph('Toggle body')]}]}]};
    function Fixture(){const editor=useEditor({extensions:[StarterKit.configure({heading:false}),CollapsibleHeading,Toggle,ToggleSummary,ToggleContent],content:doc,editorProps:{attributes:{class:'rich-editor-body'}}});return <main className="p-6 bg-pane text-t1"><EditorContent editor={editor}/></main>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const width of [340, 900]) {
  it(`keeps heading and toggle buttons in their gutters with shared focus (${width}px, ${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width, height: 800 } });
    try {
      page.setDefaultTimeout(5000);
      await page.goto(fixture.url + (theme === 'dark' ? '/?dark' : '/'));
      const heading = page.locator('.collapsible-heading-wrapper').first();
      await heading.hover();
      const headingButton = page.getByRole('button', { name: 'Collapse section', exact: true });
      const toggleButton = page.getByRole('button', { name: 'Collapse toggle', exact: true });
      await toggleButton.waitFor();
      for (const [button, text] of [[headingButton, heading.locator('h2')], [toggleButton, page.locator('.toggle-summary')]] as const) {
        const rect = await button.boundingBox();
        expect(rect?.width).toBe(24);expect(rect?.height).toBe(24);
        expect(await button.evaluate(el => getComputedStyle(el).position)).toBe('absolute');
        expect(rect!.x + rect!.width).toBeLessThanOrEqual((await text.boundingBox())!.x);
        await page.keyboard.press('Tab');await button.focus();
        expect(await button.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      }
      await toggleButton.click();
      expect(await page.locator('.toggle-block').getAttribute('data-open')).toBe('false');
      await heading.hover();await headingButton.click();
      expect(await heading.getAttribute('class')).toContain('is-collapsed');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    } finally { await page.close(); }
  });
}

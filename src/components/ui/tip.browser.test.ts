import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {Tip,TipProvider} from './src/components/ui/tip';
    import {Dialog,DialogTrigger,DialogContent,DialogTitle} from './src/components/ui/dialog';
    import {Sheet,SheetTrigger,SheetContent,SheetTitle} from './src/components/ui/sheet';
    import {Popover,PopoverTrigger,PopoverContent} from './src/components/ui/popover';
    const params=new URLSearchParams(location.search),kind=params.get('kind');
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const [Root,Trigger,Content,Title]=kind==='sheet'?[Sheet,SheetTrigger,SheetContent,SheetTitle]:kind==='popover'?[Popover,PopoverTrigger,PopoverContent,'h2']:[Dialog,DialogTrigger,DialogContent,DialogTitle];
    createRoot(document.getElementById('root')).render(<TipProvider><Root>
      <Trigger asChild><button>Open actions</button></Trigger>
      <Content aria-label="Actions" aria-describedby={undefined} {...(kind==='popover'?{}:{showCloseButton:false})}>
        <Title>Actions</Title>
        <Tip label="First action"><button aria-label="First action">1</button></Tip>
        <Tip label="Second action"><button aria-label="Second action">2</button></Tip>
      </Content>
    </Root></TipProvider>);
  `, [], { css: true });
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) for (const kind of ['dialog', 'sheet', 'popover']) {
  it(`keeps autofocus quiet, closes with one Escape and shows a Tip on Tab inside (${kind}, ${theme})`, async () => {
    const page = await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&kind=${kind}`);
      const trigger = page.getByRole('button', { name: 'Open actions', exact: true });
      const first = page.getByRole('button', { name: 'First action', exact: true });
      const second = page.getByRole('button', { name: 'Second action', exact: true });
      const open = async () => {
        await trigger.focus();await page.keyboard.press('Enter');
        await expect.poll(() => first.evaluate(el => el === document.activeElement)).toBe(true);
        // Let the focus handler and any portaled tooltip commit before checking its absence.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      await open();
      expect(await page.getByRole('tooltip').count()).toBe(0);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
      await expect.poll(() => trigger.evaluate(el => el === document.activeElement)).toBe(true);
      await open();await page.keyboard.press('Tab');
      expect(await second.evaluate(el => el === document.activeElement)).toBe(true);
      await expect.poll(() => page.getByRole('tooltip').textContent()).toContain('Second action');
    } finally { await page.close(); }
  });
}

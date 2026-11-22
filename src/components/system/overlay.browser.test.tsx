import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';
let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
 import React from'react';import{createRoot}from'react-dom/client';
 import{Dialog,DialogTrigger,DialogContent,DialogTitle}from'@/components/system/dialog';
 import{Sheet,SheetTrigger,SheetContent,SheetTitle}from'@/components/system/sheet';
 import{Popover,PopoverTrigger,PopoverContent}from'@/components/system/popover';
 import{DropdownMenu,DropdownMenuTrigger,DropdownMenuContent}from'@/components/system/menu';
 import{MenuAction}from'@/components/system/menu-action';import{Button}from'@/components/system/button';import{Field}from'@/components/system/field';import{TipProvider}from'@/components/ui/tip';
 const params=new URLSearchParams(location.search),kind=params.get('kind');document.documentElement.classList.toggle('dark',params.get('theme')==='dark');window.picks=[];
 function Menu(){return <DropdownMenu><DropdownMenuTrigger asChild><Button>Open menu</Button></DropdownMenuTrigger><DropdownMenuContent><MenuAction kind="menu" onSelect={()=>window.picks.push('one')}>First action</MenuAction><MenuAction kind="menu" disabled>Unavailable</MenuAction></DropdownMenuContent></DropdownMenu>}
 function Pop(){return <Popover><PopoverTrigger asChild><Button>Open popover</Button></PopoverTrigger><PopoverContent><Field aria-label="Popup field" defaultValue="Retained"/></PopoverContent></Popover>}
 function Side(){return <Sheet><SheetTrigger asChild><Button>Open sheet</Button></SheetTrigger><SheetContent aria-describedby={undefined}><SheetTitle>Side panel</SheetTitle><Field aria-label="Sheet field"/></SheetContent></Sheet>}
 createRoot(document.getElementById('root')).render(<TipProvider><main style={{padding:32}}>
 {kind==='dialog'?<Dialog><DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>Main dialog</DialogTitle><Field aria-label="Dialog field"/><Pop/><Menu/><Side/></DialogContent></Dialog>:kind==='sheet'?<Side/>:kind==='menu'?<Menu/>:<Pop/>}
 <Button>Outside action</Button></main></TipProvider>);
 `,
    [],
    { css: true },
  );
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});

for (const theme of ['light', 'dark'])
  for (const width of [390, 1440]) {
    for (const kind of ['dialog', 'sheet', 'popover', 'menu'])
      it(`closes one ${kind} layer and returns focus at ${width}px (${theme})`, async () => {
        const page = await fixture.browser.newPage({
          viewport: { width, height: 844 },
        });
        try {
          await page.goto(`${fixture.url}/?kind=${kind}&theme=${theme}`);
          const trigger = page.getByRole('button', {
            name: 'Open ' + kind,
            exact: true,
          });
          await trigger.click();
          const layer =
            kind === 'menu'
              ? page.getByRole('menu')
              : kind === 'dialog'
                ? page.getByRole('dialog', { name: 'Main dialog' })
                : kind === 'sheet'
                  ? page.getByRole('dialog', { name: 'Side panel' })
                  : page.getByRole('textbox', { name: 'Popup field' });
          await layer.waitFor();
          if (kind === 'dialog' || kind === 'sheet') {
            expect(
              await page
                .getByRole('button', { name: 'Outside action' })
                .count(),
            ).toBe(0);
            expect(
              await page.locator('body').getAttribute('data-scroll-locked'),
            ).not.toBe(null);
          }
          await page.keyboard.press('Escape');
          await layer.waitFor({ state: 'detached' });
          await expect
            .poll(() => trigger.evaluate((el) => document.activeElement === el))
            .toBe(true);
          expect(
            await page.locator('body').getAttribute('data-scroll-locked'),
          ).toBe(null);
        } finally {
          await page.close();
        }
      });
    it(`keeps nested menus, popovers and sheets above their dialog at ${width}px (${theme})`, async () => {
      const page = await fixture.browser.newPage({
        viewport: { width, height: 844 },
      });
      try {
        await page.goto(`${fixture.url}/?kind=dialog&theme=${theme}`);
        await page
          .getByRole('button', { name: 'Open dialog', exact: true })
          .click();
        const dialog = page.getByRole('dialog', {
          name: 'Main dialog',
          exact: true,
        });
        await dialog.waitFor();
        for (const kind of ['popover', 'menu', 'sheet']) {
          const trigger = dialog.getByRole('button', {
            name: 'Open ' + kind,
            exact: true,
          });
          await trigger.click();
          const child =
            kind === 'menu'
              ? page.getByRole('menu')
              : kind === 'sheet'
                ? page.getByRole('dialog', { name: 'Side panel' })
                : page.getByRole('textbox', { name: 'Popup field' });
          await child.waitFor();
          await page.keyboard.press('Escape');
          await child.waitFor({ state: 'detached' });
          expect(await dialog.isVisible()).toBe(true);
          await expect
            .poll(() => trigger.evaluate((el) => document.activeElement === el))
            .toBe(true);
          expect(
            await page.locator('body').getAttribute('data-scroll-locked'),
          ).not.toBe(null);
        }
        await page
          .getByRole('textbox', { name: 'Dialog field' })
          .fill('Keep this draft');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(
          await page.locator('body').getAttribute('data-scroll-locked'),
        ).toBe(null);
      } finally {
        await page.close();
      }
    });
  }

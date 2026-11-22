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

let rawFixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
 rawFixture = await browserFixture(`
 import React from'react';import{createRoot}from'react-dom/client';
 import{Dialog,DialogPortal,DialogFrame,DialogTitle}from'@/components/system/dialog';
 import{SheetFrame}from'@/components/system/sheet';
 const sheet=new URLSearchParams(location.search).has('sheet');
 createRoot(document.getElementById('root')).render(<Dialog open><DialogPortal>
 {sheet?<SheetFrame padding="none" aria-describedby={undefined} style={{width:'min(672px,100vw)'}} className="fixed right-0 top-0 bottom-0 flex"><DialogTitle className="sr-only">Area</DialogTitle><div data-resizer style={{width:6,flexShrink:0}}/><div data-body style={{flex:1}}><button>Area action</button></div></SheetFrame>
 :<DialogFrame placement="custom" padding="none" aria-describedby={undefined} className="fixed inset-x-2 top-2 bottom-2 flex flex-col md:inset-x-4 md:top-12 md:bottom-4"><DialogTitle>Board</DialogTitle><div data-body style={{flex:1}}>Content</div></DialogFrame>}
 </DialogPortal></Dialog>);`, [], {css:true});
},120_000);
afterAll(async()=>{await rawFixture?.close()});
for(const width of [390,900,1440]) {
 it(`keeps custom Board and Calendar frame dimensions at ${width}`,async()=>{
  const page=await rawFixture.browser.newPage({viewport:{width,height:900}});
  try{await page.goto(rawFixture.url);const layer=page.getByRole('dialog');await layer.waitFor();
   const box=await layer.boundingBox();expect(box).toMatchObject({x:width>=768?16:8,y:width>=768?48:8,width:width-(width>=768?32:16),height:900-(width>=768?64:16)});
   expect(await layer.evaluate(el=>getComputedStyle(el).gap)).toMatch(/^(0px|normal)$/);
  }finally{await page.close()}
 });
 it(`keeps raw area sheet width and horizontal resizer at ${width}`,async()=>{
  const page=await rawFixture.browser.newPage({viewport:{width,height:900}});
  try{await page.goto(rawFixture.url+'/?sheet');const layer=page.getByRole('dialog');await layer.waitFor();
   const box=await layer.boundingBox();expect(box?.width).toBe(Math.min(672,width));
   const resizer=await page.locator('[data-resizer]').boundingBox(),body=await page.locator('[data-body]').boundingBox();
   expect(resizer?.width).toBe(6);expect(body!.x).toBe(resizer!.x+6);expect(body!.height).toBe(900);
  }finally{await page.close()}
 });
}

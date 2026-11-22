/** Actual migrated surfaces, with synthetic data and delivery only. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { browserFixture } from "@/test/fixtures/browser-fixture";

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{TipProvider}from'@/components/ui/tip';
    import{TreeSearchBar}from'@/components/executions/file-tree/tree-search-bar';
    import{DeckAddBar}from'@/components/deck/deck-add-bar';
    import{ReferenceFolderDialog}from'@/components/workspaces/reference-folder-dialog';
    import{SettingsNavigation}from'@/components/settings/settings-nav';import{Search}from'lucide-react';
    import{FeedbackPanel}from'@/components/feedback/feedback-panel';import PairPage from'@/app/pair/page';
    const params=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    window.events=[];window.drafts=[];window.submitted=[];
    function App(){const[query,setQuery]=useState(''),[open,setOpen]=useState(true);const surface=params.get('surface');
      if(surface==='tree-column')return <main style={{width:166,padding:8,background:'var(--pane)'}}><TreeSearchBar query={query} onChange={setQuery} matchCount={2} totalCount={20} shortcut="⌘P"/></main>;
      if(surface==='nav')return <SettingsNavigation active="general" label="Test settings" onSelect={id=>window.events.push(id)} sections={['general','plugins','models'].map(id=>({id,label:id[0].toUpperCase()+id.slice(1),title:id,icon:Search}))}/>;
      if(surface==='pair')return <PairPage/>;
      if(surface==='feedback')return <form onSubmit={e=>{e.preventDefault();window.submitted=[...new FormData(e.currentTarget)];}}><FeedbackPanel onClose={()=>{}}/><button type="submit">Inspect form</button></form>;
      if(surface==='reference')return <ReferenceFolderDialog open={open} onOpenChange={setOpen} workspaceId="current" workspaceName="Current agent" device={{id:'device',name:'My computer'}} existing={[]} saving={false} error={null} onSubmit={draft=>window.drafts.push(draft)}/>;
      return <main style={{padding:16,background:'var(--pane)',display:'grid',gap:16,width:params.has('narrow')?340:undefined}}>
        <section data-tree><TreeSearchBar query={query} onChange={setQuery} matchCount={2} totalCount={20} shortcut="⌘P"/></section>
        <section data-deck><DeckAddBar candidates={[{id:'task',title:'Ship report',status:'todo'}]} excludeIds={new Set()} onTaskCreated={t=>window.events.push(['created',t.title])} onAddExisting={t=>window.events.push(['existing',t.title])}/></section>
      </main>;
    }createRoot(document.getElementById('root')).render(<TipProvider><App/></TipProvider>);
  `,
    [
      {
        name: "field-surface-data",
        setup(build) {
          const modules: Record<string, string> = {
            "@/hooks/use-tasks": `export const useCreateTask=()=>({isPending:false,mutate:(input,callbacks)=>callbacks.onSuccess({id:'new',title:input.title})});`,
            "@/hooks/use-workspaces": `export const useWorkspaces=()=>({data:[{id:'current',name:'Current agent'},{id:'other',name:'Other agent'}]});`,
            "./folder-picker-dialog": `export const FolderPickerDialog=()=>null;`,
            "@/components/auth/qr-scanner-modal": `export const QrScannerModal=({open,onDecoded})=>open?<button onClick={()=>onDecoded('not a code')}>Read invalid code</button>:null;`,
            "next/navigation": `export const useRouter=()=>({replace:()=>{}});`,
            "@/contexts/dashboard-context": `export const useOptionalDashboard=()=>null;export const useDashboard=()=>({});`,
            "@/components/home/home-context": `export const useOptionalHomeContext=()=>null;export const useHomeDocumentScope=()=>undefined;`,
            "@tanstack/react-query": `export const useMutation=()=>({mutateAsync:async()=>({}),isPending:false});`,
            "@/lib/trpc/client": `export const trpc={feedback:{preparePublicIssue:{mutationOptions:()=>({})}}};export const createAppTRPCClient=()=>({userState:{list:{query:async()=>{const e=new Error('Synthetic failure');e.status=new URLSearchParams(location.search).has('connection')?503:401;throw e;}}}});`,
          };
          for (const name of Object.keys(modules)) {
            build.onResolve(
              {
                filter: new RegExp(
                  "^" + name.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&") + "$",
                ),
              },
              () => ({ path: name, namespace: "field-surface-data" }),
            );
            build.onLoad(
              { filter: /.*/, namespace: "field-surface-data" },
              (args) => ({
                contents: modules[args.path],
                loader: "tsx",
                resolveDir: process.cwd(),
              }),
            );
          }
        },
      },
    ],
    { css: true },
  );
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});

for (const theme of ["light", "dark"]) {
  for (const width of [390, 900]) it(`keeps query and Clear usable in a 150px tree column at ${width}px (${theme})`, async () => {
    const page = await fixture.browser.newPage({viewport:{width,height:844}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=tree-column`);
      const input = page.getByRole('textbox', {name:'Search files',exact:true});
      await input.fill('readme');
      expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(60);
      expect(await input.locator('..').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      const clear = page.getByRole('button', {name:'Clear search',exact:true});
      expect((await clear.boundingBox())!.height).toBe(width===390?40:28);
      expect(await page.getByText('2/20',{exact:true}).isVisible()).toBe(false);
      const summary = await input.getAttribute('aria-describedby');
      expect(await page.locator('[id="'+summary+'"]').textContent()).toBe('2 matches of 20 files');
      await clear.click();expect(await input.inputValue()).toBe('');
      expect(await page.getByText('⌘P',{exact:true}).isVisible()).toBe(false);
      await input.evaluate(el=>(el as HTMLInputElement).blur());
      await page.locator('[data-align="inline-start"] svg').click();
      expect(await input.evaluate(el=>el===document.activeElement)).toBe(true);
    } finally {await page.close();}
  });

  it(`keeps Settings search desktop-only without changing the phone nav height (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=nav`);
      const search = page.locator('input[aria-label="Search test settings"]');
      await search.waitFor({ state: "attached" });
      expect(await search.isVisible()).toBe(false);
      expect(
        (await page
          .getByRole("navigation", { name: "Test settings" })
          .boundingBox())!.height,
      ).toBeLessThan(56);
      await page.setViewportSize({ width: 900, height: 1000 });
      await search.waitFor({ state: "visible" });
      await expect
        .poll(async () => (await search.locator("..").boundingBox())!.height)
        .toBe(32);
      await search.fill("Plugins");
      expect(
        await page
          .getByRole("navigation")
          .getByRole("button")
          .allTextContents(),
      ).toEqual(["Plugins"]);
    } finally {
      await page.close();
    }
  });

  for (const width of [340, 360, 390, 900]) {
    it(`keeps compound search rows usable at ${width}px (${theme})`, async () => {
      const page = await fixture.browser.newPage({
        viewport: { width, height: 844 },
      });
      try {
        await page.goto(
          `${fixture.url}/?theme=${theme}${width === 900 ? "&narrow" : ""}`,
        );
        const tree = page.getByRole("textbox", {
          name: "Search files",
          exact: true,
        });
        const deck = page.getByRole("textbox", {
          name: "Add a task, or find an existing one",
          exact: true,
        });
        const target = width === 900 ? 32 : 40;
        for (const input of [tree, deck]) {
          await input.waitFor();
          const shell = input.locator("xpath=..");
          expect((await shell.boundingBox())!.height).toBe(target);
          expect(
            await shell.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          expect((await input.boundingBox())!.width).toBeGreaterThan(120);
        }
        await tree.fill("readme");
        expect(await page.getByText("2/20", { exact: true }).isVisible()).toBe(
          true,
        );
        const clear = page.getByRole("button", {
          name: "Clear search",
          exact: true,
        });
        expect((await clear.boundingBox())!.height).toBe(width === 900 ? 28 : 40);
        await clear.click();
        expect(await tree.inputValue()).toBe("");
        expect(await tree.evaluate((el) => el === document.activeElement)).toBe(
          true,
        );
        await tree.fill("readme");
        await page.keyboard.press("Escape");
        expect(await tree.inputValue()).toBe("");
        await page.keyboard.press("Escape");
        expect(await tree.evaluate((el) => el === document.activeElement)).toBe(
          false,
        );
        await deck.fill("Ship");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { events: unknown[] }).events,
            ),
          )
          .toEqual([["existing", "Ship report"]]);
        await deck.fill("New task");
        await page.keyboard.press("Enter");
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { events: unknown[] }).events,
            ),
          )
          .toEqual([
            ["existing", "Ship report"],
            ["created", "New task"],
          ]);
        expect(await deck.inputValue()).toBe("");
      } finally {
        await page.close();
      }
    });
  }
  it(`keeps linked-folder validation, payload and phone scrolling (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 360, height: 844 },
    });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=reference`);
      const dialog = page.getByRole("dialog");
      const alias = page.getByRole("textbox", { name: "Alias", exact: true });
      await alias.fill("bad alias");
      await alias.focus();
      expect(await alias.getAttribute("aria-invalid")).toBe("true");
      expect(await alias.getAttribute("aria-describedby")).toContain("-error");
      expect(
        await alias
          .locator("xpath=..")
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe("2px");
      await page
        .getByPlaceholder("/Users/you/code/api", { exact: true })
        .fill("/sample/api");
      await alias.fill("api");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      expect(
        await page.evaluate(
          () => (window as unknown as { drafts: unknown[] }).drafts,
        ),
      ).toEqual([
        {
          alias: "api",
          path: "/sample/api",
          targetWorkspaceId: null,
          description: null,
          workspaceId: "current",
          readOnly: false,
          addReverse: false,
        },
      ]);
      await page
        .getByRole("button", { name: "Another agent", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Agent", exact: true })
        .selectOption("other");
      const bounds = await dialog.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(16);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(828);
      expect(
        await dialog.evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth &&
            getComputedStyle(el.querySelector('[data-slot="dialog-body"]')!).overflowY === "auto",
        ),
      ).toBe(true);
      const save = page.getByRole("button", { name: "Add", exact: true });
      await save.scrollIntoViewIfNeeded();
      expect(await save.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });
  it(`keeps pairing errors on their actual source (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 390, height: 1000 },
    });
    try {
      for (const connection of [false, true]) {
        await page.goto(
          `${fixture.url}/?theme=${theme}&surface=pair${connection ? "&connection" : ""}`,
        );
        const token = page.getByRole("textbox", {
          name: "Pairing token",
          exact: true,
        });
        await token.fill("ri_live_example");
        await page
          .getByRole("button", { name: "Connect", exact: true })
          .click();
        await page.getByRole("alert").waitFor();
        expect(await token.getAttribute("aria-invalid")).toBe(
          connection ? null : "true",
        );
        if (connection)
          expect(await page.getByRole("alert").innerText()).toContain(
            "Couldn't reach the server",
          );
      }
      await page
        .getByRole("button", { name: "Scan QR code", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Read invalid code", exact: true })
        .click();
      await expect
        .poll(() => page.getByRole("alert").innerText())
        .toContain("doesn't look like");
      expect(
        await page
          .getByRole("textbox", { name: "Pairing token", exact: true })
          .getAttribute("aria-invalid"),
      ).toBe(null);
    } finally {
      await page.close();
    }
  });
  it(`submits Feedback's default and each radio value with keyboard focus (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 900, height: 1000 },
    });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=feedback`);
      const group = page.getByRole("radiogroup", {
        name: "Feedback category",
        exact: true,
      });
      await group.waitFor();
      const submit = async (value: string) => {
        await page
          .getByRole("button", { name: "Inspect form", exact: true })
          .click();
        const entries = await page.evaluate(
          () =>
            (window as unknown as { submitted: [string, string][] }).submitted,
        );
        expect(entries).toHaveLength(1);
        expect(entries[0][0]).toMatch(/-kind$/);
        expect(entries[0][1]).toBe(value);
      };
      await submit("feedback");
      for (const [label, value] of [
        ["Bug", "bug"],
        ["Question", "question"],
        ["Feedback", "feedback"],
      ]) {
        await group.getByRole("radio", { name: label, exact: true }).click();
        await submit(value);
      }
      const first = group.getByRole("radio", { name: "Feedback", exact: true });
      await first.focus();
      await page.keyboard.down("ArrowRight");
      const bug = group.getByRole("radio", { name: "Bug", exact: true });
      await expect.poll(() => bug.isChecked()).toBe(true);
      await page.keyboard.up("ArrowRight");
      expect(
        await bug.evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe("2px");
      await submit("bug");
    } finally {
      await page.close();
    }
  });
}

for (const theme of ['light', 'dark']) {
  it(`gives standalone Deck and Settings search fields md desktop height (${theme})`, async () => {
    const page = await fixture.browser.newPage({viewport:{width:900,height:844}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&narrow`);
      const deck = page.getByRole('textbox',{name:'Add a task, or find an existing one',exact:true});
      await deck.waitFor();
      expect((await deck.locator('..').boundingBox())!.height).toBe(32);
      await page.goto(`${fixture.url}/?theme=${theme}&surface=nav`);
      const search = page.getByRole('textbox',{name:'Search test settings',exact:true});
      await search.waitFor();
      expect((await search.locator('..').boundingBox())!.height).toBe(32);
    } finally { await page.close(); }
  });

  for (const width of [360,390]) it(`pins linked-folder actions above the phone fold with body-first focus at ${width}px (${theme})`, async () => {
    const page = await fixture.browser.newPage({viewport:{width,height:844}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=reference`);
      const dialog=page.getByRole('dialog'); await dialog.waitFor();
      const primary=page.getByRole('button',{name:'Add',exact:true});
      // Invalid copy must not push the footer out of the visible dialog either.
      await page.getByRole('textbox',{name:'Alias',exact:true}).fill('bad alias');
      const visible=await primary.evaluate(el=>{
        const box=el.getBoundingClientRect(),frame=el.closest('[role="dialog"]')!.getBoundingClientRect();
        const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
        return box.top>=frame.top&&box.bottom<=Math.min(frame.bottom,innerHeight)&&!!hit&&(el===hit||el.contains(hit));
      });
      expect(visible).toBe(true);
      await page.getByRole('textbox',{name:'Alias',exact:true}).fill('backend');
      await page.getByRole('textbox',{name:/Where it is/}).fill('/Users/example/backend');
      const lastBody=page.getByRole('switch').last(); await lastBody.focus();
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await primary.evaluate(el=>el===document.activeElement)).toBe(true);
      await primary.click();
      expect(await page.evaluate(()=>(window as unknown as {drafts:unknown[]}).drafts.length)).toBe(1);
    } finally { await page.close(); }
  });

  it(`uses the same title style for linked-folder field and switch labels (${theme})`, async () => {
    const page=await fixture.browser.newPage({viewport:{width:360,height:844}});
    try {
      await page.goto(`${fixture.url}/?theme=${theme}&surface=reference`);
      await page.getByRole('dialog').waitFor();
      const style=(el:Element)=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.color];};
      const field=await page.locator('.ri-field-label').first().evaluate(style);
      for(const toggle of await page.getByRole('switch').all()) {
        expect(await toggle.locator('..').locator('[data-slot="form-label"]').evaluate(style)).toEqual(field);
      }
    } finally { await page.close(); }
  });
}

for (const theme of ['light', 'dark']) for (const width of [360, 390]) {
  it(`keeps the linked-folder invalid focus outline inside the scrolling body at ${width} ${theme}`, async () => {
    const page = await fixture.browser.newPage({viewport: {width, height: 844}});
    try {
      await page.goto(fixture.url + '/?surface=reference&theme=' + theme);
      const alias = page.getByRole('textbox', {name: 'Alias', exact: true});
      await alias.fill('bad alias');
      const geometry = await alias.evaluate(el => {
        const owner = el.closest('[data-slot="field-shell"]') ?? el;
        const r = owner.getBoundingClientRect(), body = el.closest('[data-slot="dialog-body"]')!.getBoundingClientRect();
        const style = getComputedStyle(owner), outside = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
        return {focused: el === document.activeElement, invalid: el.getAttribute('aria-invalid'), outline: style.outlineWidth, contained: r.left - outside >= body.left && r.right + outside <= body.right};
      });
      expect(geometry).toEqual({focused: true, invalid: 'true', outline: '2px', contained: true});
    } finally {await page.close();}
  });
}

import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Locator } from 'playwright-core';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';
    import{Field}from'@/components/system/field';import{TextArea}from'@/components/system/text-area';import{NativeSelect}from'@/components/system/native-select';
    import{SelectField}from'@/components/system/select-field';import{Select,SelectValue,SelectContent,SelectItem}from'@/components/ui/select';
    import{Button}from'@/components/system/button';import{Command,CommandInput,CommandList,CommandItem}from'@/components/ui/command';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    function App(){const[name,setName]=useState('Maya'),[frequency,setFrequency]=useState('daily'),[search,setSearch]=useState(''),[clears,setClears]=useState(0),[live,setLive]=useState(''),[liveError,setLiveError]=useState(),[parserValue,setParserValue]=useState(''),[parserError,setParserError]=useState(),[rich,setRich]=useState('daily');const ref=useRef(null);
      return <main data-slot="settings-body" style={{padding:16,display:'grid',gap:16,background:'var(--pane)',color:'var(--t1)'}}>
        <form id="form" onSubmit={e=>e.preventDefault()}>
          <p id="existing-help">Existing help</p>
          <Field id="person-name" label="Name" name="name" description="Shown to your team" descriptionId="name-help" aria-describedby="existing-help" value={name} onChange={e=>setName(e.target.value)} ref={ref}/>
          <TextArea label="Instructions" name="instructions" defaultValue="Do the work" rows={3}/>
          <NativeSelect label="Frequency" name="frequency" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option></NativeSelect>
          <Field label="Disabled input" disabled name="disabled" defaultValue="Unavailable"/>
        </form>
        <Field label="Invalid input" description="A short account name" error="Enter an account name" defaultValue=""/>
        <TextArea label="Invalid area" error="Enter instructions" rows={2}/>
        <NativeSelect label="Invalid select" error="Choose a period"><option value="">Pick one</option><option value="weekly">Weekly</option></NativeSelect>
        <TextArea label="Disabled area" disabled value="Unavailable" readOnly/>
        <NativeSelect label="Disabled select" disabled><option>Unavailable</option></NativeSelect>
        <Field label="Read only" readOnly value="A saved value"/>
        <div id="toolbar" className="flex items-center gap-2"><Field size="sm" aria-label="Toolbar search" className="w-48"/><Button size="sm">Filter</Button></div>
        <Field label="Grouped" defaultValue="A value" className="w-64" trailing={<Button size="xs" onClick={()=>setClears(n=>n+1)}>Clear</Button>}/>
        <Field aria-label="Parser" inlineMessage error="Not a date" value="bad date" onChange={()=>{}} size="sm"/>
        <Field label="Narrow control" className="w-64" controlClassName="w-24"/>
        <Field label="Phone field" size="touch"/>
        <Field aria-label="Code" purpose="code" defaultValue="pnpm dev"/>
        <TextArea aria-label="Task title" purpose="title" titleSize="entity" autoSize rows={1} defaultValue="A title"/>
        <button id="focus-ref" onClick={()=>ref.current.focus()}>Focus name</button>
        <Field aria-label="Live validation" value={live} error={liveError} onChange={e=>{setLive(e.target.value);setLiveError(e.target.value.length<2?'Use two letters':undefined)}}/>
        <Field aria-label="Live parser" inlineMessage value={parserValue} error={parserError} onChange={e=>{setParserValue(e.target.value);setParserError(e.target.value.length<2?'Type a date':undefined)}}/>
        <Select value={rich} onValueChange={setRich}><SelectField label="Rich select" description="Keep the installed picker"><SelectValue/></SelectField><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select>
        <Select defaultValue="daily"><SelectField label="Invalid rich select" error="Choose a period"><SelectValue/></SelectField><SelectContent><SelectItem value="daily">Daily</SelectItem></SelectContent></Select>
        <Select defaultValue="daily" disabled><SelectField label="Disabled rich select"><SelectValue/></SelectField><SelectContent><SelectItem value="daily">Daily</SelectItem></SelectContent></Select>
        <output id="clears">{clears}</output>
        <Command label="Search models"><Field asChild purpose="embedded" description="Pick a model" error="Choose a model"><CommandInput aria-label="Search models" value={search} onValueChange={setSearch}/></Field><CommandList><CommandItem>Alpha</CommandItem><CommandItem>Beta</CommandItem></CommandList></Command>
        <output id="search">{search}</output>
      </main>;
    }createRoot(document.getElementById('root')).render(<App/>);
  `,
    [],
    { css: true },
  );
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});

async function contrast(target: Locator) {
  return target.evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const layers: string[] = [];
    for (let p: Element | null = el; p; p = p.parentElement)
      layers.unshift(getComputedStyle(p).backgroundColor);
    const rgb = (colors: string[]) => {
      ctx.clearRect(0, 0, 1, 1);
      for (const c of colors) {
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
      }
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = (values: number[]) =>
      values
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const fill = rgb(layers),
      ink = rgb(['rgb(' + fill.join(' ') + ')', getComputedStyle(el).color]);
    const [a, b] = [lum(fill), lum(ink)].sort((a, b) => b - a);
    return (a + 0.05) / (b + 0.05);
  });
}
for (const theme of ['light', 'dark']) {
  for (const [name, invalid, disabled] of [
    ['Name', 'Invalid input', 'Disabled input'],
    ['Instructions', 'Invalid area', 'Disabled area'],
    ['Frequency', 'Invalid select', 'Disabled select'],
  ]) {
    it(`owns shape, focus, invalid, disabled and hover contrast for ${name} (${theme})`, async () => {
      const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
      try {
        await page.goto(`${fixture.url}/?theme=${theme}`);
        const control = page.getByLabel(name, { exact: true });
        await control.waitFor();
        expect(await control.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
        if (name !== 'Instructions') expect((await control.boundingBox())!.height).toBe(32);
        expect(await control.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');
        await control.hover();
        expect(await contrast(control)).toBeGreaterThanOrEqual(4.5);
        await page.keyboard.press('Tab');
        await control.focus();
        expect(await control.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
        expect(await control.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('0px');
        expect(await control.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
        const error = page.getByLabel(invalid, { exact: true });
        await error.focus();
        expect(await error.getAttribute('aria-invalid')).toBe('true');
        expect(await error.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
        expect(
          await error.evaluate(
            (el) =>
              getComputedStyle(el).outlineColor ===
              getComputedStyle(el.closest('[data-slot="system-field"]')!.querySelector('[role="alert"]')!)
                .color,
          ),
        ).toBe(true);
        expect(
          await error.evaluate((el) =>
            (el.getAttribute('aria-describedby') || '')
              .split(' ')
              .every((id) => !!document.getElementById(id)),
          ),
        ).toBe(true);
        const off = page.getByLabel(disabled, { exact: true });
        expect(await off.isDisabled()).toBe(true);
        expect(await off.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5');
        await off.focus();
        expect(await off.evaluate((el) => el === document.activeElement)).toBe(false);
      } finally {
        await page.close();
      }
    });
  }
  it(`keeps the same focused control while validation appears and clears (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      for (const name of ['Live validation', 'Live parser']) {
        const input = page.getByRole('textbox', { name, exact: true });
        const node = await input.elementHandle();
        await input.focus();
        await page.keyboard.type('a');
        expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
        expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await input.getAttribute('aria-invalid')).toBe('true');
        await page.keyboard.type('b');
        expect(await input.inputValue()).toBe('ab');
        expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
        expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await input.getAttribute('aria-invalid')).toBeNull();
      }
    } finally {
      await page.close();
    }
  });
  it(`owns the installed Select field states and retains keyboard selection (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const input = page.getByRole('combobox', { name: 'Rich select', exact: true });
      expect((await input.boundingBox())!.height).toBe(32);
      expect(await input.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('10px');
      await input.hover();
      expect(await contrast(input)).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab');
      await input.focus();
      expect(await input.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await input.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
      await input.press('ArrowDown');
      await page.getByRole('option', { name: 'Daily', exact: true }).waitFor();
      await page.getByRole('option', { name: 'Daily', exact: true }).focus();
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(() =>
          page
            .getByRole('option', { name: 'Weekly', exact: true })
            .evaluate((el) => el === document.activeElement),
        )
        .toBe(true);
      await page.keyboard.press('Enter');
      await expect.poll(() => input.innerText()).toBe('Weekly');
      await expect.poll(() => input.evaluate((el) => el === document.activeElement)).toBe(true);
      const error = page.getByRole('combobox', { name: 'Invalid rich select', exact: true });
      await error.focus();
      expect(await error.getAttribute('aria-invalid')).toBe('true');
      expect(
        await error.evaluate(
          (el) =>
            getComputedStyle(el).outlineColor ===
            getComputedStyle(el.closest('[data-slot="system-field"]')!.querySelector('[role="alert"]')!)
              .color,
        ),
      ).toBe(true);
      expect(
        await page.getByRole('combobox', { name: 'Disabled rich select', exact: true }).isDisabled(),
      ).toBe(true);
    } finally {
      await page.close();
    }
  });
  it(`owns label and help ids, native events, refs and form data (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const name = page.getByLabel('Name', { exact: true });
      expect(await name.getAttribute('id')).toBe('person-name');
      expect(await name.getAttribute('aria-describedby')).toBe('existing-help name-help');
      await page.locator('label[for="person-name"]').click();
      expect(await name.evaluate((el) => el === document.activeElement)).toBe(true);
      await name.fill('Luis');
      await page.getByLabel('Frequency', { exact: true }).selectOption('weekly');
      await page.getByLabel('Instructions', { exact: true }).fill('Review this');
      expect(
        await page.locator('#form').evaluate((el) => Object.fromEntries(new FormData(el as HTMLFormElement))),
      ).toEqual({ name: 'Luis', instructions: 'Review this', frequency: 'weekly' });
      await page.locator('#focus-ref').click();
      expect(await name.evaluate((el) => el === document.activeElement)).toBe(true);
      const saved = page.getByLabel('Read only', { exact: true });
      await saved.focus();
      await page.keyboard.type('x');
      expect(await saved.inputValue()).toBe('A saved value');
    } finally {
      await page.close();
    }
  });
  it(`owns one group focus outline and linked inline parser feedback (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const input = page.getByLabel('Grouped', { exact: true }),
        group = input.locator('..');
      expect((await group.boundingBox())!.width).toBe(256);
      await input.focus();
      expect(await input.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('0px');
      expect(await group.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await input.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      expect(await page.locator('#clears').innerText()).toBe('1');
      const parser = page.getByRole('textbox', { name: 'Parser', exact: true });
      await parser.focus();
      expect(await parser.getAttribute('aria-invalid')).toBe('true');
      expect(await parser.getAttribute('aria-describedby')).toBe(
        await page.getByRole('alert').filter({ hasText: 'Not a date' }).getAttribute('id'),
      );
      expect(await parser.locator('..').evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
    } finally {
      await page.close();
    }
  });
  it(`keeps toolbar heights aligned and layout widths available to callers (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const field = page.getByRole('textbox', { name: 'Toolbar search' }),
        button = page.getByRole('button', { name: 'Filter', exact: true });
      expect((await field.boundingBox())!.height).toBe(28);
      expect((await button.boundingBox())!.height).toBe(28);
      expect((await field.boundingBox())!.width).toBe(192);
      expect((await page.getByLabel('Narrow control',{exact:true}).boundingBox())!.width).toBe(96);
    } finally {
      await page.close();
    }
  });
  it(`adapts cmdk while retaining its owned associations and value events (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const input = page.getByRole('combobox', { name: 'Search models', exact: true });
      const engineId = await input.getAttribute('id');
      expect(
        await input.evaluate(
          (el) => document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent,
        ),
      ).toBe('Search models');
      expect(
        await input.evaluate((el) =>
          document.getElementById(el.getAttribute('aria-controls')!)?.getAttribute('role'),
        ),
      ).toBe('listbox');
      expect(await input.getAttribute('aria-invalid')).toBe('true');
      expect(
        await input.evaluate((el) =>
          (el.getAttribute('aria-describedby') || '').split(' ').every((id) => !!document.getElementById(id)),
        ),
      ).toBe(true);
      await input.fill('Alpha');
      expect(await page.locator('#search').innerText()).toBe('Alpha');
      expect(await input.getAttribute('id')).toBe(engineId);
      expect(await page.getByRole('option', { name: 'Beta', exact: true }).count()).toBe(0);
    } finally {
      await page.close();
    }
  });
  it(`owns code, title and embedded purposes (${theme})`, async () => {
    const page = await fixture.browser.newPage({ viewport: { width: 1000, height: 1100 } });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      expect(
        await page
          .getByRole('textbox', { name: 'Code', exact: true })
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toMatch(/mono/i);
      const title = page.getByRole('textbox', { name: 'Task title', exact: true });
      expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe('24px');
      const height = (await title.boundingBox())!.height;
      await title.fill('First line\nSecond line');
      await expect.poll(async () => (await title.boundingBox())!.height).toBeGreaterThan(height);
      const embedded = page.getByRole('combobox', { name: 'Search models', exact: true });
      expect(await embedded.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      await embedded.hover();
      await expect.poll(() => embedded.evaluate((el) => getComputedStyle(el).borderColor)).toBe('rgba(0, 0, 0, 0)');
      await embedded.focus();
      expect(await embedded.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
    } finally {
      await page.close();
    }
  });
  it(`uses 40px fields and 16px entry text on a phone (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      for (const label of ['Name', 'Frequency', 'Phone field', 'Rich select']) {
        const input = page.getByLabel(label, { exact: true });
        expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBe(40);
        expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    } finally {
      await page.close();
    }
  });
}

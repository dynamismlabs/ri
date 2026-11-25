/** Ri's own dialog lending an app the person's accounts (hub-connect.tsx), with Ri's server answers stood in. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(
    `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {useHubConnect} from '@/components/apps/hub-connect';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    function Harness(){const hub=useHubConnect();return <><button onClick={()=>void hub.connect('app-people')}>Choose accounts</button>{hub.dialog}</>;}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><TipProvider><Harness/></TipProvider></QueryClientProvider>);
  `,
    [
      {
        name: 'hub-connect-server',
        setup(build) {
          build.onResolve({ filter: /^@\/lib\/trpc\/client$/ }, (args) => ({ path: args.path, namespace: 'hub-connect-server' }));
          build.onLoad({ filter: /.*/, namespace: 'hub-connect-server' }, () => ({
            loader: 'js',
            contents: `
      const tool=(name,description,requested,asks=false)=>({name,description,requested,asks});
      const auth={appId:'app-people',appName:'People',purpose:'to remember the people you write to and meet',options:{
        accounts:[
          {connectionId:'c-home',toolkitId:'gmail',service:'Gmail',account:'me@example.com',tools:[tool('gmail__search_messages','Search your mail',true),tool('gmail__get_message','Read one message',true),tool('gmail__send_email','Send an email',false,true)]},
          {connectionId:'c-home',toolkitId:'google_calendar',service:'Google Calendar',account:'me@example.com',tools:[tool('google_calendar__list_events','List events',true)]},
          {connectionId:'c-work',toolkitId:'gmail',service:'Gmail',account:'me@work.example',tools:[tool('gmail__search_messages','Search your mail',false)]},
        ],
        services:[{name:'ai_text',tool:'ri__ai_text',description:'Use your model in Ri to read and write text',write:false,requested:true},{name:'list_tasks',tool:'ri__list_tasks',description:'See your tasks',write:false,requested:false}],
      }};
      window.calls=[];
      const path=()=>['personalApps'];
      export const trpc={personalApps:{pathKey:path},hubApps:{pathKey:()=>['hubApps']}};
      export const trpcClient={personalApps:{
        hubBegin:{mutate:async(input)=>{window.calls.push(['begin',input]);return {authorizationUrl:'http://127.0.0.1:3000/oauth/authorize?resource=http%3A%2F%2F127.0.0.1%3A3000%2Fapi%2Fintegrations%2Fmcp'};}},
        hubAuthorization:{query:async(input)=>{window.calls.push(['authorization',input]);return auth;}},
        hubApprove:{mutate:async(input)=>{window.calls.push(['approve',input]);return {appId:'app-people',appName:'People',connected:true};}},
      }};
    `,
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
    it(`asks which accounts, tools and services, with the app's asks ticked, and approves exactly those (${width}px, ${theme})`, async () => {
      const page = await fixture.browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500 });
      page.setDefaultTimeout(3000);
      try {
        await page.goto(`${fixture.url}/?theme=${theme}`);
        await page.getByRole('button', { name: 'Choose accounts' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('heading', { name: 'Let People use your accounts through Ri?' }).waitFor();
        expect(await dialog.getByText('“to remember the people you write to and meet”').count()).toBe(1);
        const box = (name: RegExp) => dialog.getByRole('checkbox', { name });
        // What People asked for is ticked; what it didn't, and Send, are not.
        expect(await box(/gmail__search_messages/).first().getAttribute('aria-checked')).toBe('true');
        expect(await box(/gmail__send_email/).getAttribute('aria-checked')).toBe('false');
        expect(await box(/See your tasks/).getAttribute('aria-checked')).toBe('false');
        // The work account wasn't asked for, so it starts closed with nothing ticked.
        expect(await dialog.locator('details').nth(2).evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
        await box(/gmail__get_message/).click();
        expect(await box(/gmail__get_message/).getAttribute('aria-checked')).toBe('false');
        await box(/See your tasks/).click();
        await page.screenshot({ path: `${process.env.RI_SCREENSHOT_DIR ?? '/tmp'}/hub-connect-${width}-${theme}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await dialog.getByRole('button', { name: 'Allow' }).click();
        await dialog.waitFor({ state: 'detached' });
        const calls = await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls);
        expect(calls).toEqual([
          ['begin', { appId: 'app-people' }],
          ['authorization', { authorizationUrl: expect.stringContaining('/oauth/authorize') }],
          ['approve', {
            authorizationUrl: expect.stringContaining('/oauth/authorize'),
            tools: { 'c-home': ['gmail__search_messages', 'google_calendar__list_events'] },
            services: ['ai_text', 'list_tasks'],
          }],
        ]);
      } finally {
        await page.close();
      }
    });
  }

it('allows nothing until something is chosen', async () => {
  const page = await fixture.browser.newPage({ viewport: { width: 900, height: 900 } });
  page.setDefaultTimeout(3000);
  try {
    await page.goto(fixture.url);
    await page.getByRole('button', { name: 'Choose accounts' }).click();
    const dialog = page.getByRole('dialog');
    for (const name of [/gmail__search_messages/, /gmail__get_message/, /google_calendar__list_events/, /Use your model/]) await dialog.getByRole('checkbox', { name }).first().click();
    expect(await dialog.getByRole('button', { name: 'Allow' }).isDisabled()).toBe(true);
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await dialog.waitFor({ state: 'detached' });
    expect((await page.evaluate(() => (window as unknown as { calls: [string][] }).calls)).map(([kind]) => kind)).toEqual(['begin', 'authorization']);
  } finally {
    await page.close();
  }
});

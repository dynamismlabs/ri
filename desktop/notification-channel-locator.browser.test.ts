import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '../src/test/fixtures/browser-fixture';
import { testTimeouts } from '../src/test/fixtures/browser-timeouts';
import { desktopChannelTestButton } from './renderer-locators';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {TipProvider} from '@/components/ui/tip';
    import {NotificationsSection} from '@/components/settings/sections/notifications-section';
    const params = new URLSearchParams(location.search);
    document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
    const enabled = !params.has('disabled');
    const status = {supported:true,enabled,channelId:'desktop:device:here'};
    window.nativeActions = [];
    window.otherChannelTests = [];
    window.riDesktop = {platform:'linux',notificationStatus:async()=>status,notifications:async action=>{window.nativeActions.push(action);return status;}};
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TipProvider><NotificationsSection/></TipProvider></QueryClientProvider>);
  `, [{ name: 'notification-channel-data', setup(build) {
    build.onResolve({ filter: /lib\/trpc\/client$/ }, () => ({ path: 'client', namespace: 'notification-fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'notification-fixture' }, () => ({ loader: 'ts', contents: `
      const params = new URLSearchParams(location.search);
      const events = params.has('events') ? ['chat.needs_input','chat.completed'] : [];
      const channel = {id:'desktop:device:here',kind:'in_app',config:{surface:'desktop'},enabled:!params.has('disabled'),label:'This computer',events};
      export const trpcClient = {
        notifications: {
          channelsGet:{query:async()=>({channels:[{...channel,id:'desktop:device:elsewhere',label:'Other computer'},channel,{id:'web',kind:'web_push',config:{},enabled:true,label:'Browsers',events:[]}]})},
          digestsGet:{query:async()=>({digests:[]})},deliveriesGet:{query:async()=>({deliveries:[]})},
          channelsTestPost:{mutate:async input=>{window.otherChannelTests.push(input);return{status:'sent'};}}
        },
        integrations:{connectionsGet:{query:async()=>({connections:[]})}},
        settings:{baseUrlGet:{query:async()=>({local:'http://fixture',lan:null,tunnel:null})}}
      };
    ` }));
    build.onResolve({ filter: /notifications\/web-push-client$/ }, () => ({ path: 'push', namespace: 'notification-fixture-push' }));
    build.onLoad({ filter: /.*/, namespace: 'notification-fixture-push' }, () => ({ loader: 'ts', contents: `
      export const removeDesktopWebPushSubscription=async()=>{};
      export const getBrowserPushStatus=async()=>({supported:false,configured:false,permission:'denied',subscribed:false});
      export const subscribeToWebPush=async()=>{};export const unsubscribeFromWebPush=async()=>{};
    ` }));
  } }]);
}, 60_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light', 'dark']) {
  for (const events of [false, true]) {
    it(`targets this desktop channel and invokes its real native test handler (${theme}, events=${events})`, async () => {
      const page = await fixture.browser.newPage();
      testTimeouts(page, 5000);
      try {
        await page.goto(`${fixture.url}?theme=${theme}${events ? '&events=1' : ''}`);
        await page.getByText(/^This desktop app(?: · \d+ events)?$/).waitFor();
        expect(await page.getByRole('button', { name: 'Test', exact: true }).count()).toBe(3);
        const test = desktopChannelTestButton(page);
        expect(await test.count()).toBe(1);
        expect(await test.isEnabled()).toBe(true);
        await test.click();
        await expect.poll(() => page.evaluate(() => Reflect.get(window, 'nativeActions'))).toEqual(['test']);
        expect(await page.evaluate(() => Reflect.get(window, 'otherChannelTests'))).toEqual([]);
        await page.getByText('Test queued. Check your computer’s notifications. Any delivery error will appear above.', { exact: true }).waitFor();
      } finally { await page.close(); }
    });
  }
  it(`preserves disabled state on this desktop channel (${theme})`, async () => {
    const page = await fixture.browser.newPage();
    testTimeouts(page, 5000);
    try {
      await page.goto(`${fixture.url}?theme=${theme}&disabled=1`);
      await page.getByText('This desktop app', { exact: true }).waitFor();
      const test = desktopChannelTestButton(page);
      expect(await test.count()).toBe(1);
      expect(await test.isDisabled()).toBe(true);
      expect(await page.evaluate(() => Reflect.get(window, 'nativeActions'))).toEqual([]);
    } finally { await page.close(); }
  });
}

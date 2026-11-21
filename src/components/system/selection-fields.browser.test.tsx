import { afterAll, beforeAll, expect, it } from 'vitest';
import { browserFixture } from '@/test/fixtures/browser-fixture';

let fixture: Awaited<ReturnType<typeof browserFixture>>;
beforeAll(async () => {
  fixture = await browserFixture(`
    import React from 'react';import{createRoot}from'react-dom/client';
    import{TipProvider}from'@/components/ui/tip';
    import{ClientSettings}from'@/components/settings/client-settings';
    import{SendToChatButton}from'@/components/chat-ui/coordination/send-to-chat';
    document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');
    window.claims=[];
    createRoot(document.getElementById('root')).render(<TipProvider><main style={{padding:16}}><ClientSettings/><SendToChatButton eventId="event" sessionId="chat"/></main></TipProvider>);
  `, [{name:'selection-field-data',setup(build){
    const modules: Record<string,string> = {
      '@/hooks/use-client-location':`export const useClientLocation=()=>({kind:'remote',hostname:'my-host.example'});export const isHostnameClaimed=()=>false;export const setHostnameClaim=(hostname,value)=>window.claims.push({hostname,value});`,
      '@/hooks/use-host-info':`export const useHostInfo=()=>({data:{hostname:'Test host'}});`,
      '@/hooks/use-workspaces':`export const useWorkspaces=()=>({data:[]});`,
      '@/hooks/use-default-selection':`export const useDefaultSelection=()=>({harness:'codex'});`,
      '@/hooks/use-harness-models':`export const useHarnessModels=()=>({models:[]});`,
      '@/components/workspaces/launcher/model-controls':`export const ModelControl=()=> <p>Model picker</p>;`,
      '@/components/chat-ui/chat-capabilities':`export const useChatCapabilities=()=>({coordination:true});`,
      '@/lib/trpc/client':`export const trpcClient={};`,
      '@tanstack/react-query':`export const useQuery=()=>({data:[],isLoading:false});export const useMutation=()=>({isPending:false});`,
    };
    for(const name of Object.keys(modules)) {
      build.onResolve({filter:new RegExp('^'+name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'$')},()=>({path:name,namespace:'selection-field-data'}));
      build.onLoad({filter:/.*/,namespace:'selection-field-data'},args=>({contents:modules[args.path],loader:'tsx',resolveDir:process.cwd()}));
    }
  }}], {css:true});
}, 120_000);
afterAll(async () => { await fixture?.close(); });

for (const theme of ['light','dark']) {
  it(`keeps the hostname checkbox label and stored values (${theme})`, async () => {
    const page = await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      const input = page.getByRole('checkbox');
      await page.getByText('Treat this hostname as my host machine',{exact:true}).click();
      expect(await input.isChecked()).toBe(true);
      expect(await page.evaluate(() => (window as unknown as {claims:unknown[]}).claims)).toEqual([{hostname:'my-host.example',value:true}]);
      await page.keyboard.press('Tab');
      await input.focus();
      expect(await input.evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await input.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
      await page.keyboard.press('Space');
      expect(await input.isChecked()).toBe(false);
      expect(await page.evaluate(() => (window as unknown as {claims:unknown[]}).claims)).toEqual([{hostname:'my-host.example',value:true},{hostname:'my-host.example',value:false}]);
    } finally { await page.close(); }
  });
  it(`selects the chat target with arrows and keeps the corresponding content (${theme})`, async () => {
    const page = await fixture.browser.newPage();
    try {
      await page.goto(`${fixture.url}/?theme=${theme}`);
      await page.getByRole('button',{name:'Send to chat',exact:true}).click();
      const group = page.getByRole('radiogroup',{name:'Chat target',exact:true});
      expect(await group.count()).toBe(1);
      const existing = group.getByRole('radio',{name:'Existing chat',exact:true});
      await existing.focus();
      // Radix moves roving focus on a queued task. Keep the key down until
      // the selection lands, then release it as a person would.
      await page.keyboard.down('ArrowRight');
      await expect.poll(() => group.getByRole('radio',{name:'New chat',exact:true}).isChecked()).toBe(true);
      await page.keyboard.up('ArrowRight');
      expect(await group.getByRole('radio',{name:'New chat',exact:true}).evaluate(el => getComputedStyle(el).outlineWidth)).toBe('2px');
      expect(await page.getByText('Model picker',{exact:true}).isVisible()).toBe(true);
      await page.keyboard.down('ArrowLeft');
      await expect.poll(() => existing.isChecked()).toBe(true);
      await page.keyboard.up('ArrowLeft');
      expect(await page.getByText('No matching chats.',{exact:true}).isVisible()).toBe(true);
    } finally { await page.close(); }
  });
}

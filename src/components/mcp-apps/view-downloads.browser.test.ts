/** Saving a file a view hands Ri, and the links it may open: product components, synthetic API, real sandboxed guest. */
import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import http from 'node:http';
import { prepareResource } from '@/lib/mcp-apps/resource';

const LINKS = ['https://example.com/docs', 'http://127.0.0.1:4310/books/b1', 'http://localhost:4310/', 'mailto:club@books.example?subject=Kindred',
  'http://example.com/', 'javascript:alert(1)', 'file:///etc/hosts', 'https://user:secret@example.com/'];

/**
 * The guest does what a kit app's view does: offers a CSV through `ui/download-file` (twice, so the
 * person can save one and decline the other), tries a link to a file, then opens each link through
 * `ui/open-link`. It reports each answer through a `probe` tool call.
 */
const guest = `<html><body><p>Reading Log</p><script>
let id=0;const pending=new Map();const rpc=(method,params)=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});parent.postMessage({jsonrpc:'2.0',id:request,method,params},'*')});
const report=(event,data)=>rpc('tools/call',{name:'probe',arguments:{event,...data}});
const attempt=(method,params)=>rpc(method,params).then(result=>({result}),error=>({error:error.message}));
addEventListener('message',event=>{if(event.source!==parent)return;const m=event.data;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
const csv={type:'resource',resource:{uri:'file:///'+encodeURIComponent('Reading list.csv'),mimeType:'text/csv',text:'title\\nKindred\\n'}};
rpc('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'Reading Log',version:'1.0.0'},appCapabilities:{}}).then(async r=>{
  parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');
  await report('init',{downloadFile:r.hostCapabilities.downloadFile??null,openLinks:!!r.hostCapabilities.openLinks});
  await report('saved',await attempt('ui/download-file',{contents:[csv]}));
  await report('declined',await attempt('ui/download-file',{contents:[csv]}));
  await report('linked',await attempt('ui/download-file',{contents:[{type:'resource_link',uri:'https://example.com/a.csv',name:'a.csv'}]}));
  const links={};for(const url of ${JSON.stringify(LINKS)})links[url]='error' in await attempt('ui/open-link',{url})?'refused':'opened';
  await report('links',{links});
});
</script></body></html>`;

it('saves a file the view hands Ri only when the person says Save, and opens only the links Ri allows', async () => {
  const chatId = 'chat-1';
  const resource = prepareResource({contents: [{uri: 'ui://reading-log/books', mimeType: 'text/html;profile=mcp-app', text: guest}]}, 'ui://reading-log/books', false);
  const bundle = await build({stdin: {resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
    import{ConnectedCompanion}from'@/components/mcp-apps/companion';import{ConnectedView}from'@/components/mcp-apps/view';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
      <ConnectedCompanion chatId="${chatId}">{() => <ConnectedView captureId="capture-1" chatId="${chatId}"/>}</ConnectedCompanion></QueryClientProvider>);
  `}, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"', 'process.env': '{}'},
  plugins: [{name: 'isolate-view', setup(builder) {
    builder.onResolve({filter: /contexts\/dashboard-context$/}, () => ({path: 'dashboard', namespace: 'fixture'}));
    builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({loader: 'tsx', contents: 'export const useOptionalDashboard = () => null;'}));
  }}]});
  const probes: Record<string, unknown>[] = [];
  const view = {id: 'view-1', captureId: 'capture-1', chatId, serverId: 'reading-log', sourceRef: 'reading-log', title: 'Reading Log · Books', resource,
    input: {}, result: {content: []}, revision: 0, legacy: false, kind: 'result', deepLink: null, file: null, modelContext: null,
    tool: 'show_books', app: 'Reading Log', icons: []};
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    if (url.pathname.startsWith('/api/trpc/')) {
      let body = ''; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || url.searchParams.get('input') || '{}'), method = url.pathname.slice('/api/trpc/'.length);
      let data: unknown;
      if (method === 'connectedApps.open') data = view;
      else if (method === 'connectedApps.status') data = {revision: 0, expiresAt: Date.now() + 60_000};
      else if (method === 'transport.capabilities') data = {websocket: false};
      else if (method === 'connectedApps.invoke') { probes.push(input.args); data = {kind: 'result', result: {content: []}}; }
      if (data === undefined) { res.statusCode = 500; res.end(`Unexpected operation ${method}`); return; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({result: {data}})); return;
    }
    if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader('content-type', 'text/html'); res.end('<html><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath: chromium.executablePath(), headless: true, chromiumSandbox: true, args: ['--disable-features=IsolateSandboxedIframes']});
  try {
    const page = await browser.newPage({acceptDownloads: true}), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Ri opens an allowed link in a new window. Record them instead of opening them.
    await page.addInitScript(() => { const opened: string[] = []; (window as unknown as {opened: string[]}).opened = opened; window.open = (url?: string | URL) => { opened.push(String(url)); return null; }; });
    await page.goto(`http://127.0.0.1:${(server.address() as {port: number}).port}`);
    const events = () => probes.map(probe => probe.event);
    await expect.poll(events, {timeout: 15_000}).toContain('init');
    // A connected app's view is told it may save files and open links.
    expect(probes[0]).toEqual({event: 'init', downloadFile: {}, openLinks: true});

    // Ri names the app, the file and its size, and saves it only on Save.
    const prompt = page.getByRole('alertdialog', {name: 'Save a file from this app'});
    await expect.poll(() => prompt.textContent(), {timeout: 10_000}).toBe('Reading Log wants to save Reading list.csv (14 bytes).SaveDon’t save');
    const download = page.waitForEvent('download');
    await prompt.getByRole('button', {name: 'Save', exact: true}).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('Reading list.csv');
    expect(await fs.readFile((await saved.path())!, 'utf8')).toBe('title\nKindred\n');
    await expect.poll(events).toContain('saved');
    expect(probes.find(probe => probe.event === 'saved')).toEqual({event: 'saved', result: {}});

    // Declining answers the view as the spec says, and saves nothing.
    let other = false; page.on('download', () => { other = true; });
    await prompt.getByRole('button', {name: 'Don’t save', exact: true}).click();
    await expect.poll(events).toContain('declined');
    expect(probes.find(probe => probe.event === 'declined')).toEqual({event: 'declined', result: {isError: true}});
    expect(other).toBe(false);
    expect(await prompt.count()).toBe(0);

    // A link to a file is refused without asking: Ri saves only what the app sent.
    await expect.poll(events).toContain('links');
    expect(probes.find(probe => probe.event === 'linked')).toEqual({event: 'linked', error: expect.stringContaining('not a link')});
    // https anywhere, http only to this computer, and mailto. Never credentials or another scheme.
    expect(probes.find(probe => probe.event === 'links')).toEqual({event: 'links', links: {
      'https://example.com/docs': 'opened', 'http://127.0.0.1:4310/books/b1': 'opened', 'http://localhost:4310/': 'opened', 'mailto:club@books.example?subject=Kindred': 'opened',
      'http://example.com/': 'refused', 'javascript:alert(1)': 'refused', 'file:///etc/hosts': 'refused', 'https://user:secret@example.com/': 'refused',
    }});
    expect(await page.evaluate(() => (window as unknown as {opened: string[]}).opened)).toEqual(['https://example.com/docs', 'http://127.0.0.1:4310/books/b1', 'http://localhost:4310/', 'mailto:club@books.example?subject=Kindred']);
    expect(errors).toEqual([]);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60_000);

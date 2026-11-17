/**
 * Add app, the way the person does it (docs/personal-apps.md "Connecting an app"): Ri adds the
 * app by its address, the app's consent screen sends the person back to Ri's callback, and the
 * app's screen opens and calls its tools. New app and the catalog's Add end in the same
 * `addPersonalApp`. Real HTTP to a real MCP server that is its own OAuth server, a real home.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { startOAuthMcpApp, type OAuthMcpApp } from '@/test/fixtures/oauth-mcp-app';

let home: TestHome;
let app: OAuthMcpApp | undefined;

// A cold home loads the database layer, and the runtime then connects over real HTTP.
beforeEach(async () => { home = await createTestHome({ prefix: 'ri-add-app-' }); }, 60_000);
afterEach(async () => {
  (await import('./runtime')).invalidateIntegrationRuntime();
  await app?.close();
  app = undefined;
  await home.cleanup();
}, 60_000);

const VIEW = 'ui://bookmarks/app.html';

/** A small Bookmarks app, as the kit makes one: a screen to open, and tools its screen calls. */
function bookmarks(): Promise<OAuthMcpApp> {
  return startOAuthMcpApp((server, calls) => {
    const saved = [{ id: 'b1', title: 'MCP Apps', url: 'https://modelcontextprotocol.io' }];
    server.registerTool('open_bookmarks', {
      title: 'Bookmarks', description: 'Open Bookmarks.', inputSchema: fromJsonSchema({ type: 'object', properties: {} }),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VIEW }, 'openai/ui': { entrypoints: [{ type: 'global' }] } },
    }, async (args) => {
      calls.push({ name: 'open_bookmarks', args });
      return { content: [{ type: 'text', text: 'Bookmarks' }], structuredContent: { count: saved.length } };
    });
    server.registerTool('list_bookmarks', {
      description: 'List saved bookmarks.', inputSchema: fromJsonSchema({ type: 'object', properties: { query: { type: 'string' } } }),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VIEW, visibility: ['app'] } },
    }, async (args) => {
      calls.push({ name: 'list_bookmarks', args });
      return { content: [{ type: 'text', text: JSON.stringify(saved) }], structuredContent: { bookmarks: saved } };
    });
    server.registerResource('Bookmarks', VIEW, { mimeType: 'text/html;profile=mcp-app' }, async () => ({
      contents: [{ uri: VIEW, mimeType: 'text/html;profile=mcp-app', text: '<!doctype html><title>Bookmarks</title>' }],
    }));
  }, { name: 'bookmarks' });
}

/** Add app by its address: the app's consent screen is next. */
async function addApp(name: string, url: string) {
  const { addPersonalApp } = await import('./apps');
  const added = await addPersonalApp({ name, url, returnTo: '/apps' });
  if (!added.requiresAuth) throw new Error('expected the app to ask for consent');
  return added;
}

/** The person allows Ri on the app's consent screen, and the browser lands on Ri's callback. */
async function consent(authUrl: string) {
  const answer = await fetch(authUrl, { redirect: 'manual' });
  expect(answer.status).toBe(302);
  const callback = new URL(answer.headers.get('location')!);
  const { GET } = await import('@/app/api/integrations/mcp-oauth/[sid]/route');
  const landed = await GET(new NextRequest(callback), { params: Promise.resolve({ sid: callback.pathname.split('/').pop()! }) });
  return new URL(landed.headers.get('location')!, 'http://ri.test');
}

describe('Add app', () => {
  it('connects an app by its address, then opens its screen and calls its tools from there', async () => {
    app = await bookmarks();
    const added = await addApp('Bookmarks', app.url);
    expect(added.authUrl).toContain(`${app.origin}/authorize`);

    const landed = await consent(added.authUrl);
    expect(landed.searchParams.get('error')).toBeNull();
    expect(landed.searchParams.get('connected')).toBe('Bookmarks');

    // Ri names the app's toolkit once, and every caller agrees with the engine.
    const { getIntegrationRuntime, getMcpServerStore } = await import('./runtime');
    const { mcpToolActionId, mcpToolkitId } = await import('./mcp-servers');
    const entry = getMcpServerStore().list().find(candidate => candidate.app?.name === 'Bookmarks')!;
    const toolkit = (await getIntegrationRuntime()).getToolkits().find(candidate => candidate.id === mcpToolkitId(entry));
    expect(toolkit?.id).toBe('app_bookmarks');
    expect(toolkit?.actions.map(action => action.id).sort()).toEqual([mcpToolActionId(entry, 'list_bookmarks'), mcpToolActionId(entry, 'open_bookmarks')].sort());

    // Open app: the screen opens through its entrypoint, then calls a tool only its screen may use.
    const service = await import('@/lib/mcp-apps/service');
    const launch = await service.prepareConnectedLaunch(entry.id, 'viewer-1', 'open_bookmarks', { kind: 'global' });
    if (launch.kind !== 'launch') throw new Error('expected a new screen');
    await expect(service.launchConnectedView(launch.viewId, 'viewer-1')).resolves.toMatchObject({ kind: 'opened' });
    const listed = await service.callConnectedView(launch.viewId, 'viewer-1', 'list_bookmarks', { query: 'mcp' }, randomUUID());
    expect(listed).toMatchObject({ kind: 'result', result: { structuredContent: { bookmarks: [{ id: 'b1', title: 'MCP Apps' }] } } });
    expect(app.calls).toEqual([{ name: 'open_bookmarks', args: {} }, { name: 'list_bookmarks', args: { query: 'mcp' } }]);
  }, 120_000);

  it('connects an app whose tool takes an input named account, and the tool gets it', async () => {
    // People's configure_source, before it was renamed: a connected server may use the word.
    app = await startOAuthMcpApp((server, calls) => {
      server.registerTool('configure_source', {
        description: 'Choose which mail account People reads.', annotations: { readOnlyHint: true },
        inputSchema: fromJsonSchema({ type: 'object', properties: { account: { type: 'string', description: 'The mail account to read' } }, required: ['account'] }),
      }, async (args) => {
        calls.push({ name: 'configure_source', args });
        return { content: [{ type: 'text', text: 'Reading it' }] };
      });
    }, { name: 'people' });
    const landed = await consent((await addApp('People', app.url)).authUrl);
    expect(landed.searchParams.get('error')).toBeNull();
    expect(landed.searchParams.get('connected')).toBe('People');

    const { getIntegrationRuntime, getMcpServerStore } = await import('./runtime');
    const { hostedMcpConnectionId } = await import('./hosted-mcp');
    const { mcpToolActionId } = await import('./mcp-servers');
    const entry = getMcpServerStore().list().find(candidate => candidate.app?.name === 'People')!;
    const outcome = await (await getIntegrationRuntime()).runAction(mcpToolActionId(entry, 'configure_source'), { account: 'trey@example.com' }, { connectionId: hostedMcpConnectionId(entry) });
    expect(outcome).toMatchObject({ ok: true });
    expect(app.calls).toEqual([{ name: 'configure_source', args: { account: 'trey@example.com' } }]);
  }, 120_000);

  it('says the tools didn\'t load, not that sign-in failed, when the app signs Ri in but its tools fail', async () => {
    app = await startOAuthMcpApp(() => {}, {
      name: 'broken',
      intercept: message => message.method === 'tools/list'
        ? Response.json({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'The tool list is broken' } })
        : undefined,
    });
    const landed = await consent((await addApp('Broken', app.url)).authUrl);
    expect(landed.searchParams.get('error')).toBe('tools_unavailable');
  }, 120_000);
});

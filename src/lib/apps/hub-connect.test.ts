/**
 * Connecting an app Ri installed to Ri's own hub, without a browser (docs/personal-apps.md
 * "Connecting an app Ri installed to the hub"). Real HTTP to an app that offers the kit's hub routes
 * with its host key, and a real home: the app registers its client and starts with PKCE, Ri checks
 * and approves the authorization with the person's choice, and the app exchanges the code at Ri's
 * token endpoint with its own verifier. Only the kit's `status` (the host key's path) and the
 * person's connected accounts stand in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { startOAuthMcpApp, type HubHostOptions, type OAuthMcpApp } from '@/test/fixtures/oauth-mcp-app';
import type { AppStatus } from './status';
import { isHubAuthorization } from './hub-link';

const status = vi.hoisted(() => ({ current: null as Partial<AppStatus> | null }));
vi.mock('./status', async (importOriginal) => ({
  ...await importOriginal<typeof import('./status')>(),
  appStatus: async () => ({ state: 'running', checkedAt: new Date().toISOString(), ...status.current }),
}));
vi.mock('@/lib/executor/adapter', () => ({ recycleWorkspaceSessions: async () => {} }));
// The person's connected accounts, as the hub's consent screen offers them (hub/consent.ts).
vi.mock('@/lib/integrations/hub/consent', async () => {
  const { z } = await import('zod');
  const { hubConsentOptions } = await import('@/lib/integrations/hub/grant');
  const q = await import('@/lib/db/queries');
  const action = (id: string, mutating = false) => ({ id, description: id, input: z.object({}), mutating });
  const toolkits = [
    { id: 'gmail', providerId: 'google', displayName: 'Gmail', actions: [action('gmail.search_messages'), action('gmail.get_message'), action('gmail.send_email', true)] },
    { id: 'google_calendar', providerId: 'google', displayName: 'Google Calendar', actions: [action('google_calendar.list_events')] },
  ];
  const connections = [{ id: 'c-home', providerId: 'google', accountId: 'home', email: 'me@example.com', status: 'active' }];
  return {
    hubConsentFor: async (request: { client: { id: string }; scope: string | null }) => {
      const current = q.getHubAppByClientId(request.client.id);
      return hubConsentOptions(toolkits as never, connections as never, request.scope, current && !current.revokedAt ? current.grant : null);
    },
  };
});

const KEY = 'k'.repeat(43);
let home: TestHome;
const apps: OAuthMcpApp[] = [];

beforeEach(async () => { home = await createTestHome({ prefix: 'ri-hub-connect-' }); status.current = null; }, 60_000);
afterEach(async () => {
  (await import('@/lib/integrations/runtime')).invalidateIntegrationRuntime();
  for (const app of apps.splice(0)) await app.close();
  await home.cleanup();
}, 60_000);

/** The app's client at Ri's hub, made and used as the kit's hub client makes and uses it over HTTP. */
async function hubClient(): Promise<Pick<HubHostOptions, 'register' | 'exchange'>> {
  const { registerClient } = await import('@/lib/oauth/clients');
  const { exchangeToken } = await import('@/lib/oauth/flow');
  return {
    register: (redirectUri) => registerClient({
      client_name: 'People', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
      software_id: 'people', purpose: 'to remember the people you write to',
    }).client_id,
    exchange: (form, issuer) => exchangeToken(form, null, issuer),
  };
}

/** An app with the kit's hub routes, added to Ri, and installed by Ri unless `installed` is false. */
async function installed(name: string, hub: Partial<HubHostOptions> | null, options: { installed?: boolean; signInRequired?: boolean } = {}) {
  const app = await startOAuthMcpApp((server) => {
    server.registerTool('list_people', { description: 'List people.', inputSchema: fromJsonSchema({ type: 'object', properties: {} }), annotations: { readOnlyHint: true } },
      async () => ({ content: [{ type: 'text', text: '[]' }] }));
  }, {
    name: name.toLowerCase(), host: { key: KEY, signInRequired: options.signInRequired },
    ...(hub ? { hub: { purpose: 'to remember the people you write to', uses: ['read your mail'], scope: 'mail.read', ...await hubClient(), ...hub } } : {}),
  });
  apps.push(app);
  const dataDir = path.join(home.root, 'app-data', name);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'host-key'), `${KEY}\n`, { mode: 0o600 });
  status.current = { dataDir, hostKeyPath: path.join(dataDir, 'host-key') };
  const { addPersonalApp } = await import('@/lib/integrations/apps');
  const added = await addPersonalApp({ name, url: app.url });
  if (options.installed !== false) {
    const folder = path.join(home.root, 'apps', name);
    fs.mkdirSync(folder, { recursive: true });
    (await import('@/lib/db/queries')).createAppSource({ name, folder, createdByRi: true, url: app.url, personalAppId: added.app.id });
  }
  return { app, appId: added.app.id, serverId: added.app.ri!.serverId };
}

describe('Connecting an app Ri installed to Ri\'s hub', () => {
  it('tells the app where the hub is, then connects it with the accounts the person chose, with no browser', async () => {
    const { app, appId } = await installed('People', {});
    const { appHub, beginAppHub, hubAuthorization, approveAppHub, riHubUrl } = await import('./hub-connect');

    // The app learns where Ri's hub is, so its own Settings and view can connect there too.
    expect(await appHub(appId)).toEqual({ kind: 'host', state: 'not_connected', here: true, uses: ['read your mail'], purpose: 'to remember the people you write to', error: null, testData: false });
    expect(app.hub.url).toBe(riHubUrl());

    const begun = await beginAppHub(appId);
    if (!('authorizationUrl' in begun)) throw new Error('expected an authorization to approve');
    expect(isHubAuthorization(begun.authorizationUrl, 'ri.example.com')).toBe(true);
    // Ri's dialog offers what the consent page would, with what the app asked for ticked.
    const offered = await hubAuthorization(begun.authorizationUrl);
    expect(offered).toMatchObject({ appId, appName: 'People', purpose: 'to remember the people you write to' });
    const gmail = offered.options.accounts.find((account) => account.toolkitId === 'gmail')!;
    expect(gmail.tools.filter((tool) => tool.requested).map((tool) => tool.name).sort()).toEqual(['gmail__get_message', 'gmail__search_messages']);

    // The person ticks one tool, and something offered nowhere, which is dropped.
    await expect(approveAppHub(begun.authorizationUrl, { tools: { 'c-home': ['gmail__search_messages', 'gmail__delete_everything'], 'c-other': ['gmail__send_email'] }, services: ['list_tasks', 'not_a_service'] }))
      .resolves.toEqual({ appId, appName: 'People', connected: true });
    const q = await import('@/lib/db/queries');
    const record = q.listHubApps().find((item) => item.name === 'People')!;
    expect(record.grant).toEqual({ accounts: [{ connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages'] }], services: ['list_tasks'] });
    // The app holds its own tokens for the hub, exchanged with its verifier at Ri's token endpoint.
    expect(app.hub.tokens).toMatchObject({ token_type: 'Bearer', access_token: expect.stringMatching(/^ri_hub_at_/), refresh_token: expect.stringMatching(/^ri_hub_rt_/) });
    expect(await appHub(appId)).toMatchObject({ kind: 'host', state: 'connected', here: true });
    // Only the key went: nothing a browser or a proxy would add, which the kit refuses.
    expect(app.hostRequests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /api/host/hub', 'POST /api/host/hub', 'POST /api/host/hub/connect', 'POST /api/host/hub/finish', 'GET /api/host/hub',
    ]);
    for (const request of app.hostRequests) {
      expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
      for (const header of ['origin', 'forwarded', 'x-forwarded-for', 'cookie']) expect(request.headers[header]).toBeUndefined();
    }
    // The code was the app's once: approving the same authorization again doesn't connect anything new.
    await expect(approveAppHub(begun.authorizationUrl, { tools: { 'c-home': ['gmail__search_messages'] }, services: [] })).rejects.toThrow(/didn’t finish connecting/);
  });

  it('answers an approval from the app\'s own view only for that app', async () => {
    const people = await installed('People', {});
    const other = await installed('Bookmarks', {});
    const { beginAppHub, hubAuthorization, approveAppHub } = await import('./hub-connect');
    const begun = await beginAppHub(people.appId);
    if (!('authorizationUrl' in begun)) throw new Error('expected an authorization to approve');
    await expect(hubAuthorization(begun.authorizationUrl, other.serverId)).rejects.toThrow('That approval is for another app.');
    await expect(approveAppHub(begun.authorizationUrl, { tools: { 'c-home': ['gmail__search_messages'] }, services: [] }, other.serverId)).rejects.toThrow('That approval is for another app.');
    expect(people.app.hub.tokens).toBeNull();
    await expect(approveAppHub(begun.authorizationUrl, { tools: { 'c-home': ['gmail__search_messages'] }, services: [] }, people.serverId)).resolves.toMatchObject({ connected: true });
  });

  it('approves only an authorization for this Ri\'s hub that returns to an app it installed', async () => {
    const { appId } = await installed('People', {});
    const { beginAppHub, hubAuthorization, approveAppHub } = await import('./hub-connect');
    const begun = await beginAppHub(appId);
    if (!('authorizationUrl' in begun)) throw new Error('expected an authorization to approve');
    const changed = (edit: (url: URL) => void) => { const url = new URL(begun.authorizationUrl); edit(url); return url.href; };
    const choice = { tools: { 'c-home': ['gmail__search_messages'] }, services: [] };
    // Another site, another page, or an address that isn't one.
    for (const bad of ['not a url', changed((url) => { url.host = 'ri.example.com'; url.protocol = 'https:'; }), changed((url) => { url.pathname = '/api/oauth/authorize'; })])
      await expect(approveAppHub(bad, choice)).rejects.toThrow(/approval for this Ri|address Ri can read/);
    // Ri's own MCP endpoint instead of the hub: an assistant, not an app borrowing accounts.
    const { getLoopbackBaseUrl } = await import('@/lib/auth/bootstrap');
    await expect(approveAppHub(changed((url) => url.searchParams.set('resource', `${getLoopbackBaseUrl()}/api/mcp`)), choice)).rejects.toThrow();
    // No PKCE.
    await expect(hubAuthorization(changed((url) => url.searchParams.delete('code_challenge')))).rejects.toThrow(/PKCE/);
    // A client that returns somewhere Ri didn't install anything.
    const { registerClient } = await import('@/lib/oauth/clients');
    const stranger = registerClient({ client_name: 'Stranger', redirect_uris: ['http://127.0.0.1:19/api/hub/callback'], token_endpoint_auth_method: 'none' }).client_id;
    await expect(hubAuthorization(changed((url) => { url.searchParams.set('client_id', stranger); url.searchParams.set('redirect_uri', 'http://127.0.0.1:19/api/hub/callback'); })))
      .rejects.toThrow('Stranger isn’t an app Ri installed on this computer, so it connects in a browser.');
    expect(isHubAuthorization(changed((url) => url.searchParams.set('resource', 'http://127.0.0.1:3000/api/mcp')), '')).toBe(false);
    expect(isHubAuthorization('https://ri.example.com/oauth/authorize?resource=https%3A%2F%2Fri.example.com%2Fapi%2Fintegrations%2Fmcp', 'ri.example.com')).toBe(true);
    expect(isHubAuthorization('https://evil.example/oauth/authorize?resource=https%3A%2F%2Fevil.example%2Fapi%2Fintegrations%2Fmcp', 'ri.example.com')).toBe(false);
  });

  it('says why when Ri can\'t connect an app itself, and leaves a hub the app uses alone', async () => {
    const { appHub, beginAppHub } = await import('./hub-connect');
    // Made before the kit's hub routes: update it first.
    const older = await installed('Older', null);
    expect(await appHub(older.appId)).toEqual({ kind: 'browser', reason: 'no_endpoint' });
    await expect(beginAppHub(older.appId)).rejects.toThrow('Update Older first: its version can’t be connected from Ri.');
    // No hub at all, test data, an owner who signs in, and one Ri didn't install.
    expect(await appHub((await installed('Plain', { none: true })).appId)).toEqual({ kind: 'none' });
    expect(await appHub((await installed('Fixtures', { testData: true })).appId)).toMatchObject({ kind: 'host', testData: true });
    expect(await appHub((await installed('Accounts', {}, { signInRequired: true })).appId)).toEqual({ kind: 'browser', reason: 'sign_in_required' });
    const added = await installed('Added', {}, { installed: false });
    expect(await appHub(added.appId)).toEqual({ kind: 'browser', reason: 'not_installed_by_ri' });
    await expect(beginAppHub(added.appId)).rejects.toThrow('Added wasn’t installed by Ri on this computer, so connect it from its own Settings.');
    expect(added.app.hostRequests).toEqual([]);
    // An app on another hub keeps it: Ri says so instead of pointing it here.
    const elsewhere = await installed('Elsewhere', { url: 'http://127.0.0.1:19/api/integrations/mcp' });
    expect(await appHub(elsewhere.appId)).toMatchObject({ kind: 'host', here: false });
    expect(elsewhere.app.hub.url).toBe('http://127.0.0.1:19/api/integrations/mcp');
  });

  it('tells an app where the hub is once when one of its views opens', async () => {
    const { app, serverId } = await installed('People', {});
    const { offerRiHub, riHubUrl } = await import('./hub-connect');
    await offerRiHub(serverId);
    await offerRiHub(serverId);
    expect(app.hub.url).toBe(riHubUrl());
    expect(app.hostRequests.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /api/host/hub', 'POST /api/host/hub']);
    await offerRiHub('no-such-server');
  });
});

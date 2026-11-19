/**
 * Allowing Ri in an app it installed, without a browser (docs/personal-apps.md "Allowing Ri in an
 * app"). Real HTTP to a real MCP server that is its own OAuth server and offers the kit's host grant,
 * and a real home: Ri's own OAuth client starts, the app approves the choice with its host key, and
 * Ri's server finishes the connection the way its callback does. Only the kit's `status` stands in,
 * for the host key's path, since these apps have no kit to ask.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { startOAuthMcpApp, type HostGrantOptions, type OAuthMcpApp } from '@/test/fixtures/oauth-mcp-app';
import type { AppStatus } from './status';

const status = vi.hoisted(() => ({ current: null as Partial<AppStatus> | null }));
vi.mock('./status', async (importOriginal) => ({
  ...await importOriginal<typeof import('./status')>(),
  appStatus: async () => ({ state: 'running', checkedAt: new Date().toISOString(), ...status.current }),
}));
// Allowing an agent recycles its chats, which these tests have none of.
vi.mock('@/lib/executor/adapter', () => ({ recycleWorkspaceSessions: async () => {} }));

const KEY = 'k'.repeat(43);
let home: TestHome;
let app: OAuthMcpApp | undefined;

beforeEach(async () => { home = await createTestHome({ prefix: 'ri-host-access-' }); status.current = null; }, 60_000);
afterEach(async () => {
  (await import('@/lib/integrations/runtime')).invalidateIntegrationRuntime();
  await app?.close();
  app = undefined;
  await home.cleanup();
}, 60_000);

/** People, installed by Ri: a tool, its host grant, and its host key in its data directory. */
async function installedPeople(host: HostGrantOptions | undefined, keyFile = 'host-key') {
  app = await startOAuthMcpApp((server, calls) => {
    server.registerTool('list_people', { description: 'List people.', inputSchema: fromJsonSchema({ type: 'object', properties: {} }), annotations: { readOnlyHint: true } },
      async (args) => { calls.push({ name: 'list_people', args }); return { content: [{ type: 'text', text: '[]' }] }; });
  }, { name: 'people', host });
  const dataDir = path.join(home.root, 'app-data', 'people');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, keyFile), `${KEY}\n`, { mode: 0o600 });
  status.current = { dataDir, hostKeyPath: path.join(dataDir, 'host-key') };
  const { addPersonalApp } = await import('@/lib/integrations/apps');
  const added = await addPersonalApp({ name: 'People', url: app.url });
  const q = await import('@/lib/db/queries');
  const folder = path.join(home.root, 'apps', 'people');
  fs.mkdirSync(folder, { recursive: true });
  q.createAppSource({ name: 'People', folder, createdByRi: true, url: app.url, personalAppId: added.app.id });
  return { appId: added.app.id, serverId: added.app.ri!.serverId };
}

const ri = async (appId: string) => (await import('@/lib/integrations/apps')).getPersonalApp(appId).ri!;

describe('Allowing Ri in an app it installed', () => {
  it('asks with the app\'s own choices, then connects with the one the person picked, with no browser', async () => {
    const { appId, serverId } = await installedPeople({ key: KEY, recommended: 'read' });
    const { placeAccess, allowPlaceHere } = await import('./host-access');
    expect(await ri(appId)).toMatchObject({ status: 'sign_in' });

    const access = await placeAccess(serverId);
    expect(access).toMatchObject({ kind: 'host', appName: 'People', placeName: 'Ri', recommended: 'read', loopbackOnly: true });
    if (access.kind !== 'host') throw new Error('expected the app\'s choices');
    expect(access.choices.map((choice) => choice.label)).toEqual(['Read and make changes', 'Read only']);

    await expect(allowPlaceHere(serverId, 'read')).resolves.toMatchObject({ connected: true, appName: 'People' });
    expect(app!.grants).toEqual([{ clientName: 'Ri', access: 'read' }]);
    expect(await ri(appId)).toMatchObject({ status: 'connected' });
    // Connected for real: Ri's runtime loaded the app's tools with the tokens it got.
    const { getIntegrationRuntime, getMcpServerStore } = await import('@/lib/integrations/runtime');
    const { mcpToolkitId } = await import('@/lib/integrations/mcp-servers');
    const { mcpToolActionId } = await import('@/lib/integrations/mcp-servers');
    const entry = getMcpServerStore().get(serverId)!;
    const toolkit = (await getIntegrationRuntime()).getToolkits().find((candidate) => candidate.id === mcpToolkitId(entry));
    expect(toolkit?.actions.map((action) => action.id)).toEqual([mcpToolActionId(entry, 'list_people')]);
    // Only the key went: nothing a browser or a proxy would add, which the kit refuses.
    expect(app!.hostRequests.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /api/host/access-choices', 'POST /api/host/approve']);
    for (const request of app!.hostRequests) {
      expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(Object.keys(request.headers).filter((name) => name === 'origin' || name === 'forwarded' || name.startsWith('x-forwarded'))).toEqual([]);
    }
  }, 120_000);

  it('allows an agent with that agent\'s own connection, named for it', async () => {
    const { appId } = await installedPeople({ key: KEY });
    const q = await import('@/lib/db/queries');
    const cwd = path.join(home.root, 'family'); fs.mkdirSync(cwd);
    const family = q.createWorkspace({ name: 'Family', cwd, isGit: false });
    const { allowPersonalAppInAgent } = await import('@/lib/integrations/apps');
    const start = await allowPersonalAppInAgent({ appId, workspaceId: family.id });
    const { placeAccess, allowPlaceHere } = await import('./host-access');
    expect(await placeAccess(start.serverId)).toMatchObject({ kind: 'host', placeName: 'Family' });
    await expect(allowPlaceHere(start.serverId, 'write')).resolves.toMatchObject({ connected: true, placeName: 'Family' });
    expect(app!.grants).toEqual([{ clientName: 'Ri · Family', access: 'write' }]);
    const { getPersonalApp } = await import('@/lib/integrations/apps');
    expect(getPersonalApp(appId).agents).toMatchObject([{ label: 'Family', status: 'connected' }]);
    expect(await ri(appId)).toMatchObject({ status: 'sign_in' });
  }, 120_000);

  it('leaves it to the app\'s page when the app was made before the grant', async () => {
    const { serverId } = await installedPeople(undefined);
    const { placeAccess, allowPlaceHere } = await import('./host-access');
    // Its kit reports a key, but the app has no grant to use it with.
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', reason: 'no_endpoint', loopbackOnly: true });
    // An older kit doesn't report a key at all.
    status.current = { dataDir: status.current!.dataDir };
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', reason: 'no_endpoint' });
    await expect(allowPlaceHere(serverId, 'write')).resolves.toMatchObject({ connected: false, reason: 'no_endpoint' });
  }, 120_000);

  it('leaves it to the app\'s page when the app asks the person to sign in first', async () => {
    const { appId, serverId } = await installedPeople({ key: KEY, signInRequired: true });
    const { placeAccess } = await import('./host-access');
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', reason: 'sign_in_required' });
    expect(await ri(appId)).toMatchObject({ status: 'sign_in' });
  }, 120_000);

  it('names the computer the app runs on, whose browser alone opens its page', async () => {
    const { serverId } = await installedPeople(undefined);
    const q = await import('@/lib/db/queries');
    const { ensureHomeIdentity } = await import('@/lib/home/identity');
    q.updateDevice(ensureHomeIdentity().home.hostDeviceId, { name: 'AI Mac Mini' });
    const { placeAccess } = await import('./host-access');
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', homeComputer: 'AI Mac Mini' });
  }, 120_000);

  it('never sends anything but the app\'s own host key', async () => {
    const { serverId } = await installedPeople({ key: KEY }, 'host-key');
    const { placeAccess } = await import('./host-access');
    const dataDir = status.current!.dataDir!;
    const elsewhere = path.join(home.root, 'elsewhere'); fs.mkdirSync(elsewhere);
    fs.writeFileSync(path.join(elsewhere, 'host-key'), KEY);
    fs.writeFileSync(path.join(dataDir, 'secrets.txt'), KEY);
    for (const hostKeyPath of [path.join(elsewhere, 'host-key'), path.join(dataDir, 'secrets.txt'), 'host-key']) {
      status.current = { dataDir, hostKeyPath };
      expect(await placeAccess(serverId), hostKeyPath).toMatchObject({ kind: 'browser', reason: 'unavailable' });
    }
    fs.writeFileSync(path.join(dataDir, 'host-key'), 'not a key');
    status.current = { dataDir, hostKeyPath: path.join(dataDir, 'host-key') };
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', reason: 'unavailable' });
    expect(app!.hostRequests).toEqual([]);
  }, 120_000);

  it('leaves it to the app\'s page when the app refuses the key', async () => {
    const { serverId } = await installedPeople({ key: 'x'.repeat(43) });
    const { placeAccess, allowPlaceHere } = await import('./host-access');
    expect(await placeAccess(serverId)).toMatchObject({ kind: 'browser', reason: 'unavailable' });
    await expect(allowPlaceHere(serverId, 'read')).resolves.toMatchObject({ connected: false, reason: 'unavailable' });
  }, 120_000);

  it('never takes a sign-in the app sends anywhere but Ri\'s own callback', async () => {
    const { appId, serverId } = await installedPeople({ key: KEY, redirectTo: (_uri, code, state) => `https://elsewhere.example/callback?code=${code}&state=${state}` });
    const { allowPlaceHere } = await import('./host-access');
    await expect(allowPlaceHere(serverId, 'write')).rejects.toThrow(/somewhere other than its own sign-in/);
    expect(await ri(appId)).toMatchObject({ status: 'sign_in' });
  }, 120_000);

  it('keeps the browser for an app Ri didn\'t install', async () => {
    app = await startOAuthMcpApp(() => {}, { name: 'outside', host: { key: KEY } });
    const { addPersonalApp } = await import('@/lib/integrations/apps');
    const added = await addPersonalApp({ name: 'Outside', url: app.url });
    const { placeAccess } = await import('./host-access');
    expect(await placeAccess(added.app.ri!.serverId)).toMatchObject({ kind: 'browser', reason: 'not_installed_by_ri' });
    expect(app.hostRequests).toEqual([]);
  }, 120_000);
});

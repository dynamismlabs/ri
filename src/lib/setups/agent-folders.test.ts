/**
 * An agent's folders as one list (docs/agent-folders.md): a primary folder,
 * made by Ri when none is chosen, more folders added beside it, and any of
 * the agent's own made primary instead.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';

let home: TestHome;
let q: typeof import('@/lib/db/queries');
let folders: typeof import('./folders');
let create: typeof import('@/lib/workspaces/create-for-home');
let hostId: string;
let laptopId: string;

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-agent-folders-' });
  const identity = await import('@/lib/home/identity');
  identity.resetHomeIdentityCache();
  hostId = identity.ensureHomeIdentity().device.id;
  q = await import('@/lib/db/queries');
  folders = await import('./folders');
  create = await import('@/lib/workspaces/create-for-home');
  const grant = q.createDeviceGrant({ kind: 'enroll', deviceId: null, deviceName: 'MacBook', createdByApiKeyId: null });
  laptopId = q.redeemEnrollGrant({ secret: grant.secret, name: 'MacBook' }).device.id;
});
afterEach(async () => {
  (await import('@/lib/executor/adapter'))._resetExecutorState();
  (await import('@/lib/home/identity')).resetHomeIdentityCache();
  await home.cleanup();
});

function plain(name: string): string {
  const dir = path.join(home.root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function repo(name: string): string {
  const dir = plain(name);
  const env = { ...process.env, GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@b', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@b' };
  execSync('git init -q -b main && git commit -q --allow-empty -m init && git update-ref refs/remotes/origin/main HEAD', { cwd: dir, env });
  return dir;
}

const linked = (workspaceId: string) =>
  folders.agentFoldersEverywhere(workspaceId).find((d) => d.deviceId === hostId)!.linked;

describe('creating an agent', () => {
  it('makes it a folder when none is chosen', async () => {
    const agent = await create.createWorkspaceForHome({ name: 'Blogging and Growth' }, null);

    const made = path.join(home.root, 'made-agent-folders', 'blogging-and-growth');
    expect(agent).toMatchObject({ cwd: made, isGit: false, baseBranch: null });
    expect(fs.statSync(made).isDirectory()).toBe(true);
    expect(q.getWorkspaceSetup(agent.id, hostId)?.sourcePath).toBe(made);
  });

  it('works in more folders beside the primary one, named after themselves', async () => {
    const primary = repo('app');
    const api = plain('code/api');
    const docs = plain('Design Docs');

    const agent = await create.createWorkspaceForHome({ name: 'App', cwd: primary, folders: [api, docs, primary] }, null);

    expect(agent).toMatchObject({ cwd: primary, isGit: true });
    expect(linked(agent.id).map((r) => ({ alias: r.alias, path: r.path, readOnly: r.readOnly }))).toEqual([
      { alias: 'api', path: api, readOnly: false },
      { alias: 'design-docs', path: docs, readOnly: false },
    ]);
  });

  it("links another agent when a folder is that agent's", async () => {
    const backend = await create.createWorkspaceForHome({ name: 'Backend', cwd: plain('backend') }, null);

    const agent = await create.createWorkspaceForHome({ name: 'Frontend', cwd: plain('frontend'), folders: [backend.cwd] }, null);

    expect(linked(agent.id)).toMatchObject([{ alias: 'backend', agent: { id: backend.id, name: 'Backend' }, path: backend.cwd }]);
  });

  it('refuses a folder that is not there before anything is made', async () => {
    await expect(
      create.createWorkspaceForHome({ name: 'Research', folders: [path.join(home.root, 'missing')] }, null),
    ).rejects.toThrow(/doesn't exist/);

    expect(q.listWorkspaces({ status: 'active' }).map((w) => w.name)).not.toContain('Research');
    expect(fs.existsSync(path.join(home.root, 'made-agent-folders', 'research'))).toBe(false);
  });
});

describe('adding a folder', () => {
  it('is named after the folder and kept unique, and adding it again changes nothing', async () => {
    const agent = await create.createWorkspaceForHome({ name: 'App', cwd: plain('app') }, null);
    const first = await folders.linkFolder(agent.id, hostId, plain('one/shared'));
    const again = await folders.linkFolder(agent.id, hostId, path.join(home.root, 'one/shared/'));
    await folders.linkFolder(agent.id, hostId, plain('two/shared'));

    expect(again).toBe(first);
    expect(linked(agent.id).map((r) => r.alias)).toEqual(['shared', 'shared-2']);
  });

  it("refuses the agent's own primary folder", async () => {
    const agent = await create.createWorkspaceForHome({ name: 'App', cwd: plain('app') }, null);

    await expect(folders.linkFolder(agent.id, hostId, agent.cwd)).rejects.toThrow(/already App's primary folder/);
  });
});

describe('making a folder primary', () => {
  it('swaps it with the primary one, which stays as a folder named after itself', async () => {
    const start = plain('notes');
    const agent = await create.createWorkspaceForHome({ name: 'Writing', cwd: start, folders: [] }, null);
    const target = repo('site');
    const refId = await folders.linkFolder(agent.id, hostId, target);
    q.updateReferenceFolder(refId, { description: 'The website', readOnly: true });

    await folders.makeLinkedFolderPrimary(agent.id, refId);

    expect(q.getWorkspace(agent.id)).toMatchObject({ cwd: target, isGit: true, baseBranch: 'main' });
    expect(q.getWorkspaceSetup(agent.id, hostId)?.sourcePath).toBe(target);
    expect(linked(agent.id)).toMatchObject([{ referenceFolderId: refId, alias: 'notes', path: start, readOnly: false, description: null }]);
  });

  it("refuses another agent's folder and one every agent has", async () => {
    const other = await create.createWorkspaceForHome({ name: 'Backend', cwd: plain('backend') }, null);
    const agent = await create.createWorkspaceForHome({ name: 'Frontend', cwd: plain('frontend'), folders: [other.cwd] }, null);
    const agentLink = linked(agent.id)[0]!.referenceFolderId;
    const everyAgent = q.createReferenceFolder({ workspaceId: null, alias: 'handbook', path: plain('handbook'), description: null });

    await expect(folders.makeLinkedFolderPrimary(agent.id, agentLink)).rejects.toThrow(/Backend's folder/);
    await expect(folders.makeLinkedFolderPrimary(agent.id, everyAgent.id)).rejects.toThrow(/every agent/);
    expect(q.getWorkspace(agent.id)?.cwd).toBe(path.join(home.root, 'frontend'));
  });

  it('asks for its place on every device the agent is on first, and changes nothing until then', async () => {
    const start = plain('app');
    const agent = await create.createWorkspaceForHome({ name: 'App', cwd: start }, null);
    q.setAgentFolder(agent.id, laptopId, '/Users/me/app');
    const refId = await folders.linkFolder(agent.id, hostId, plain('api'));

    await expect(folders.makeLinkedFolderPrimary(agent.id, refId)).rejects.toThrow(/Choose where @api is on MacBook first/);
    expect(q.getWorkspace(agent.id)?.cwd).toBe(start);

    q.setFolderLink(laptopId, refId, '/Users/me/api');
    await folders.makeLinkedFolderPrimary(agent.id, refId);

    expect(q.getWorkspaceSetup(agent.id, hostId)?.sourcePath).toBe(path.join(home.root, 'api'));
    expect(q.getWorkspaceSetup(agent.id, laptopId)?.sourcePath).toBe('/Users/me/api');
    expect(q.getFolderLink(laptopId, refId)?.path).toBe('/Users/me/app');
    expect(q.getFolderLink(hostId, refId)?.path).toBe(start);
  });
});

describe('the agent actions', () => {
  async function run(name: string, input: Record<string, unknown>) {
    const { runAction } = await import('@/lib/orchestrator/dispatch');
    return runAction(name, input, { remote: false } as never) as Promise<{ ok: boolean; result?: { id: string; cwd: string }; error?: { message: string } }>;
  }

  it('create an agent with no folder, or with more than one, and make another primary, safe to repeat', async () => {
    const made = await run('create_workspace', { name: 'Research' });
    expect(made).toMatchObject({ ok: true, result: { cwd: path.join(home.root, 'made-agent-folders', 'research') } });

    const app = plain('app');
    const api = plain('api');
    const created = await run('create_workspace', { name: 'App', cwd: app, folders: [api] });
    expect(created.ok).toBe(true);
    const id = created.result!.id;
    expect(linked(id).map((r) => r.alias)).toEqual(['api']);

    expect(await run('make_primary_folder', { agent: 'App', alias: 'api' })).toMatchObject({ ok: true, result: { cwd: api } });
    expect(await run('make_primary_folder', { agent: 'App', alias: 'api' })).toMatchObject({ ok: true, result: { cwd: api } });
    expect(linked(id).map((r) => ({ alias: r.alias, path: r.path }))).toEqual([{ alias: 'app', path: app }]);
  });
});

/**
 * Removing an app Ri installed, and adding it again (docs/personal-apps.md "Removing an app"),
 * through Ri's real path: the catalog's Add (clone, checksum, the kit's install, the app's consent
 * screen, Ri's OAuth callback), Remove, and Add again. The app kit is a stand-in at its command
 * line (src/test/fixtures/kit-app/kit/cli.mjs, the commands of the kit's docs/safe-change.md), and
 * the app is a real one on this computer that keeps a count in its data directory.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { treeChecksum } from './catalog-checksum';

vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });

const FIXTURE = path.resolve('src/test/fixtures/kit-app');
let home: TestHome;
let root: string;
let dataDir: string;

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Kit', '-c', 'user.email=kit@x', ...args], { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-remove-app-' });
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-remove-app-'));
  dataDir = path.join(root, 'data');
  // Ri's apps' Node and the app's data stay in this test's folder.
  vi.stubEnv('RI_INSTALL_ROOT', path.join(root, 'install'));
  vi.stubEnv('APP_DATA_DIR', dataDir);
  // The app's repository, as its author publishes it, with its lockfile from the pnpm Ri carries.
  const upstream = path.join(root, 'upstream');
  fs.cpSync(FIXTURE, upstream, { recursive: true });
  fs.renameSync(path.join(upstream, 'gitignore.txt'), path.join(upstream, '.gitignore'));
  const { appToolchain } = await import('./toolchain');
  const tools = appToolchain();
  execFileSync(tools.pnpm?.command ?? 'pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--offline'], { cwd: upstream, env: { ...process.env, ...tools.env }, stdio: 'ignore' });
  git(upstream, 'init', '-q', '-b', 'main');
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'Tide Log');
  const version = git(upstream, 'rev-parse', 'HEAD');
  const catalog = path.join(root, 'catalog.json');
  fs.writeFileSync(catalog, JSON.stringify({ apps: [{ id: 'tide-log', name: 'Tide Log', description: 'Tides you saw.', reaches: [], git: upstream, version, checksum: await treeChecksum(upstream, version) }] }));
  vi.stubEnv('RI_APP_CATALOG', catalog);
  (await import('./builder')).setAppBuildSettings({ appsDir: path.join(root, 'apps') });
});

afterEach(async () => {
  // Whatever happened, the app stops.
  const pidFile = path.join(dataDir, 'releases', 'service.pid');
  const pid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, 'utf8')) : 0;
  if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Already gone. */ } }
  (await import('@/lib/integrations/runtime')).invalidateIntegrationRuntime();
  vi.unstubAllEnvs();
  await home.cleanup();
  fs.rmSync(root, { recursive: true, force: true });
});

/** A job of the kit's, once it ends. */
async function settled(jobId: string) {
  const { getAppJob } = await import('./builder');
  for (;;) {
    const job = getAppJob(jobId)!;
    if (job.state !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The person allows Ri on the app's consent screen, and the browser lands on Ri's callback. */
async function consent(authUrl: string) {
  const answer = await fetch(authUrl, { redirect: 'manual' });
  const callback = new URL(answer.headers.get('location')!);
  const { GET } = await import('@/app/api/integrations/mcp-oauth/[sid]/route');
  const landed = await GET(new NextRequest(callback), { params: Promise.resolve({ sid: callback.pathname.split('/').pop()! }) });
  return new URL(landed.headers.get('location')!, 'http://ri.test');
}

/** Visit the app through Ri's connection for its own chats: the count it keeps in its data. */
async function visit(): Promise<number> {
  const { getIntegrationRuntime, getMcpServerStore } = await import('@/lib/integrations/runtime');
  const { hostedMcpConnectionId } = await import('@/lib/integrations/hosted-mcp');
  const { mcpToolkitId } = await import('@/lib/integrations/mcp-servers');
  const entry = getMcpServerStore().list().find((candidate) => candidate.app?.place.kind === 'ri')!;
  const outcome = await (await getIntegrationRuntime()).runAction(`${mcpToolkitId(entry)}.visits`, {}, { connectionId: hostedMcpConnectionId(entry) });
  if (!outcome.ok) throw new Error(`The visit failed: ${JSON.stringify(outcome)}`);
  return (outcome.result as { structuredContent: { visits: number } }).structuredContent.visits;
}

/** Add from the catalog, wait for the install, and allow Ri in the app. */
async function addAndConnect() {
  const { addCatalogApp } = await import('./catalog');
  const { source, job } = await addCatalogApp('tide-log');
  const done = await settled(job.id);
  expect(done, JSON.stringify(done)).toMatchObject({ state: 'done' });
  const landed = await consent(done.authUrl!);
  expect(landed.searchParams.get('error')).toBeNull();
  return source;
}

const answers = async (url: string) => { try { return (await fetch(url.replace(/\/mcp$/, '/api/health'))).ok; } catch { return false; } };

describe('removing an app Ri installed', () => {
  it('uninstalls it and keeps its folder and data, and Add picks both back up', async () => {
    const q = await import('@/lib/db/queries');
    const { listPersonalApps } = await import('@/lib/integrations/apps');
    const { listCatalogApps } = await import('./catalog');
    const { removeApp } = await import('./remove');

    const source = await addAndConnect();
    const installed = q.getAppSource(source.id)!;
    expect(installed.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(await visit()).toBe(1);
    // The person changes their copy of the app.
    fs.writeFileSync(path.join(installed.folder!, 'NOTES.md'), 'Mine\n');
    git(installed.folder!, 'add', '-A');
    git(installed.folder!, 'commit', '-q', '-m', 'My notes');

    // It borrows the person's accounts through the hub, as kit apps do.
    const hub = q.upsertHubApp({ clientId: 'tide-log-hub', name: 'Tide Log', clientUri: new URL(installed.url!).origin, grant: { accounts: [], services: ['list_tasks'] } });

    // Uninstalled for sure, so its hub access stays for Add to pick back up, even if asked to go.
    const removed = await removeApp(source.id, { turnOffAccess: true });
    expect(removed).toEqual({ name: 'Tide Log', folder: installed.folder, dataDir, stillInstalled: null, accessTurnedOff: false });
    expect(q.getHubApp(hub.id)?.revokedAt).toBeNull();
    // Stopped and uninstalled with the kit's own command.
    expect(await answers(installed.url!)).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'releases', 'service.process'))).toBe(false);
    // Disconnected and off every list, its folder and data where they were.
    expect(listPersonalApps()).toEqual([]);
    expect(q.listAppSources()).toEqual([]);
    expect((await listCatalogApps()).apps[0]).toMatchObject({ sourceId: null, installedVersion: null });
    expect(fs.readFileSync(path.join(installed.folder!, 'NOTES.md'), 'utf8')).toBe('Mine\n');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'visits.json'), 'utf8'))).toEqual({ visits: 1 });

    // Add again: the same app, its kept folder (changes and all) and its data. Nothing is cloned over it.
    const again = await addAndConnect();
    expect(again.id).toBe(source.id);
    expect(q.getAppSource(source.id)).toMatchObject({ folder: installed.folder, removedAt: null });
    expect(git(installed.folder!, 'log', '-1', '--format=%s')).toBe('My notes');
    expect(await visit()).toBe(2);
  });

  it('says when its folder is gone and it may still run, with the kit’s command to uninstall it by hand', async () => {
    const q = await import('@/lib/db/queries');
    const { listPersonalApps } = await import('@/lib/integrations/apps');
    const { appStatus } = await import('./status');
    const { appToolchain } = await import('./toolchain');
    const { removeApp } = await import('./remove');

    const source = await addAndConnect();
    const installed = q.getAppSource(source.id)!;
    fs.rmSync(installed.folder!, { recursive: true, force: true });
    // What the Remove dialog reads to say so before it runs.
    expect(await appStatus(source.id, { fresh: true })).toMatchObject({ state: 'unknown', problem: 'no_folder' });

    // Its hub access, and another app's at another address.
    const hub = q.upsertHubApp({ clientId: 'tide-log-hub', name: 'Tide Log', clientUri: new URL(installed.url!).origin, grant: { accounts: [], services: ['list_tasks'] } });
    const other = q.upsertHubApp({ clientId: 'other-hub', name: 'Other', clientUri: 'http://127.0.0.1:1', grant: { accounts: [], services: ['list_tasks'] } });

    // Ri can't confirm it stopped, and the person kept "also turn off its access" ticked.
    const removed = await removeApp(source.id, { turnOffAccess: true });
    const kit = appToolchain().kit;
    expect(removed).toEqual({ name: 'Tide Log', folder: installed.folder, dataDir: null, stillInstalled: { command: kit ? `pnpm exec ${kit.name} serve --uninstall` : null }, accessTurnedOff: true });
    expect(q.getHubApp(hub.id)?.revokedAt).toEqual(expect.any(String));
    expect(q.getHubApp(other.id)?.revokedAt).toBeNull();
    // It says so because it's so: the kit never ran, and the app still answers.
    expect(await answers(installed.url!)).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'releases', 'service.process'))).toBe(true);
    // It's off Ri all the same.
    expect(listPersonalApps()).toEqual([]);
    expect(q.listAppSources()).toEqual([]);
  });

  it('connects an app that is installed but not connected, from its page', async () => {
    const q = await import('@/lib/db/queries');
    const { removePersonalApp } = await import('@/lib/integrations/apps');
    const { reconnectApp, isConnected } = await import('./remove');

    const source = await addAndConnect();
    expect(await visit()).toBe(1);
    // Removed the way only disconnecting did before: still installed and running, not connected.
    await removePersonalApp(q.getAppSource(source.id)!.personalAppId!);
    expect(isConnected(q.getAppSource(source.id)!)).toBe(false);
    expect(await answers(q.getAppSource(source.id)!.url!)).toBe(true);

    const start = await reconnectApp(source.id);
    if (!start.requiresAuth) throw new Error('expected the app to ask for consent');
    expect((await consent(start.authUrl)).searchParams.get('error')).toBeNull();
    expect(isConnected(q.getAppSource(source.id)!)).toBe(true);
    expect(await visit()).toBe(2);
    await expect(reconnectApp(source.id)).rejects.toThrow(/already connected/);
  });
});

describe('New app with the name of an app the person removed', () => {
  it('picks its kept folder back up rather than making another', async () => {
    const q = await import('@/lib/db/queries');
    const { createApp } = await import('./builder');
    const folder = path.join(root, 'apps', 'tide-log');
    fs.mkdirSync(folder, { recursive: true });
    const kept = q.createAppSource({ name: 'Tide Log', folder, createdByRi: true });
    q.updateAppSource(kept.id, { removedAt: new Date().toISOString() });
    expect(q.listAppSources()).toEqual([]);

    const back = await createApp({ name: 'Tide Log' });
    expect(back).toMatchObject({ id: kept.id, folder, removedAt: null });
    expect(q.listAppSources().map((source) => source.id)).toEqual([kept.id]);
  });

  it('still refuses a folder that holds something else', async () => {
    const { createApp } = await import('./builder');
    fs.mkdirSync(path.join(root, 'apps', 'tide-log'), { recursive: true });
    await expect(createApp({ name: 'Tide Log' })).rejects.toThrow(/already exists/);
  });
});

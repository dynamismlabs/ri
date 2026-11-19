import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as q from '@/lib/db/queries';
import { treeChecksum } from './catalog-checksum';
import { catalogSerial, type Catalog, type CatalogEntry } from './catalog-entries';
import { forgetCatalogFeed, savedFeedFile } from './catalog-feed';
import bundled from './catalog.json';

vi.setConfig({ testTimeout: 60_000 });

// The kit's install and switch are the builder's (and the kit's) to test. Here they only record what they were asked.
const installed: string[] = [];
const switched: Array<{ sourceId: string; commit: string }> = [];
vi.mock('./builder', async (original) => {
  const actual = await original<typeof import('./builder')>();
  return {
    ...actual,
    installApp: vi.fn(async (sourceId: string) => { installed.push(sourceId); return { id: 'job', sourceId, kind: 'install', state: 'running', steps: [], startedAt: '' }; }),
    switchTo: vi.fn((source: { id: string }, commit: string) => { switched.push({ sourceId: source.id, commit }); return { id: 'job', sourceId: source.id, kind: 'change', state: 'running', steps: [], startedAt: '' }; }),
  };
});

// What the kit's status says the app runs.
const running = { commit: null as string | null };
vi.mock('./status', () => ({ runningCommit: vi.fn(async () => running.commit) }));

const { addCatalogApp, listCatalogApps, mergeRequest, updateCatalogApp } = await import('./catalog');
const { recordCatalogVersion, setAppBuildSettings } = await import('./builder');

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Kit', '-c', 'user.email=kit@x', ...args], { cwd, encoding: 'utf8' }).trim();

let upstream: string;
let apps: string;
let catalogFile: string;

function commitUpstream(file: string, text: string, tag?: string) {
  fs.writeFileSync(path.join(upstream, file), text);
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', `Write ${file}`);
  if (tag) git(upstream, 'tag', tag);
  return git(upstream, 'rev-parse', 'HEAD');
}

async function publish(version: string, overrides: Partial<CatalogEntry> = {}) {
  const entry: CatalogEntry = {
    id: 'tide-log', name: 'Tide Log', description: 'Tides you saw.', reaches: ['Your calendar, to suggest times'],
    git: upstream, version, checksum: await treeChecksum(upstream, version), ...overrides,
  };
  fs.writeFileSync(catalogFile, JSON.stringify({ apps: [entry] }));
  return entry;
}

/** The kit installed or switched to `commit` and it's running, as its result and status say. */
async function nowRunning(sourceId: string, commit: string) {
  running.commit = commit;
  return recordCatalogVersion(q.getAppSource(sourceId)!, commit);
}

beforeEach(() => {
  installed.length = 0;
  switched.length = 0;
  running.commit = null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-catalog-'));
  upstream = path.join(root, 'upstream');
  apps = path.join(root, 'apps');
  catalogFile = path.join(root, 'catalog.json');
  fs.mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  commitUpstream('README.md', 'Tide Log\n', 'v1.0.0');
  vi.stubEnv('RI_APP_CATALOG', catalogFile);
  setAppBuildSettings({ appsDir: apps });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setAppBuildSettings({ appsDir: null });
  for (const source of [...q.listAppSources(), ...q.listRemovedAppSources()]) q.deleteAppSource(source.id);
});

describe('adding an app the person removed', () => {
  it('installs its kept folder again, changes and all, and clones afresh only when the folder is gone', async () => {
    await publish('v1.0.0');
    const { source } = await addCatalogApp('tide-log');
    const folder = path.join(apps, 'tide-log');
    fs.writeFileSync(path.join(folder, 'mine.txt'), 'my change\n');
    q.updateAppSource(source.id, { removedAt: new Date().toISOString() });
    expect((await listCatalogApps()).apps[0]).toMatchObject({ sourceId: null });

    const { source: back } = await addCatalogApp('tide-log');
    expect(back).toMatchObject({ id: source.id, folder, removedAt: null });
    expect(fs.readFileSync(path.join(folder, 'mine.txt'), 'utf8')).toBe('my change\n');
    expect(installed).toEqual([source.id, source.id]);
    await expect(addCatalogApp('tide-log')).rejects.toThrow(/already added/);

    // Removed again, and its folder deleted by hand: a fresh copy from the catalog, as a new app.
    q.updateAppSource(source.id, { removedAt: new Date().toISOString() });
    fs.rmSync(folder, { recursive: true, force: true });
    const { source: fresh } = await addCatalogApp('tide-log');
    expect(fresh.id).not.toBe(source.id);
    expect(q.getAppSource(source.id)).toBeUndefined();
    expect(git(folder, 'rev-parse', 'HEAD')).toBe(git(upstream, 'rev-parse', 'v1.0.0'));
  });
});

describe('adding an app from the catalog', () => {
  it('clones the pinned version as the person\'s own repository, with its source as upstream, then installs and connects it', async () => {
    const pinned = git(upstream, 'rev-parse', 'v1.0.0');
    commitUpstream('later.txt', 'not pinned\n');
    await publish('v1.0.0');
    expect((await listCatalogApps()).apps[0]).toMatchObject({ id: 'tide-log', sourceId: null, updateAvailable: false });

    const { source } = await addCatalogApp('tide-log');
    const folder = path.join(apps, 'tide-log');
    // Nothing runs yet, so no version is recorded, and there's nothing to update.
    expect(source).toMatchObject({ folder, gitUrl: upstream, createdByRi: true, catalogId: 'tide-log', catalogVersion: null, catalogCommit: null });
    expect(git(folder, 'rev-parse', 'HEAD')).toBe(pinned);
    expect(fs.existsSync(path.join(folder, 'later.txt'))).toBe(false);
    expect(git(folder, 'remote')).toBe('upstream');
    expect(git(folder, 'status', '--porcelain')).toBe('');
    expect(installed).toEqual([source.id]);
    expect((await listCatalogApps()).apps[0]).toMatchObject({ sourceId: source.id, installedVersion: null, updateAvailable: false });
    await expect(updateCatalogApp(source.id)).rejects.toThrow(/isn’t installed yet/);
    // The install is running the pinned commit: now it has a version.
    expect(await nowRunning(source.id, pinned)).toBe(true);
    expect(q.getAppSource(source.id)).toMatchObject({ catalogVersion: 'v1.0.0', catalogCommit: pinned });
    expect((await listCatalogApps()).apps[0]).toMatchObject({ installedVersion: 'v1.0.0', updateAvailable: false });
    await expect(addCatalogApp('tide-log')).rejects.toThrow(/already added/);
  });

  it('pins a commit as well as a tag', async () => {
    const commit = commitUpstream('notes.md', 'untagged\n');
    await publish(commit);
    const { source } = await addCatalogApp('tide-log');
    expect(git(source.folder!, 'rev-parse', 'HEAD')).toBe(commit);
  });

  it('refuses a version whose files don\'t match the catalog, and leaves nothing behind', async () => {
    await publish('v1.0.0', { checksum: `sha256-${'0'.repeat(64)}` });
    await expect(addCatalogApp('tide-log')).rejects.toThrow(/doesn’t match/);
    expect(fs.existsSync(path.join(apps, 'tide-log'))).toBe(false);
    expect(fs.readdirSync(apps)).toEqual([]);
    expect(q.listAppSources()).toEqual([]);
    expect(installed).toEqual([]);
  });

  it('refuses a second Add of the same app while the first runs, and the first finishes whole', async () => {
    await publish('v1.0.0');
    const first = addCatalogApp('tide-log');
    await expect(addCatalogApp('tide-log')).rejects.toThrow('Tide Log is already being added.');
    const { source } = await first;
    expect(git(source.folder!, 'rev-parse', 'HEAD')).toBe(git(upstream, 'rev-parse', 'v1.0.0'));
    expect(installed).toEqual([source.id]);
    // Done: the next Add says it's added, not that it's under way.
    await expect(addCatalogApp('tide-log')).rejects.toThrow(/already added/);
  });

  it('removes only what its own attempt made when it fails, never a folder something else made meanwhile', async () => {
    await publish('v1.0.0');
    const folder = path.join(apps, 'tide-log');
    // The folder appears while the clone runs (the person, another Ri): it's theirs, and it stays.
    const adding = addCatalogApp('tide-log');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'mine.txt'), 'keep me\n');
    await expect(adding).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(path.join(folder, 'mine.txt'), 'utf8')).toBe('keep me\n');
    // A failed attempt leaves no half-cloned copy beside it either.
    expect(fs.readdirSync(apps)).toEqual(['tide-log']);
    expect(q.listAppSources()).toEqual([]);
  });

  it('says so when it can\'t get the app', async () => {
    await publish('v1.0.0', { git: path.join(apps, 'nowhere') });
    await expect(addCatalogApp('tide-log')).rejects.toThrow(/couldn’t get Tide Log/);
    expect(fs.existsSync(path.join(apps, 'tide-log'))).toBe(false);
  });
});

describe('updating an app from the catalog', () => {
  /** Add the app and have the kit install its pinned version. */
  async function addAndInstall() {
    await publish('v1.0.0');
    const { source } = await addCatalogApp('tide-log');
    await nowRunning(source.id, git(source.folder!, 'rev-parse', 'HEAD'));
    return q.getAppSource(source.id)!;
  }

  it('switches an app the person never changed straight to the new version, and records it once that\'s running', async () => {
    const source = await addAndInstall();
    const next = commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    await publish('v1.1.0');
    expect((await listCatalogApps()).apps[0]).toMatchObject({ installedVersion: 'v1.0.0', updateAvailable: true });

    const update = await updateCatalogApp(source.id);
    expect(update).toMatchObject({ mode: 'switch', version: 'v1.1.0' });
    expect(switched).toEqual([{ sourceId: source.id, commit: next }]);
    // The kit's switch reports the new release running, and that records the version.
    expect(await nowRunning(source.id, next)).toBe(true);
    expect(q.getAppSource(source.id)).toMatchObject({ catalogVersion: 'v1.1.0', catalogCommit: next });
    expect(await updateCatalogApp(source.id)).toEqual({ mode: 'current', version: 'v1.1.0' });
  });

  it('has the builder merge the update first when the person changed the app, and records it once the merge is running', async () => {
    const source = await addAndInstall();
    // The person's own change, applied: the kit runs it.
    fs.writeFileSync(path.join(source.folder!, 'mine.md'), 'My tides\n');
    git(source.folder!, 'add', '-A');
    git(source.folder!, 'commit', '-q', '-m', 'My change');
    running.commit = git(source.folder!, 'rev-parse', 'HEAD');
    const next = commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    await publish('v1.1.0');

    const update = await updateCatalogApp(source.id);
    expect(update.mode).toBe('merge');
    if (update.mode !== 'merge') return;
    expect(switched).toEqual([]);
    expect(update.commit).toBe(next);
    expect(update.message).toContain(`git merge ${next}`);
    expect(update.message).not.toMatch(/—|;/);
    const work = update.source.changeFolder!;
    expect(fs.existsSync(work)).toBe(true);
    expect(q.getAppSource(source.id)?.catalogVersion).toBe('v1.0.0');

    // The builder merges in the working copy. Applying it switches to the merge, which includes the update.
    git(work, 'merge', '-q', '--no-edit', next);
    expect(await nowRunning(source.id, git(work, 'rev-parse', 'HEAD'))).toBe(true);
    expect(q.getAppSource(source.id)).toMatchObject({ catalogVersion: 'v1.1.0', catalogCommit: next });
  });

  it('records an update the running app already includes, by the kit\'s status, without switching again', async () => {
    const source = await addAndInstall();
    const next = commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    git(source.folder!, 'fetch', '-q', 'upstream', 'v1.1.0');
    git(source.folder!, 'merge', '-q', '--ff-only', next);
    await publish('v1.1.0');
    running.commit = next;
    expect(await updateCatalogApp(source.id)).toEqual({ mode: 'current', version: 'v1.1.0' });
    expect(switched).toEqual([]);
    expect(q.getAppSource(source.id)?.catalogVersion).toBe('v1.1.0');
  });

  it('installs an update the folder has but the app never ran, rather than calling it current', async () => {
    // The reviewer's case: v2 is merged into the folder and committed, but its switch never ran
    // (or its checks failed), so v1 is still what runs.
    const source = await addAndInstall();
    const v1 = running.commit!;
    const next = commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    git(source.folder!, 'fetch', '-q', 'upstream', 'v1.1.0');
    git(source.folder!, 'merge', '-q', '--ff-only', next);
    await publish('v1.1.0');
    expect(running.commit).toBe(v1);
    expect(await updateCatalogApp(source.id)).toMatchObject({ mode: 'switch', version: 'v1.1.0' });
    expect(switched).toEqual([{ sourceId: source.id, commit: next }]);
    // Still offered until the switch is running it.
    expect(q.getAppSource(source.id)?.catalogVersion).toBe('v1.0.0');
    expect((await listCatalogApps()).apps[0]).toMatchObject({ updateAvailable: true });
    // A recorded version never comes from the folder alone either.
    expect(await recordCatalogVersion(q.getAppSource(source.id)!, v1)).toBe(false);
  });

  it('never uses an update whose files don\'t match the catalog', async () => {
    const source = await addAndInstall();
    commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    await publish('v1.1.0', { checksum: `sha256-${'1'.repeat(64)}` });
    await expect(updateCatalogApp(source.id)).rejects.toThrow(/doesn’t match/);
    expect(switched).toEqual([]);
    expect(q.getAppSource(source.id)?.changeFolder).toBeNull();
  });

  it('asks in plain words', () => {
    expect(mergeRequest({ name: 'Tide Log', version: 'v2' }, 'abc', 'v1')).not.toMatch(/—|;/);
  });
});

describe('adding and updating from the hosted feed', () => {
  // One of Ri's own repositories on GitHub, which git serves from this test's folder.
  const feedGit = 'https://github.com/dynamismlabs/app-tide-log.git';
  const shipped = bundled as Catalog;
  let feed: Catalog;
  let published = 0;

  /** The feed now lists Tide Log at `version`, one serial newer. */
  async function serve(version: string) {
    published++;
    const entry: CatalogEntry = { id: 'tide-log', name: 'Tide Log', description: 'Tides you saw.', reaches: [], git: feedGit, version, checksum: await treeChecksum(upstream, version) };
    feed = { serial: catalogSerial(shipped) + published, apps: [...shipped.apps, entry] };
    // Due again, as it is ten minutes later.
    forgetCatalogFeed();
  }

  beforeEach(() => {
    published = 0;
    vi.stubEnv('RI_APP_CATALOG', undefined);
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', `url.${upstream}.insteadOf`);
    vi.stubEnv('GIT_CONFIG_VALUE_0', feedGit);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(feed))));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    forgetCatalogFeed();
    fs.rmSync(savedFeedFile(), { force: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    forgetCatalogFeed();
    fs.rmSync(savedFeedFile(), { force: true });
  });

  const tideLog = async () => (await listCatalogApps()).apps.find((app) => app.id === 'tide-log');

  it('adds an app only the feed lists, and "Update to v1.1.0" works from the feed as from the shipped list', async () => {
    await serve('v1.0.0');
    expect(await tideLog()).toMatchObject({ version: 'v1.0.0', sourceId: null });
    const { source } = await addCatalogApp('tide-log');
    expect(git(source.folder!, 'config', '--get', 'remote.upstream.url')).toBe(feedGit);
    expect(await nowRunning(source.id, git(source.folder!, 'rev-parse', 'HEAD'))).toBe(true);

    const next = commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    await serve('v1.1.0');
    expect(await tideLog()).toMatchObject({ version: 'v1.1.0', installedVersion: 'v1.0.0', updateAvailable: true });
    expect(await updateCatalogApp(source.id)).toMatchObject({ mode: 'switch', version: 'v1.1.0' });
    expect(switched).toEqual([{ sourceId: source.id, commit: next }]);
    expect(await nowRunning(source.id, next)).toBe(true);
    expect(q.getAppSource(source.id)).toMatchObject({ catalogVersion: 'v1.1.0', catalogCommit: next });

    // Restarted with the feed out of reach: the saved feed still says v1.1.0, so Ri never offers the
    // shipped list's older entry (here, none) as an update.
    forgetCatalogFeed();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await tideLog()).toMatchObject({ version: 'v1.1.0', installedVersion: 'v1.1.0', updateAvailable: false });
    expect(await updateCatalogApp(source.id)).toEqual({ mode: 'current', version: 'v1.1.0' });
  });

  it('never uses a feed version whose files don\'t match its checksum', async () => {
    await serve('v1.0.0');
    const { source } = await addCatalogApp('tide-log');
    await nowRunning(source.id, git(source.folder!, 'rev-parse', 'HEAD'));
    commitUpstream('tides.md', 'High at noon\n', 'v1.1.0');
    await serve('v1.1.0');
    feed = { ...feed, apps: feed.apps.map((app) => app.id === 'tide-log' ? { ...app, checksum: `sha256-${'0'.repeat(64)}` } : app) };
    await expect(updateCatalogApp(source.id)).rejects.toThrow(/doesn’t match what Ri’s catalog lists/);
    expect(switched).toEqual([]);
  });
});

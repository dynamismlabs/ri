import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bundled from './catalog.json';
import { catalogSerial, type Catalog, type CatalogEntry } from './catalog-entries';
import { CATALOG_FEED_URL, catalogEntry, FEED_REPOSITORIES, forgetCatalogFeed, parseFeed, readCatalog, savedFeedFile } from './catalog-feed';

/**
 * The hosted catalog feed. `fetch` stands in for GitHub: every test says what the feed answers,
 * and none reaches the network.
 */

const shipped = bundled as Catalog;
const shippedSerial = catalogSerial(shipped);

const tideLog: CatalogEntry = {
  id: 'tide-log', name: 'Tide Log', description: 'Tides you saw.', reaches: [],
  git: `${FEED_REPOSITORIES}app-tide-log.git`, version: 'v1.0.0', checksum: `sha256-${'b'.repeat(64)}`,
};

/** A feed one newer than the shipped list (or as given), with one more app. */
function feed(over: Partial<Catalog> = {}): Catalog {
  return { serial: shippedSerial + 1, apps: [...shipped.apps, tideLog], ...over };
}

/** What `fetch` answers for the feed, and every request it got. */
let answer: () => Promise<Response>;
const requests: Array<{ url: string; init?: RequestInit }> = [];
const json = (body: unknown, init: ResponseInit = {}) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

beforeEach(() => {
  requests.length = 0;
  answer = json(feed());
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return answer();
  }));
  vi.stubEnv('RI_APP_CATALOG', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  forgetCatalogFeed();
  fs.rmSync(savedFeedFile(), { force: true });
});

afterEach(() => {
  forgetCatalogFeed();
  fs.rmSync(savedFeedFile(), { force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the feed', () => {
  it('is the shipped catalog.json on Ri\'s main branch, and the shipped list would pass as one', () => {
    const url = new URL(CATALOG_FEED_URL);
    expect(url.protocol).toBe('https:');
    const [, owner, repo, branch, ...file] = url.pathname.split('/');
    expect(`https://github.com/${owner}/`).toBe(FEED_REPOSITORIES);
    expect([repo, branch]).toEqual(['ri', 'main']);
    // Moving the file stops the feed for every Ri already released.
    expect(fs.existsSync(path.join(process.cwd(), ...file))).toBe(true);
    expect(path.join(...file)).toBe(path.join('src', 'lib', 'apps', 'catalog.json'));
    expect(() => parseFeed(bundled, 'the shipped list')).not.toThrow();
  });

  it('asks only the fixed address, without following a redirect', async () => {
    await readCatalog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(CATALOG_FEED_URL);
    expect(requests[0].init).toMatchObject({ redirect: 'error' });
  });

  it('is used when it\'s newer than the shipped list, for listing and for one app', async () => {
    expect(await readCatalog()).toEqual(feed().apps);
    expect(await catalogEntry('tide-log')).toEqual(tideLog);
  });

  it('is ignored unless its serial is above the shipped list\'s', async () => {
    for (const serial of [shippedSerial, shippedSerial - 1, undefined]) {
      forgetCatalogFeed();
      fs.rmSync(savedFeedFile(), { force: true });
      answer = json(feed({ serial }));
      expect(await readCatalog()).toEqual(shipped.apps);
    }
  });

  it('leaves the shipped list exactly as it is when the feed can\'t be reached', async () => {
    for (const fail of [async () => { throw new TypeError('fetch failed'); }, json('Not Found', { status: 404 }), json('', { status: 503 })]) {
      forgetCatalogFeed();
      answer = fail;
      expect(await readCatalog()).toEqual(shipped.apps);
      expect(await catalogEntry('tide-log')).toBeNull();
    }
  });

  it('leaves the shipped list as it is when the feed isn\'t valid', async () => {
    const invalid = [
      json('{ not json'),
      json({ apps: [{ ...tideLog, checksum: 'abc' }], serial: shippedSerial + 1 }),
      json({ ...feed(), extra: true }),
      json({ serial: shippedSerial + 1, apps: [tideLog, tideLog] }),
      json('x'.repeat(1024 * 1024 + 1)),
    ];
    for (const bad of invalid) {
      forgetCatalogFeed();
      answer = bad;
      expect(await readCatalog()).toEqual(shipped.apps);
    }
  });

  it('refuses a feed that names a repository that isn\'t one of Ri\'s own', async () => {
    const outside = [
      '/Users/someone/apps/tide-log', 'file:///Users/someone/apps/tide-log', 'https://github.com/someone-else/tide-log.git',
      'https://gitlab.com/dynamismlabs/tide-log.git', 'https://github.com/dynamismlabs/../someone-else/x.git',
      'https://github.com/dynamismlabs/tide-log.git?x=1', 'https://github.com.evil.example/dynamismlabs/tide-log.git',
    ];
    for (const git of outside) {
      forgetCatalogFeed();
      answer = json(feed({ apps: [...shipped.apps, { ...tideLog, git }] }));
      expect(await readCatalog(), git).toEqual(shipped.apps);
    }
    expect(() => parseFeed(feed({ apps: [{ ...tideLog, git: outside[0] }] }), 'a feed')).toThrow(/lists tide-log from outside/);
  });

  it('asks again only once it\'s due: after ten minutes, or a minute after it failed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await readCatalog();
      await readCatalog();
      expect(requests).toHaveLength(1);
      vi.setSystemTime(Date.now() + 10 * 60_000);
      answer = async () => { throw new TypeError('fetch failed'); };
      // Still the feed it had: one failure doesn't take a newer list away.
      expect(await readCatalog()).toEqual(feed().apps);
      expect(requests).toHaveLength(2);
      await readCatalog();
      expect(requests).toHaveLength(2);
      vi.setSystemTime(Date.now() + 60_000);
      answer = json(feed({ serial: shippedSerial + 2, apps: [...shipped.apps, { ...tideLog, version: 'v1.1.0' }] }));
      expect((await catalogEntry('tide-log'))?.version).toBe('v1.1.0');
      expect(requests).toHaveLength(3);
    } finally { vi.useRealTimers(); }
  });

  it('keeps the newest feed in the work folder, so a restart while offline still knows it', async () => {
    await readCatalog();
    expect(JSON.parse(fs.readFileSync(savedFeedFile(), 'utf8'))).toEqual(feed());
    // A restart, and now the feed can't be reached.
    forgetCatalogFeed();
    answer = async () => { throw new TypeError('fetch failed'); };
    expect(await readCatalog()).toEqual(feed().apps);
    // And an older feed never replaces it, even one the network hands over.
    forgetCatalogFeed();
    answer = json(feed({ serial: shippedSerial + 1, apps: shipped.apps }));
    fs.writeFileSync(savedFeedFile(), JSON.stringify(feed({ serial: shippedSerial + 5 })));
    expect(await readCatalog()).toEqual(feed().apps);
    expect(catalogSerial(JSON.parse(fs.readFileSync(savedFeedFile(), 'utf8')))).toBe(shippedSerial + 5);
  });

  it('ignores a saved copy that isn\'t valid', async () => {
    fs.mkdirSync(path.dirname(savedFeedFile()), { recursive: true });
    fs.writeFileSync(savedFeedFile(), JSON.stringify(feed({ apps: [{ ...tideLog, git: '/tmp/tide-log' }] })));
    answer = async () => { throw new TypeError('fetch failed'); };
    expect(await readCatalog()).toEqual(shipped.apps);
  });

  it('lets the Apps page show what Ri has when the feed is slow, and the feed the next time', async () => {
    let arrive!: () => void;
    answer = () => new Promise<Response>((resolve) => { arrive = () => resolve(new Response(JSON.stringify(feed()))); });
    const started = Date.now();
    expect(await readCatalog({ waitMs: 50 })).toEqual(shipped.apps);
    expect(Date.now() - started).toBeLessThan(2_000);
    arrive();
    await vi.waitFor(async () => expect(await readCatalog({ waitMs: 0 })).toEqual(feed().apps));
    expect(requests).toHaveLength(1);
  });
});

describe('RI_APP_CATALOG, for development', () => {
  let server: http.Server | undefined;
  afterEach(async () => { await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve()); server = undefined; });

  it('"bundled" is the shipped list, and nothing is fetched', async () => {
    vi.stubEnv('RI_APP_CATALOG', 'bundled');
    expect(await readCatalog()).toEqual(shipped.apps);
    expect(requests).toHaveLength(0);
  });

  it('a file is exactly that list, whatever its serial or repositories', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ri-catalog-feed-')), 'catalog.json');
    const local = { ...tideLog, git: '/Users/someone/apps/tide-log' };
    fs.writeFileSync(file, JSON.stringify({ apps: [local] }));
    vi.stubEnv('RI_APP_CATALOG', file);
    expect(await readCatalog()).toEqual([local]);
    expect(requests).toHaveLength(0);
  });

  it('an address is fetched as that list exactly, and its failure is shown rather than covered over', async () => {
    vi.unstubAllGlobals();
    let body = JSON.stringify({ apps: [{ ...tideLog, git: '/Users/someone/apps/tide-log' }] });
    server = http.createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(body); });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
    vi.stubEnv('RI_APP_CATALOG', address);
    expect((await readCatalog()).map((entry) => entry.git)).toEqual(['/Users/someone/apps/tide-log']);
    // Asked each time, so a developer's change shows at once.
    body = JSON.stringify({ apps: [] });
    expect(await readCatalog()).toEqual([]);
    body = '{ not json';
    await expect(readCatalog()).rejects.toThrow(/isn’t JSON/);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    await expect(readCatalog()).rejects.toThrow(/couldn’t reach the app catalog/);
  });
});

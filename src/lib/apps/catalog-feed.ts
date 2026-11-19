/**
 * Ri's catalog between releases (docs/personal-apps.md "The catalog feed").
 *
 * Each Ri release ships the catalog it was built with (`catalog.json`). Ri also reads that same file
 * from Ri's main branch on GitHub, so a new app or a new version of one reaches people without a
 * release. Publishing is the catalog's usual flow: `scripts/app-catalog-entry.ts --write`, which
 * bumps the serial, then a pull request. Once it merges, every Ri sees it within about ten minutes.
 *
 * Which list Ri uses:
 * - `RI_APP_CATALOG`, for development and tests: `bundled` (only the shipped list), a file, or an
 *   http(s) address. Exactly that list, with its errors shown and none of the feed's limits.
 * - Otherwise the newest of the shipped list and the newest feed Ri has fetched, by `serial`. A tie
 *   goes to the shipped list. A fetched feed is kept in the work folder, so after a restart while
 *   offline Ri still knows the versions it may already have updated apps to, and never offers an
 *   app its older version. Never fetched, or never newer: the shipped list, exactly as before.
 *
 * Trust: the feed comes only from `CATALOG_FEED_URL` (https, no redirects, at most 1 MiB, within 5
 * seconds). It must be a valid catalog whose every entry names one of Ri's own repositories
 * (`FEED_REPOSITORIES`), never a folder on this computer or another host. As with the shipped
 * list, a version installs only if its files match the entry's checksum (catalog-checksum.ts). The
 * feed isn't signed: whoever can change Ri's main branch can change it, as they can change Ri's
 * code. The docs say when to sign it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileAsync } from '@/lib/config/atomic-write';
import { getWorkDir } from '@/lib/config/paths';
import { processState } from '@/lib/process-state';
import { bundledCatalog, catalogSerial, CatalogError, parseCatalog, readCatalogFile, type Catalog, type CatalogEntry } from './catalog-entries';

/**
 * Where the feed lives: `catalog.json` on Ri's main branch. Every released Ri reads this address,
 * so moving the file stops the feed for all of them (they keep their shipped lists).
 */
export const CATALOG_FEED_URL = 'https://raw.githubusercontent.com/dynamismlabs/ri/main/src/lib/apps/catalog.json';
/** The only repositories a feed may name. The shipped list and a developer's override aren't limited. */
export const FEED_REPOSITORIES = 'https://github.com/dynamismlabs/';
const FEED_MAX_BYTES = 1024 * 1024;
const FEED_TIMEOUT_MS = 5_000;
/** How long a fetched feed counts as current. */
const FEED_FRESH_MS = 10 * 60_000;
/** How soon Ri asks again after the feed couldn't be fetched or wasn't valid. */
const FEED_RETRY_MS = 60_000;
/** How long the Apps page waits for a feed being fetched before it shows what Ri already has. */
export const CATALOG_LIST_WAIT_MS = 2_500;

interface FeedState {
  /** The newest valid feed Ri has, from the network or the work folder. Undefined until the work folder was read. */
  feed: Catalog | null | undefined;
  /** When to fetch again. */
  nextAttemptAt: number;
  fetching: Promise<void> | null;
  /** Why the last fetch failed, for the server's log. */
  lastError: string | null;
}

const state = processState('apps.catalog-feed', (): FeedState => ({ feed: undefined, nextAttemptAt: 0, fetching: null, lastError: null }));

/** Where Ri keeps the newest feed it fetched, in its work folder. */
export const savedFeedFile = () => path.join(/* turbopackIgnore: true */ getWorkDir(), 'app-catalog-feed.json');

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** One of Ri's own repositories on GitHub, as a plain https address. */
function fromRiRepositories(entry: CatalogEntry): boolean {
  let url: URL;
  try { url = new URL(entry.git); } catch { return false; }
  return url.protocol === 'https:' && !url.search && !url.hash && `${url.origin}${url.pathname}`.startsWith(FEED_REPOSITORIES);
}

/** A feed as Ri accepts it: a valid catalog, every entry from Ri's own repositories. */
export function parseFeed(raw: unknown, where: string): Catalog {
  const catalog = parseCatalog(raw, where);
  const outside = catalog.apps.filter((entry) => !fromRiRepositories(entry)).map((entry) => entry.id);
  if (outside.length) throw new CatalogError(`The app catalog at ${where} lists ${outside.join(', ')} from outside ${FEED_REPOSITORIES}, so Ri didn’t use it.`);
  return catalog;
}

/** The JSON at `url`, at most FEED_MAX_BYTES, within FEED_TIMEOUT_MS, without following a redirect. */
async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
  } catch (error) {
    throw new CatalogError(`Ri couldn’t reach the app catalog at ${url}: ${message(error)}`);
  }
  if (!response.ok) throw new CatalogError(`The app catalog at ${url} answered with HTTP ${response.status}.`);
  const tooLarge = () => new CatalogError(`The app catalog at ${url} is larger than ${FEED_MAX_BYTES} bytes.`);
  if (Number(response.headers.get('content-length') ?? 0) > FEED_MAX_BYTES) throw tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = response.body?.getReader();
    for (;;) {
      const read = await reader?.read();
      if (!read || read.done) break;
      size += read.value.byteLength;
      if (size > FEED_MAX_BYTES) { await reader!.cancel().catch(() => {}); throw tooLarge(); }
      chunks.push(read.value);
    }
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError(`Ri couldn’t read the app catalog at ${url}: ${message(error)}`);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new CatalogError(`The app catalog at ${url} isn’t JSON.`); }
}

/** The newest feed Ri has, reading the work folder's copy the first time. */
function knownFeed(): Catalog | null {
  if (state.feed === undefined) {
    try { state.feed = parseFeed(JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ savedFeedFile(), 'utf8')), 'the copy Ri saved'); }
    catch { state.feed = null; }
  }
  return state.feed;
}

/** Fetch the feed, once at a time. It's kept only if its serial is at least the one Ri has: never an older feed. */
function fetchFeed(): Promise<void> {
  state.fetching ??= (async () => {
    try {
      const feed = parseFeed(await fetchJson(CATALOG_FEED_URL), CATALOG_FEED_URL);
      state.lastError = null;
      state.nextAttemptAt = Date.now() + FEED_FRESH_MS;
      const known = knownFeed();
      if (known && catalogSerial(feed) < catalogSerial(known)) return;
      state.feed = feed;
      await atomicWriteFileAsync(savedFeedFile(), JSON.stringify(feed)).catch((error: unknown) => {
        console.warn(`[apps] Ri couldn’t save the app catalog it fetched: ${message(error)}`);
      });
    } catch (error) {
      state.lastError = message(error);
      state.nextAttemptAt = Date.now() + FEED_RETRY_MS;
      console.warn(`[apps] ${state.lastError} Ri is using the catalog it already has.`);
    } finally {
      state.fetching = null;
    }
  })();
  return state.fetching;
}

/** The catalog `RI_APP_CATALOG` names, exactly. */
async function overrideCatalog(value: string): Promise<Catalog> {
  if (value === 'bundled') return bundledCatalog();
  if (/^https?:\/\//i.test(value)) return parseCatalog(await fetchJson(value), value);
  return readCatalogFile(value);
}

/**
 * The catalog Ri uses now. When the feed is due, this fetches it and waits up to `waitMs` (all of
 * the fetch, by default, which is bounded by its own timeout). The Apps page passes
 * CATALOG_LIST_WAIT_MS, so a slow network only delays it that long, and the feed shows next time.
 */
export async function readCatalog(options: { waitMs?: number } = {}): Promise<CatalogEntry[]> {
  const override = process.env.RI_APP_CATALOG;
  if (override) return (await overrideCatalog(override)).apps;
  if (Date.now() >= state.nextAttemptAt) void fetchFeed();
  const fetching = state.fetching;
  if (fetching) {
    if (options.waitMs === undefined) await fetching;
    else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([fetching, new Promise<void>((resolve) => { timer = setTimeout(resolve, options.waitMs); })]);
      clearTimeout(timer);
    }
  }
  const bundled = bundledCatalog();
  const feed = knownFeed();
  return (feed && catalogSerial(feed) > catalogSerial(bundled) ? feed : bundled).apps;
}

/** One app's entry in the catalog Ri uses now, after the feed if it's due. */
export async function catalogEntry(id: string): Promise<CatalogEntry | null> {
  return (await readCatalog()).find((entry) => entry.id === id) ?? null;
}

/** Forget every feed fetched in this process, so the next read starts over from the work folder. For tests. */
export function forgetCatalogFeed(): void {
  state.feed = undefined;
  state.nextAttemptAt = 0;
  state.fetching = null;
  state.lastError = null;
}

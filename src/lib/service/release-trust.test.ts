import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrivateKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promote, publish, refresh, signer } from '../../../desktop/publish-release.mjs';
import { keyId, keygen, rotate, signEnvelope, signKeys } from '../../../desktop/release-keys.mjs';
import { checkRelease, checkReleaseIndex, checkReleaseVersion, releasePolicyFile, secureFetch, seenKeysVersion } from './release-trust';
import { writeOrigin } from './origin';
import { CURRENT_COMPATIBILITY } from '@/lib/releases/compatibility';

// Every key here is made in a temporary folder by the same commands the owner runs.
let root: string;
let feed: string;
let keysFile: string;
let rootKeyFile: string;
let rootKey: string;
let online: KeyObject;
const hash = (letter: string) => letter.repeat(64);
const payload = (version: string, id: string) => ({
  version, platform: process.platform, arch: process.arch, minimumUpdater: 1, apiProtocol: 1, configFormat: 1, migrationHistory: hash('b'),
  runtime: { id: hash(id), url: `https://feed.test/v${version}/runtime.tar.gz`, sha256: hash('c'), size: 100, unpackedSize: 1000 },
  compatibility: CURRENT_COMPATIBILITY,
});
const name = (file: string) => `${file}-${process.platform}-${process.arch}.json`;
const signingKey = (file: string) => createPrivateKey(fs.readFileSync(file, 'utf8'));
/** One workflow run: sign into a fresh folder, then upload it over the feed. */
function run(step: (by: ReturnType<typeof signer>, out: string) => unknown) {
  const out = fs.mkdtempSync(path.join(root, 'run-'));
  step(signer({ key: online, rootKey, keysFile, existing: feed }), out);
  for (const file of fs.readdirSync(out)) fs.copyFileSync(path.join(out, file), path.join(feed, file));
}
const publishTo = (version: string, id: string, channel: 'stable' | 'latest', sequence: number) => run((by, out) => publish({ payloads: [payload(version, id)], channel, by, out, existing: feed, sequence }));
const promoteTo = (version: string, sequence: number) => run((by, out) => promote({ existing: feed, version, by, out, sequence }));
const refreshFeed = () => run((by, out) => refresh({ existing: feed, by, out }));
const policy = (key = rootKey, address = 'https://feed.test/') => fs.writeFileSync(releasePolicyFile(), JSON.stringify({ format: 2, feed: address, rootKey: key }));
const keyIds = () => fs.readdirSync(feed).filter(file => /-(darwin|linux)-/.test(file)).map(file => JSON.parse(fs.readFileSync(path.join(feed, file), 'utf8')).keyid);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-release-trust-'));
  feed = path.join(root, 'feed');
  fs.mkdirSync(feed);
  keysFile = path.join(root, 'repo', 'release-keys.json');
  fs.mkdirSync(path.dirname(keysFile));
  const made = keygen({ dir: path.join(root, 'keys'), keysFile });
  rootKeyFile = made.rootFile;
  rootKey = fs.readFileSync(made.rootPublicFile, 'utf8');
  online = signingKey(made.onlineFile);
  vi.stubEnv('RI_ROOT', path.join(root, 'home')); vi.stubEnv('RI_INSTALL_ROOT', path.join(root, 'installed'));
  fs.mkdirSync(path.join(root, 'installed'), { recursive: true });
  policy();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = path.join(feed, path.basename(new URL(url).pathname));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }); });

it('lets a computer on stable fetch a release promoted after it was published', async () => {
  publishTo('0.2.0', 'a', 'latest', 10);
  promoteTo('0.2.0', 20);
  expect((await checkRelease()).sequence).toBe(20);
  // The file for the version itself still carries the sequence it was published with.
  const version = await checkReleaseVersion('0.2.0');
  expect(version).toMatchObject({ version: '0.2.0', sequence: 10 });
  expect(seenKeysVersion()).toBe(1);
});

it('follows the feed at releases.ri.app through its redirect to the GitHub release', async () => {
  publishTo('0.2.0', 'a', 'latest', 10);
  promoteTo('0.2.0', 20);
  policy(rootKey, 'https://releases.ri.app/');
  const asked: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    asked.push(url);
    const { host, pathname } = new URL(url);
    // The domain only redirects, temporarily, and GitHub redirects again to its storage.
    if (host === 'releases.ri.app') return new Response(null, { status: 307, headers: { location: `https://github.com/dynamismlabs/ri/releases/download/feed${pathname}` } });
    if (host === 'github.com') return new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/${path.basename(pathname)}?token=t` } });
    return new Response(fs.readFileSync(path.join(feed, path.basename(pathname))));
  }));
  expect(await checkRelease()).toMatchObject({ version: '0.2.0', channel: 'stable' });
  const through = (file: string) => [
    `https://releases.ri.app/${file}`,
    `https://github.com/dynamismlabs/ri/releases/download/feed/${file}`,
    `https://release-assets.githubusercontent.com/${file}?token=t`,
  ];
  // The keys first, then the release they vouch for.
  expect(asked).toEqual([...through('keys.json'), ...through(name('stable'))]);
});

it('keeps a separate order for each channel, since stable is often behind latest', async () => {
  publishTo('0.2.0', 'a', 'latest', 10);
  promoteTo('0.2.0', 20);
  await checkRelease();
  publishTo('0.3.0', 'b', 'latest', 15);
  writeOrigin({ channel: 'latest' });
  expect((await checkRelease()).version).toBe('0.3.0');
  writeOrigin({ channel: 'stable' });
  expect((await checkRelease()).version).toBe('0.2.0');
});

it('refuses a channel moved backwards', async () => {
  publishTo('0.3.0', 'b', 'stable', 20);
  await checkRelease();
  publishTo('0.2.0', 'a', 'stable', 10);
  await expect(checkRelease()).rejects.toThrow('downgrade');
});

it('refuses a feed whose keys another root signed', async () => {
  publishTo('0.2.0', 'a', 'stable', 10);
  const other = generateKeyPairSync('ed25519');
  policy(other.publicKey.export({ type: 'spki', format: 'pem' }).toString());
  await expect(checkReleaseVersion('0.2.0')).rejects.toThrow('not signed by the root key this installation trusts');
  await expect(checkRelease()).rejects.toThrow('not signed by the root key');
  // Nor a keys file claiming to be the root's, with someone else's signature.
  policy();
  fs.writeFileSync(path.join(feed, 'keys.json'), JSON.stringify({ ...signKeys(1, [online], other.privateKey), keyid: keyId(rootKey) }));
  await expect(checkRelease()).rejects.toThrow('signature');
});

it('refuses an older keys file than one it has seen', async () => {
  publishTo('0.2.0', 'a', 'stable', 10);
  const first = fs.readFileSync(path.join(feed, 'keys.json'));
  await checkRelease();
  rotate({ rootKeyFile, dir: path.join(root, 'keys'), keysFile });
  refreshFeed();
  await checkRelease();
  expect(seenKeysVersion()).toBe(2);
  // A feed serving version 1 again, which still verifies against the root.
  fs.writeFileSync(path.join(feed, 'keys.json'), first);
  await expect(checkRelease()).rejects.toThrow('roll back its signing keys');
  await expect(checkReleaseIndex()).rejects.toThrow('roll back its signing keys');
  expect(seenKeysVersion()).toBe(2);
});

it('refuses a release signed by a key the keys file doesn\'t list, even with a good signature', async () => {
  publishTo('0.2.0', 'a', 'stable', 10);
  const stranger = generateKeyPairSync('ed25519').privateKey;
  const release = JSON.parse(Buffer.from(JSON.parse(fs.readFileSync(path.join(feed, name('stable')), 'utf8')).payload, 'base64').toString());
  fs.writeFileSync(path.join(feed, name('stable')), JSON.stringify(signEnvelope({ ...release, version: '0.9.0', sequence: 99 }, stranger)));
  await expect(checkRelease()).rejects.toThrow('signed by a key its publisher does not list');
  fs.writeFileSync(path.join(feed, name('index')), JSON.stringify(signEnvelope({ format: 1, versions: [] }, stranger)));
  await expect(checkReleaseIndex()).rejects.toThrow('does not list');
  // Naming a listed key doesn't help a signature made by another one.
  fs.writeFileSync(path.join(feed, name('stable')), JSON.stringify({ ...signEnvelope({ ...release, version: '0.9.0', sequence: 99 }, stranger), keyid: keyId(online) }));
  await expect(checkRelease()).rejects.toThrow('signature is invalid');
});

it('stops trusting a revoked key at the next check, with nothing to do on the computer', async () => {
  publishTo('0.2.0', 'a', 'stable', 10);
  expect((await checkRelease()).version).toBe('0.2.0');
  const leaked = online;
  // Revoke: a new key, and keys version 2 without the old one. Then the refresh.
  const next = rotate({ rootKeyFile, dir: path.join(root, 'keys'), keysFile, revoke: [keyId(leaked)] });
  online = signingKey(next.onlineFile);
  refreshFeed();
  expect(new Set(keyIds())).toEqual(new Set([next.onlineId]));
  expect((await checkRelease()).version).toBe('0.2.0');
  expect((await checkReleaseIndex()).map(item => item.version)).toEqual(['0.2.0']);
  // Whoever holds the leaked key signs a newer release, correctly. It's refused.
  const release = JSON.parse(Buffer.from(JSON.parse(fs.readFileSync(path.join(feed, name('stable')), 'utf8')).payload, 'base64').toString());
  fs.writeFileSync(path.join(feed, name('stable')), JSON.stringify(signEnvelope({ ...release, version: '0.9.0', sequence: Number.MAX_SAFE_INTEGER }, leaked)));
  await expect(checkRelease()).rejects.toThrow('does not list');
  // So is putting back the keys file that listed it.
  fs.writeFileSync(path.join(feed, 'keys.json'), JSON.stringify(signKeys(1, [leaked], createPrivateKey(fs.readFileSync(rootKeyFile, 'utf8')))));
  await expect(checkRelease()).rejects.toThrow('roll back');
});

it('rotates end to end: keygen, publish, rotate, publish, refresh, rotate again, and every computer keeps updating', async () => {
  const first = online;
  publishTo('0.2.0', 'a', 'stable', 10);
  expect((await checkRelease()).version).toBe('0.2.0');

  // A plain rotation: the new key signs from now on, and what the old one signed stays valid.
  const second = rotate({ rootKeyFile, dir: path.join(root, 'keys'), keysFile });
  online = signingKey(second.onlineFile);
  publishTo('0.3.0', 'b', 'latest', 20);
  expect(new Set(keyIds())).toEqual(new Set([keyId(first), second.onlineId]));
  expect(await checkRelease()).toMatchObject({ version: '0.2.0', channel: 'stable' });
  expect(seenKeysVersion()).toBe(2);
  writeOrigin({ channel: 'latest' });
  expect((await checkRelease()).version).toBe('0.3.0');
  expect((await checkReleaseVersion('0.2.0')).version).toBe('0.2.0');
  expect((await checkReleaseIndex()).map(item => item.version)).toEqual(['0.3.0', '0.2.0']);

  // Monday's refresh moves every file to the new key.
  refreshFeed();
  expect(new Set(keyIds())).toEqual(new Set([second.onlineId]));

  // The next rotation drops the first key, which nothing on the feed uses any more.
  const third = rotate({ rootKeyFile, dir: path.join(root, 'keys'), keysFile });
  expect(third.left).toEqual([keyId(first)]);
  online = signingKey(third.onlineFile);
  promoteTo('0.3.0', 30);
  writeOrigin({ channel: 'stable' });
  expect(await checkRelease()).toMatchObject({ version: '0.3.0', sequence: 30 });
  expect((await checkReleaseVersion('0.2.0')).version).toBe('0.2.0');
  expect(seenKeysVersion()).toBe(3);
  // And a file signed by the first key is now refused.
  fs.writeFileSync(path.join(feed, name('0.2.0')), JSON.stringify(signEnvelope(JSON.parse(Buffer.from(JSON.parse(fs.readFileSync(path.join(feed, name('0.2.0')), 'utf8')).payload, 'base64').toString()), first)));
  await expect(checkReleaseVersion('0.2.0')).rejects.toThrow('does not list');
});

it('gives up on a download only when it stops moving, not when it takes a long time', async () => {
  let push!: (chunk: Uint8Array) => void; let close!: () => void;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { signal: AbortSignal }) => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      push = chunk => controller.enqueue(chunk); close = () => controller.close();
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
    },
  }))));
  const steady = await secureFetch('https://feed.test/runtime.tar.gz', 80);
  const reading = steady.arrayBuffer();
  // Six times the stall limit in total, with bytes arriving throughout.
  for (let i = 0; i < 12; i++) { await new Promise(resolve => setTimeout(resolve, 40)); push(new Uint8Array([i])); }
  close();
  expect((await reading).byteLength).toBe(12);

  const stuck = await secureFetch('https://feed.test/runtime.tar.gz', 80);
  push(new Uint8Array([1]));
  await expect(stuck.arrayBuffer()).rejects.toThrow('stopped moving');
});

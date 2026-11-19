/**
 * The release feed (docs/publishing.md). Signs metadata and writes the folder that
 * gets uploaded. It uploads nothing itself, so a run can always be inspected first.
 *
 *   check     Say whether the signing key is one the keys file lists, before building.
 *   publish   Sign this version for every platform built, and point its channel at it.
 *   promote   Point `stable` at a version already on `latest`.
 *   refresh   Sign everything again with a later expiry, changing nothing else.
 *   withdraw  Mark a version withdrawn, so nothing moves to it again.
 *
 * Each platform has a file per channel, a file per version, and a signed index of
 * the versions kept, which is how a connected computer finds a bridge release.
 * Other files on the feed (install.sh, the downloads manifests the website reads) are
 * not signed metadata, so these commands leave them alone.
 *
 * Every file is signed by an online key, which the root-signed keys file must list
 * (desktop/release-keys.mjs). Every run writes that keys file to the feed too, and signs
 * again any file whose key it no longer lists, so the feed is whole after each run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { KEYS_FILE, keyId, openEnvelope, openKeys, readKeysFile, rootPublicKey, signEnvelope } from './release-keys.mjs';

function compareVersions(a, b) {
  const parts = value => { const [core, pre] = value.split('-', 2); return { numbers: core.split('.').map(Number), pre }; };
  const left = parts(a); const right = parts(b);
  for (let i = 0; i < 3; i++) { const delta = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0); if (delta) return delta; }
  if (left.pre === right.pre) return 0;
  return !left.pre ? 1 : !right.pre ? -1 : left.pre < right.pre ? -1 : 1;
}
/** A signed metadata file: `<channel, version or index>-<platform>-<arch>.json`. */
const SIGNED_FILE = /^(.+)-(?:darwin|linux)-(?:arm64|x64)\.json$/;
const signedFiles = folder => fs.readdirSync(folder).filter(name => SIGNED_FILE.test(name));
const dated = (days, now) => ({ publishedAt: new Date(now).toISOString(), expiresAt: new Date(now + days * 86_400_000).toISOString() });
const write = (out, name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value)}\n`);
const read = (folder, name) => { const file = path.join(folder, name); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };

/**
 * Who signs this run: the online key, and the keys file listing it. That is the newer of
 * this checkout's and the feed's, both checked against the root key, so the feed's never
 * goes back. A file already on the feed is read if either lists its key, so the first run
 * after a rotation or a revocation can still read what the old key signed.
 */
export function signer({ key, rootKey, keysFile = KEYS_FILE, existing = /** @type {string | null} */ (null) }) {
  if (key.asymmetricKeyType !== 'ed25519' || key.type !== 'private') throw new Error('Release metadata requires an Ed25519 signing key');
  const root = rootPublicKey(rootKey);
  const local = readKeysFile(keysFile, root);
  const onFeed = existing && read(existing, 'keys.json');
  const feed = onFeed ? openKeys(onFeed, root, "The feed's keys.json") : null;
  if (feed && feed.version === local.version && feed.envelope.payload !== local.envelope.payload) {
    throw new Error(`The feed's keys.json and ${path.basename(keysFile)} are both version ${local.version} but differ. Run pnpm release:rotate to sign the next version.`);
  }
  const chosen = feed && feed.version > local.version ? feed : local;
  const id = keyId(key);
  if (!chosen.keys.has(id)) {
    throw new Error(`The signing key (RI_RELEASE_SIGNING_KEY) is ${id}, which keys version ${chosen.version} doesn't list. It lists ${[...chosen.keys.keys()].join(', ')}. `
      + 'Set the secret to a listed key, or run pnpm release:rotate and commit desktop/release-keys.json (docs/publishing.md, "Signing keys").');
  }
  return { key, id, root, version: chosen.version, keys: chosen.keys, keysEnvelope: chosen.envelope, trusted: new Map([...(feed?.keys ?? []), ...chosen.keys]) };
}

/** The keys file goes up with every run, and nothing stays signed by a key it leaves out. */
function finish({ by, existing, out }) {
  write(out, 'keys.json', by.keysEnvelope);
  if (!existing) return;
  for (const name of signedFiles(existing)) {
    if (fs.existsSync(path.join(out, name))) continue;
    const value = read(existing, name);
    if (!by.keys.has(value.keyid)) write(out, name, signEnvelope(openEnvelope(value, by.trusted, name), by.key));
  }
}

function updateIndex({ existing, out, platform, arch, release, by }) {
  const name = `index-${platform}-${arch}.json`;
  const before = read(existing ?? out, name);
  const versions = before ? openEnvelope(before, by.trusted, name).versions : [];
  const entry = release.compatibility ? [{ version: release.version, sequence: release.sequence, compatibility: release.compatibility }] : [];
  const merged = [...entry, ...versions.filter(item => item.version !== release.version)].sort((a, b) => compareVersions(b.version, a.version));
  write(out, name, signEnvelope({ format: 1, versions: merged }, by.key));
}

/** Everything `publish` needs, so a test can run it without a command line. */
export function publish({ payloads, channel, by, out, existing = /** @type {string | null} */ (null), notes = '', sequence, days = 30, now = Date.now() }) {
  if (!['stable', 'latest'].includes(channel)) throw new Error('Choose stable or latest channel');
  fs.mkdirSync(out, { recursive: true });
  const written = [];
  for (const payload of payloads) {
    const { version, platform, arch } = payload;
    if (existing && read(existing, `${version}-${platform}-${arch}.json`)) throw new Error(`Version ${version} is already published for ${platform}-${arch}. Publish a new version, or promote this one.`);
    const release = { format: 1, sequence, channel, ...dated(days, now), withdrawn: false, notes, ...payload };
    write(out, `${version}-${platform}-${arch}.json`, signEnvelope(release, by.key));
    write(out, `${channel}-${platform}-${arch}.json`, signEnvelope(release, by.key));
    // Latest gets every release, so a stable one goes there too.
    if (channel === 'stable') write(out, `latest-${platform}-${arch}.json`, signEnvelope({ ...release, channel: 'latest' }, by.key));
    updateIndex({ existing, out, platform, arch, release, by });
    written.push(`${platform}-${arch}`);
  }
  finish({ by, existing, out });
  return written;
}

export function promote({ existing, version, by, out, sequence, days = 30, now = Date.now() }) {
  fs.mkdirSync(out, { recursive: true });
  // Exactly this version: 0.2.0 isn't 0.2.0-rc.1.
  const names = signedFiles(existing).filter(name => SIGNED_FILE.exec(name)?.[1] === version);
  if (!names.length) throw new Error(`Version ${version} is not on this feed`);
  for (const name of names) {
    const release = openEnvelope(read(existing, name), by.trusted, name);
    if (release.withdrawn) throw new Error(`Version ${version} was withdrawn`);
    write(out, `stable-${release.platform}-${release.arch}.json`, signEnvelope({ ...release, channel: 'stable', sequence, ...dated(days, now) }, by.key));
  }
  finish({ by, existing, out });
  return names.length;
}

/** Metadata expires, so a client can't be held on an old release by a frozen feed. */
export function refresh({ existing, by, out, days = 30, now = Date.now() }) {
  fs.mkdirSync(out, { recursive: true });
  let count = 0;
  for (const name of signedFiles(existing)) {
    const value = openEnvelope(read(existing, name), by.trusted, name);
    write(out, name, signEnvelope(value.expiresAt ? { ...value, expiresAt: new Date(now + days * 86_400_000).toISOString() } : value, by.key));
    count++;
  }
  finish({ by, existing, out });
  return count;
}

export function withdraw({ existing, version, by, out, sequence, days = 30, now = Date.now() }) {
  fs.mkdirSync(out, { recursive: true });
  let count = 0;
  for (const name of signedFiles(existing).filter(file => !file.startsWith('index-'))) {
    const release = openEnvelope(read(existing, name), by.trusted, name);
    if (release.version !== version) continue;
    write(out, name, signEnvelope({ ...release, withdrawn: true, sequence, ...dated(days, now) }, by.key));
    count++;
  }
  if (!count) throw new Error(`Version ${version} is not on this feed`);
  finish({ by, existing, out });
  return count;
}

/**
 * The feed's address, as every installation pins it: an HTTPS folder on a host that may
 * only redirect, as https://releases.ri.app/ redirects to the GitHub release tagged `feed`.
 */
export function feedAddress(value) {
  const feed = new URL(value);
  if (feed.protocol !== 'https:' || feed.username || feed.password || feed.search || feed.hash) throw new Error('The release feed must be a plain HTTPS address');
  return feed.href.endsWith('/') ? feed.href : `${feed.href}/`;
}

/** The install script, with this feed and the root public key written in. */
export function writeInstallScript({ template, feed, rootKey, out }) {
  const root = rootPublicKey(rootKey).export({ type: 'spki', format: 'pem' }).toString();
  const script = fs.readFileSync(template, 'utf8').replaceAll('__RI_FEED__', feedAddress(feed)).replaceAll('__RI_ROOT_KEY_BASE64__', Buffer.from(root).toString('base64'));
  fs.writeFileSync(path.join(out, 'install.sh'), script, { mode: 0o755 });
}

function loadSigner(values) {
  const text = values['private-key'] ? fs.readFileSync(values['private-key'], 'utf8') : process.env.RI_RELEASE_SIGNING_KEY;
  if (!text) throw new Error('Give --private-key, or set RI_RELEASE_SIGNING_KEY');
  const rootKey = values['root-key'] ? fs.readFileSync(values['root-key'], 'utf8') : process.env.RI_RELEASE_PUBLIC_KEY;
  if (!rootKey) throw new Error('Give --root-key, or set RI_RELEASE_PUBLIC_KEY to the root public key');
  return signer({ key: createPrivateKey(text), rootKey, keysFile: values.keys ? path.resolve(values.keys) : KEYS_FILE, existing: values.existing ?? null });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [command] = process.argv.slice(2);
  const { values: v } = parseArgs({ args: process.argv.slice(3), options: {
    payloads: { type: 'string' }, channel: { type: 'string', default: 'latest' }, 'private-key': { type: 'string' }, out: { type: 'string' },
    existing: { type: 'string' }, notes: { type: 'string' }, sequence: { type: 'string' }, version: { type: 'string' }, feed: { type: 'string' },
    'expires-days': { type: 'string', default: '30' }, 'root-key': { type: 'string' }, keys: { type: 'string' },
  } });
  const by = loadSigner(v);
  if (command === 'check') {
    console.info(`Signing key ${by.id} is listed in keys version ${by.version}.`);
    process.exit(0);
  }
  if (!v.out) throw new Error('Missing --out');
  const days = Number(v['expires-days']);
  const sequence = v.sequence ? Number(v.sequence) : Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isInteger(days) || days < 1 || days > 90) throw new Error('Check --sequence and --expires-days');
  if (command === 'publish') {
    if (!v.payloads) throw new Error('Missing --payloads');
    const payloads = fs.readdirSync(v.payloads).filter(name => name.endsWith('.payload.json')).map(name => JSON.parse(fs.readFileSync(path.join(v.payloads, name), 'utf8')));
    if (!payloads.length) throw new Error('No platform metadata to publish');
    const versions = new Set(payloads.map(item => item.version));
    if (versions.size !== 1) throw new Error(`Platforms disagree about the version: ${[...versions].join(', ')}`);
    const written = publish({ payloads, channel: v.channel, by, out: v.out, existing: v.existing, sequence, days, notes: v.notes ? fs.readFileSync(v.notes, 'utf8').slice(0, 10000) : '' });
    if (v.feed) writeInstallScript({ template: fileURLToPath(new URL('../scripts/install.sh', import.meta.url)), feed: v.feed, rootKey: by.root, out: v.out });
    console.info(`Signed ${[...versions][0]} on ${v.channel} for ${written.join(', ')} into ${v.out}, with key ${by.id} from keys version ${by.version}`);
  } else if (command === 'promote') console.info(`Pointed stable at ${v.version} for ${promote({ existing: v.existing, version: v.version, by, out: v.out, sequence, days })} platforms, with key ${by.id}`);
  else if (command === 'refresh') console.info(`Signed ${refresh({ existing: v.existing, by, out: v.out, days })} files with a later expiry, with key ${by.id} from keys version ${by.version}`);
  else if (command === 'withdraw') console.info(`Withdrew ${v.version} in ${withdraw({ existing: v.existing, version: v.version, by, out: v.out, sequence, days })} files, with key ${by.id}`);
  else throw new Error('Use check, publish, promote, refresh or withdraw');
}

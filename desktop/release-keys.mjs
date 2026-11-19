#!/usr/bin/env node
/**
 * Release signing keys (docs/publishing.md, "Signing keys"). Two kinds, after The Update
 * Framework's root and targets roles, kept as small as they can be:
 *
 *   root    One Ed25519 key, made once and kept offline by the owner, never in CI. Every
 *           installation pins its public half for good (release-policy.json, install.sh).
 *   online  What CI signs release metadata with (RI_RELEASE_SIGNING_KEY). Replacing one
 *           changes nothing on any computer.
 *
 * The keys file (desktop/release-keys.json, uploaded to the feed as keys.json) is the
 * root's signed list of online keys, with a version that only goes up. Installations keep
 * the highest version they've seen and refuse an older one. It never expires: forgetting
 * to sign it again would stop every installation updating, which is worse for a
 * one-person publisher than what an expiry guards against. Release metadata expires.
 *
 *   keygen   The root key, the first online key and keys version 1. Once.
 *   rotate   A new online key and the next keys version, from the root key in a file.
 *            The key it replaces stays listed until the rotation after, unless --revoke.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KeyObject, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

/** The keys file every publish uploads. Committed, since only the root can change it. */
export const KEYS_FILE = fileURLToPath(new URL('./release-keys.json', import.meta.url));
const DEFAULT_DIR = path.join(os.homedir(), '.config/ri-release');

/** The public half of a key, PEM or KeyObject, private or public. */
const publicHalf = key => (key instanceof KeyObject && key.type === 'public' ? key : createPublicKey(key));
/** A key's id: the start of the SHA-256 of its public half. Envelopes name their key by it. */
export function keyId(key) {
  return createHash('sha256').update(publicHalf(key).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
}
const publicPem = key => publicHalf(key).export({ type: 'spki', format: 'pem' }).toString();

/** The root's public half, from a KeyObject or PEM text. Never a private key from text,
 * which would mean the root key was given to something that should only check it. */
export function rootPublicKey(value) {
  if (typeof value === 'string' && !value.trim().startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('The root key must be the Ed25519 PUBLIC key. The root private key never leaves your password manager.');
  const key = publicHalf(value);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('The root key must be an Ed25519 key');
  return key;
}

export function signEnvelope(value, privateKey) {
  const payload = Buffer.from(JSON.stringify(value));
  return { keyid: keyId(privateKey), payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('base64') };
}

/** The payload of an envelope signed by one of `keys` (id to public key). */
export function openEnvelope(value, keys, what = 'A file in the existing feed') {
  const key = keys.get(value?.keyid);
  if (!key) throw new Error(`${what} is signed by key ${value?.keyid ?? '(none)'}, which no keys file lists`);
  const bytes = Buffer.from(value.payload, 'base64');
  if (!verify(null, bytes, key, Buffer.from(value.signature, 'base64'))) throw new Error(`${what} has a bad signature`);
  return JSON.parse(bytes.toString('utf8'));
}

/** A keys file: these online keys, newest last, at this version, signed by the root. */
export function signKeys(version, publicKeys, rootPrivateKey) {
  return signEnvelope({ format: 1, version, keys: publicKeys.map(key => ({ id: keyId(key), publicKey: publicPem(key) })) }, rootPrivateKey);
}

/** The online keys a keys file lists, by id in its order, once its root signature checks. */
export function openKeys(value, root, what = 'The keys file') {
  const rootKey = rootPublicKey(root);
  if (value?.keyid !== keyId(rootKey)) throw new Error(`${what} is signed by key ${value?.keyid ?? '(none)'}, not the root key ${keyId(rootKey)}`);
  const body = openEnvelope(value, new Map([[keyId(rootKey), rootKey]]), what);
  if (body?.format !== 1 || !Number.isSafeInteger(body.version) || body.version < 1 || !Array.isArray(body.keys) || !body.keys.length) throw new Error(`${what} is malformed`);
  const keys = new Map();
  for (const entry of body.keys) {
    const key = createPublicKey(entry.publicKey);
    if (key.asymmetricKeyType !== 'ed25519' || keyId(key) !== entry.id || keys.has(entry.id)) throw new Error(`${what} lists a malformed key`);
    keys.set(entry.id, key);
  }
  return { version: body.version, keys, envelope: value };
}

const readJson = (file, missing) => {
  if (!fs.existsSync(file)) throw new Error(missing);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const shown = file => {
  const relative = path.relative(process.cwd(), file);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative;
  return file.startsWith(`${os.homedir()}/`) ? `~/${path.relative(os.homedir(), file)}` : file;
};
const writeKeysFile = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const writePrivate = (file, key) => fs.writeFileSync(file, key.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });

/** The keys file in this checkout, checked against the root. */
export function readKeysFile(file, root) {
  return openKeys(readJson(file, `There is no ${shown(file)} yet. Run pnpm release:keygen first (docs/publishing.md, "The first release").`), root, shown(file));
}

/** First-time setup: the root key, the first online key and keys version 1. */
export function keygen({ dir = DEFAULT_DIR, keysFile = KEYS_FILE } = {}) {
  const rootFile = path.join(dir, 'release-root.pem');
  if (fs.existsSync(keysFile)) throw new Error(`${shown(keysFile)} already exists, signed by the root key every installation trusts. To replace the signing key, run pnpm release:rotate.`);
  if (fs.existsSync(rootFile)) throw new Error(`${shown(rootFile)} already exists. A new root key would orphan every installation that trusts the old one.`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const root = generateKeyPairSync('ed25519');
  const online = generateKeyPairSync('ed25519');
  const rootPublicFile = path.join(dir, 'release-root-public.pem');
  const onlineFile = path.join(dir, `release-signing-${keyId(online.publicKey)}.pem`);
  writePrivate(rootFile, root.privateKey);
  fs.writeFileSync(rootPublicFile, publicPem(root.publicKey), { mode: 0o644, flag: 'wx' });
  writePrivate(onlineFile, online.privateKey);
  writeKeysFile(keysFile, signKeys(1, [online.publicKey], root.privateKey));
  return { rootFile, rootPublicFile, onlineFile, keysFile, rootId: keyId(root.publicKey), onlineId: keyId(online.publicKey) };
}

/** A new online key and the next keys version. Keeps the newest key already listed, the
 * one being replaced, so what it signed stays valid until the feed is signed again, and
 * leaves out older ones and any in `revoke`. */
export function rotate({ rootKeyFile = path.join(DEFAULT_DIR, 'release-root.pem'), dir = DEFAULT_DIR, keysFile = KEYS_FILE, revoke = /** @type {string[]} */ ([]) } = {}) {
  if (!fs.existsSync(rootKeyFile)) throw new Error(`No root key at ${shown(rootKeyFile)}. Copy it there from your password manager, or give --root-key.`);
  const root = createPrivateKey(fs.readFileSync(rootKeyFile, 'utf8'));
  if (root.asymmetricKeyType !== 'ed25519') throw new Error('The root key must be an Ed25519 key');
  const envelope = readJson(keysFile, `There is no ${shown(keysFile)} to rotate. Run pnpm release:keygen first.`);
  let current;
  try { current = openKeys(envelope, createPublicKey(root), shown(keysFile)); }
  catch (error) { throw new Error(`${error.message}. Is ${shown(rootKeyFile)} the root key from pnpm release:keygen?`); }
  const listed = [...current.keys.keys()];
  for (const id of revoke) if (!current.keys.has(id)) throw new Error(`Key ${id} isn't in keys version ${current.version}, which lists ${listed.join(', ')}`);
  const newest = listed.at(-1);
  const kept = revoke.includes(newest) ? [] : [newest];
  const online = generateKeyPairSync('ed25519');
  const onlineId = keyId(online.publicKey);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const onlineFile = path.join(dir, `release-signing-${onlineId}.pem`);
  writePrivate(onlineFile, online.privateKey);
  const version = current.version + 1;
  writeKeysFile(keysFile, signKeys(version, [...kept.map(id => current.keys.get(id)), online.publicKey], root));
  return { version, onlineId, onlineFile, keysFile, kept, left: listed.filter(id => !kept.includes(id)), revoked: revoke };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [command] = process.argv.slice(2);
  const { values: v } = parseArgs({ args: process.argv.slice(3), options: {
    dir: { type: 'string' }, keys: { type: 'string' }, 'root-key': { type: 'string' }, revoke: { type: 'string', multiple: true },
  } });
  const dir = v.dir ? path.resolve(v.dir) : DEFAULT_DIR;
  const keysFile = v.keys ? path.resolve(v.keys) : KEYS_FILE;
  if (command === 'keygen') {
    const made = keygen({ dir, keysFile });
    console.info(`Root key:         ${shown(made.rootFile)}
Root public key:  ${shown(made.rootPublicFile)}
Signing key:      ${shown(made.onlineFile)}
Keys file:        ${shown(made.keysFile)}, version 1, listing ${made.onlineId}

1. Save the root key in your password manager now, then delete ${shown(made.rootFile)}.
   Every installation trusts it for good. Losing it means no more updates for anyone,
   and leaking it lets someone else ship them. You need it again only to rotate.
2. Add the root public key and the signing key to the repository:
     gh variable set RI_RELEASE_PUBLIC_KEY < ${shown(made.rootPublicFile)}
     gh secret set RI_RELEASE_SIGNING_KEY --env release < ${shown(made.onlineFile)}
   The second needs the release environment (docs/publishing.md, "The first release").
   Then delete the signing key file. The secret is its only copy, and replacing it is
   one rotation away.
3. Commit ${shown(made.keysFile)}.`);
  } else if (command === 'rotate') {
    const rootKeyFile = v['root-key'] ? path.resolve(v['root-key']) : path.join(DEFAULT_DIR, 'release-root.pem');
    const made = rotate({ rootKeyFile, dir, keysFile, revoke: v.revoke ?? [] });
    const listing = [`${made.onlineId} (new)`, ...made.kept].join(' and ');
    console.info(`Keys version ${made.version} lists ${listing}.${made.left.length ? ` Left out: ${made.left.join(', ')}.` : ''}
Signing key: ${shown(made.onlineFile)}

1. Commit the keys file and push it to main:
     git commit -m "Rotate the release signing key" ${shown(made.keysFile)} && git push
2. Replace the signing key, then delete ${shown(made.onlineFile)}:
     gh secret set RI_RELEASE_SIGNING_KEY --env release < ${shown(made.onlineFile)}
3. Put the root key back in your password manager and delete ${shown(rootKeyFile)}.
${made.revoked.length
    ? `4. Sign the feed again now, so computers stop trusting ${made.revoked.join(', ')} at their next check:
     gh workflow run release.yml -f action=refresh`
    : 'The next publish, or Monday\'s refresh, puts the new keys on the feed. Nothing changes on any computer.'}`);
  } else throw new Error('Use keygen or rotate');
}

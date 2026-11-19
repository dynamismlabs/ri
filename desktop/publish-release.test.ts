import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { feedAddress, promote, publish, refresh, signer, withdraw, writeInstallScript } from './publish-release.mjs';
import { keyId, openEnvelope, signEnvelope, signKeys } from './release-keys.mjs';
import { ReleaseSchema, verifyRelease, verifyReleaseKeys } from '../src/lib/service/release-trust';
import { CURRENT_COMPATIBILITY } from '../src/lib/releases/compatibility';

let root: string;
let repo: string;
let keysFile: string;
const pem = (key: KeyObject) => (key.type === 'public' ? key : createPublicKey(key)).export({ type: 'spki', format: 'pem' }).toString();
const rootPair = generateKeyPairSync('ed25519');
const rootKey = pem(rootPair.publicKey);
const { privateKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519').privateKey;
const now = Date.parse('2026-11-07T12:00:00Z');
const hash = (letter: string) => letter.repeat(64);
const payload = (version: string, platform = process.platform, arch = process.arch) => ({
  version, platform, arch, minimumUpdater: 1, apiProtocol: 1, configFormat: 1, migrationHistory: hash('b'),
  runtime: { id: hash('a'), url: `https://example.test/v${version}/runtime.tar.gz`, sha256: hash('c'), size: 100, unpackedSize: 1000 },
  compatibility: CURRENT_COMPATIBILITY,
});
const read = (folder: string, name: string) => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
const open = (folder: string, name: string) => read(folder, `${name}-${process.platform}-${process.arch}.json`);
/** The keys file in "the checkout", signed by the root. */
const writeKeys = (version: number, keys: KeyObject[], by = rootPair.privateKey) => fs.writeFileSync(keysFile, JSON.stringify(signKeys(version, keys, by)));
const by = (existing: string | null = null, key = privateKey) => signer({ key, rootKey, keysFile, existing });
/** What a computer trusts after reading this folder's keys.json. */
const trust = (folder: string) => verifyReleaseKeys(read(folder, 'keys.json'), rootKey);
const check = (folder: string, name: string, channel: 'stable' | 'latest', minimum = 0, at = now) => verifyRelease(open(folder, name), { keys: trust(folder), channel }, minimum, at);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-publish-'));
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-publish-repo-'));
  keysFile = path.join(repo, 'release-keys.json');
  writeKeys(1, [privateKey]);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); });

it('writes a file per channel and version that a client accepts', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now, notes: 'What changed' });
  const release = check(root, 'latest', 'latest');
  expect(ReleaseSchema.parse(release)).toMatchObject({ version: '0.2.0', channel: 'latest', sequence: 5, withdrawn: false, notes: 'What changed' });
  expect(check(root, '0.2.0', 'latest').version).toBe('0.2.0');
  expect(fs.existsSync(path.join(root, `stable-${process.platform}-${process.arch}.json`))).toBe(false);
  // Each file names the key that signed it, and the keys file goes up beside them.
  expect(open(root, 'latest').keyid).toBe(keyId(privateKey));
  expect(read(root, 'keys.json')).toEqual(read(repo, 'release-keys.json'));
});

it('puts a stable release on latest too, since latest gets every release', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'stable', by: by(), out: root, sequence: 5, now });
  expect(check(root, 'stable', 'stable').version).toBe('0.2.0');
  expect(check(root, 'latest', 'latest').version).toBe('0.2.0');
});

it('refuses to publish a version twice, since a client that has it wouldn\'t move', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  expect(() => publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(root), out: path.join(root, 'next'), existing: root, sequence: 6, now })).toThrow('already published');
});

it('keeps a signed index of versions, newest first, for finding a bridge', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  const next = path.join(root, 'next');
  publish({ payloads: [payload('0.10.0')], channel: 'latest', by: by(root), out: next, existing: root, sequence: 6, now });
  expect(openEnvelope(open(next, 'index'), trust(next).keys).versions.map((item: { version: string }) => item.version)).toEqual(['0.10.0', '0.2.0']);
});

it('refuses a feed file signed by a key no keys file lists', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  // Someone else's key, listed nowhere: the feed's own keys file is gone, and the checkout's lists only the new key.
  writeKeys(2, [other]);
  fs.rmSync(path.join(root, 'keys.json'));
  expect(() => publish({ payloads: [payload('0.3.0')], channel: 'latest', by: by(root, other), out: path.join(root, 'next'), existing: root, sequence: 6, now })).toThrow(`signed by key ${keyId(privateKey)}, which no keys file lists`);
  // A forged signature under a listed key's id.
  writeKeys(2, [privateKey]);
  const forged = { ...signEnvelope({ format: 1, versions: [] }, other), keyid: keyId(privateKey) };
  fs.writeFileSync(path.join(root, `index-${process.platform}-${process.arch}.json`), JSON.stringify(forged));
  expect(() => publish({ payloads: [payload('0.3.0')], channel: 'latest', by: by(root), out: path.join(root, 'next'), existing: root, sequence: 6, now })).toThrow('bad signature');
});

it('promotes a version to stable with a newer sequence', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  const next = path.join(root, 'next');
  expect(promote({ existing: root, version: '0.2.0', by: by(root), out: next, sequence: 6, now })).toBe(1);
  expect(check(next, 'stable', 'stable', 5)).toMatchObject({ version: '0.2.0', sequence: 6 });
  expect(() => promote({ existing: root, version: '9.9.9', by: by(root), out: next, sequence: 7, now })).toThrow('not on this feed');
});

it('refreshes the expiry, so a client past the old one still accepts it, and changes nothing else', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now, days: 1 });
  const later = now + 5 * 86_400_000;
  expect(() => check(root, 'latest', 'latest', 0, later)).toThrow('expired');
  const next = path.join(root, 'next');
  refresh({ existing: root, by: by(root), out: next, now: later, days: 30 });
  expect(check(next, 'latest', 'latest', 0, later)).toMatchObject({ version: '0.2.0', sequence: 5 });
  expect(openEnvelope(open(next, 'index'), trust(next).keys).versions).toHaveLength(1);
});

it('withdraws a version, so a client refuses it', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  const next = path.join(root, 'next');
  expect(withdraw({ existing: root, version: '0.2.0', by: by(root), out: next, sequence: 6, now })).toBe(2);
  expect(() => check(next, 'latest', 'latest')).toThrow('withdrawn');
});

it('writes this feed and the root public key into the install script, never a signing key', () => {
  const template = path.join(root, 'template.sh');
  fs.writeFileSync(template, 'FEED="__RI_FEED__"\nKEY="__RI_ROOT_KEY_BASE64__"\n');
  writeInstallScript({ template, feed: 'https://example.test/feed/', rootKey: by().root, out: root });
  const script = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  expect(script).toContain('FEED="https://example.test/feed/"');
  expect(Buffer.from(/KEY="([^"]+)"/.exec(script)![1], 'base64').toString()).toBe(rootKey);
  expect(script).not.toContain('PRIVATE');
});

it('promotes exactly the version named, not a prerelease of it', () => {
  publish({ payloads: [payload('0.2.0-rc.1')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 6, now });
  const out = path.join(root, 'next');
  expect(promote({ existing: root, version: '0.2.0', by: by(root), out, sequence: 7, now })).toBe(1);
  expect(check(out, 'stable', 'stable').version).toBe('0.2.0');
});

it('leaves the feed\'s unsigned files alone when refreshing, withdrawing or promoting', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  // The website's downloads lists and the install script share the feed release.
  fs.writeFileSync(path.join(root, 'downloads-latest.json'), JSON.stringify({ format: 1, channel: 'latest', version: '0.2.0' }));
  fs.writeFileSync(path.join(root, 'install.sh'), '#!/bin/sh\n');
  const refreshed = path.join(root, 'refreshed');
  expect(refresh({ existing: root, by: by(root), out: refreshed, now })).toBe(3);
  expect(fs.readdirSync(refreshed).some(name => name.startsWith('downloads-'))).toBe(false);
  const withdrawn = path.join(root, 'withdrawn');
  expect(withdraw({ existing: root, version: '0.2.0', by: by(root), out: withdrawn, sequence: 6, now })).toBe(2);
  expect(fs.readdirSync(withdrawn).sort()).toEqual([`0.2.0-${process.platform}-${process.arch}.json`, 'keys.json', `latest-${process.platform}-${process.arch}.json`]);
  expect(promote({ existing: root, version: '0.2.0', by: by(root), out: path.join(root, 'promoted'), sequence: 7, now })).toBe(1);
});

it('writes the feed at releases.ri.app into the install script, which only redirects to GitHub', () => {
  expect(feedAddress('https://releases.ri.app')).toBe('https://releases.ri.app/');
  expect(feedAddress('https://releases.ri.app/')).toBe('https://releases.ri.app/');
  for (const bad of ['http://releases.ri.app/', 'https://user:pass@releases.ri.app/', 'https://releases.ri.app/?x=1']) expect(() => feedAddress(bad)).toThrow('plain HTTPS');
  const template = path.join(root, 'template.sh');
  fs.writeFileSync(template, 'FEED="${RI_INSTALL_FEED:-__RI_FEED__}"\n');
  writeInstallScript({ template, feed: 'https://releases.ri.app', rootKey, out: root });
  expect(fs.readFileSync(path.join(root, 'install.sh'), 'utf8')).toBe('FEED="${RI_INSTALL_FEED:-https://releases.ri.app/}"\n');
});

it('refuses to sign with a key the keys file doesn\'t list, and says how to fix it', () => {
  expect(() => by(null, other)).toThrow(`The signing key (RI_RELEASE_SIGNING_KEY) is ${keyId(other)}, which keys version 1 doesn't list. It lists ${keyId(privateKey)}.`);
  expect(() => by(null, other)).toThrow('pnpm release:rotate');
  expect(() => signer({ key: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, rootKey, keysFile })).toThrow('Ed25519');
});

it('refuses a keys file the root key didn\'t sign, or that was changed after', () => {
  writeKeys(1, [privateKey], generateKeyPairSync('ed25519').privateKey);
  expect(() => by()).toThrow('not the root key');
  writeKeys(1, [privateKey]);
  const signed = read(repo, 'release-keys.json');
  const listing = JSON.parse(Buffer.from(signed.payload, 'base64').toString());
  fs.writeFileSync(keysFile, JSON.stringify({ ...signed, payload: Buffer.from(JSON.stringify({ ...listing, keys: [...listing.keys, { id: keyId(other), publicKey: pem(other) }] })).toString('base64') }));
  expect(() => by()).toThrow('bad signature');
});

it('takes only the root\'s public key, and says when there is no keys file yet', () => {
  expect(() => signer({ key: privateKey, rootKey: rootPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), keysFile })).toThrow('PUBLIC');
  fs.rmSync(keysFile);
  expect(() => by()).toThrow('pnpm release:keygen');
});

it('uses the newer keys file of the checkout\'s and the feed\'s, so the feed\'s never goes back', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'latest', by: by(), out: root, sequence: 5, now });
  // The feed has keys version 2, from a checkout ahead of this one.
  fs.writeFileSync(path.join(root, 'keys.json'), JSON.stringify(signKeys(2, [privateKey, other], rootPair.privateKey)));
  const next = path.join(root, 'next');
  publish({ payloads: [payload('0.3.0')], channel: 'latest', by: by(root), out: next, existing: root, sequence: 6, now });
  expect(trust(next).version).toBe(2);
  // Two different lists can't share a version.
  fs.writeFileSync(path.join(root, 'keys.json'), JSON.stringify(signKeys(1, [privateKey, other], rootPair.privateKey)));
  expect(() => by(root)).toThrow('both version 1 but differ');
});

it('signs again what a revoked key signed, so the feed is whole after the run', () => {
  publish({ payloads: [payload('0.2.0')], channel: 'stable', by: by(), out: root, sequence: 5, now });
  // A plain rotation lists both keys, so what the old one signed stays as it is.
  writeKeys(2, [privateKey, other]);
  const rotated = path.join(root, 'rotated');
  publish({ payloads: [payload('0.3.0')], channel: 'latest', by: by(root, other), out: rotated, existing: root, sequence: 6, now });
  expect(fs.existsSync(path.join(rotated, `stable-${process.platform}-${process.arch}.json`))).toBe(false);
  for (const name of fs.readdirSync(rotated).filter(file => file !== 'keys.json')) fs.copyFileSync(path.join(rotated, name), path.join(root, name));
  fs.copyFileSync(path.join(rotated, 'keys.json'), path.join(root, 'keys.json'));
  expect(check(root, 'stable', 'stable').version).toBe('0.2.0');
  expect(check(root, 'latest', 'latest').version).toBe('0.3.0');
  // Revoking the old key leaves it out, and the next run moves everything it signed to the new key.
  writeKeys(3, [other]);
  const revoked = path.join(root, 'revoked');
  promote({ existing: root, version: '0.3.0', by: by(root, other), out: revoked, sequence: 7, now });
  expect(fs.readdirSync(revoked).sort()).toEqual([`0.2.0-${process.platform}-${process.arch}.json`, 'keys.json', `stable-${process.platform}-${process.arch}.json`]);
  for (const name of fs.readdirSync(revoked)) fs.copyFileSync(path.join(revoked, name), path.join(root, name));
  const keys = trust(root);
  expect([...keys.keys.keys()]).toEqual([keyId(other)]);
  for (const name of fs.readdirSync(root).filter(file => /-(darwin|linux)-/.test(file))) expect(read(root, name).keyid).toBe(keyId(other));
  expect(verifyRelease(open(root, '0.2.0'), { keys, channel: 'stable' }, 0, now).version).toBe('0.2.0');
  expect(check(root, 'stable', 'stable').version).toBe('0.3.0');
});

it('refuses from the command line, before writing anything, when the signing key isn\'t listed', () => {
  const script = path.join(__dirname, 'publish-release.mjs');
  const env = (key: KeyObject) => ({ ...process.env, RI_RELEASE_PUBLIC_KEY: rootKey, RI_RELEASE_SIGNING_KEY: key.export({ type: 'pkcs8', format: 'pem' }).toString() });
  const listed = spawnSync(process.execPath, [script, 'check', '--keys', keysFile], { env: env(privateKey), encoding: 'utf8' });
  expect(listed.stdout).toContain(`Signing key ${keyId(privateKey)} is listed in keys version 1.`);
  expect(listed.status).toBe(0);
  const unlisted = spawnSync(process.execPath, [script, 'check', '--keys', keysFile], { env: env(other), encoding: 'utf8' });
  expect(unlisted.status).not.toBe(0);
  expect(unlisted.stderr).toContain('doesn\'t list');
  const payloads = path.join(root, 'payloads');
  fs.mkdirSync(payloads);
  fs.writeFileSync(path.join(payloads, 'a.payload.json'), JSON.stringify(payload('0.2.0')));
  const out = path.join(root, 'out');
  const refused = spawnSync(process.execPath, [script, 'publish', '--keys', keysFile, '--payloads', payloads, '--out', out], { env: env(other), encoding: 'utf8' });
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toContain('pnpm release:rotate');
  expect(fs.existsSync(out)).toBe(false);
});

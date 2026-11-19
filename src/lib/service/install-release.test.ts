/** What the install script's last step trusts (scripts/install.sh): the root key it
 * carries vouches for the feed's keys, and a listed key for the release. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrivateKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { keygen, signEnvelope, signKeys } from '../../../desktop/release-keys.mjs';
import { installPublishedRelease } from './install-release';
import { releasePolicyFile, seenKeysVersion } from './release-trust';
import { writeRuntimeFixture } from './runtime-fixture';
import { getRuntimeBaseDir } from './paths';

let root: string;
let resources: string;
let rootKey: string;
let rootPrivate: KeyObject;
let online: KeyObject;
let keysEnvelope: unknown;
let manifest: ReturnType<typeof writeRuntimeFixture>;
const releaseFor = (change: Record<string, unknown> = {}) => ({
  format: 1, sequence: 5, version: '0.2.0', channel: 'stable', publishedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  platform: process.platform, arch: process.arch, minimumUpdater: 1, apiProtocol: 1, configFormat: 1, withdrawn: false, notes: '', migrationHistory: 'b'.repeat(64),
  runtime: { id: manifest.id, url: 'https://feed.test/runtime.tar.gz', sha256: 'c'.repeat(64), size: 100, unpackedSize: 1000 }, ...change,
});
const policyIn = (key: string) => fs.writeFileSync(path.join(resources, 'release-policy.json'), JSON.stringify({ format: 2, feed: 'https://feed.test/', rootKey: key }));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-install-release-'));
  vi.stubEnv('RI_ROOT', path.join(root, 'home'));
  vi.stubEnv('RI_INSTALL_ROOT', path.join(root, 'installed'));
  vi.stubEnv('RI_COMMAND_DIR', path.join(root, 'bin'));
  const keysFile = path.join(root, 'release-keys.json');
  const made = keygen({ dir: path.join(root, 'keys'), keysFile });
  rootKey = fs.readFileSync(made.rootPublicFile, 'utf8');
  rootPrivate = createPrivateKey(fs.readFileSync(made.rootFile, 'utf8'));
  online = createPrivateKey(fs.readFileSync(made.onlineFile, 'utf8'));
  keysEnvelope = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
  resources = path.join(root, 'download');
  manifest = writeRuntimeFixture(resources, { version: '0.2.0' });
  policyIn(rootKey);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('installs a release a listed key signed, pins its root and remembers the keys version', () => {
  const installed = installPublishedRelease(resources, signEnvelope(releaseFor(), online), keysEnvelope, rootKey);
  expect(installed).toMatchObject({ version: '0.2.0', id: manifest.id, launcher: { installed: true } });
  expect(JSON.parse(fs.readFileSync(releasePolicyFile(), 'utf8'))).toEqual({ format: 2, feed: 'https://feed.test/', rootKey });
  expect(seenKeysVersion()).toBe(1);
});

it('installs nothing when the root key the script carries didn\'t sign the keys', () => {
  const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
  expect(() => installPublishedRelease(resources, signEnvelope(releaseFor(), online), keysEnvelope, other)).toThrow('not signed by the root key');
  expect(fs.existsSync(getRuntimeBaseDir()) && fs.readdirSync(getRuntimeBaseDir()).length).toBeFalsy();
});

it('installs nothing signed by a key the keys file doesn\'t list', () => {
  const stranger = generateKeyPairSync('ed25519').privateKey;
  expect(() => installPublishedRelease(resources, signEnvelope(releaseFor(), stranger), keysEnvelope, rootKey)).toThrow('does not list');
  expect(fs.existsSync(releasePolicyFile())).toBe(false);
});

it('refuses older keys than this computer has seen, as when installing again', () => {
  installPublishedRelease(resources, signEnvelope(releaseFor(), online), signKeys(4, [online], rootPrivate), rootKey);
  expect(seenKeysVersion()).toBe(4);
  expect(() => installPublishedRelease(resources, signEnvelope(releaseFor(), online), keysEnvelope, rootKey)).toThrow('roll back');
});

it('refuses a release that trusts another root than the script does', () => {
  policyIn(generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString());
  expect(() => installPublishedRelease(resources, signEnvelope(releaseFor(), online), keysEnvelope, rootKey)).toThrow('different publisher');
  expect(seenKeysVersion()).toBe(0);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { keyId, keygen, openKeys, rotate } from './release-keys.mjs';

// Every key here is made in a temporary folder and removed after each test.
let dir: string;
let keysFile: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-release-keys-'));
  keysFile = path.join(dir, 'repo', 'release-keys.json');
  fs.mkdirSync(path.dirname(keysFile));
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const keysDir = () => path.join(dir, 'keys');
const listed = (rootPublic: string) => {
  const keys = openKeys(JSON.parse(fs.readFileSync(keysFile, 'utf8')), rootPublic);
  return { version: keys.version, ids: [...keys.keys.keys()] };
};
const mode = (file: string) => fs.statSync(file).mode & 0o777;

it('makes the root key, the first signing key and keys version 1, once', () => {
  const made = keygen({ dir: keysDir(), keysFile });
  const rootPublic = fs.readFileSync(made.rootPublicFile, 'utf8');
  expect(listed(rootPublic)).toEqual({ version: 1, ids: [made.onlineId] });
  expect(keyId(createPrivateKey(fs.readFileSync(made.onlineFile, 'utf8')))).toBe(made.onlineId);
  expect(keyId(rootPublic)).toBe(made.rootId);
  expect(rootPublic).toMatch(/^-----BEGIN PUBLIC KEY-----/);
  expect([mode(made.rootFile), mode(made.onlineFile)]).toEqual([0o600, 0o600]);
  // A second run would orphan every installation that trusts the first root.
  expect(() => keygen({ dir: keysDir(), keysFile })).toThrow('already exists');
  fs.rmSync(keysFile);
  expect(() => keygen({ dir: keysDir(), keysFile })).toThrow('orphan every installation');
});

it('rotates: the replaced key stays listed until the rotation after, and older ones go', () => {
  const first = keygen({ dir: keysDir(), keysFile });
  const rootPublic = fs.readFileSync(first.rootPublicFile, 'utf8');
  const second = rotate({ rootKeyFile: first.rootFile, dir: keysDir(), keysFile });
  expect(listed(rootPublic)).toEqual({ version: 2, ids: [first.onlineId, second.onlineId] });
  expect(second).toMatchObject({ kept: [first.onlineId], left: [] });
  const third = rotate({ rootKeyFile: first.rootFile, dir: keysDir(), keysFile });
  expect(listed(rootPublic)).toEqual({ version: 3, ids: [second.onlineId, third.onlineId] });
  expect(third).toMatchObject({ kept: [second.onlineId], left: [first.onlineId] });
  expect(mode(third.onlineFile)).toBe(0o600);
});

it('revokes a key by leaving it out of the next keys version', () => {
  const first = keygen({ dir: keysDir(), keysFile });
  const rootPublic = fs.readFileSync(first.rootPublicFile, 'utf8');
  const next = rotate({ rootKeyFile: first.rootFile, dir: keysDir(), keysFile, revoke: [first.onlineId] });
  expect(listed(rootPublic)).toEqual({ version: 2, ids: [next.onlineId] });
  expect(next).toMatchObject({ kept: [], left: [first.onlineId], revoked: [first.onlineId] });
  expect(() => rotate({ rootKeyFile: first.rootFile, dir: keysDir(), keysFile, revoke: ['0123456789abcdef'] })).toThrow(`Key 0123456789abcdef isn't in keys version 2, which lists ${next.onlineId}`);
});

it('refuses to rotate with a key that isn\'t the root, or with no root key at hand', () => {
  const first = keygen({ dir: keysDir(), keysFile });
  const before = fs.readFileSync(keysFile, 'utf8');
  const wrong = path.join(dir, 'wrong.pem');
  fs.writeFileSync(wrong, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
  expect(() => rotate({ rootKeyFile: wrong, dir: keysDir(), keysFile })).toThrow('not the root key');
  expect(() => rotate({ rootKeyFile: first.onlineFile, dir: keysDir(), keysFile })).toThrow('Is ');
  expect(() => rotate({ rootKeyFile: path.join(dir, 'missing.pem'), dir: keysDir(), keysFile })).toThrow('password manager');
  expect(fs.readFileSync(keysFile, 'utf8')).toBe(before);
});

it('prints the exact commands for the repository, from pnpm release:keygen and pnpm release:rotate', () => {
  const script = path.join(__dirname, 'release-keys.mjs');
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args, '--dir', keysDir(), '--keys', keysFile], { encoding: 'utf8' });
  const made = run('keygen');
  expect(made.status).toBe(0);
  const signing = fs.readdirSync(keysDir()).find(name => name.startsWith('release-signing-'))!;
  expect(made.stdout).toContain(`gh variable set RI_RELEASE_PUBLIC_KEY < ${path.join(keysDir(), 'release-root-public.pem')}`);
  expect(made.stdout).toContain(`gh secret set RI_RELEASE_SIGNING_KEY --env release < ${path.join(keysDir(), signing)}`);
  expect(made.stdout).toContain('password manager');
  const rotated = run('rotate', '--root-key', path.join(keysDir(), 'release-root.pem'));
  expect(rotated.status).toBe(0);
  const next = fs.readdirSync(keysDir()).find(name => name.startsWith('release-signing-') && name !== signing)!;
  expect(rotated.stdout).toContain('Keys version 2 lists');
  expect(rotated.stdout).toContain(`gh secret set RI_RELEASE_SIGNING_KEY --env release < ${path.join(keysDir(), next)}`);
  expect(rotated.stdout).toContain(`git commit -m "Rotate the release signing key" ${keysFile}`);
  const revoked = run('rotate', '--root-key', path.join(keysDir(), 'release-root.pem'), '--revoke', next.slice('release-signing-'.length, -'.pem'.length));
  expect(revoked.status).toBe(0);
  expect(revoked.stdout).toContain('gh workflow run release.yml -f action=refresh');
});

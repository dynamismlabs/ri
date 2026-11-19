import { generateKeyPairSync, sign } from 'node:crypto';
import { expect, it } from 'vitest';
import { releaseKeyId, verifyRelease, verifyReleaseKeys, type ReleaseKeys } from './release-trust';
const root = generateKeyPairSync('ed25519');
const pair = generateKeyPairSync('ed25519');
const pem = (key: typeof pair.publicKey) => key.export({ format: 'pem', type: 'spki' }).toString();
const rootKey = pem(root.publicKey);
const now = Date.now();
const release = { format: 1, sequence: 2, version: '0.2.0', channel: 'stable', publishedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 86400000).toISOString(), platform: process.platform, arch: process.arch, minimumUpdater: 1, apiProtocol: 1, configFormat: 1, withdrawn: false, notes: 'Test release', migrationHistory: 'a'.repeat(64), runtime: { id: 'b'.repeat(64), url: 'https://releases.example/runtime.tar.gz', sha256: 'c'.repeat(64), size: 10, unpackedSize: 100 } };
function signed(value: unknown, key = pair.privateKey, keyid = releaseKeyId(key)) { const bytes = Buffer.from(JSON.stringify(value)); return { keyid, payload: bytes.toString('base64'), signature: sign(null, bytes, key).toString('base64') }; }
function envelope(change = {}) { return signed({ ...release, ...change }); }
const listing = (version: number, ...keys: (typeof pair.publicKey)[]) => ({ format: 1, version, keys: keys.map(key => ({ id: releaseKeyId(key), publicKey: pem(key) })) });
const keys: ReleaseKeys = verifyReleaseKeys(signed(listing(1, pair.publicKey), root.privateKey), rootKey);

it('accepts only matching, current publisher-authenticated releases', () => {
  expect(verifyRelease(envelope(), { keys, channel: 'stable' }, 1, now).sequence).toBe(2);
});
it('rejects tampering and a key the root never listed', () => {
  const e = envelope(); e.payload = Buffer.from(JSON.stringify({ ...release, version: '9.9.9' })).toString('base64');
  expect(() => verifyRelease(e, { keys, channel: 'stable' }, 1, now)).toThrow('signature');
  const other = generateKeyPairSync('ed25519').privateKey;
  expect(() => verifyRelease(signed(release, other), { keys, channel: 'stable' }, 1, now)).toThrow('does not list');
  expect(() => verifyRelease({ ...envelope(), keyid: undefined }, { keys, channel: 'stable' }, 1, now)).toThrow();
});
it.each([
  [{ sequence: 1 }, 'downgrade'], [{ expiresAt: new Date(now - 1).toISOString() }, 'expired'],
  [{ withdrawn: true }, 'withdrawn'], [{ arch: process.arch === 'arm64' ? 'x64' : 'arm64' }, 'match'],
  [{ minimumUpdater: 2 }, 'Invalid literal'], [{ runtime: { ...release.runtime, url: 'http://insecure.example/file' } }, 'Invalid input'],
])('rejects ineligible metadata %j', (change, error) => {
  expect(() => verifyRelease(envelope(change), { keys, channel: 'stable' }, 2, now)).toThrow(error);
});
it('takes keys only from the root, never older than the newest seen, and only as listed', () => {
  expect(verifyReleaseKeys(signed(listing(3, pair.publicKey), root.privateKey), rootKey, 3).version).toBe(3);
  expect(() => verifyReleaseKeys(signed(listing(2, pair.publicKey), root.privateKey), rootKey, 3)).toThrow('roll back');
  expect(() => verifyReleaseKeys(signed(listing(1, pair.publicKey), pair.privateKey), rootKey)).toThrow('not signed by the root key');
  expect(() => verifyReleaseKeys(signed(listing(1, pair.publicKey), pair.privateKey, releaseKeyId(root.publicKey)), rootKey)).toThrow('signature');
  // An id that isn't its key's, a key listed twice, or a key of another kind.
  const mislabeled = { format: 1, version: 1, keys: [{ id: releaseKeyId(root.publicKey), publicKey: pem(pair.publicKey) }] };
  expect(() => verifyReleaseKeys(signed(mislabeled, root.privateKey), rootKey)).toThrow('malformed');
  expect(() => verifyReleaseKeys(signed(listing(1, pair.publicKey, pair.publicKey), root.privateKey), rootKey)).toThrow('malformed');
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey;
  expect(() => verifyReleaseKeys(signed(listing(1, ec), root.privateKey), rootKey)).toThrow('malformed');
  expect(() => verifyReleaseKeys(signed({ format: 1, version: 1, keys: [] }, root.privateKey), rootKey)).toThrow();
});

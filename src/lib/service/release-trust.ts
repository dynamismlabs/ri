import fs from 'node:fs';
import path from 'node:path';
import { KeyObject, createHash, createPublicKey, verify } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { atomicWriteFile } from '@/lib/config/atomic-write';
import { getRuntimeBaseDir } from './paths';
import { readOrigin, writeOrigin } from './origin';
import { UpdatePreferencesSchema, type ReleasePreferences } from './update-settings';
import { RuntimeCompatibilitySchema } from '@/lib/releases/compatibility';

const httpsUrl = z.string().url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ReleaseSchema = z.object({
  format: z.literal(1), sequence: z.number().int().positive(), version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/),
  channel: z.enum(['stable', 'latest']), publishedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  platform: z.enum(['darwin', 'linux']), arch: z.enum(['arm64', 'x64']), minimumUpdater: z.literal(1),
  apiProtocol: z.literal(1), configFormat: z.literal(1), withdrawn: z.boolean(), notes: z.string().max(10000),
  // Exact migration-prefix checks against the target's signed files are the
  // schema compatibility contract. Baseline squashes require a bridge release.
  migrationHistory: digest,
  // `id` says what the app's own part is, so an unchanged one isn't downloaded again (section 4.2).
  shell: z.object({ url: httpsUrl, sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/), size: z.number().int().positive().max(4 * 1024 ** 3), id: digest.optional() }).strict().optional(),
  runtime: z.object({ id: digest, url: httpsUrl, sha256: digest, size: z.number().int().positive().max(4 * 1024 ** 3), unpackedSize: z.number().int().positive().max(16 * 1024 ** 3) }).strict(),
  /** What it can talk to, so a connected computer can tell before downloading (section 7.7). */
  compatibility: RuntimeCompatibilitySchema.optional(),
}).strict();
export type Release = z.infer<typeof ReleaseSchema>;
/** What a release ships: where to look and the root key to trust. Neither ever
 * changes on a computer. The root key signs the list of keys that sign releases
 * (docs/publishing.md, "Signing keys"). The person's choices live in the origin. */
const ReleasePolicySchema = z.object({ format: z.literal(2), feed: httpsUrl, rootKey: z.string().min(1).max(16000) }).strict();
export type ReleasePolicy = z.infer<typeof ReleasePolicySchema> & ReleasePreferences;

/** A file on the feed by its whole name. */
export function feedUrl(policy: Pick<ReleasePolicy, 'feed'>, name: string) {
  return new URL(name, policy.feed.endsWith('/') ? policy.feed : `${policy.feed}/`).href;
}
/** One file per channel and platform, one per version and platform, and an
 * index of the versions kept (docs/publishing.md). */
export function feedFile(policy: Pick<ReleasePolicy, 'feed'>, name: string, platform: string = process.platform, arch: string = process.arch) {
  return feedUrl(policy, `${name}-${platform}-${arch}.json`);
}

/** One per computer, like the store: the first release staged here brings it. */
export function releasePolicyFile(base = getRuntimeBaseDir()) { return path.join(/* turbopackIgnore: true */ base, 'release-policy.json'); }

export function releasePolicy(): ReleasePolicy | null {
  const file = releasePolicyFile();
  if (!fs.existsSync(/* turbopackIgnore: true */ file)) return null;
  return { ...ReleasePolicySchema.parse(JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8'))), ...releasePreferences() };
}
export function releasePreferences(): ReleasePreferences {
  const origin = readOrigin();
  return { channel: origin.channel, auto: origin.auto, metered: !!origin.metered };
}
/** Called only by the single controller owner, never by the renderer or Next
 * process directly. The package-installed trust anchors remain untouched. */
export function updateReleasePreferences(input: unknown): ReleasePreferences {
  writeOrigin(UpdatePreferencesSchema.parse(input));
  return releasePreferences();
}

/** A key's id: the start of the SHA-256 of its public half, as desktop/release-keys.mjs makes it. */
export function releaseKeyId(key: string | KeyObject) {
  const publicKey = key instanceof KeyObject && key.type === 'public' ? key : createPublicKey(key);
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
}
const KeyIdSchema = z.string().regex(/^[a-f0-9]{16}$/);
const EnvelopeSchema = z.object({ keyid: KeyIdSchema, payload: z.string().max(128000), signature: z.string().max(200) }).strict();
const ReleaseKeysSchema = z.object({
  format: z.literal(1), version: z.number().int().positive(),
  keys: z.array(z.object({ id: KeyIdSchema, publicKey: z.string().max(1000) }).strict()).min(1).max(16),
}).strict();
/** The online keys the root key vouches for, by id, and the keys file's version. */
export interface ReleaseKeys { version: number; keys: Map<string, KeyObject> }

/** The payload, once the key the envelope names is one of `keys` and its signature checks. */
function openSigned(envelope: unknown, keys: Map<string, KeyObject>, unlisted: string): unknown {
  const { keyid, payload, signature } = EnvelopeSchema.parse(envelope);
  const key = keys.get(keyid);
  if (!key) throw new Error(unlisted);
  const bytes = Buffer.from(payload, 'base64');
  if (!verify(null, bytes, key, Buffer.from(signature, 'base64'))) throw new Error('Release publisher signature is invalid');
  return JSON.parse(bytes.toString('utf8'));
}

/** The feed's keys file, checked against the root key this installation pinned, and
 * no older than the newest one it has seen. */
export function verifyReleaseKeys(envelope: unknown, rootKey: string, minimumVersion = 0): ReleaseKeys {
  const root = createPublicKey(rootKey);
  const body = ReleaseKeysSchema.parse(openSigned(envelope, new Map([[releaseKeyId(root), root]]), 'The release signing keys are not signed by the root key this installation trusts'));
  if (body.version < minimumVersion) throw new Error('Release feed attempted to roll back its signing keys');
  const keys = new Map<string, KeyObject>();
  for (const entry of body.keys) {
    const key = createPublicKey(entry.publicKey);
    if (key.asymmetricKeyType !== 'ed25519' || releaseKeyId(key) !== entry.id || keys.has(entry.id)) throw new Error('The release signing keys are malformed');
    keys.set(entry.id, key);
  }
  return { version: body.version, keys };
}

const unlistedKey = 'Release is signed by a key its publisher does not list';
export function verifyRelease(envelope: unknown, policy: { keys: ReleaseKeys; channel: ReleasePreferences['channel'] }, minimumSequence = 0, now = Date.now()): Release {
  const release = ReleaseSchema.parse(openSigned(envelope, policy.keys.keys, unlistedKey));
  if (release.channel !== policy.channel || release.platform !== process.platform || release.arch !== process.arch) throw new Error('Release does not match this installation');
  if (release.sequence < minimumSequence) throw new Error('Release feed attempted a downgrade');
  if (Date.parse(release.expiresAt) <= now || Date.parse(release.publishedAt) > now + 5 * 60_000) throw new Error('Release metadata expired or has an invalid date');
  if (release.withdrawn) throw new Error('This release was withdrawn by its publisher');
  return release;
}
/** A slow connection is fine, however long the download takes. Only one that has
 * stopped moving gives up, so the next check can try again. */
export async function secureFetch(url: string, stallMs = 2 * 60_000): Promise<Response> {
  for (let i = 0; i < 6; i++) {
    httpsUrl.parse(url);
    const stalled = new AbortController();
    let timer = setTimeout(() => stalled.abort(new Error('The download stopped moving.')), stallMs);
    const watch = () => { clearTimeout(timer); timer = setTimeout(() => stalled.abort(new Error('The download stopped moving.')), stallMs); };
    let response: Response;
    try { response = await fetch(url, { redirect: 'manual', signal: stalled.signal }); }
    catch (error) { clearTimeout(timer); throw error; }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timer);
      await response.body?.cancel();
      url = new URL(response.headers.get('location') ?? '', url).href;
      continue;
    }
    if (!response.ok || !response.body) { clearTimeout(timer); throw new Error(`Release download failed (${response.status})`); }
    watch();
    return new Response(response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { watch(); controller.enqueue(chunk); },
      flush() { clearTimeout(timer); },
    })), { status: response.status, headers: response.headers });
  }
  throw new Error('Release download redirected too many times');
}
async function fetchEnvelope(url: string) {
  const response = await secureFetch(url);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of Readable.fromWeb(response.body as never)) {
    bytes += chunk.length;
    if (bytes > 256_000) throw new Error('Release metadata is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
/** The highest number this installation has seen for something that only goes up. */
function seenNumber(name: string) {
  const seenFile = path.join(/* turbopackIgnore: true */ getRuntimeBaseDir(), name);
  const seen = fs.existsSync(/* turbopackIgnore: true */ seenFile) ? Number(fs.readFileSync(/* turbopackIgnore: true */ seenFile, 'utf8')) : 0;
  if (!Number.isSafeInteger(seen) || seen < 0) throw new Error(`Invalid saved ${name}`);
  return { seen, seenFile };
}
/** The newest pointer seen on a channel, so a feed can't move it backwards. Each
 * channel has its own: `stable` is often behind `latest`, on purpose. */
const seenSequence = (channel: ReleasePreferences['channel']) => seenNumber(`release-sequence-${channel}`);
/** The newest keys file seen, so a feed can't bring back a key its publisher left out. */
export const seenKeysVersion = () => seenNumber('release-keys-version').seen;
export function rememberReleaseKeys(keys: ReleaseKeys) {
  const { seen, seenFile } = seenNumber('release-keys-version');
  if (keys.version > seen) atomicWriteFile(seenFile, `${keys.version}\n`);
}
/** The keys that may sign releases now: the feed's keys file, every time, since a
 * revoked key must stop working at the next check. */
async function trustedKeys(policy: ReleasePolicy) {
  const keys = verifyReleaseKeys(await fetchEnvelope(feedUrl(policy, 'keys.json')), policy.rootKey, seenKeysVersion());
  rememberReleaseKeys(keys);
  return keys;
}
const notConfigured = 'Updates are not configured. This build needs a publisher root key and HTTPS release feed.';
export async function checkRelease(): Promise<Release> {
  const policy = releasePolicy();
  if (!policy) throw new Error(notConfigured);
  const keys = await trustedKeys(policy);
  const { seen, seenFile } = seenSequence(policy.channel);
  const release = verifyRelease(await fetchEnvelope(feedFile(policy, policy.channel)), { keys, channel: policy.channel }, seen);
  atomicWriteFile(seenFile, `${release.sequence}\n`);
  return release;
}
/** One version by number, whichever channel it came from: to check it's still good
 * before using it, or the version a connected computer's Home runs (section 7.7).
 * Asking for a version says nothing about a channel's order, so no sequence applies. */
export async function checkReleaseVersion(version: string): Promise<Release> {
  const policy = releasePolicy();
  if (!policy) throw new Error(notConfigured);
  const keys = await trustedKeys(policy);
  const envelope = await fetchEnvelope(feedFile(policy, version));
  const release = verifyRelease(envelope, { keys, channel: readEnvelopeChannel(envelope) });
  if (release.version !== version) throw new Error('The release feed answered with a different version');
  return release;
}
const VersionIndexSchema = z.object({ format: z.literal(1), versions: z.array(z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/), sequence: z.number().int().positive(), compatibility: RuntimeCompatibilitySchema,
}).strict()).max(500) }).strict();
/** The versions kept on the feed for this platform, newest first, for finding a bridge. */
export async function checkReleaseIndex() {
  const policy = releasePolicy();
  if (!policy) throw new Error(notConfigured);
  const keys = await trustedKeys(policy);
  return VersionIndexSchema.parse(openSigned(await fetchEnvelope(feedFile(policy, 'index')), keys.keys, unlistedKey)).versions;
}
function readEnvelopeChannel(envelope: { payload?: unknown }) {
  // Only used to accept either channel. verifyRelease checks the signature over these same bytes.
  return (JSON.parse(Buffer.from(String(envelope.payload), 'base64').toString('utf8')) as { channel: ReleasePreferences['channel'] }).channel;
}

/**
 * What people download, and how they check it (docs/publishing.md, "Downloads").
 *
 * Every version release and the alpha release carry SHA256SUMS for their installers and
 * runtimes. The website reads one manifest per channel: downloads-stable.json and
 * downloads-latest.json on the `feed` release, and downloads.json on the `alpha` release.
 * Their shape is a contract with the site (ri.app), so it changes only with a new `format`.
 * Each version release also keeps its own downloads.json, the same shape without a
 * channel, which is what promoting copies to stable.
 *
 *   build     Record which build made a platform's files: release/build.json.
 *   version   Hash a version's files and write SHA256SUMS and downloads.json beside them.
 *   channel   Write downloads-<channel>.json from a version's downloads.json.
 *   withdraw  Name the channel manifests that offer a version, which withdrawing removes.
 *
 * Like publish-release.mjs, it only writes files. The workflow uploads them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const FORMAT = 1;
export const CHANNELS = ['stable', 'latest', 'alpha'];
/** Node's platform names, as the site shows them. */
export const PLATFORM_NAMES = { darwin: 'mac', win32: 'windows', linux: 'linux' };
const PLATFORM_ORDER = ['mac', 'windows', 'linux'];
const ARCH_ORDER = ['arm64', 'x64'];
const KIND_ORDER = ['dmg', 'exe', 'appimage', 'deb', 'runtime'];

/** What kind of download a file is, or null for one the site doesn't offer. */
export function downloadKind(name) {
  if (/^ri-runtime-.+\.tar\.gz$/.test(name)) return 'runtime';
  if (name.endsWith('.dmg')) return 'dmg';
  if (name.endsWith('.exe')) return 'exe';
  if (name.endsWith('.AppImage')) return 'appimage';
  if (name.endsWith('.deb')) return 'deb';
  return null;
}

/** The files SHA256SUMS and attestations cover: every download, and the Mac app archive the
 * desktop app updates itself from. Not the updater's .yml and .blockmap files. */
export const isReleaseBinary = name => downloadKind(name) !== null || name.endsWith('.zip');

/** An ISO time to the second, as the manifests write it: 2026-11-19T12:00:00Z. */
export const isoSeconds = value => new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** Commits are shown, and linked, by their short form. */
export const shortCommit = commit => {
  if (!/^[0-9a-f]{7,40}$/.test(commit ?? '')) throw new Error(`Not a commit: ${commit}`);
  return commit.slice(0, 7);
};

export async function sha256File(file) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size };
}

/** SHA256SUMS in the form `sha256sum -c` reads, sorted by name. */
export function sha256sums(entries) {
  const names = new Set();
  for (const { name, sha256 } of entries) {
    if (names.has(name)) throw new Error(`${name} appears twice`);
    if (!/^[0-9a-f]{64}$/.test(sha256) || /[\s/\\]/.test(name)) throw new Error(`Can't list ${name} in SHA256SUMS`);
    names.add(name);
  }
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : 1)).map(({ name, sha256 }) => `${sha256}  ${name}\n`).join('');
}

/** One file in a manifest, its keys in the contract's order. */
export function fileEntry({ platform, arch, name, url, sha256, size, commit, builtAt }) {
  const kind = downloadKind(name);
  const shown = PLATFORM_NAMES[platform] ?? platform;
  if (!kind) throw new Error(`${name} is not a download`);
  if (!PLATFORM_ORDER.includes(shown) || !ARCH_ORDER.includes(arch)) throw new Error(`${name} has no known platform: ${platform}-${arch}`);
  if (!/^[0-9a-f]{64}$/.test(sha256) || !Number.isSafeInteger(size) || size <= 0) throw new Error(`${name} needs its sha256 and size`);
  if (new URL(url).protocol !== 'https:') throw new Error(`${name} must download over HTTPS`);
  return { platform: shown, arch, kind, name, url, sha256, size, commit: shortCommit(commit), builtAt: isoSeconds(builtAt) };
}

const rank = (order, value) => order.indexOf(value);
export const sortFiles = files => [...files].sort((a, b) =>
  rank(PLATFORM_ORDER, a.platform) - rank(PLATFORM_ORDER, b.platform)
  || rank(ARCH_ORDER, a.arch) - rank(ARCH_ORDER, b.arch)
  || rank(KIND_ORDER, a.kind) - rank(KIND_ORDER, b.kind)
  || (a.name < b.name ? -1 : 1));

/** A channel's manifest, for the site. A version's own record is the same without `channel`. */
export function manifest({ channel, version, commit, publishedAt, notesUrl, files }) {
  if (channel !== undefined && !CHANNELS.includes(channel)) throw new Error(`Unknown channel ${channel}`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) throw new Error(`Not a version: ${version}`);
  if (!files.length) throw new Error('A manifest needs at least one file');
  return {
    format: FORMAT, ...(channel ? { channel } : {}), version, commit: shortCommit(commit),
    publishedAt: isoSeconds(publishedAt), notesUrl: new URL(notesUrl).href, files: sortFiles(files),
  };
}

/** A channel's manifest from a version's record, which was written when it was published. */
export function channelManifest(record, channel) {
  if (record?.format !== FORMAT) throw new Error('This downloads.json is from another format');
  const { version, commit, publishedAt, notesUrl, files } = record;
  return manifest({ channel, version, commit, publishedAt, notesUrl, files });
}

function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  });
}

/**
 * Everything one version's builds made, from the folder its artifacts were downloaded into:
 * one subfolder per platform, each with the build.json its build wrote.
 */
export async function versionRecord({ artifacts, version, baseUrl, notesUrl, commit, publishedAt = Date.now() }) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const sums = [];
  const files = [];
  for (const folder of fs.readdirSync(artifacts, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(artifacts, entry.name)).sort()) {
    const buildFile = path.join(folder, 'build.json');
    if (!fs.existsSync(buildFile)) throw new Error(`${folder} has no build.json, so its files can't be described`);
    const build = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
    for (const file of walk(folder).filter(file => isReleaseBinary(path.basename(file))).sort()) {
      const name = path.basename(file);
      const { sha256, size } = await sha256File(file);
      sums.push({ name, sha256 });
      if (downloadKind(name)) files.push(fileEntry({ platform: build.platform, arch: build.arch, name, url: new URL(name, base).href, sha256, size, commit: build.commit, builtAt: build.builtAt }));
    }
  }
  return { record: manifest({ version, commit, publishedAt, notesUrl, files }), sums: sha256sums(sums) };
}

/** The channel manifests in a feed folder that offer this version. Withdrawing it leaves those
 * channels with nothing to download, as the feed has nothing to install, until the next version. */
export function manifestsOffering(existing, version) {
  return CHANNELS.map(channel => `downloads-${channel}.json`).filter(name => {
    const file = path.join(existing, name);
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).version === version;
  });
}

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

// Run as a command, on Windows too, where the build jobs record their files (as scripts/next-build.mjs does).
const invoked = (() => {
  try { return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1] ?? '')).href; } catch { return false; }
})();
if (invoked) {
  const [command] = process.argv.slice(2);
  const { values: v } = parseArgs({ args: process.argv.slice(3), options: {
    out: { type: 'string' }, artifacts: { type: 'string' }, version: { type: 'string' }, commit: { type: 'string' },
    'base-url': { type: 'string' }, 'notes-url': { type: 'string' }, record: { type: 'string' }, channel: { type: 'string' },
    existing: { type: 'string' }, notarized: { type: 'boolean', default: false },
  } });
  if (command === 'build') {
    if (!v.out) throw new Error('Missing --out');
    const commit = v.commit ?? process.env.GITHUB_SHA;
    shortCommit(commit);
    fs.mkdirSync(path.dirname(v.out), { recursive: true });
    writeJson(v.out, { platform: process.platform, arch: process.arch, commit, builtAt: isoSeconds(Date.now()), notarized: v.notarized });
    console.info(`Recorded the ${process.platform}-${process.arch} build of ${commit.slice(0, 7)}`);
  } else if (command === 'version') {
    for (const key of ['artifacts', 'version', 'commit', 'base-url', 'notes-url', 'out']) if (!v[key]) throw new Error(`Missing --${key}`);
    const { record, sums } = await versionRecord({ artifacts: v.artifacts, version: v.version, commit: v.commit, baseUrl: v['base-url'], notesUrl: v['notes-url'] });
    fs.mkdirSync(v.out, { recursive: true });
    fs.writeFileSync(path.join(v.out, 'SHA256SUMS'), sums);
    writeJson(path.join(v.out, 'downloads.json'), record);
    console.info(`SHA256SUMS lists ${sums.trim().split('\n').length} files, downloads.json offers ${record.files.length}`);
  } else if (command === 'channel') {
    for (const key of ['record', 'channel', 'out']) if (!v[key]) throw new Error(`Missing --${key}`);
    const result = channelManifest(JSON.parse(fs.readFileSync(v.record, 'utf8')), v.channel);
    fs.mkdirSync(v.out, { recursive: true });
    writeJson(path.join(v.out, `downloads-${v.channel}.json`), result);
    console.info(`downloads-${v.channel}.json offers ${result.version}`);
  } else if (command === 'withdraw') {
    if (!v.existing || !v.version) throw new Error('Give --existing and --version');
    // Names only, one a line, for the workflow to delete.
    for (const name of manifestsOffering(v.existing, v.version)) console.info(name);
  } else throw new Error('Use build, version, channel or withdraw');
}

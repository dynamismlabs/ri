import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { channelManifest, downloadKind, isReleaseBinary, manifestsOffering, sha256sums, versionRecord } from './release-downloads.mjs';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-release-downloads-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const COMMIT = 'abc1234def5678abc1234def5678abc1234def56';
const BASE = 'https://github.com/dynamismlabs/ri/releases/download/v0.2.0/';
const NOTES = 'https://github.com/dynamismlabs/ri/releases/tag/v0.2.0';
const script = path.resolve(__dirname, 'release-downloads.mjs');

/** The website's contract, as it was given: nothing more, nothing less. */
const File = z.object({
  platform: z.enum(['mac', 'windows', 'linux']), arch: z.enum(['arm64', 'x64']), kind: z.enum(['dmg', 'exe', 'appimage', 'deb', 'runtime']),
  name: z.string(), url: z.string().url().startsWith('https://'), sha256: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().positive(),
  commit: z.string().regex(/^[0-9a-f]{7}$/), builtAt: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/),
}).strict();
const Manifest = z.object({
  format: z.literal(1), channel: z.enum(['stable', 'latest', 'alpha']), version: z.string(), commit: z.string().regex(/^[0-9a-f]{7}$/),
  publishedAt: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/), notesUrl: z.string().url(), files: z.array(File).min(1),
}).strict();

// What each release build uploads (.github/workflows/release.yml), with the files that stay off the list.
const ARTIFACTS: Record<string, { build: object, files: string[] }> = {
  'ri-darwin-arm64': { build: { platform: 'darwin', arch: 'arm64', commit: COMMIT, builtAt: '2026-11-19T11:00:00Z', notarized: true },
    files: ['ri-runtime-0.2.0-darwin-arm64.tar.gz', 'payloads/darwin-arm64.payload.json', 'desktop/Ri-0.2.0-arm64.dmg', 'desktop/Ri-0.2.0-arm64-mac.zip', 'desktop/Ri-0.2.0-arm64-mac.zip.blockmap', 'desktop/arm64-mac.yml'] },
  'ri-darwin-x64': { build: { platform: 'darwin', arch: 'x64', commit: COMMIT, builtAt: '2026-11-19T11:05:00.123Z', notarized: true },
    files: ['ri-runtime-0.2.0-darwin-x64.tar.gz', 'desktop/Ri-0.2.0.dmg', 'desktop/Ri-0.2.0-mac.zip', 'desktop/x64-mac.yml'] },
  'ri-linux-x64': { build: { platform: 'linux', arch: 'x64', commit: COMMIT, builtAt: '2026-11-19T10:40:00Z', notarized: false },
    files: ['ri-runtime-0.2.0-linux-x64.tar.gz', 'desktop/Ri-0.2.0.AppImage', 'desktop/ri-desktop_0.2.0_amd64.deb', 'desktop/x64-linux.yml'] },
  'ri-linux-arm64': { build: { platform: 'linux', arch: 'arm64', commit: COMMIT, builtAt: '2026-11-19T10:45:00Z', notarized: false },
    files: ['ri-runtime-0.2.0-linux-arm64.tar.gz', 'desktop/Ri-0.2.0-arm64.AppImage', 'desktop/ri-desktop_0.2.0_arm64.deb', 'desktop/arm64-linux-arm64.yml'] },
  'ri-win32-x64': { build: { platform: 'win32', arch: 'x64', commit: COMMIT, builtAt: '2026-11-19T10:50:00Z', notarized: false },
    files: ['desktop/Ri-Setup-0.2.0-x64.exe'] },
};
function download(folder = path.join(root, 'artifacts')) {
  for (const [name, { build, files }] of Object.entries(ARTIFACTS)) {
    fs.mkdirSync(path.join(folder, name), { recursive: true });
    fs.writeFileSync(path.join(folder, name, 'build.json'), JSON.stringify(build));
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(folder, name, file)), { recursive: true });
      fs.writeFileSync(path.join(folder, name, file), `bytes of ${path.basename(file)}`);
    }
  }
  return folder;
}
const sha = (name: string) => createHash('sha256').update(`bytes of ${name}`).digest('hex');

it('knows which files are downloads, and which only the updater reads', () => {
  expect(['Ri-0.2.0-arm64.dmg', 'Ri-Setup-0.2.0-x64.exe', 'Ri-0.2.0.AppImage', 'ri-desktop_0.2.0_amd64.deb', 'ri-runtime-0.2.0-linux-x64.tar.gz'].map(downloadKind))
    .toEqual(['dmg', 'exe', 'appimage', 'deb', 'runtime']);
  for (const name of ['Ri-0.2.0-mac.zip', 'arm64-mac.yml', 'Ri-0.2.0.dmg.blockmap', 'darwin-arm64.payload.json', 'build.json']) expect(downloadKind(name)).toBeNull();
  expect(isReleaseBinary('Ri-0.2.0-mac.zip')).toBe(true);
  expect(isReleaseBinary('Ri-0.2.0-mac.zip.blockmap')).toBe(false);
});

it('lists every installer and runtime of a version, Windows included, in the site\'s exact format', async () => {
  const { record, sums } = await versionRecord({ artifacts: download(), version: '0.2.0', commit: COMMIT, baseUrl: BASE, notesUrl: NOTES, publishedAt: Date.parse('2026-11-19T12:00:00.456Z') });
  const stable = Manifest.parse(channelManifest(record, 'stable'));
  expect(Object.keys(stable)).toEqual(['format', 'channel', 'version', 'commit', 'publishedAt', 'notesUrl', 'files']);
  expect(stable).toMatchObject({ format: 1, channel: 'stable', version: '0.2.0', commit: 'abc1234', publishedAt: '2026-11-19T12:00:00Z', notesUrl: NOTES });
  expect(stable.files.map(file => `${file.platform} ${file.arch} ${file.kind} ${file.name}`)).toEqual([
    'mac arm64 dmg Ri-0.2.0-arm64.dmg', 'mac arm64 runtime ri-runtime-0.2.0-darwin-arm64.tar.gz',
    'mac x64 dmg Ri-0.2.0.dmg', 'mac x64 runtime ri-runtime-0.2.0-darwin-x64.tar.gz',
    'windows x64 exe Ri-Setup-0.2.0-x64.exe',
    'linux arm64 appimage Ri-0.2.0-arm64.AppImage', 'linux arm64 deb ri-desktop_0.2.0_arm64.deb', 'linux arm64 runtime ri-runtime-0.2.0-linux-arm64.tar.gz',
    'linux x64 appimage Ri-0.2.0.AppImage', 'linux x64 deb ri-desktop_0.2.0_amd64.deb', 'linux x64 runtime ri-runtime-0.2.0-linux-x64.tar.gz',
  ]);
  const windows = stable.files.find(file => file.kind === 'exe')!;
  expect(Object.keys(windows)).toEqual(['platform', 'arch', 'kind', 'name', 'url', 'sha256', 'size', 'commit', 'builtAt']);
  expect(windows).toEqual({
    platform: 'windows', arch: 'x64', kind: 'exe', name: 'Ri-Setup-0.2.0-x64.exe', url: `${BASE}Ri-Setup-0.2.0-x64.exe`,
    sha256: sha('Ri-Setup-0.2.0-x64.exe'), size: 'bytes of Ri-Setup-0.2.0-x64.exe'.length, commit: 'abc1234', builtAt: '2026-11-19T10:50:00Z',
  });
  expect(stable.files.find(file => file.name === 'Ri-0.2.0.dmg')!.builtAt).toBe('2026-11-19T11:05:00Z');
  // Ubuntu and Debian get a deb on both architectures, beside the AppImage.
  expect(stable.files.filter(file => file.kind === 'deb')).toEqual([
    { platform: 'linux', arch: 'arm64', kind: 'deb', name: 'ri-desktop_0.2.0_arm64.deb', url: `${BASE}ri-desktop_0.2.0_arm64.deb`, sha256: sha('ri-desktop_0.2.0_arm64.deb'), size: 'bytes of ri-desktop_0.2.0_arm64.deb'.length, commit: 'abc1234', builtAt: '2026-11-19T10:45:00Z' },
    { platform: 'linux', arch: 'x64', kind: 'deb', name: 'ri-desktop_0.2.0_amd64.deb', url: `${BASE}ri-desktop_0.2.0_amd64.deb`, sha256: sha('ri-desktop_0.2.0_amd64.deb'), size: 'bytes of ri-desktop_0.2.0_amd64.deb'.length, commit: 'abc1234', builtAt: '2026-11-19T10:40:00Z' },
  ]);
  // SHA256SUMS also covers the Mac app archive the desktop app updates from, never updater metadata.
  const listed = sums.trim().split('\n').map(line => line.split('  ')[1]);
  expect(listed).toEqual([...listed].sort());
  expect(listed).toContain('Ri-0.2.0-arm64-mac.zip');
  expect(listed).toHaveLength(stable.files.length + 2);
  expect(sums).toContain(`${sha('Ri-Setup-0.2.0-x64.exe')}  Ri-Setup-0.2.0-x64.exe\n`);
  // SHA256SUMS is also what the release workflow attests from.
  expect(sums).toContain(`${sha('ri-desktop_0.2.0_amd64.deb')}  ri-desktop_0.2.0_amd64.deb\n`);
  expect(sums).toContain(`${sha('ri-desktop_0.2.0_arm64.deb')}  ri-desktop_0.2.0_arm64.deb\n`);
  expect(sums).not.toMatch(/\.yml|blockmap|payload|build\.json/);
});

it('writes SHA256SUMS that the usual tools check', async () => {
  const { sums } = await versionRecord({ artifacts: download(), version: '0.2.0', commit: COMMIT, baseUrl: BASE, notesUrl: NOTES });
  const flat = path.join(root, 'flat');
  fs.mkdirSync(flat);
  for (const file of sums.trim().split('\n').map(line => line.split('  ')[1])) fs.writeFileSync(path.join(flat, file), `bytes of ${file}`);
  fs.writeFileSync(path.join(flat, 'SHA256SUMS'), sums);
  const tool = spawnSync('sha256sum', ['--version']).status === 0 ? ['sha256sum', ['-c', 'SHA256SUMS']] as const : ['shasum', ['-a', '256', '-c', 'SHA256SUMS']] as const;
  const result = spawnSync(tool[0], [...tool[1]], { cwd: flat, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  fs.writeFileSync(path.join(flat, 'Ri-0.2.0.dmg'), 'changed');
  expect(spawnSync(tool[0], [...tool[1]], { cwd: flat }).status).not.toBe(0);
});

it('refuses files it can\'t describe, rather than leave them off', async () => {
  const artifacts = download();
  fs.rmSync(path.join(artifacts, 'ri-win32-x64', 'build.json'));
  await expect(versionRecord({ artifacts, version: '0.2.0', commit: COMMIT, baseUrl: BASE, notesUrl: NOTES })).rejects.toThrow(/ri-win32-x64 has no build\.json/);
  expect(() => sha256sums([{ name: 'a.dmg', sha256: 'a'.repeat(64) }, { name: 'a.dmg', sha256: 'b'.repeat(64) }])).toThrow('appears twice');
  expect(() => channelManifest({ format: 2 }, 'stable')).toThrow('another format');
  expect(() => channelManifest({ format: 1, version: '0.2.0', commit: COMMIT, publishedAt: 0, notesUrl: NOTES, files: [] }, 'beta')).toThrow('Unknown channel');
});

it('runs as the release workflow calls it: a version, its channel, and a withdrawal', () => {
  const artifacts = download();
  const assets = path.join(root, 'assets');
  const feed = path.join(root, 'feed');
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('version', '--artifacts', artifacts, '--out', assets, '--version', '0.2.0', '--commit', COMMIT, '--base-url', BASE, '--notes-url', NOTES);
  const record = JSON.parse(fs.readFileSync(path.join(assets, 'downloads.json'), 'utf8'));
  expect(record).not.toHaveProperty('channel');
  expect(fs.readFileSync(path.join(assets, 'SHA256SUMS'), 'utf8')).toContain('Ri-Setup-0.2.0-x64.exe');

  run('channel', '--record', path.join(assets, 'downloads.json'), '--channel', 'latest', '--out', feed);
  run('channel', '--record', path.join(assets, 'downloads.json'), '--channel', 'stable', '--out', feed);
  expect(Manifest.parse(JSON.parse(fs.readFileSync(path.join(feed, 'downloads-latest.json'), 'utf8'))).channel).toBe('latest');

  // Withdrawing names exactly the channel files that offer that version.
  fs.writeFileSync(path.join(feed, 'downloads-stable.json'), JSON.stringify({ ...record, channel: 'stable', version: '0.1.0' }));
  expect(run('withdraw', '--existing', feed, '--version', '0.2.0').trim().split('\n')).toEqual(['downloads-latest.json']);
  expect(manifestsOffering(feed, '0.1.0')).toEqual(['downloads-stable.json']);
  expect(manifestsOffering(feed, '9.9.9')).toEqual([]);
});

it('records which build made a platform\'s files', () => {
  const out = path.join(root, 'release', 'build.json');
  const result = spawnSync(process.execPath, [script, 'build', '--out', out, '--notarized'], { encoding: 'utf8', env: { ...process.env, GITHUB_SHA: COMMIT } });
  expect(result.status, result.stderr).toBe(0);
  const build = JSON.parse(fs.readFileSync(out, 'utf8'));
  expect(build).toMatchObject({ platform: process.platform, arch: process.arch, commit: COMMIT, notarized: true });
  expect(build.builtAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PLATFORMS, passedPlatforms, readBuilds, releaseNotes, stage } from './alpha-release.mjs';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-alpha-release-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const NEW = '242ea131f970aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OLD = '52f52c33bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const built = (commit: string, date: string, run: number) => ({ commit, date, run, number: run % 100 });
const notesFor = (builds: Record<string, ReturnType<typeof built>>) =>
  releaseNotes({ builds, commit: NEW, server: 'https://github.com', repo: 'dynamismlabs/ri', tag: 'alpha' });

// The names each build writes today (docs/alpha-builds.md), beside files that must stay out.
const ARTIFACTS: Record<string, string[]> = {
  'ri-alpha-darwin-arm64': ['Ri-0.1.0-arm64.dmg'],
  'ri-alpha-darwin-x64': ['Ri-0.1.0.dmg'],
  'ri-alpha-win32-x64': ['Ri-Setup-0.1.0-x64.exe'],
  'ri-alpha-linux-x64': ['Ri-0.1.0.AppImage', 'ri-desktop_0.1.0_amd64.deb'],
  'ri-alpha-linux-arm64': ['Ri-0.1.0-arm64.AppImage', 'ri-desktop_0.1.0_arm64.deb'],
};
function download(name: string, files: string[]) {
  fs.mkdirSync(path.join(root, name, 'desktop'), { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(root, name, 'desktop', file), file);
  fs.writeFileSync(path.join(root, name, 'ri-runtime-0.1.0.tar.gz'), 'runtime');
}

it('publishes every platform whose build job passed, and only those', () => {
  const jobs = [
    { name: 'targets', conclusion: 'success' },
    { name: 'Alpha macos-arm64', conclusion: 'success' },
    { name: 'Alpha macos-x64', conclusion: 'success' },
    { name: 'Alpha linux-x64', conclusion: 'success' },
    { name: 'Alpha linux-arm64', conclusion: 'cancelled' },
    { name: 'Alpha windows-x64', conclusion: 'failure' },
    { name: 'Publish the alpha release', conclusion: null },
  ];
  expect(passedPlatforms(jobs).map(platform => platform.target)).toEqual(['macos-arm64', 'macos-x64', 'linux-x64']);
});

it('renames each installer to its fixed name and leaves runtimes and fixtures behind', () => {
  for (const [name, files] of Object.entries(ARTIFACTS)) download(name, files);
  download('ri-alpha-win32-x64-upgrade-fixture', ['Ri-Setup-0.1.1-x64.exe']);
  const out = fs.mkdtempSync(path.join(root, 'publish-'));
  const staged = PLATFORMS.flatMap(platform => stage(platform, root, out)).map(file => path.basename(file));
  expect(staged).toEqual([
    'Ri-mac-arm64.dmg', 'Ri-mac-x64.dmg', 'Ri-Setup-x64.exe',
    'Ri-linux-x64.AppImage', 'Ri-linux-x64.deb', 'Ri-linux-arm64.AppImage', 'Ri-linux-arm64.deb',
  ]);
  expect(fs.readdirSync(out).sort()).toEqual([...staged].sort());
  expect(fs.readFileSync(path.join(out, 'Ri-Setup-x64.exe'), 'utf8')).toBe('Ri-Setup-0.1.0-x64.exe');
  expect(fs.readFileSync(path.join(out, 'Ri-linux-arm64.deb'), 'utf8')).toBe('ri-desktop_0.1.0_arm64.deb');
});

it('refuses a build that is missing an installer before anything moves', () => {
  download('ri-alpha-linux-x64', ['Ri-0.1.0.AppImage']);
  const linux = PLATFORMS.find(platform => platform.target === 'linux-x64')!;
  expect(() => stage(linux, root, root)).toThrow(/linux-x64 needs one installer matching .*deb.*found none/);
  expect(fs.existsSync(path.join(root, 'ri-alpha-linux-x64', 'desktop', 'Ri-0.1.0.AppImage'))).toBe(true);
});

it('links every fixed file and says which build it came from', () => {
  const builds = Object.fromEntries(PLATFORMS.map(platform => [platform.target, built(NEW, '2026-11-16', 43990000123)]));
  const notes = notesFor(builds);
  for (const name of PLATFORMS.flatMap(platform => platform.files.map(([, file]) => file))) {
    expect(notes).toContain(`[${name}](https://github.com/dynamismlabs/ri/releases/download/alpha/${name})`);
  }
  expect(notes).toContain('built from [242ea13](https://github.com/dynamismlabs/ri/commit/242ea131f970aaaaaaaaaaaaaaaaaaaaaaaaaaaa) on November 16, 2026.');
  expect(notes).toContain('| Windows x64 | [Ri-Setup-x64.exe](https://github.com/dynamismlabs/ri/releases/download/alpha/Ri-Setup-x64.exe) | [242ea13](https://github.com/dynamismlabs/ri/commit/242ea131f970aaaaaaaaaaaaaaaaaaaaaaaaaaaa) | November 16, 2026 | [#23](https://github.com/dynamismlabs/ri/actions/runs/43990000123) |');
  expect(notes).not.toContain('is older');
  expect(notes).toMatch(/More info, then Run anyway/);
  expect(notes).toMatch(/Privacy & Security, and choose Open Anyway/);
  expect(notes).toMatch(/chmod \+x Ri-linux-x64\.AppImage/);
  expect(readBuilds(notes)).toEqual(builds);
});

it('says which platform kept an older file, and shows one never built as missing', () => {
  const builds = {
    'macos-arm64': built(NEW, '2026-11-16', 2),
    'macos-x64': built(NEW, '2026-11-16', 2),
    'windows-x64': built(OLD, '2026-11-09', 1),
    'linux-x64': built(NEW, '2026-11-16', 2),
  };
  const notes = notesFor(builds);
  expect(notes).toContain('**Windows x64 is older.** No newer build of it has passed, so its file is still from [52f52c3](https://github.com/dynamismlabs/ri/commit/52f52c33bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) on November 9, 2026.');
  expect(notes.match(/is older/g)).toHaveLength(1);
  expect(notes).toContain('| Linux arm64 | Not built yet | | | |');
  expect(notes).not.toContain('releases/download/alpha/Ri-linux-arm64');
});

it('writes public copy without long dashes or semicolons, and starts fresh without notes', () => {
  const notes = notesFor({ 'windows-x64': built(OLD, '2026-11-09', 1) });
  const visible = notes.replace(/<!--[\s\S]*?-->/g, '');
  expect(visible).not.toMatch(/[—–;]/);
  expect(readBuilds(null)).toEqual({});
  expect(readBuilds('Notes someone wrote by hand')).toEqual({});
});

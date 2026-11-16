/**
 * The rolling alpha release (docs/alpha-builds.md). After an alpha run on main, each
 * platform that passed replaces its files on one pre-release tagged `alpha`, under a
 * name without the version, so its download link never changes. A platform that
 * didn't pass keeps its previous file, and the notes say which one is older.
 *
 *   node desktop/alpha-release.mjs <downloaded artifacts folder>
 *
 * Runs in the alpha workflow with GH_TOKEN and the usual GITHUB_* variables.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Each alpha target, its build artifact, and the fixed names its installers are published under. */
export const PLATFORMS = [
  { target: 'macos-arm64', label: 'Mac, Apple silicon', artifact: 'ri-alpha-darwin-arm64', files: [[/\.dmg$/, 'Ri-mac-arm64.dmg']] },
  { target: 'macos-x64', label: 'Mac, Intel', artifact: 'ri-alpha-darwin-x64', files: [[/\.dmg$/, 'Ri-mac-x64.dmg']] },
  { target: 'windows-x64', label: 'Windows x64', artifact: 'ri-alpha-win32-x64', files: [[/^Ri-Setup-.+-x64\.exe$/, 'Ri-Setup-x64.exe']] },
  { target: 'linux-x64', label: 'Linux x64', artifact: 'ri-alpha-linux-x64', files: [[/\.AppImage$/, 'Ri-linux-x64.AppImage'], [/\.deb$/, 'Ri-linux-x64.deb']] },
  { target: 'linux-arm64', label: 'Linux arm64', artifact: 'ri-alpha-linux-arm64', files: [[/\.AppImage$/, 'Ri-linux-arm64.AppImage'], [/\.deb$/, 'Ri-linux-arm64.deb']] },
];

/** The platforms whose build job passed in this run, from the run's jobs list. */
export function passedPlatforms(jobs) {
  const passed = new Set(jobs.filter(job => job.conclusion === 'success').map(job => job.name));
  return PLATFORMS.filter(platform => passed.has(`Alpha ${platform.target}`));
}

/** Moves a platform's installers out of its downloaded artifact under their fixed names. */
export function stage(platform, artifacts, out) {
  const folder = path.join(artifacts, platform.artifact, 'desktop');
  const names = fs.readdirSync(folder);
  const moves = platform.files.map(([pattern, name]) => {
    const found = names.filter(file => pattern.test(file));
    if (found.length !== 1) throw new Error(`${platform.target} needs one installer matching ${pattern} in ${folder}, found ${found.join(', ') || 'none'}`);
    return [path.join(folder, found[0]), path.join(out, name)];
  });
  for (const [from, to] of moves) fs.renameSync(from, to);
  return moves.map(([, to]) => to);
}

// Which build each platform's file came from, kept in the notes where the page doesn't show it.
const STATE = /<!-- alpha-builds (\{.*?\}) -->/;
export const readBuilds = body => JSON.parse(body?.match(STATE)?.[1] ?? '{}');

const longDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The public release notes. They are user-facing copy, so no long dashes and no semicolons. */
export function releaseNotes({ builds, commit, server, repo, tag }) {
  const base = `${server}/${repo}`;
  const short = sha => `[${sha.slice(0, 7)}](${base}/commit/${sha})`;
  const date = Object.values(builds).find(build => build.commit === commit)?.date;
  const rows = PLATFORMS.map(platform => {
    const build = builds[platform.target];
    if (!build) return `| ${platform.label} | Not built yet | | | |`;
    const links = platform.files.map(([, name]) => `[${name}](${base}/releases/download/${tag}/${name})`).join('<br>');
    return `| ${platform.label} | ${links} | ${short(build.commit)} | ${longDate(build.date)} | [#${build.number}](${base}/actions/runs/${build.run}) |`;
  });
  const older = PLATFORMS.filter(platform => builds[platform.target] && builds[platform.target].commit !== commit).map(platform => {
    const build = builds[platform.target];
    return `**${platform.label} is older.** No newer build of it has passed, so its file is still from ${short(build.commit)} on ${longDate(build.date)}.`;
  });
  return [
    `The newest alpha build of Ri from \`main\`, built from ${short(commit)}${date ? ` on ${longDate(date)}` : ''}. Every alpha run on \`main\` replaces these files, so the links below always download the latest build of each platform.`,
    '',
    '| Platform | Download | Commit | Date | Build |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ...(older.length ? ['', ...older] : []),
    '',
    '## Opening Ri',
    '',
    '**Mac.** Open the DMG and drag Ri into Applications, then open Ri. Alpha builds are not notarized by Apple, so macOS blocks the first launch. Open System Settings, then Privacy & Security, and choose Open Anyway. Ri needs macOS 13.5 or newer.',
    '',
    '**Windows.** Open `Ri-Setup-x64.exe`. If Windows says it protected your PC, choose More info, then Run anyway. Ri needs 64-bit Windows 10 version 1809 or newer, or Windows 11, on an Intel or AMD processor.',
    '',
    '**Linux.** Make the AppImage executable with `chmod +x Ri-linux-x64.AppImage`, then open it. On Ubuntu or Debian you can install the package instead with `sudo apt install ./Ri-linux-x64.deb`. ARM computers use the arm64 files.',
    '',
    'Alpha builds do not update themselves. To update, close Ri and install the newer file. Your data stays in place.',
    '',
    `<!-- alpha-builds ${JSON.stringify(builds)} -->`,
  ].join('\n');
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

/**
 * Puts the staged files on the release, creating it the first time, then moves its tag
 * to this commit and rewrites the notes. Files of platforms not given are left alone.
 */
export function publish({ repo, tag, commit, server, files, built, work }) {
  let body = null;
  try { body = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'body')).body; }
  catch { gh('release', 'create', tag, '--repo', repo, '--target', commit, '--prerelease', '--latest=false', '--title', 'Ri alpha', '--notes', 'The first alpha build is uploading.'); }
  gh('release', 'upload', tag, '--repo', repo, '--clobber', ...files);
  if (body !== null) gh('api', '--method', 'PATCH', `repos/${repo}/git/refs/tags/${tag}`, '-f', `sha=${commit}`, '-F', 'force=true');
  const builds = { ...readBuilds(body), ...built };
  const notes = path.join(work, 'notes.md');
  fs.writeFileSync(notes, releaseNotes({ builds, commit, server, repo, tag }));
  gh('release', 'edit', tag, '--repo', repo, '--prerelease', '--latest=false', '--notes-file', notes);
  return builds;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [artifacts] = process.argv.slice(2);
  if (!artifacts) throw new Error('Give the folder the alpha artifacts were downloaded into');
  const { GITHUB_REPOSITORY: repo, GITHUB_SHA: commit, GITHUB_RUN_ID: run, GITHUB_RUN_NUMBER: number, GITHUB_SERVER_URL: server = 'https://github.com' } = process.env;
  if (!repo || !commit || !run || !number) throw new Error('Run this in the alpha workflow, which sets GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID and GITHUB_RUN_NUMBER');
  const { jobs } = JSON.parse(gh('api', `repos/${repo}/actions/runs/${run}/jobs?filter=latest&per_page=100`));
  const passed = passedPlatforms(jobs);
  if (!passed.length) {
    console.info('No platform passed, so the alpha release is unchanged.');
  } else {
    const work = fs.mkdtempSync(path.join(artifacts, 'publish-'));
    const files = passed.flatMap(platform => stage(platform, artifacts, work));
    const date = new Date().toISOString().slice(0, 10);
    const built = Object.fromEntries(passed.map(platform => [platform.target, { commit, date, run: Number(run), number: Number(number) }]));
    publish({ repo, tag: 'alpha', commit, server, files, built, work });
    console.info(`Published ${files.map(file => path.basename(file)).join(', ')} to ${server}/${repo}/releases/tag/alpha`);
  }
}

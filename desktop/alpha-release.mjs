/**
 * The rolling alpha release (docs/alpha-builds.md). After an alpha run on main, each
 * platform that passed replaces its files on one pre-release tagged `alpha`, under a
 * name without the version, so its download link never changes. A platform that
 * didn't pass keeps its previous file, and the notes say which one is older.
 * SHA256SUMS and downloads.json (the website's manifest, desktop/release-downloads.mjs)
 * describe every file on the release, whichever run built it.
 *
 *   node desktop/alpha-release.mjs <downloaded artifacts folder>
 *
 * Runs in the alpha workflow with GH_TOKEN and the usual GITHUB_* variables.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fileEntry, manifest, sha256File, sha256sums } from './release-downloads.mjs';

/** Each alpha target, its build artifact, and the fixed names its installers are published under. */
export const PLATFORMS = [
  { target: 'macos-arm64', label: 'Mac, Apple silicon', platform: 'darwin', arch: 'arm64', artifact: 'ri-alpha-darwin-arm64', files: [[/\.dmg$/, 'Ri-mac-arm64.dmg']] },
  { target: 'macos-x64', label: 'Mac, Intel', platform: 'darwin', arch: 'x64', artifact: 'ri-alpha-darwin-x64', files: [[/\.dmg$/, 'Ri-mac-x64.dmg']] },
  { target: 'windows-x64', label: 'Windows x64', platform: 'win32', arch: 'x64', artifact: 'ri-alpha-win32-x64', files: [[/^Ri-Setup-.+-x64\.exe$/, 'Ri-Setup-x64.exe']] },
  { target: 'linux-x64', label: 'Linux x64', platform: 'linux', arch: 'x64', artifact: 'ri-alpha-linux-x64', files: [[/\.AppImage$/, 'Ri-linux-x64.AppImage'], [/\.deb$/, 'Ri-linux-x64.deb']] },
  { target: 'linux-arm64', label: 'Linux arm64', platform: 'linux', arch: 'arm64', artifact: 'ri-alpha-linux-arm64', files: [[/\.AppImage$/, 'Ri-linux-arm64.AppImage'], [/\.deb$/, 'Ri-linux-arm64.deb']] },
];

/** The platforms whose build job passed in this run, from the run's jobs list. */
export function passedPlatforms(jobs) {
  const passed = new Set(jobs.filter(job => job.conclusion === 'success').map(job => job.name));
  return PLATFORMS.filter(platform => passed.has(`Alpha ${platform.target}`));
}

/** What a platform's build job recorded beside its files (release-downloads.mjs build):
 * the commit, when it was built, and whether Apple notarized it. */
export function readBuild(platform, artifacts) {
  const file = path.join(artifacts, platform.artifact, 'build.json');
  if (!fs.existsSync(file)) throw new Error(`${platform.target} has no build.json in ${path.dirname(file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

/**
 * The release's SHA256SUMS and downloads.json, for every file on it. One this run built is
 * described from its bytes (`local`, by name). One kept from an earlier run is described
 * from the release, where GitHub records each file's digest and size.
 */
export function alphaDownloads({ builds, local, assets, version, commit, publishedAt, server, repo, tag }) {
  const files = [];
  for (const platform of PLATFORMS) {
    const build = builds[platform.target];
    if (!build) continue;
    for (const [, name] of platform.files) {
      const fresh = local.get(name);
      const asset = assets.find(item => item.name === name);
      const sha256 = fresh?.sha256 ?? /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '')?.[1];
      // Only what the release really has is offered.
      if (!sha256) continue;
      files.push(fileEntry({
        platform: platform.platform, arch: platform.arch, name, url: `${server}/${repo}/releases/download/${tag}/${name}`,
        sha256, size: fresh?.size ?? asset.size, commit: build.commit,
        // Builds from before build.json was recorded fall back to when their file was uploaded.
        builtAt: build.builtAt ?? asset?.updated_at,
      }));
    }
  }
  const downloads = manifest({ channel: 'alpha', version, commit, publishedAt, notesUrl: `${server}/${repo}/releases/tag/${tag}`, files });
  return { downloads, sums: sha256sums(downloads.files) };
}

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
  const macs = PLATFORMS.filter(platform => platform.platform === 'darwin' && builds[platform.target]);
  const unnotarized = macs.filter(platform => !builds[platform.target].notarized);
  const opening = 'Open the DMG and drag Ri into Applications, then open Ri.';
  const mac = macs.length && !unnotarized.length
    ? `**Mac.** ${opening} Ri needs macOS 13.5 or newer.`
    : `**Mac.** ${opening} ${!macs.length || unnotarized.length === macs.length ? 'Alpha builds are' : `The ${unnotarized[0].label} build is`} not notarized by Apple, so macOS blocks the first launch. Open System Settings, then Privacy & Security, and choose Open Anyway. Ri needs macOS 13.5 or newer.`;
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
    mac,
    '',
    '**Windows.** Open `Ri-Setup-x64.exe`. If Windows says it protected your PC, choose More info, then Run anyway. Ri needs 64-bit Windows 10 version 1809 or newer, or Windows 11, on an Intel or AMD processor.',
    '',
    '**Linux.** Make the AppImage executable with `chmod +x Ri-linux-x64.AppImage`, then open it. On Ubuntu or Debian you can install the package instead with `sudo apt install ./Ri-linux-x64.deb`. ARM computers use the arm64 files.',
    '',
    'Alpha builds do not update themselves. To update, close Ri and install the newer file. Your data stays in place.',
    '',
    `To check a download, compare it with \`SHA256SUMS\`, or run \`gh attestation verify <file> --repo ${repo}\` to see the build that made it.`,
    '',
    `<!-- alpha-builds ${JSON.stringify(builds)} -->`,
  ].join('\n');
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

/**
 * Moves the release's tag to this commit (creating the release the first time), puts the
 * staged files on it with SHA256SUMS and downloads.json, checks GitHub holds the same
 * bytes, and rewrites the notes. Files of platforms not given are left alone.
 * The tag goes first because it is the step GitHub can refuse: without the workflow
 * permission, which a workflow's own token can't have, it won't tag a commit whose
 * workflow files differ from main's. Refused there, the release is left as it was.
 */
export async function publish({ repo, tag, commit, server, files, built, work, version, now = Date.now() }) {
  const view = () => JSON.parse(gh('api', `repos/${repo}/releases/tags/${tag}`));
  let release = null;
  try { release = view(); }
  catch { gh('release', 'create', tag, '--repo', repo, '--target', commit, '--prerelease', '--latest=false', '--title', 'Ri alpha', '--notes', 'The first alpha build is uploading.'); }
  if (release !== null) gh('api', '--method', 'PATCH', `repos/${repo}/git/refs/tags/${tag}`, '-f', `sha=${commit}`, '-F', 'force=true');
  const builds = { ...readBuilds(release?.body), ...built };
  const local = new Map();
  for (const file of files) local.set(path.basename(file), await sha256File(file));
  const { downloads, sums } = alphaDownloads({ builds, local, assets: release?.assets ?? [], version, commit, publishedAt: now, server, repo, tag });
  const sumsFile = path.join(work, 'SHA256SUMS');
  const downloadsFile = path.join(work, 'downloads.json');
  fs.writeFileSync(sumsFile, sums);
  fs.writeFileSync(downloadsFile, `${JSON.stringify(downloads, null, 2)}\n`);
  gh('release', 'upload', tag, '--repo', repo, '--clobber', ...files, sumsFile, downloadsFile);
  // GitHub records the digest of what it received. A file that differs from what this run
  // built would make SHA256SUMS wrong, so that stops here, before the notes point at it.
  const received = new Map(view().assets.map(asset => [asset.name, asset.digest]));
  for (const [name, { sha256 }] of local) {
    const digest = received.get(name);
    if (!digest) console.warn(`GitHub hasn't recorded a digest for ${name}, so it wasn't checked`);
    else if (digest !== `sha256:${sha256}`) throw new Error(`GitHub holds different bytes for ${name} (${digest}) than this run built (sha256:${sha256})`);
  }
  const notes = path.join(work, 'notes.md');
  fs.writeFileSync(notes, releaseNotes({ builds, commit, server, repo, tag }));
  gh('release', 'edit', tag, '--repo', repo, '--prerelease', '--latest=false', '--notes-file', notes);
  return { builds, downloads };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const [artifacts] = process.argv.slice(2);
  if (!artifacts) throw new Error('Give the folder the alpha artifacts were downloaded into');
  const { GITHUB_REPOSITORY: repo, GITHUB_SHA: commit, GITHUB_RUN_ID: run, GITHUB_RUN_NUMBER: number, GITHUB_SERVER_URL: server = 'https://github.com', GITHUB_OUTPUT: output } = process.env;
  if (!repo || !commit || !run || !number) throw new Error('Run this in the alpha workflow, which sets GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID and GITHUB_RUN_NUMBER');
  const { jobs } = JSON.parse(gh('api', `repos/${repo}/actions/runs/${run}/jobs?filter=latest&per_page=100`));
  const passed = passedPlatforms(jobs);
  if (!passed.length) {
    console.info('No platform passed, so the alpha release is unchanged.');
  } else {
    const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    const date = new Date().toISOString().slice(0, 10);
    const built = Object.fromEntries(passed.map(platform => {
      const { builtAt, notarized } = readBuild(platform, artifacts);
      return [platform.target, { commit, date, run: Number(run), number: Number(number), builtAt, notarized: !!notarized }];
    }));
    const work = fs.mkdtempSync(path.join(artifacts, 'publish-'));
    const files = passed.flatMap(platform => stage(platform, artifacts, work));
    const { downloads } = await publish({ repo, tag: 'alpha', commit, server, files, built, work, version });
    // This run's files alone, for the workflow to attest. Kept files were attested by their own runs.
    const subjects = path.join(artifacts, 'attest.sha256');
    fs.writeFileSync(subjects, sha256sums(downloads.files.filter(file => files.some(staged => path.basename(staged) === file.name))));
    if (output) fs.appendFileSync(output, `published=true\nsubjects=${subjects}\n`);
    console.info(`Published ${files.map(file => path.basename(file)).join(', ')} to ${server}/${repo}/releases/tag/alpha`);
  }
}

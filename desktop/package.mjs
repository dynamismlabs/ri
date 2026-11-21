import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createPublicKey } from 'node:crypto';
import { assertDesktopPackagingRuntime, DESKTOP_NODE_VERSION, macSigning } from './package-preflight.mjs';

assertDesktopPackagingRuntime();
const headless = process.argv.includes('--headless');
const releaseBuild = process.argv.includes('--release');
// An installer to hand to someone, without publisher keys (docs/publishing.md). On
// macOS it is ad-hoc signed, since Apple silicon won't run an app with no signature at
// all, unless CSC_NAME names a Developer ID. Can't update itself.
const shareBuild = process.argv.includes('--share');
// A Developer ID signs and notarizes the Mac app. Checked before anything is built.
const signing = macSigning({ release: releaseBuild, share: shareBuild });
const { build, Platform, Arch } = await import('electron-builder');
const tar = await import('tar');
const { copyNextVectorExtension, appPartId, assertCompanionPackage, assertShellDependencies, assertWindowPreloadsShipped, LINUX_ICON_RELATIVE_PATH, MAC_MINIMUM_SYSTEM_VERSION, MAC_SIGN_IGNORE, pruneDependencySourceMaps, removeUnusedPackageCopy, removeWhatInstallersDrop, SERVER_FOLDERS, SHELL_ENTRYPOINTS, rebaseResourceLinks } = await import('./package-files.mjs');
const { signRuntime } = await import('./sign-runtime.mjs');
const { notarizeApp } = await import('./notarize.mjs');
const { stageSpeechHelper } = await import('./speech/package.mjs');

const repo = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// A release built from a checkout for this computer (docs/always-on-spec.md
// section 8): written straight into this folder, with no distribution copy or
// archive, since the release store takes its files from here.
const releaseDirArg = process.argv.indexOf('--release-dir');
const releaseDir = releaseDirArg === -1 ? null : path.resolve(process.argv[releaseDirArg + 1] ?? '');
if (releaseDir && (!process.argv[releaseDirArg + 1] || !headless || releaseBuild)) throw new Error('--release-dir needs a folder, and is only for a headless, unsigned local build');
const run = (cmd, args, cwd = repo, env = process.env, timeout) => {
  if (process.platform === 'win32' && cmd === 'pnpm') {
    const entry = process.env.npm_execpath;
    if (!entry) throw new Error('Run packaging through pnpm');
    if (entry.endsWith('.exe')) cmd = entry;
    else { args = [entry, ...args]; cmd = process.execPath; }
  }
  const result = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
};
const artifacts = path.join(repo, '.electron-demo');
fs.mkdirSync(artifacts, { recursive: true });
// Beside the release folder when there is one, so its files move into place.
if (releaseDir) fs.mkdirSync(path.dirname(releaseDir), { recursive: true });
const stage = fs.mkdtempSync(releaseDir ? path.join(path.dirname(releaseDir), '.package-stage-') : path.join(os.tmpdir(), 'ri-package-stage-'));
const server = path.join(stage, 'server');
const shell = path.join(stage, 'shell');
const node = path.join(stage, 'node');
run('pnpm', ['desktop:build']);
if (!process.argv.includes('--skip-build')) run(process.execPath, ['desktop/launch.mjs', '--build-only']);
if (!fs.existsSync(path.join(repo, '.next-desktop/BUILD_ID'))) throw new Error('Build the production app first.');

// pnpm deploy copies the package allowlist and a self-contained production graph.
// Explicitly copy Next runtime assets afterwards. Never copy .env or a data home.
const deployed = path.join(stage, 'deployed');
// Windows packages materialize junctions for NSIS, so dependencies must be
// hoisted instead of depending on pnpm's linked per-package resolution.
run('pnpm', ['--config.allow-unused-patches=true', '--filter', 'ai-task-manager', 'deploy', '--prod', '--legacy', '--ignore-scripts', ...(process.platform === 'win32' ? ['--config.node-linker=hoisted'] : []), deployed]);
// Workspace packages may be hardlinked to the checkout. Freeze their bytes so
// editing source while packaging cannot change a manifest that was just made.
// On macOS `cp -c` clones: the bytes are frozen but share disk until either
// changes. Node's FICLONE flag makes a full copy there (2.8 GB of modules).
if (process.platform === 'darwin') run('/bin/cp', ['-c', '-R', '-P', deployed, server]);
else fs.cpSync(deployed, server, { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
rebaseResourceLinks(server, deployed);
fs.rmSync(deployed, { recursive: true, force: true });
fs.mkdirSync(path.join(server, 'src/styles'), { recursive: true });
fs.copyFileSync(path.join(repo, 'src/styles/theme.css'), path.join(server, 'src/styles/theme.css'));
for (const name of SERVER_FOLDERS) fs.cpSync(path.join(repo, name), path.join(server, name), { recursive: true });
if (process.argv.includes('--with-speech')) stageSpeechHelper(path.join(repo, 'release/speech-helper'), path.join(server, 'speech-helper'));
fs.cpSync(path.join(repo, '.next-desktop'), path.join(server, '.next-desktop'), {
  recursive: true,
  // Turbopack's hashed externals link into ../node_modules. Keep those relative.
  verbatimSymlinks: true,
  filter: (source) => !source.endsWith('.nft.json') && !['cache', 'dev', 'types', 'diagnostics', 'trace', 'trace-build'].includes(path.basename(source)),
});
// Next's TS config loader requires dev-only TypeScript. Ship equivalent JavaScript.
const { transformSync } = createRequire(require.resolve('tsup'))('esbuild');
fs.writeFileSync(path.join(server, 'next.config.mjs'), transformSync(fs.readFileSync(path.join(repo, 'next.config.ts'), 'utf8'), { loader: 'ts', format: 'esm' }).code);

const version = DESKTOP_NODE_VERSION;
const archive = `node-v${version}-${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
const base = `https://nodejs.org/dist/v${version}/`;
const checksums = await fetch(`${base}SHASUMS256.txt`).then((r) => { if (!r.ok) throw new Error('Could not download Node checksums'); return r.text(); });
const expected = checksums.split('\n').map((line) => line.trim().split(/\s+/)).find(([, name]) => name === archive)?.[0];
if (!expected) throw new Error('Official Node checksum not found');
const cache = path.join(artifacts, archive);
if (!fs.existsSync(cache)) {
  const response = await fetch(`${base}${archive}`);
  if (!response.ok) throw new Error('Could not download portable Node');
  fs.writeFileSync(cache, Buffer.from(await response.arrayBuffer()));
}
if (createHash('sha256').update(fs.readFileSync(cache)).digest('hex') !== expected) throw new Error('Node download checksum mismatch');
fs.mkdirSync(node);
// Git Bash also puts a tar.exe on PATH. Its remote-archive syntax treats a
// Windows drive letter as a host, so use Windows' own ZIP-capable tar.
run(process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/tar.exe') : '/usr/bin/tar', ['-xf', cache, '--strip-components=1', '-C', node]);

// Scripts were disabled in deploy, so preserve the already-built native artifacts
// from this exact Node ABI. Do not rebuild these libraries for Electron.
const deployedRequire = createRequire(path.join(server, 'package.json'));
for (const name of ['better-sqlite3', 'node-pty']) {
  const source = path.dirname(require.resolve(`${name}/package.json`));
  const target = path.dirname(deployedRequire.resolve(`${name}/package.json`));
  for (const folder of ['build/Release', 'prebuilds']) if (fs.existsSync(path.join(source, folder))) {
    fs.cpSync(path.join(source, folder), path.join(target, folder), { recursive: true });
  }
}
// Before the checks below, so they run against what ships.
removeUnusedPackageCopy(server);
console.info(`Removed ${pruneDependencySourceMaps(path.join(server, 'node_modules')) + pruneDependencySourceMaps(path.join(server, '.next-desktop/server'))} source maps from the release.`);
// The AppImage never carries .gitkeep, .DS_Store or empty folders. Ship none anywhere,
// so every installer matches the runtime and its manifest.
console.info(`Removed ${removeWhatInstallersDrop(server) + removeWhatInstallersDrop(node)} files and empty folders the AppImage would drop.`);
const portableNode = path.join(node, process.platform === 'win32' ? 'node.exe' : 'bin/node');
run(portableNode, ['dist/cli/index.mjs', '--help'], server);
for (const name of ['.env', '.env.local', '.env.production', '.config', '.work', 'data.db']) {
  if (fs.existsSync(path.join(server, name))) throw new Error(`Private data must not ship: server/${name}`);
}

fs.mkdirSync(shell);
assertWindowPreloadsShipped(path.join(repo, 'desktop'));
for (const name of SHELL_ENTRYPOINTS) fs.copyFileSync(path.join(repo, 'dist/desktop', name), path.join(shell, name));
assertCompanionPackage(server, shell);
assertShellDependencies(shell);
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(shell, 'package.json'), JSON.stringify({ name: 'ri-desktop', productName: 'Ri', desktopName: 'app.ri.desktop.desktop', version: pkg.version, main: 'main.cjs', description: pkg.description ?? 'Ri desktop', author: 'Ri contributors', dependencies: {} }));
const desktopConfig = path.join(stage, 'desktop-config.json');
const callbackUrl = process.env.RI_DESKTOP_OAUTH_RELAY_URL;
if (callbackUrl) {
  const url = new URL(callbackUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Callback service must be a plain HTTPS URL');
}
fs.writeFileSync(desktopConfig, JSON.stringify({ callbackUrl, relayProviders: process.env.RI_DESKTOP_OAUTH_RELAY_PROVIDERS, appPart: appPartId(path.join(repo, 'dist/desktop'), pkg.devDependencies.electron) }));
// Finalize resources before signing. Neither an updater nor a running service
// may modify a signed .app after this step.
console.info(`Verified ${rebaseResourceLinks(stage, stage, server)} portable resource links.`);
copyNextVectorExtension(server);
run(portableNode, [path.join(repo, 'desktop/native-probe.mjs')], server, process.env, 35_000);
if (signing.notarize) {
  signRuntime(stage, signing.codesignIdentity, path.join(repo, 'desktop/runtime-entitlements.plist'), signing.keychain);
  if (process.argv.includes('--with-speech')) {
    // Signing changes native bytes. Inventory the final signed helper before
    // freezing the runtime so publisher review can bind to this candidate.
    run(process.env.RI_SPEECH_BUILD_PYTHON || path.join(repo, '.electron-demo/speech-build/venv/bin/python'),
      [path.join(repo, 'desktop/speech/native_inventory.py'), path.join(server, 'speech-helper')]);
    run(process.env.RI_SPEECH_BUILD_PYTHON || path.join(repo, '.electron-demo/speech-build/venv/bin/python'),
      [path.join(repo, 'desktop/speech/native_inventory.py'), path.join(server, 'speech-helper'), '--verify']);
  }
}
// The commit a checkout build came from, for `ri status`. Inside the manifest.
if (process.env.RI_RELEASE_COMMIT) {
  if (!/^[a-f0-9]{40}$/.test(process.env.RI_RELEASE_COMMIT)) throw new Error('RI_RELEASE_COMMIT must be a full commit id');
  fs.writeFileSync(path.join(server, 'ri-release.json'), JSON.stringify({ commit: process.env.RI_RELEASE_COMMIT }));
}
run(process.execPath, ['dist/cli/index.mjs', 'service', 'manifest', stage]);
const policy = path.join(stage, 'release-policy.json');
if (process.env.RI_RELEASE_FEED || process.env.RI_RELEASE_PUBLIC_KEY_FILE) {
  if (!process.env.RI_RELEASE_FEED || !process.env.RI_RELEASE_PUBLIC_KEY_FILE) throw new Error('Configure both RI_RELEASE_FEED and RI_RELEASE_PUBLIC_KEY_FILE');
  const feed = new URL(process.env.RI_RELEASE_FEED);
  if (feed.protocol !== 'https:' || feed.username || feed.password) throw new Error('Release feed must use HTTPS');
  // The root key's public half, which every installation pins (docs/publishing.md, "Signing keys").
  const rootKey = fs.readFileSync(process.env.RI_RELEASE_PUBLIC_KEY_FILE, 'utf8');
  if (!rootKey.startsWith('-----BEGIN PUBLIC KEY-----') || createPublicKey(rootKey).asymmetricKeyType !== 'ed25519') throw new Error('Supply the Ed25519 root PUBLIC key, never a private key');
  fs.writeFileSync(policy, JSON.stringify({ format: 2, feed: feed.href, rootKey }));
}
if (releaseBuild && !fs.existsSync(policy)) throw new Error('Release builds require the publisher root public key and an HTTPS feed');
if (releaseDir) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  for (const name of ['node', 'server', 'runtime-manifest.json', ...(fs.existsSync(policy) ? ['release-policy.json'] : [])]) fs.renameSync(path.join(stage, name), path.join(releaseDir, name));
  fs.rmSync(stage, { recursive: true, force: true });
  console.info(`Release for this computer: ${releaseDir}`);
  process.exit(0);
}
const runtimeName = `ri-runtime-${pkg.version}-${process.platform}-${process.arch}`;
const runtimeOutput = path.join(repo, 'release', runtimeName);
// This output is generated by this command. Do not merge a previous build's
// dependency graph or publisher policy into the new artifact.
fs.rmSync(runtimeOutput, { recursive: true, force: true });
fs.mkdirSync(runtimeOutput, { recursive: true });
for (const name of ['node', 'server', 'runtime-manifest.json', ...(fs.existsSync(policy) ? ['release-policy.json'] : [])]) {
  fs.cpSync(path.join(stage, name), path.join(runtimeOutput, name), { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
}
const runtimeArchive = `${runtimeOutput}.tar.gz`;
await tar.c({ file: runtimeArchive, cwd: runtimeOutput, gzip: true, portable: true, noMtime: true }, ['node', 'server', 'runtime-manifest.json', ...(fs.existsSync(policy) ? ['release-policy.json'] : [])]);
console.info(`Headless runtime: ${runtimeOutput}`);
console.info(`Update payload: ${runtimeArchive}`);
if (!headless) {
  const platform = process.platform === 'darwin' ? Platform.MAC : process.platform === 'win32' ? Platform.WINDOWS : Platform.LINUX;
  const platformTargets = process.platform === 'darwin' ? (releaseBuild && !shareBuild ? ['dmg', 'zip'] : ['dmg']) : process.platform === 'win32' ? ['nsis'] : ['AppImage', 'deb'];
  const targets = (shareBuild || releaseBuild) ? platformTargets : ['dir'];
  const resourcesToCopy = ['server', 'node', 'desktop-config.json', 'runtime-manifest.json', ...(fs.existsSync(policy) ? ['release-policy.json'] : [])];
  // electron-builder normalizes its configuration in place. Each installer
  // needs fresh arrays and objects, including the higher-version test build.
  const packageOptions = () => ({ targets: platform.createTarget(targets, process.arch === 'arm64' ? Arch.arm64 : Arch.x64), publish: 'never', config: {
    appId: 'app.ri.desktop', productName: 'Ri', electronVersion: pkg.devDependencies.electron,
    directories: { app: shell, output: path.join(repo, 'release/desktop'), buildResources: path.join(repo, 'assets/brand/icons') },
    files: [...SHELL_ENTRYPOINTS, 'package.json', '!node_modules/**/*'], asar: true,
    npmRebuild: false, nodeGypRebuild: false, forceCodeSigning: signing.notarize,
    protocols: [{ name: 'Ri OAuth callback', schemes: ['ri'] }],
    mac: { icon: path.join(repo, 'assets/brand/icons/icon.icns'), identity: signing.identity, signIgnore: MAC_SIGN_IGNORE, minimumSystemVersion: MAC_MINIMUM_SYSTEM_VERSION, hardenedRuntime: true,
      // Notarized in afterSign instead (desktop/notarize.mjs), which rides out network drops.
      notarize: false,
      extendInfo: { NSMicrophoneUsageDescription: 'Ri uses the microphone when you record a voice message.', NSCameraUsageDescription: 'Ri uses the camera when you scan a pairing code.' } },
    linux: { executableName: 'ri', syncDesktopName: true, icon: path.join(repo, LINUX_ICON_RELATIVE_PATH), category: 'Office', maintainer: 'Ri contributors' },
    // The package manager owns a deb install, so its app never replaces itself
    // (desktop/shell-update.ts). No updater files: without them electron-builder
    // doesn't mark the install as a deb, or list the deb in the AppImage's
    // latest-linux.yml. The runtime inside still updates from the feed.
    deb: { publish: null },
    win: { icon: path.join(repo, 'assets/brand/icons/icon.ico'), signExecutable: false, artifactName: 'Ri-Setup-${version}-${arch}.exe' },
    nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, differentialPackage: false, include: path.join(repo, 'desktop/windows-installer.nsh') },
    // Only so electron-builder writes the updater's latest*.yml. The app never reads this
    // address: it points the updater at the folder of the shell file named in the signed
    // release (desktop/shell-update.ts), which is the version's GitHub release, not the feed.
    publish: process.env.RI_RELEASE_FEED ? [{ provider: 'generic', url: new URL('.', process.env.RI_RELEASE_FEED).href }] : null,
    afterPack: async context => {
      const resources = process.platform === 'darwin' ? path.join(context.appOutDir, 'Ri.app/Contents/Resources') : path.join(context.appOutDir, 'resources');
      // Builder's dependency filters prune pnpm's virtual store even for
      // extraResources. Copy the already verified runtime verbatim instead.
      for (const name of resourcesToCopy) fs.cpSync(path.join(stage, name), path.join(resources, name), { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
      rebaseResourceLinks(resources, stage, path.join(resources, 'server'));
      // Any changed bytes here are included in the subsequent OS signature.
      run(process.execPath, ['dist/cli/index.mjs', 'service', 'manifest', resources]);
    },
    afterSign: async context => {
      if (process.platform !== 'darwin') return;
      const resources = path.join(context.appOutDir, 'Ri.app/Contents/Resources');
      run(process.execPath, ['dist/cli/index.mjs', 'service', 'verify', resources]);
      // electron-builder makes the dmg and zip after this hook, so both hold the stapled app.
      if (signing.notarize) await notarizeApp({ appPath: path.join(context.appOutDir, 'Ri.app') });
    },
  } });
  // GitHub's Mac runners, the Intel ones above all, sometimes keep the DMG's
  // temporary volume busy when dmgbuild unmounts it. A second build usually passes.
  let output;
  try { output = await build(packageOptions()); }
  catch (error) {
    if (process.platform !== 'darwin' || !String(error?.message).includes('Unable to detach device cleanly')) throw error;
    console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : ''}macOS kept the DMG volume busy, so the installers are being built once more.`);
    output = await build(packageOptions());
  }
  if (process.platform === 'win32' && process.argv.includes('--upgrade-test')) {
    const parts = pkg.version.split('.').map(Number);
    const upgradeVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    const upgradeOptions = packageOptions();
    upgradeOptions.config.extraMetadata = { version: upgradeVersion };
    upgradeOptions.config.directories.output = path.join(repo, 'release/windows-upgrade-test');
    await build(upgradeOptions);
  }
  console.info(`Desktop output: ${output.join(', ') || path.join(repo, 'release/desktop')}`);
}
console.info(releaseBuild ? 'Artifacts built. Verify them and sign the release manifest before publishing.' : 'Local unsigned build. This is not a published release.');
fs.rmSync(stage, { recursive: true, force: true });

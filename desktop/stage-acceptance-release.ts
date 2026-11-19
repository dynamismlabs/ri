/** Stage the packaged app's bundled release once, into the install root every
 * packaged acceptance Home in this CI job shares (RI_ACCEPTANCE_INSTALL_ROOT).
 * Each Home's first start then finds the release in the store and verifies it,
 * as a second Home on one computer does, instead of copying the whole release
 * again. A Mac CI runner takes minutes for each copy. The recovery smoke keeps
 * its own install root, so a first start from nothing is still checked.
 * RI_DESKTOP_PACKAGE=... RI_ACCEPTANCE_INSTALL_ROOT=... pnpm exec tsx desktop/stage-acceptance-release.ts */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { desktopPackageLayout } from './package-layout';
import { latestRelease, stageRelease } from '../src/lib/service/store';

const pkg = process.env.RI_DESKTOP_PACKAGE;
const base = process.env.RI_ACCEPTANCE_INSTALL_ROOT;
assert(pkg, 'Set RI_DESKTOP_PACKAGE to the packaged application');
assert(base && path.isAbsolute(base), 'Set RI_ACCEPTANCE_INSTALL_ROOT to an absolute folder for this run');
fs.mkdirSync(base, { recursive: true, mode: 0o700 });
const started = Date.now();
const manifest = stageRelease(desktopPackageLayout(pkg).resources, base);
assert.equal(latestRelease(base), manifest.id);
console.info(JSON.stringify({ staged: manifest.id, version: manifest.version, files: manifest.files.length, seconds: Math.round((Date.now() - started) / 1000), base }, null, 2));

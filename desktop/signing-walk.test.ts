import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { MAC_SIGN_IGNORE } from './package-files.mjs';

const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const packager = createRequire(builder.resolve('app-builder-lib'));
const utilPath = packager.resolve('@electron/osx-sign/dist/cjs/util');
const { walkAsync } = packager(utilPath) as {
  walkAsync(directory: string, ignore?: (file: string) => boolean): Promise<string[]>;
};
const osxSignFs = createRequire(utilPath)('fs-extra') as {
  readdir(dir: string): Promise<string[]>;
};
const temporary: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('prunes the configured server and node runtime trees at their directory root during signing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-signing-walk-'));
  temporary.push(root);
  const contents = path.join(root, 'Ri.app/Contents');
  const macos = path.join(contents, 'MacOS');
  const resources = path.join(contents, 'Resources');
  const server = path.join(resources, 'server');
  const node = path.join(resources, 'node');
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(path.join(server, 'node_modules/.pnpm/dep'), { recursive: true });
  fs.mkdirSync(path.join(node, 'bin'), { recursive: true });
  const native = path.join(macos, 'shell.node');
  fs.writeFileSync(native, Buffer.from([0, 0, 0, 1]));
  fs.writeFileSync(path.join(server, 'node_modules/.pnpm/dep/dependency.node'), Buffer.from([0, 0, 0, 1]));
  fs.writeFileSync(path.join(node, 'bin/node'), Buffer.from([0, 0, 0, 1]));

  const ignorePatterns = MAC_SIGN_IGNORE.map(pattern => new RegExp(pattern));
  const visited: string[] = [];
  const readdirSpy = vi.spyOn(osxSignFs, 'readdir');
  const files = await walkAsync(contents, file => {
    visited.push(file);
    return ignorePatterns.some(pattern => pattern.test(file));
  });

  expect(files).toEqual([native]);
  expect(visited).toContain(server);
  expect(visited).toContain(node);
  expect(visited.some(file => file.startsWith(`${server}${path.sep}`))).toBe(false);
  expect(visited.some(file => file.startsWith(`${node}${path.sep}`))).toBe(false);
  expect(readdirSpy).not.toHaveBeenCalledWith(server);
  expect(readdirSpy).not.toHaveBeenCalledWith(node);
});

it('still discovers a native file when no ignore rule is supplied', async () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-signing-walk-'));
  temporary.push(app);
  const native = path.join(app, 'shell.node');
  fs.writeFileSync(native, Buffer.from([0, 0, 0, 1]));
  expect(await walkAsync(app)).toEqual([native]);
});

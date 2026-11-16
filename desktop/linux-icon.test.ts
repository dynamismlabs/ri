import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { LINUX_ICON_RELATIVE_PATH } from './package-files.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const packager = createRequire(builder.resolve('app-builder-lib'));
const { convertIcon } = packager('./util/iconConverter') as {
  convertIcon(opts: {
    sources: string[];
    fallbackSources: string[];
    roots: string[];
    format: 'icns' | 'ico' | 'set';
    outDir: string;
  }): Promise<{ icons: Array<{ file: string; size: number }>; isFallback: boolean }>;
};

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

it('resolves the configured Linux AppImage icon without falling back to the default Electron icon', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-linux-icon-'));
  temporary.push(outDir);
  const iconPath = path.join(repo, LINUX_ICON_RELATIVE_PATH);
  const result = await convertIcon({
    sources: [iconPath, path.join(repo, 'assets/brand/icons/icon.icns')],
    fallbackSources: [],
    roots: [path.join(repo, 'assets/brand/icons')],
    format: 'set',
    outDir,
  });

  expect(result.isFallback).toBe(false);
  expect(result.icons).toEqual([{ file: iconPath, size: 512 }]);
});

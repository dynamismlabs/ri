import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadRelease, type Release } from './release';
import { getRuntimeInstallDir } from './runtime';
const mocked = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./release-trust', async original => ({ ...await original<object>(), secureFetch: mocked.fetch }));
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-download-test-')); vi.stubEnv('RI_ROOT', path.join(root, 'home')); vi.stubEnv('RI_INSTALL_ROOT', path.join(root, 'runtime')); });
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const release = { runtime: { id: 'a'.repeat(64), url: 'https://publisher.invalid/runtime', size: 4, unpackedSize: 100, sha256: 'b'.repeat(64) } } as Release;
it('rejects an altered download before inspecting or installing it', async () => {
  mocked.fetch.mockResolvedValue(new Response('data'));
  await expect(downloadRelease(release)).rejects.toThrow('checksum');
});
it('stops an oversized response instead of buffering the full body', async () => {
  mocked.fetch.mockResolvedValue(new Response('longer than the signed size'));
  await expect(downloadRelease(release)).rejects.toThrow('signed download size');
});
it('leaves no partial file behind when a download stops before its file opens', async () => {
  for (let attempt = 0; attempt < 200; attempt++) {
    mocked.fetch.mockResolvedValue(new Response('longer than the signed size'));
    await expect(downloadRelease(release)).rejects.toThrow('signed download size');
    // The file stream opens asynchronously. Give a late open time to land.
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(fs.readdirSync(path.join(getRuntimeInstallDir(), 'downloads'))).toEqual([]);
  }
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertDesktopPackagingRuntime, DESKTOP_NODE_VERSION, macSigning } from './package-preflight.mjs';

it.each(['darwin', 'linux'] as const)('supports both package architectures on %s using the pinned runtime', platform => {
  for (const arch of ['arm64', 'x64']) expect(() => assertDesktopPackagingRuntime({ platform, arch, nodeVersion: DESKTOP_NODE_VERSION })).not.toThrow();
  expect(fs.readFileSync(path.resolve(__dirname, '../.nvmrc'), 'utf8').trim()).toBe(DESKTOP_NODE_VERSION);
});

it.each(['24.2.0', '26.4.0', '26.5.1'])('rejects Node %s instead of mixing native module ABIs', nodeVersion => {
  expect(() => assertDesktopPackagingRuntime({ platform: 'darwin', arch: 'arm64', nodeVersion })).toThrow(/Build with pinned Node 26\.5\.0/);
});

it('rejects unsupported operating systems and architectures', () => {
  expect(() => assertDesktopPackagingRuntime({ platform: 'win32', arch: 'x64', nodeVersion: DESKTOP_NODE_VERSION })).not.toThrow();
  expect(() => assertDesktopPackagingRuntime({ platform: 'win32', arch: 'arm64', nodeVersion: DESKTOP_NODE_VERSION })).toThrow(/Windows x64/);
  expect(() => assertDesktopPackagingRuntime({ platform: 'linux', arch: 'ia32', nodeVersion: DESKTOP_NODE_VERSION })).toThrow(/matching macOS\/Linux/);
});

it.each([
  { property: 'node', value: '24.2.0', message: 'Build with pinned Node 26.5.0' },
  { property: 'platform', value: 'freebsd', message: 'Build on the matching macOS/Linux arm64/x64 or Windows x64 host.' },
])('the real package entrypoint rejects $property before writing or building', ({ property, value, message }) => {
  // Run the actual entrypoint with mutation/build tripwires. A late guard
  // fails this test safely before it can create artifacts or start pnpm.
  const preload = `
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    Object.defineProperty(${property === 'node' ? 'process.versions' : 'process'}, ${JSON.stringify(property)}, { value: ${JSON.stringify(value)} });
    const refuse = () => { throw new Error('PACKAGING_SIDE_EFFECT_BEFORE_PREFLIGHT'); };
    for (const name of ['mkdirSync', 'mkdtempSync', 'writeFileSync', 'copyFileSync', 'cpSync', 'renameSync', 'rmSync', 'createWriteStream']) fs[name] = refuse;
    for (const name of ['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec', 'fork']) childProcess[name] = refuse;
    globalThis.fetch = refuse;
    syncBuiltinESMExports();
  `;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, path.resolve(__dirname, 'package.mjs')], {
    env, encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(message);
  expect(result.stdout + result.stderr).not.toContain('PACKAGING_SIDE_EFFECT_BEFORE_PREFLIGHT');
});

describe('Mac signing', () => {
  const key = path.join(os.tmpdir(), `ri-preflight-${process.pid}.p8`);
  const notarizing = { CSC_NAME: 'Example Inc. (ABCDE12345)', APPLE_API_KEY: key, APPLE_API_KEY_ID: 'KEY123', APPLE_API_ISSUER: 'issuer-uuid' };
  beforeAll(() => fs.writeFileSync(key, '-----BEGIN PRIVATE KEY-----\n'));
  afterAll(() => fs.rmSync(key, { force: true }));

  it('ad-hoc signs a dmg to hand someone, and leaves other builds and platforms alone', () => {
    expect(macSigning({ platform: 'darwin', share: true, env: {} })).toEqual({ identity: '-', notarize: false });
    expect(macSigning({ platform: 'darwin', env: notarizing })).toEqual({ identity: null, notarize: false });
    expect(macSigning({ platform: 'linux', release: true, env: notarizing })).toEqual({ identity: null, notarize: false });
    expect(macSigning({ platform: 'win32', share: true, env: notarizing })).toEqual({ identity: null, notarize: false });
  });

  it('signs and notarizes any Mac build with a Developer ID, through its own keychain in CI', () => {
    for (const build of [{ release: true }, { share: true }]) {
      expect(macSigning({ platform: 'darwin', ...build, env: { ...notarizing, CSC_KEYCHAIN: '/tmp/ri.keychain-db' } })).toEqual({
        identity: 'Example Inc. (ABCDE12345)', codesignIdentity: 'Developer ID Application: Example Inc. (ABCDE12345)', notarize: true, keychain: '/tmp/ri.keychain-db',
      });
    }
  });

  it('refuses a release without a Developer ID, and any setup that would sign without notarizing', () => {
    expect(() => macSigning({ platform: 'darwin', release: true, env: {} })).toThrow('A Mac release needs a Developer ID');
    expect(() => macSigning({ platform: 'darwin', share: true, env: { ...notarizing, CSC_NAME: 'Developer ID Application: Example Inc. (ABCDE12345)' } })).toThrow('without "Developer ID Application:"');
    expect(() => macSigning({ platform: 'darwin', release: true, env: { ...notarizing, APPLE_ID: 'me@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'x' } })).toThrow('not an Apple ID');
    expect(() => macSigning({ platform: 'darwin', release: true, env: { CSC_NAME: notarizing.CSC_NAME, APPLE_API_KEY_ID: 'KEY123' } })).toThrow('needs APPLE_API_KEY, APPLE_API_ISSUER');
    expect(() => macSigning({ platform: 'darwin', release: true, env: { ...notarizing, APPLE_API_KEY: '-----BEGIN PRIVATE KEY-----' } })).toThrow('path to the App Store Connect key');
  });

  it('the real package entrypoint refuses Apple ID notarization before writing or building', () => {
    const preload = `
      import fs from 'node:fs';
      import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(DESKTOP_NODE_VERSION)} });
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      const refuse = () => { throw new Error('PACKAGING_SIDE_EFFECT_BEFORE_PREFLIGHT'); };
      for (const name of ['mkdirSync', 'mkdtempSync', 'writeFileSync', 'copyFileSync', 'cpSync', 'renameSync', 'rmSync', 'createWriteStream']) fs[name] = refuse;
      for (const name of ['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec', 'fork']) childProcess[name] = refuse;
      globalThis.fetch = refuse;
      syncBuiltinESMExports();
    `;
    const env: NodeJS.ProcessEnv = { ...process.env, ...notarizing, APPLE_ID: 'me@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'x' };
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, path.resolve(__dirname, 'package.mjs'), '--release'], {
      env, encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not an Apple ID');
    expect(result.stdout + result.stderr).not.toContain('PACKAGING_SIDE_EFFECT_BEFORE_PREFLIGHT');
  });
});

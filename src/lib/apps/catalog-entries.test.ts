import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bundled from './catalog.json';
import { CatalogEntrySchema, CatalogSchema, catalogSerial } from './catalog-entries';
import { catalogEntry, readCatalog } from './catalog-feed';

const entry = {
  id: 'reading-log', name: 'Reading Log', description: 'Books you read.', reaches: [], git: 'https://github.com/example/reading-log.git',
  version: 'v1.2.0', checksum: `sha256-${'a'.repeat(64)}`,
};

afterEach(() => { vi.unstubAllEnvs(); });

describe('catalog entries', () => {
  it('ships a valid catalog, with a serial for the feed to be newer than', () => {
    const parsed = CatalogSchema.safeParse(bundled);
    expect(parsed.success).toBe(true);
    expect(catalogSerial(parsed.data!)).toBeGreaterThan(0);
  });

  it('takes an https repository or a folder on this computer, and nothing that runs commands', () => {
    for (const git of ['https://github.com/example/app.git', '/Users/me/dynamism/apps/travel', 'file:///Users/me/apps/x']) {
      expect(CatalogEntrySchema.safeParse({ ...entry, git }).success).toBe(true);
    }
    for (const git of ['ext::sh -c touch% /tmp/pwned', 'http://example.com/app.git', 'git@github.com:example/app.git', 'https://user:pw@example.com/x.git', 'relative/path']) {
      expect(CatalogEntrySchema.safeParse({ ...entry, git }).success).toBe(false);
    }
  });

  it('takes a tag or commit that can name a git ref, never an option', () => {
    for (const version of ['v1.2.0', '3f2a9c1d0b7e', 'release/2026-11']) expect(CatalogEntrySchema.safeParse({ ...entry, version }).success).toBe(true);
    for (const version of ['-upload-pack=x', 'a..b', 'v1.lock', 'v1/', '.hidden', 'v 1', 'a/.b']) expect(CatalogEntrySchema.safeParse({ ...entry, version }).success).toBe(false);
  });

  it('needs a sha256 checksum and one entry per ID', () => {
    expect(CatalogEntrySchema.safeParse({ ...entry, checksum: 'abc' }).success).toBe(false);
    expect(CatalogSchema.safeParse({ apps: [entry, entry] }).success).toBe(false);
  });

  it('reads another catalog for development, and says when it isn\'t valid', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ri-catalog-')), 'catalog.json');
    fs.writeFileSync(file, JSON.stringify({ apps: [entry] }));
    vi.stubEnv('RI_APP_CATALOG', file);
    expect(await readCatalog()).toEqual([entry]);
    expect((await catalogEntry('reading-log'))?.name).toBe('Reading Log');
    expect(await catalogEntry('nope')).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ apps: [{ ...entry, git: 'ext::x' }] }));
    await expect(readCatalog()).rejects.toThrow(/isn’t valid/);
  });

  it('counts a catalog without a serial as 0', () => {
    expect(catalogSerial(CatalogSchema.parse({ apps: [entry] }))).toBe(0);
    expect(CatalogSchema.safeParse({ serial: -1, apps: [] }).success).toBe(false);
    expect(CatalogSchema.safeParse({ serial: 1.5, apps: [] }).success).toBe(false);
  });
});

/**
 * `read_docs` through the real dispatcher, as a chat calls it over MCP or
 * `ri agent read_docs`: a guide folder in the running release's place
 * (`RI_RUNTIME_REPO`), listed, searched and read, with the error envelope an
 * agent gets for a page that isn't there.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { runAction } from './dispatch';

let home: TestHome;
let release: string;

function write(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-read-docs-' });
  release = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-read-docs-release-'));
  const guide = path.join(release, 'guide');
  write(path.join(guide, 'meta.json'), JSON.stringify({ title: 'Ri', pages: ['index', 'guides'] }));
  write(path.join(guide, 'index.md'), '---\ntitle: Ri docs\ndescription: The docs home.\n---\n\nWelcome.\n');
  write(path.join(guide, 'guides/meta.json'), JSON.stringify({ title: 'Guides', pages: ['keyboard-shortcuts', 'voice'] }));
  write(path.join(guide, 'guides/keyboard-shortcuts.md'), '---\ntitle: Keyboard shortcuts\ndescription: Every shortcut.\n---\n\nPress ⌘K to search.\n');
  write(path.join(guide, 'guides/voice.md'), '---\ntitle: Voice\ndescription: Talk instead of typing.\n---\n\nUse the keyboard less: press ⌘J.\n');
  vi.stubEnv('RI_RUNTIME_REPO', release);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  fs.rmSync(release, { recursive: true, force: true });
  await home.cleanup();
});

const LOCAL = { remote: false } as const;
const REMOTE = { remote: true, caller: { location: 'elsewhere' as const } };

describe('read_docs', () => {
  it('lists every page in order with no params', async () => {
    const envelope = await runAction('read_docs', {}, LOCAL);
    expect(envelope.ok).toBe(true);
    expect(envelope.result?.pages).toEqual([
      { id: 'index', title: 'Ri docs', description: 'The docs home.', url: 'https://ri.app/docs', section: null },
      { id: 'guides/keyboard-shortcuts', title: 'Keyboard shortcuts', description: 'Every shortcut.', url: 'https://ri.app/docs/guides/keyboard-shortcuts', section: 'Guides' },
      { id: 'guides/voice', title: 'Voice', description: 'Talk instead of typing.', url: 'https://ri.app/docs/guides/voice', section: 'Guides' },
    ]);
  });

  it('searches, title matches first, the same for a remote caller', async () => {
    for (const ctx of [LOCAL, REMOTE]) {
      const envelope = await runAction('read_docs', { query: 'keyboard' }, ctx);
      expect(envelope.ok).toBe(true);
      const { results } = envelope.result as { results: Array<{ id: string; snippet: string }> };
      expect(results.map((r) => r.id)).toEqual(['guides/keyboard-shortcuts', 'guides/voice']);
      expect(results[1].snippet).toBe('Use the keyboard less: press ⌘J.');
    }
    const none = await runAction('read_docs', { query: 'billing' }, LOCAL);
    expect(none.result).toMatchObject({ results: [], hint: expect.stringContaining('Nothing matched') });
  });

  it('reads a page by id, path or address, without saying where the files are', async () => {
    for (const page of ['guides/voice', '/docs/guides/voice', 'https://ri.app/docs/guides/voice']) {
      const envelope = await runAction('read_docs', { page }, REMOTE);
      expect(envelope.result).toEqual({
        id: 'guides/voice',
        title: 'Voice',
        description: 'Talk instead of typing.',
        url: 'https://ri.app/docs/guides/voice',
        markdown: 'Use the keyboard less: press ⌘J.',
      });
    }
    expect(JSON.stringify(await runAction('read_docs', {}, REMOTE))).not.toContain(release);
  });

  it('names close matches for a page that does not exist', async () => {
    const envelope = await runAction('read_docs', { page: 'guides/keyboard-shortcut' }, LOCAL);
    expect(envelope.ok).toBe(false);
    expect(envelope.error).toMatchObject({
      code: 'not_found',
      message: 'No guide page "guides/keyboard-shortcut". Close matches: guides/keyboard-shortcuts.',
      details: { closeMatches: ['guides/keyboard-shortcuts'] },
    });
  });

  it('takes a page or a query, not both, and no empty page', async () => {
    expect((await runAction('read_docs', { page: 'index', query: 'x' }, LOCAL)).error?.code).toBe('invalid_params');
    expect((await runAction('read_docs', { page: '' }, LOCAL)).error?.code).toBe('invalid_params');
  });

  it('says where to read the guide when this copy has none', async () => {
    fs.rmSync(path.join(release, 'guide'), { recursive: true });
    const envelope = await runAction('read_docs', {}, LOCAL);
    expect(envelope.error).toMatchObject({ code: 'unsupported', suggestion: 'Read it at https://ri.app/docs.' });
  });
});

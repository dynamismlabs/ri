import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeGuideMatches,
  findGuidePage,
  guidePageUrl,
  guideRoot,
  loadGuide,
  normalizePageId,
  searchGuide,
  splitFrontmatter,
} from './guide';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** A guide folder from `{ relative path: contents }`, objects written as JSON. */
function fixture(files: Record<string, string | object>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-guide-'));
  dirs.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return root;
}

const page = (title: string, description: string, body = '') => `---\ntitle: ${title}\ndescription: ${description}\n---\n\n${body}\n`;

const sample = () => fixture({
  'meta.json': { title: 'Ri', pages: ['index', 'getting-started', 'concepts'] },
  'index.md': page('Ri docs', 'What Ri is and how these docs are organized.', 'Start with [install](/docs/getting-started/install).'),
  'getting-started/meta.json': { title: 'Getting started', pages: ['install', 'first-run'] },
  'getting-started/install.md': page('Install Ri', 'Get Ri on your computer or a server.', '## On a server\n\nRun the installer, then `ri start`.'),
  'getting-started/first-run.md': page('First run', 'What happens the first time you open Ri.', 'Pick a harness and sign in. Your phone can connect later.'),
  'concepts/meta.json': { title: 'How Ri works', pages: ['agents'] },
  'concepts/agents.md': page('Agents', 'An agent is a folder, its tools and its standing instructions.', 'Each agent has a main chat. Phone users see it too.'),
  'concepts/chats.md': page('Chats', 'A chat is one piece of work an agent does.', 'Chats run on a harness.'),
});

describe('loadGuide', () => {
  it('lists pages in meta.json order, folders in place, unlisted pages after the listed ones', () => {
    const pages = loadGuide(sample())!;
    expect(pages.map((p) => p.id)).toEqual([
      'index',
      'getting-started/install',
      'getting-started/first-run',
      'concepts/agents',
      'concepts/chats',
    ]);
    expect(pages[1]).toMatchObject({
      title: 'Install Ri',
      description: 'Get Ri on your computer or a server.',
      url: 'https://ri.app/docs/getting-started/install',
      section: 'Getting started',
    });
    expect(pages[0]).toMatchObject({ url: 'https://ri.app/docs', section: null });
    expect(pages[1].markdown).toBe('## On a server\n\nRun the installer, then `ri start`.');
  });

  it('is null when there is no guide folder', () => {
    expect(loadGuide(path.join(os.tmpdir(), 'ri-guide-missing-folder'))).toBeNull();
  });

  it('orders a folder with no meta.json by name with its index first, and skips what is not a page', () => {
    const root = fixture({
      'zeta.md': page('Zeta', 'Last.'),
      'alpha.md': page('Alpha', 'First.'),
      'index.md': page('Home', 'The home page.'),
      'notes.txt': 'not a page',
      '.hidden.md': page('Hidden', 'Never listed.'),
    });
    expect(loadGuide(root)!.map((p) => p.id)).toEqual(['index', 'alpha', 'zeta']);
  });

  it('falls back to the first heading for a page without frontmatter, and ignores meta entries that are not there', () => {
    const root = fixture({
      'meta.json': { pages: ['---Separator---', 'missing', 'plain'] },
      'plain.md': '# Plain page\n\nNo frontmatter here.',
    });
    expect(loadGuide(root)).toEqual([expect.objectContaining({ id: 'plain', title: 'Plain page', description: '' })]);
  });

  it('skips a page bigger than the limit', () => {
    const root = fixture({ 'big.md': page('Big', 'Too big.', 'x'.repeat(1024 * 1024 + 1)), 'small.md': page('Small', 'Fine.') });
    expect(loadGuide(root)!.map((p) => p.id)).toEqual(['small']);
  });
});

describe('page lookup', () => {
  it('accepts ids, /docs paths, ri.app addresses and .md names', () => {
    expect(normalizePageId('getting-started/install')).toBe('getting-started/install');
    expect(normalizePageId('/docs/getting-started/install')).toBe('getting-started/install');
    expect(normalizePageId('https://ri.app/docs/getting-started/install#server')).toBe('getting-started/install');
    expect(normalizePageId('guide/getting-started/install.md')).toBe('getting-started/install');
    expect(normalizePageId('https://ri.app/docs')).toBe('index');
    expect(normalizePageId('  ')).toBe('index');
  });

  it('finds a page, and a folder by its index page', () => {
    const pages = loadGuide(fixture({
      'index.md': page('Home', 'Home.'),
      'concepts/index.md': page('Concepts', 'Concepts.'),
    }))!;
    expect(findGuidePage(pages, '/docs')?.id).toBe('index');
    expect(findGuidePage(pages, 'concepts')?.id).toBe('concepts/index');
    expect(findGuidePage(pages, 'nope')).toBeNull();
    expect(guidePageUrl('concepts/index')).toBe('https://ri.app/docs/concepts');
  });

  it('names close matches for a page that does not exist', () => {
    const pages = loadGuide(sample())!;
    expect(closeGuideMatches(pages, 'getting-started/instal')).toEqual(['getting-started/install']);
    expect(closeGuideMatches(pages, 'agents')[0]).toBe('concepts/agents');
    expect(closeGuideMatches(pages, 'concepts/chat')[0]).toBe('concepts/chats');
    expect(closeGuideMatches(pages, 'billing')).toEqual([]);
  });
});

describe('searchGuide', () => {
  it('ranks title matches before description matches before text matches', () => {
    const pages = loadGuide(sample())!;
    const results = searchGuide(pages, 'phone');
    expect(results.map((r) => r.id)).toEqual(['getting-started/first-run', 'concepts/agents']);
    expect(searchGuide(pages, 'agents').map((r) => r.id)[0]).toBe('concepts/agents');
    expect(searchGuide(pages, 'harness').map((r) => r.id)).toEqual(['getting-started/first-run', 'concepts/chats']);
  });

  it('puts pages matching more of the words first within a tier, and ignores stop words', () => {
    const pages = loadGuide(sample())!;
    const results = searchGuide(pages, 'how do I sign in to a harness');
    expect(results[0].id).toBe('getting-started/first-run');
    expect(searchGuide(pages, 'how do I')).toEqual([]);
  });

  it('returns a snippet from the line that matched', () => {
    const pages = loadGuide(sample())!;
    const [result] = searchGuide(pages, 'installer');
    expect(result).toMatchObject({ id: 'getting-started/install', url: 'https://ri.app/docs/getting-started/install' });
    expect(result.snippet).toBe('Run the installer, then `ri start`.');
    expect(result).not.toHaveProperty('markdown');
  });

  it('shortens a long matching line around the match', () => {
    const long = `${'word '.repeat(80)}needle ${'more '.repeat(80)}`;
    const pages = loadGuide(fixture({ 'a.md': page('A', 'A page.', long) }))!;
    const [result] = searchGuide(pages, 'needle');
    expect(result.snippet).toContain('needle');
    expect(result.snippet.length).toBeLessThanOrEqual(202);
    expect(result.snippet.startsWith('…')).toBe(true);
  });

  it('honours the limit', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i++) files[`p${i}.md`] = page(`Page ${i}`, 'Shared words.');
    expect(searchGuide(loadGuide(fixture(files))!, 'shared', 5)).toHaveLength(5);
  });
});

describe('splitFrontmatter', () => {
  it('reads quoted values and leaves a page without a closing fence alone', () => {
    expect(splitFrontmatter('---\ntitle: "A: B"\n---\nBody').data).toEqual({ title: 'A: B' });
    expect(splitFrontmatter('---\ntitle: A\nBody')).toEqual({ data: {}, body: '---\ntitle: A\nBody' });
    expect(splitFrontmatter('---\n: [\n---\nBody')).toEqual({ data: {}, body: 'Body' });
  });
});

describe('guideRoot', () => {
  it('is the guide folder of the running release, packaged or in the desktop app', () => {
    vi.stubEnv('RI_RUNTIME_REPO', '/opt/ri/server');
    expect(guideRoot()).toBe(path.resolve('/opt/ri/server/guide'));
    vi.stubEnv('RI_RUNTIME_REPO', '');
    vi.stubEnv('RI_DESKTOP', '1');
    vi.stubEnv('RI_DESKTOP_REPO', '/Applications/Ri.app/Contents/Resources/server');
    expect(guideRoot()).toBe(path.resolve('/Applications/Ri.app/Contents/Resources/server/guide'));
  });
});

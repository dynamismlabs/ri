/**
 * The guide in this checkout keeps its contract with the website and its
 * voice (AGENTS.md, "The user guide"). Every page is plain Markdown with a
 * title and a one-sentence description, every folder's meta.json lists
 * exactly what's in it, every /docs link goes to a page, and the copy reads
 * like the rest of ri.app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guideRoot, loadGuide, splitFrontmatter } from './guide';

const ROOT = path.resolve(__dirname, '../../../guide');
/** Written from the code by `pnpm guide:reference`, in the code's own words. */
const GENERATED = new Set(['reference/cli', 'reference/actions']);

interface PageFile { id: string; file: string; text: string }

function pageFiles(dir = ROOT, prefix = ''): PageFile[] {
  const files: PageFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...pageFiles(file, `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.md')) files.push({ id: `${prefix}${entry.name.slice(0, -3)}`, file, text: fs.readFileSync(file, 'utf8') });
  }
  return files;
}

function folders(dir = ROOT): string[] {
  return [dir, ...fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((e) => folders(path.join(dir, e.name)))];
}

/** The page's text outside code blocks and inline code, which is the prose a person reads. */
function prose(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

const pages = pageFiles();
const ids = new Set(pages.map((p) => p.id));
const written = pages.filter((p) => !GENERATED.has(p.id));

afterEach(() => { vi.unstubAllEnvs(); });

describe('the guide', () => {
  it('has a home page and the generated reference', () => {
    expect(ids.has('index')).toBe(true);
    for (const id of GENERATED) expect(ids.has(id), id).toBe(true);
    expect(loadGuide(ROOT)?.[0]?.id).toBe('index');
  });

  it('is where read_docs looks in a checkout', () => {
    vi.stubEnv('RI_RUNTIME_REPO', '');
    vi.stubEnv('RI_DESKTOP', '');
    expect(guideRoot()).toBe(ROOT);
    expect(loadGuide()?.length).toBe(pages.length);
  });

  it('opens every page with a title and a one-sentence description', () => {
    for (const page of pages) {
      expect(page.text.startsWith('---\n'), `${page.id} starts with frontmatter`).toBe(true);
      const { data } = splitFrontmatter(page.text);
      expect(Object.keys(data).sort(), `${page.id} frontmatter keys`).toEqual(['description', 'title']);
      expect(typeof data.title === 'string' && data.title.trim().length > 0, `${page.id} title`).toBe(true);
      const description = String(data.description ?? '');
      expect(description, `${page.id} description is one sentence ending in a full stop`).toMatch(/^[^\n]+\.$/);
      expect(description.slice(0, -1), `${page.id} description is one sentence`).not.toMatch(/[.!?]\s/);
    }
  });

  it('gives every folder a meta.json listing exactly its pages and folders', () => {
    for (const dir of folders()) {
      const where = path.relative(ROOT, dir) || 'guide';
      const metaFile = path.join(dir, 'meta.json');
      expect(fs.existsSync(metaFile), `${where}/meta.json`).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { title?: unknown; pages?: unknown };
      expect(Object.keys(meta).sort(), `${where}/meta.json keys`).toEqual(['pages', 'title']);
      expect(typeof meta.title, `${where}/meta.json title`).toBe('string');
      const present = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() || (e.name.endsWith('.md')))
        .map((e) => e.isDirectory() ? e.name : e.name.slice(0, -3));
      expect([...(meta.pages as string[])].sort(), `${where}/meta.json pages`).toEqual(present.sort());
    }
  });

  it('links between pages with /docs paths that exist', () => {
    for (const page of pages) {
      for (const [, target] of page.text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^https?:\/\//.test(target)) continue;
        expect(target, `${page.id} links with /docs paths, not files`).toMatch(/^\/docs(\/|$|#)/);
        const id = target.replace(/#.*$/, '').replace(/^\/docs\/?/, '') || 'index';
        expect(ids.has(id) || ids.has(`${id}/index`), `${page.id} links to ${target}, which is not a page`).toBe(true);
      }
    }
  });

  it('is plain Markdown: no HTML, JSX, expressions or images', () => {
    for (const page of pages) {
      const text = prose(splitFrontmatter(page.text).body);
      expect(text, `${page.id} has HTML or JSX`).not.toMatch(/<\/?[A-Za-z][^>]*>/);
      expect(text, `${page.id} has a {expression}`).not.toMatch(/[{}]/);
      expect(text, `${page.id} has an image`).not.toMatch(/!\[/);
    }
  });

  it('never uses long dashes', () => {
    for (const page of pages) expect(page.text, page.id).not.toMatch(/[—–]/);
  });

  it('reads like ri.app: no semicolons, the app\'s words, no internal paths', () => {
    const banned = /\b(workspaces?|executions?|integrations?|work OS|AI-native|productivity|supercharge|seamless(?:ly)?|unlock)\b/i;
    for (const page of written) {
      const text = prose(page.text);
      expect(text, `${page.id} has a semicolon`).not.toMatch(/;/);
      expect(text.match(banned)?.[0] ?? null, `${page.id} uses a word the app doesn't`).toBeNull();
      expect(page.text, `${page.id} names a source file`).not.toMatch(/\bsrc\/|\bdocs\/[a-z-]+\.md|\.tsx?\b/);
    }
  });
});

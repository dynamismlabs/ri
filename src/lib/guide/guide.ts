/**
 * Ri's user guide: the Markdown pages in `guide/` at the root of the
 * checkout, which every release ships beside its server (desktop/package.mjs).
 * The same files are the docs on ri.app, so the guide an agent reads here
 * always matches the version of Ri that is running.
 *
 * The folder is read when asked, never built or cached: a page edited in a
 * checkout is what the next call returns. It is a few dozen small files, so
 * reading all of them for a list or a search costs a few milliseconds, and
 * the limits below keep a stray folder from costing more.
 *
 * The format is a contract with the website (AGENTS.md, guide/):
 * - Every page is a `.md` file opening with YAML frontmatter holding `title`
 *   and a one-sentence `description`.
 * - Each folder has a Fumadocs `meta.json` (`{ "title", "pages" }`) giving
 *   its order. A folder entry is the folder's name.
 * - A page's id is its path under `guide/` without `.md`, and its public
 *   address is `https://ri.app/docs/<id>`, with `index` pages at their
 *   folder's address.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { DOCS_URL } from '@/constants/app';
import { runtimeRepository } from '@/lib/releases/runtime-identity';

/** Where the guide is published. A page's address is this plus its id. */
export const GUIDE_URL = DOCS_URL;

/** Deeper than the guide will ever go, so a linked folder can't run away. */
const MAX_DEPTH = 4;
const MAX_PAGES = 500;
/** The largest page read. The generated reference pages are the biggest, well under this. */
const MAX_PAGE_BYTES = 1024 * 1024;

export interface GuidePageSummary {
  /** The page's path under `guide/` without `.md`, such as `getting-started/install`. */
  id: string;
  title: string;
  description: string;
  /** Its address on ri.app. */
  url: string;
  /** The title of the folder it's in, or null for a page at the top. */
  section: string | null;
}

export interface GuidePage extends GuidePageSummary {
  /** The page's Markdown, without its frontmatter. */
  markdown: string;
}

export interface GuideSearchResult extends GuidePageSummary {
  /** A short piece of the page around the first match. */
  snippet: string;
}

/**
 * The guide folder of the Ri that is running: a release's own copy, or the
 * checkout's in development. Resolved like the migrations folder
 * (src/lib/db/index.ts), from this code's install and never from the
 * shell's folder, since an agent's `ri agent read_docs` runs in its own.
 */
export function guideRoot(): string {
  const repo = process.env.RI_RUNTIME_REPO
    || (process.env.RI_DESKTOP === '1' ? process.env.RI_DESKTOP_REPO : undefined)
    || runtimeRepository();
  return path.resolve(/* turbopackIgnore: true */ repo, 'guide');
}

/** The public address of a page id. */
export function guidePageUrl(id: string): string {
  if (id === 'index') return GUIDE_URL;
  return `${GUIDE_URL}/${id.replace(/\/index$/, '')}`;
}

/**
 * Every page in the guide, in the order its `meta.json` files give, with
 * pages a `meta.json` leaves out after the listed ones. Null when there is
 * no guide folder at `root`.
 */
export function loadGuide(root: string = guideRoot()): GuidePage[] | null {
  if (!isDirectory(root)) return null;
  const pages: GuidePage[] = [];

  const visit = (dir: string, prefix: string, section: string | null, depth: number) => {
    if (depth > MAX_DEPTH || pages.length >= MAX_PAGES) return;
    const entries = new Map<string, 'page' | 'folder'>();
    for (const entry of fs.readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) entries.set(entry.name, 'folder');
      else if (entry.isFile() && entry.name.endsWith('.md')) entries.set(entry.name.slice(0, -3), 'page');
    }
    const meta = readMeta(path.join(/* turbopackIgnore: true */ dir, 'meta.json'));
    const listed = (meta?.pages ?? []).filter((name) => entries.has(name));
    const rest = [...entries.keys()].filter((name) => !listed.includes(name)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    for (const name of [...listed, ...rest]) {
      if (pages.length >= MAX_PAGES) return;
      const id = prefix ? `${prefix}/${name}` : name;
      if (entries.get(name) === 'folder') {
        const folder = path.join(/* turbopackIgnore: true */ dir, name);
        const title = readMeta(path.join(/* turbopackIgnore: true */ folder, 'meta.json'))?.title ?? name;
        visit(folder, id, title, depth + 1);
        continue;
      }
      const page = readPage(path.join(/* turbopackIgnore: true */ dir, `${name}.md`), id, section);
      if (page) pages.push(page);
    }
  };

  visit(root, '', null, 0);
  return pages;
}

/** Index pages lead their folder when no `meta.json` orders it. */
function sortKey(name: string): string {
  return name === 'index' ? '' : name;
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(/* turbopackIgnore: true */ dir).isDirectory();
  } catch {
    return false;
  }
}

function readMeta(file: string): { title?: string; pages?: string[] } | null {
  try {
    const meta = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8')) as unknown;
    if (!meta || typeof meta !== 'object') return null;
    const { title, pages } = meta as { title?: unknown; pages?: unknown };
    return {
      title: typeof title === 'string' ? title : undefined,
      pages: Array.isArray(pages) ? pages.filter((page): page is string => typeof page === 'string') : undefined,
    };
  } catch {
    return null;
  }
}

function readPage(file: string, id: string, section: string | null): GuidePage | null {
  try {
    const stat = fs.statSync(/* turbopackIgnore: true */ file);
    if (!stat.isFile() || stat.size > MAX_PAGE_BYTES) return null;
    const { data, body } = splitFrontmatter(fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8'));
    const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
    return {
      id,
      title: stringField(data.title) ?? heading ?? id,
      description: stringField(data.description) ?? '',
      url: guidePageUrl(id),
      section,
      markdown: body.trim(),
    };
  } catch {
    return null;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A page's YAML frontmatter and the Markdown after it. Malformed frontmatter reads as none. */
export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const source = text.replace(/^﻿/, '');
  const open = /^---\r?\n/.exec(source);
  if (!open) return { data: {}, body: source };
  const rest = source.slice(open[0].length);
  const close = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!close) return { data: {}, body: source };
  let data: unknown;
  try {
    data = parseYaml(rest.slice(0, close.index));
  } catch {
    data = null;
  }
  return {
    data: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {},
    body: rest.slice(close.index + close[0].length),
  };
}

/** What a page is called in a list, without its text. */
export function summarize(page: GuidePage): GuidePageSummary {
  return { id: page.id, title: page.title, description: page.description, url: page.url, section: page.section };
}

/**
 * The id a caller meant: a page id, a `/docs/...` path or a ri.app address,
 * with or without `.md`. An empty one is the docs home.
 */
export function normalizePageId(input: string): string {
  const id = input.trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .replace(/^\/+/, '')
    .replace(/^(?:docs|guide)(?:\/|$)/, '')
    .replace(/\.md$/i, '')
    .replace(/\/+$/, '');
  return id || 'index';
}

/** The page a caller asked for, or null. A folder's name finds its index page. */
export function findGuidePage(pages: GuidePage[], input: string): GuidePage | null {
  const id = normalizePageId(input);
  return pages.find((page) => page.id === id) ?? pages.find((page) => page.id === `${id}/index`) ?? null;
}

/** Up to three page ids close to one that doesn't exist, closest first. */
export function closeGuideMatches(pages: GuidePage[], input: string, limit = 3): string[] {
  const id = normalizePageId(input).toLowerCase();
  const leaf = id.split('/').pop() ?? id;
  return pages
    .map((page) => {
      const candidate = page.id.toLowerCase();
      const candidateLeaf = candidate.split('/').pop() ?? candidate;
      const contains = candidate.includes(leaf) || leaf.includes(candidateLeaf) || page.title.toLowerCase().includes(leaf);
      const distance = Math.min(editDistance(id, candidate), editDistance(leaf, candidateLeaf));
      return { id: page.id, score: contains ? distance - 100 : distance, near: contains || distance <= Math.max(2, Math.floor(leaf.length / 3)) };
    })
    .filter((match) => match.near)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((match) => match.id);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Words that say nothing about which page a question is about. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'or',
  'the', 'to', 'what', 'when', 'where', 'why', 'with', 'you', 'your',
]);

export function searchTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

/**
 * Pages matching a query, best first. A page whose title matches comes
 * before one whose description does, and both before a match only in its
 * text. Within each, pages matching more of the words come first, then
 * those that mention them more, then guide order.
 */
export function searchGuide(pages: GuidePage[], query: string, limit = 8): GuideSearchResult[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const phrase = query.trim().toLowerCase();
  const scored = pages.map((page, order) => {
    const title = page.title.toLowerCase();
    const description = page.description.toLowerCase();
    const body = page.markdown.toLowerCase();
    const inTitle = title.includes(phrase) || terms.some((term) => title.includes(term));
    const inDescription = description.includes(phrase) || terms.some((term) => description.includes(term));
    const matched = terms.filter((term) => title.includes(term) || description.includes(term) || body.includes(term));
    const mentions = terms.reduce((sum, term) => sum + Math.min(countOf(body, term), 20), 0);
    return { page, order, tier: inTitle ? 2 : inDescription ? 1 : 0, matched: matched.length, mentions };
  }).filter((result) => result.matched > 0);
  scored.sort((a, b) => b.tier - a.tier || b.matched - a.matched || b.mentions - a.mentions || a.order - b.order);
  return scored.slice(0, limit).map(({ page }) => ({ ...summarize(page), snippet: snippetFor(page, phrase, terms) }));
}

function countOf(text: string, term: string): number {
  let count = 0;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) count++;
  return count;
}

const SNIPPET_CHARS = 200;

/** The line around the first mention of the phrase, or else of the first word found. */
function snippetFor(page: GuidePage, phrase: string, terms: string[]): string {
  const lines = page.markdown.split('\n').map((line) => line.trim()).filter(Boolean);
  const find = (needle: string) => lines.find((line) => line.toLowerCase().includes(needle));
  const needle = find(phrase) ? phrase : terms.find((term) => find(term));
  const line = needle ? find(needle) : undefined;
  if (!line || !needle) return page.description;
  const text = line.replace(/^#+\s*/, '').replace(/\s+/g, ' ');
  if (text.length <= SNIPPET_CHARS) return text;
  const at = Math.max(0, text.toLowerCase().indexOf(needle) - SNIPPET_CHARS / 3);
  const piece = text.slice(at, at + SNIPPET_CHARS).trim();
  return `${at > 0 ? '…' : ''}${piece}${at + SNIPPET_CHARS < text.length ? '…' : ''}`;
}

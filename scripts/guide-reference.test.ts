import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { inlineText, REFERENCE_PAGES, renderReferences, typeLabel } from './guide-reference';

describe('the guide reference pages', () => {
  it('match the code. When this fails, run pnpm guide:reference and commit the pages', async () => {
    const pages = await renderReferences();
    for (const [key, relative] of Object.entries(REFERENCE_PAGES) as Array<[keyof typeof REFERENCE_PAGES, string]>) {
      const file = path.join(process.cwd(), relative);
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      expect(current === pages[key], `${relative} is stale. Run pnpm guide:reference and commit it.`).toBe(true);
    }
  });

  it('list every command and action', async () => {
    const { cli, actions } = await renderReferences();
    for (const command of ['ri start', 'ri stop', 'ri update', 'ri doctor', 'ri home export', 'ri agent']) expect(cli).toContain(`\n## ${command}\n`.replace('## ri home export', '### ri home export'));
    expect(cli).not.toContain('ri agent list_tasks');
    expect(actions).toContain('\n## read_docs\n');
    expect(actions).toContain('\n## list_tasks\n');
  });
});

describe('inlineText', () => {
  it('keeps text from the code on one line, without long dashes, safe in a table', () => {
    expect(inlineText('Deterministic — no deck\n  generation')).toBe('Deterministic, no deck generation');
    expect(inlineText('desktop | laptop', { table: true })).toBe('desktop \\| laptop');
  });

  it('ends a sentence where the code used a semicolon, but leaves code alone', () => {
    expect(inlineText('Safe under retry; pass the same key')).toBe('Safe under retry. Pass the same key');
    expect(inlineText('Run `a; b` first;')).toBe('Run `a; b` first.');
  });

  it('sets anything that reads as a tag or an expression as code, with its whole word', () => {
    expect(inlineText('Write a snapshot to <app-root>/snapshots/.')).toBe('Write a snapshot to `<app-root>/snapshots/`.');
    expect(inlineText('front it at <name>.localhost (default: ri)')).toBe('front it at `<name>.localhost` (default: ri)');
    expect(inlineText('Pass {"a":1} or `<kept>` as is')).toBe('Pass `{"a":1}` or `<kept>` as is');
  });
});

describe('typeLabel', () => {
  it('names a parameter type the way a person reads it', () => {
    expect(typeLabel(z.string().optional())).toBe('string');
    expect(typeLabel(z.number().int().positive())).toBe('integer');
    expect(typeLabel(z.enum(['todo', 'done']).nullable().optional())).toBe('"todo" or "done" or null');
    expect(typeLabel(z.array(z.string()))).toBe('list of string');
    expect(typeLabel(z.union([z.string(), z.array(z.string())]))).toBe('string or list of string');
    expect(typeLabel(z.object({ a: z.string() }))).toBe('object');
    expect(typeLabel(z.string().default('x'))).toBe('string');
    expect(typeLabel(z.string().refine(Boolean))).toBe('string');
  });
});

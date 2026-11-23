import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function sources(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(?:css|tsx?)$/.test(file) ? [file] : [];
  });
}
const files = sources(path.join(root, 'src'));
const css = files.filter(file => file.endsWith('.css')).map(file => ({ file, text: fs.readFileSync(file, 'utf8') }));

describe('component drawing ownership', () => {
  it('loads only existing CSS owners, with no old look stylesheet or broad utility overrides', () => {
    expect(fs.existsSync(path.join(root, 'src/styles/edge.css'))).toBe(false);
    const globals = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
    for (const match of globals.matchAll(/@import ['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) expect(fs.existsSync(path.resolve(root, 'src/app', match[1]))).toBe(true);
    }
    for (const owner of css) {
      expect(owner.text, owner.file).not.toMatch(/\[data-slot=["'](?:action-button|settings-body)["']\]|\.border\.bg-card|html:root\s+\.uppercase/);
    }
    expect(globals).not.toContain('styles/edge.css');
  });
  it('keeps each domain data-slot tied to CSS or an explicit test reader', () => {
    const readers = [...css.map(owner => owner.text), ...files.filter(file => file.includes('.test.')).map(file => fs.readFileSync(file, 'utf8'))].join('\n');
    const unmatched: string[] = [];
    for (const file of files.filter(file => file.endsWith('.tsx') && !file.includes('.test.') && !file.includes('/test/') && !file.includes('/components/ui/') && !file.includes('/components/system/'))) {
      const text = fs.readFileSync(file, 'utf8');
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxAttribute(node) && node.name.getText(source) === 'data-slot' && node.initializer && ts.isStringLiteral(node.initializer)) {
          const slot = node.initializer.text;
          if (!readers.includes(`[data-slot="${slot}"]`) && !readers.includes(`[data-slot='${slot}']`)) unmatched.push(`${path.relative(root, file)}: ${slot}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(unmatched).toEqual([]);
  });
});

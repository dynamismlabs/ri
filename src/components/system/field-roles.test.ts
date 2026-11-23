import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { expect, it } from 'vitest';

// Each exception names one field and its real row of compact controls.
const compactRows = [
  { file: 'src/components/agents/agent-preview.tsx', name: 'Chat to preview', row: 'preview selector beside compact controls' },
  { file: 'src/components/chat-ui/gallery/gallery.tsx', name: 'Example state', row: 'preview state beside compact actions' },
  { file: 'src/components/chat-ui/artifacts/file-preview-view.tsx', name: 'Sheet', row: 'table sheet picker beside compact actions' },
  { file: 'src/components/tasks/task-priority.tsx', name: 'Rank,', row: 'inline rank editor beside compact actions' },
  { file: 'src/components/executions/execution-header.tsx', name: 'PR number or URL', row: 'PR entry beside compact Link' },
];

it('reserves explicit sm fields for the reviewed rows with sm controls', () => {
  const fields = new Set(['Field', 'TextArea', 'NativeSelect', 'SelectField']);
  const violations: string[] = [];
  const matched = new Set<string>();
  for (const file of execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n')) {
    if (!file.endsWith('.tsx') || file.includes('.test.') || /^src\/(test|components\/(ui|system))\//.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/components\/system\/(field|text-area|native-select|select-field)['"]/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const localFields = new Set<string>();
    const values = new Map<string, string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !/components\/system\/(field|text-area|native-select|select-field)$/.test(statement.moduleSpecifier.text)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if (fields.has((element.propertyName ?? element.name).text)) localFields.add(element.name.text);
      }
    }
    function collect(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) values.set(node.name.text, node.initializer.getText(source));
      ts.forEachChild(node, collect);
    }
    collect(source);
    function visit(node: ts.Node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && localFields.has(node.tagName.getText(source))) {
        const attributes = node.attributes.properties;
        const attribute = (name: string) => attributes.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === name)?.initializer;
        const size = attribute('size');
        const expression = size && ts.isJsxExpression(size) ? size.expression : size;
        const value = expression && ts.isIdentifier(expression) ? values.get(expression.text) ?? expression.text : expression?.getText(source);
        if (value && /['"]sm['"]/.test(value)) {
          const label = (attribute('aria-label') ?? attribute('label'))?.getText(source).replace(/[{}'"`]/g, '') ?? '(unnamed)';
          const row = compactRows.find(row => row.file === file && label.startsWith(row.name));
          if (row && !matched.has(row.file + row.name)) matched.add(row.file + row.name);
          else violations.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${label}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations, 'Standalone fields use md32/touch40, including fields beside passive headings or counts').toEqual([]);
  expect(matched.size).toBe(compactRows.length);
});

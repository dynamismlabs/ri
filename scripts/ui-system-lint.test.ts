import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { uiSystemAllowlist } from './eslint/ui-system-allowlist.mjs';

// Run the real flat config, including import bindings and the reasoned allowlist.
const eslint = new ESLint({ cwd: process.cwd() });
const probe = 'src/components/ui-system-strict-probe.tsx';
const systemImport = `import { Card as Panel } from '@/components/system/card';`;
async function messages(source: string, filePath = probe) {
  const [result] = await eslint.lintText(source, { filePath: path.resolve(filePath) });
  expect(result.messages.filter(message => message.fatal)).toEqual([]);
  return result.messages.filter(message => message.ruleId?.startsWith('ui-system/') || message.ruleId === 'no-restricted-syntax');
}
const component = (jsx: string, owner = 'Probe') => `export function ${owner}() { return (${jsx}); }`;

describe('strict UI system lint', () => {
  it.each(['button', 'input', 'select', 'textarea'])('rejects raw %s even with an old drawing hook', async element => {
    const result = await messages(component(`<${element} data-slot="action-button" />`));
    expect(result.map(value => value.ruleId)).toEqual(['ui-system/native-controls']);
  });
  it('rejects a manual dialog independently of its tag', async () => {
    expect((await messages(component('<section role="dialog" aria-modal />'))).map(value => value.ruleId)).toEqual(['ui-system/native-controls']);
  });
  it.each(['bg-card', 'border-border', 'rounded-md', 'h-8', 'text-xs', 'hover:bg-muted/50', 'md:h-[calc(100vh-2rem)]', 'font-medium', 'px-4'])('rejects owned drawing: %s', async utility => {
    const result = await messages(systemImport + component(`<Panel className="${utility}" />`));
    expect(result.map(value => value.ruleId)).toEqual(['ui-system/drawing-classes']);
  });
  it.each([
    `const paint = 'bg-card'; export function Probe() { return <Panel className={paint} />; }`,
    `export function Probe() { return <Panel className={cn('flex', active && 'rounded-lg')} />; }`,
    'export function Probe() { return <Panel className={`flex ${active ? "text-xs" : "text-sm"}`} />; }',
    `const looks = { light: { frame: 'bg-card', icon: 'text-red-500' }, dark: { frame: 'rounded-lg' } }; export function Probe() { return <Panel className={looks[tone].frame} />; }`,
    `export function Probe() { return <Wrapper action={<Panel className="border" />} />; }`,
  ])('follows aliases, expressions and nested props', async source => {
    expect((await messages(systemImport + source)).map(value => value.ruleId)).toEqual(['ui-system/drawing-classes']);
  });
  it.each(['controlClassName', 'labelClassName'])('rejects drawing in field %s', async prop => {
    expect((await messages(`import { Field } from '@/components/system/field';` + component(`<Field ${prop}="text-xs" />`))).map(value => value.ruleId)).toEqual(['ui-system/drawing-classes']);
  });
  it('follows namespace imports', async () => {
    expect((await messages(`import * as Cards from '@/components/system/card';` + component('<Cards.Card className="bg-card" />'))).map(value => value.ruleId)).toEqual(['ui-system/drawing-classes']);
  });
  it('permits layout, with no false match from a sibling object property', async () => {
    expect(await messages(systemImport + `const look = { layout: 'flex w-full gap-2 min-h-0 max-h-[90vh] text-left text-balance overflow-hidden', icon: 'text-red-500' };` + component('<Panel className={look.layout} />'))).toEqual([]);
  });
  it.each(uiSystemAllowlist.flatMap(entry => entry.elements.map(element => ({ entry, element }))))('permits the reviewed $entry.id $element boundary', async ({ entry, element }) => {
    expect(entry.reason.length).toBeGreaterThan(15);
    expect(['primitive', 'navigation', 'progress', 'visualization', 'completion', 'drag', 'tree', 'image/color', 'consent', 'transport', 'diagnostic', 'test']).toContain(entry.category);
    const file = entry.file ?? (entry.prefix ? `${entry.prefix}strict-probe.tsx` : `src/components/strict-probe${entry.suffix}`);
    const attrs = Object.entries(entry.attributes ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ');
    const tag = element === 'dialog-role' ? 'div' : element;
    const role = element === 'dialog-role' ? 'role="dialog"' : '';
    expect(await messages(component(`<${tag} ${attrs} ${role} />`, entry.owner), file)).toEqual([]);
  });
  it('does not let a reviewed owner silently grow another native declaration', async () => {
    const entry = uiSystemAllowlist.find(value => value.owner && value.elements.includes('button') && value.maxMatches === 1)!;
    const attrs = Object.entries(entry.attributes ?? {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ');
    const jsx = `<button ${attrs} />`;
    const result = await messages(component(`<>${jsx}${jsx}</>`, entry.owner), entry.file);
    expect(result.map(value => value.ruleId)).toEqual(['ui-system/native-controls']);
    expect(result[0].message).toContain('exceeds');
  });
  it.each(['CREATE', 'DUE TODAY', 'GO TO', '100% READY'])('keeps the ALL-CAPS rule: %s', async label => {
    expect((await messages(component(`<span>${label}</span>`))).map(value => value.message)).toEqual([expect.stringContaining('sentence case')]);
  });
  it.each([probe, 'src/app/dev/execution-chat/page.tsx', 'src/app/integrations-test/page.tsx', 'src/components/ui/strict-probe.tsx'])('keeps title restrictions in %s', async file => {
    expect((await messages(component('<div title="More information" />'), file)).map(value => value.message)).toEqual([expect.stringContaining('Use <Tip')]);
    expect((await messages(component('<Button title="More information" />'), file)).map(value => value.message)).toEqual([expect.stringContaining('passes title to the DOM')]);
    expect(await messages(component('<iframe title="Preview" />'), file)).toEqual([]);
  });
  it('keeps ordinary content and owned primitives available', async () => {
    expect(await messages(component('<div className="border rounded-md">Use HTTP for this connection.</div>'))).toEqual([]);
    expect(await messages(systemImport + component('<Panel />'))).toEqual([]);
  });
});

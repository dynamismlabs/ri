import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Exercise the actual flat config and esquery parser, including :has(), rather
// than matching source strings with a second implementation of the rule.
const eslint = new ESLint({ cwd: process.cwd() });
const probe = 'src/components/ui-system-ratchet-probe.tsx';
async function restrictions(source: string, filePath = probe) {
  const [result] = await eslint.lintText(`export default function Probe() { return (${source}); }`, { filePath: path.resolve(filePath) });
  expect(result.messages.filter(message => message.fatal)).toEqual([]);
  return result.messages.filter(message => message.ruleId === 'no-restricted-syntax').map(message => message.message);
}

describe('UI system lint ratchet', () => {
  it.each([
    '<button className="rounded border">Save</button>',
    '<a href="/" className="border-border rounded-md">Open</a>',
    '<button className={cn("border rounded-lg", extra)}>Save</button>',
    '<button className={cn("border", active && "rounded-full")}>Save</button>',
    '<button className={active ? "rounded border" : "rounded-md border-border"}>Save</button>',
    '<button className={`rounded-md border ${extra}`}>Save</button>',
    '<button className="hover:border-border md:rounded-lg">Save</button>',
  ])('rejects unhooked raw bordered controls: %s', async source => {
    expect(await restrictions(source)).toEqual([expect.stringContaining('shared data-slot')]);
  });

  it.each([
    '<button data-slot="action-button" className="rounded border">Save</button>',
    '<button data-slot={slot} className={cn("rounded border", extra)}>Save</button>',
    '<Button className="rounded border">Save</Button>',
    '<button className="rounded-md ring-border">Save</button>',
    '<div className="rounded-md border">A content box</div>',
    '<button className="rounded-md">Save</button>',
    '<button className="border-border">Save</button>',
  ])('accepts shared hooks and unrelated classes: %s', async source => {
    expect(await restrictions(source)).toEqual([]);
  });

  it.each(['CREATE', 'DUE TODAY', 'GO TO', '100% READY'])('rejects capital labels: %s', async label => {
    expect(await restrictions(`<span>${label}</span>`)).toEqual([expect.stringContaining('sentence case')]);
  });

  it('keeps sentence-case source and classic uppercase utilities', async () => {
    expect(await restrictions('<span className="uppercase">Due today</span>')).toEqual([]);
    expect(await restrictions('<p>Use HTTP for this connection.</p>')).toEqual([]);
    expect(await restrictions('<span>OK</span>')).toEqual([]);
  });

  it('exempts installed UI primitives from raw-control drawing checks', async () => {
    expect(await restrictions('<button className="rounded border">Save</button>', 'src/components/ui/ratchet-probe.tsx')).toEqual([]);
  });

  it.each([probe, 'src/app/dev/execution-chat/page.tsx', 'src/app/integrations-test/page.tsx', 'src/components/settings/sections/api-transport.tsx', 'src/components/workspaces/worktree-scripts-section.tsx', 'src/components/ui/ratchet-probe.tsx'])('keeps tooltip restrictions active in %s', async file => {
    expect(await restrictions('<div title="x">Save</div>', file)).toEqual([expect.stringContaining('Use <Tip')]);
    expect(await restrictions('<Button title="x">Save</Button>', file)).toEqual([expect.stringContaining('passes title to the DOM')]);
    expect(await restrictions('<iframe title="Preview" />', file)).toEqual([]);
  });
});

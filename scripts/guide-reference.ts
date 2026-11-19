/**
 * Writes the guide's two generated pages from the code, so they can't drift:
 * guide/reference/cli.md from the `ri` command tree (src/cli/program.ts) and
 * guide/reference/actions.md from the action registry
 * (src/lib/orchestrator/registry.ts).
 *
 *   pnpm guide:reference           rewrite both pages
 *   pnpm guide:reference --check   exit 1 if either is stale, changing nothing
 *
 * scripts/guide-reference.test.ts fails when a page is stale, so a change to a
 * command or an action lands with its reference.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command, Help } from 'commander';
import type { z } from 'zod';
import type { Action } from '@/lib/orchestrator/types';
import { APP_NAME, APP_SHORT_ID } from '@/constants/app';
import { INTEGRATION_LABELS } from '@/constants/integrations';
import { COORDINATION_TOOLS } from '@/lib/coordination/surface';
import { HOME_CONTENT_ACTIONS } from '@/lib/external-ai/policy';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REFERENCE_PAGES = {
  cli: 'guide/reference/cli.md',
  actions: 'guide/reference/actions.md',
} as const;

const GENERATED_NOTE = 'This page is generated from the code by `pnpm guide:reference`. Edit the code, not this page.';

/**
 * Text from the code, made safe for the guide: one line, no long dashes (the
 * guide's voice), table pipes escaped, and anything that reads as a tag or an
 * expression (`<dir>`, `{...}`) set as code so no Markdown renderer takes it
 * for HTML.
 */
export function inlineText(text: string, { table = false } = {}): string {
  const flat = text.replace(/\s+/g, ' ').replace(/\s*[—–]\s*/g, ', ').trim();
  const safe = flat.split(/(`[^`]*`)/).map((part, i) => {
    if (i % 2 === 1) return part;
    // The whole word around it (`<app-root>/snapshots/`), less closing punctuation.
    return part.replace(/[^\s(]*(?:<[^<>]*>|\{[^{}]*\})[^\s(),;]*/g, (match) => {
      const [, word, tail] = /^(.*?)([.:]*)$/.exec(match)!;
      return `\`${word}\`${tail}`;
    });
  }).join('');
  return table ? safe.replace(/\|/g, '\\|') : safe;
}

/** A sentence from the code, ending with a full stop. */
function sentence(text: string): string {
  const line = inlineText(text);
  return line && !/[.!?:)]$/.test(line) ? `${line}.` : line;
}

function frontmatter(title: string, description: string): string {
  return `---\ntitle: ${title}\ndescription: ${description}\n---\n`;
}

// ── CLI ─────────────────────────────────────────────────────────

function commandPath(command: Command): string {
  const names: string[] = [];
  for (let c: Command | null = command; c; c = c.parent) names.unshift(c.name());
  return names.join(' ');
}

function visibleSubcommands(help: Help, command: Command): Command[] {
  return help.visibleCommands(command).filter((sub) => sub.name() !== 'help');
}

function renderCommand(help: Help, command: Command, depth: number, out: string[]): void {
  const heading = '#'.repeat(Math.min(2 + depth, 4));
  out.push(`${heading} ${commandPath(command)}`, '');
  const description = help.commandDescription(command);
  if (description) out.push(sentence(description), '');
  out.push('```sh', help.commandUsage(command), '```', '');

  const args = help.visibleArguments(command);
  if (args.length) {
    out.push('| Argument | What it is |', '| --- | --- |');
    for (const arg of args) out.push(`| \`${help.argumentTerm(arg)}\` | ${inlineText(help.argumentDescription(arg), { table: true }) || ' '} |`);
    out.push('');
  }
  const options = help.visibleOptions(command).filter((option) => option.long !== '--help');
  if (options.length) {
    out.push('| Option | What it does |', '| --- | --- |');
    for (const option of options) out.push(`| \`${help.optionTerm(option)}\` | ${inlineText(help.optionDescription(option), { table: true }) || ' '} |`);
    out.push('');
  }

  if (command.name() === 'agent' && command.parent?.parent === null) {
    out.push(
      `Every action is a subcommand: \`${APP_SHORT_ID} agent <action>\`, with each parameter as a \`--flag\` or the whole input as JSON with \`--input\`. ` +
        `The output is JSON. See the [actions reference](/docs/reference/actions) for every action and its parameters.`,
      '',
    );
    return;
  }
  for (const sub of visibleSubcommands(help, command)) renderCommand(help, sub, depth + 1, out);
}

export function renderCliReference(program: Command): string {
  const help = program.createHelp();
  const out = [
    frontmatter(`The ${APP_SHORT_ID} command`, `Every \`${APP_SHORT_ID}\` command and option, generated from the code.`),
    `The \`${APP_SHORT_ID}\` command runs and looks after ${APP_NAME} on a computer. Every command takes \`--help\`, which prints the same details as this page.`,
    '',
    GENERATED_NOTE,
    '',
  ];
  const top = visibleSubcommands(help, program);
  out.push('| Command | What it does |', '| --- | --- |');
  for (const command of top) out.push(`| \`${commandPath(command)}\` | ${inlineText(help.subcommandDescription(command), { table: true }) || ' '} |`);
  out.push('');
  for (const command of top) renderCommand(help, command, 0, out);
  return `${out.join('\n').trimEnd()}\n`;
}

// ── Actions ─────────────────────────────────────────────────────

interface ZodDefLike {
  typeName?: string;
  innerType?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  in?: z.ZodTypeAny;
  options?: z.ZodTypeAny[] | readonly string[];
  values?: Record<string, string | number> | readonly string[];
  value?: unknown;
  checks?: Array<{ kind: string }>;
  description?: string;
  getter?: () => z.ZodTypeAny;
}

const def = (schema: z.ZodTypeAny): ZodDefLike => (schema as unknown as { _def: ZodDefLike })._def;

/** The schema under optional, nullable, default and refinement wrappers. */
function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; nullable: boolean; description?: string } {
  let current = schema;
  let nullable = false;
  let description = def(schema).description;
  for (;;) {
    const d = def(current);
    description ??= d.description;
    if (d.typeName === 'ZodNullable') nullable = true;
    const next = ['ZodOptional', 'ZodNullable', 'ZodDefault', 'ZodCatch', 'ZodReadonly', 'ZodBranded'].includes(d.typeName ?? '')
      ? d.innerType ?? d.type
      : d.typeName === 'ZodEffects' ? d.schema
        : d.typeName === 'ZodPipeline' ? d.in
          : undefined;
    if (!next) return { inner: current, nullable, description };
    current = next;
  }
}

/** A short, readable type for a parameter. */
export function typeLabel(schema: z.ZodTypeAny): string {
  const { inner, nullable } = unwrap(schema);
  const d = def(inner);
  let label: string;
  switch (d.typeName) {
    case 'ZodString': label = 'string'; break;
    case 'ZodNumber': label = d.checks?.some((check) => check.kind === 'int') ? 'integer' : 'number'; break;
    case 'ZodBoolean': label = 'boolean'; break;
    case 'ZodDate': label = 'date'; break;
    case 'ZodEnum': label = (d.values as readonly string[]).map((value) => JSON.stringify(value)).join(' or '); break;
    case 'ZodNativeEnum': label = Object.values(d.values as Record<string, string | number>).filter((value) => typeof value === 'string').map((value) => JSON.stringify(value)).join(' or '); break;
    case 'ZodLiteral': label = JSON.stringify(d.value); break;
    case 'ZodArray': label = `list of ${typeLabel(d.type!)}`; break;
    case 'ZodUnion': label = [...new Set((d.options as z.ZodTypeAny[]).map(typeLabel))].join(' or '); break;
    case 'ZodObject': case 'ZodRecord': case 'ZodDiscriminatedUnion': case 'ZodLazy': case 'ZodIntersection': label = 'object'; break;
    default: label = 'any';
  }
  return nullable ? `${label} or null` : label;
}

function renderAction(action: Action, cli: string): string[] {
  const out = [`## ${action.name}`, '', sentence(action.description), ''];
  const facts = [action.mutating ? 'Changes data.' : 'Reads only.'];
  if ((COORDINATION_TOOLS as readonly string[]).includes(action.name)) facts.push('A tool in every chat.');
  if ((HOME_CONTENT_ACTIONS as readonly string[]).includes(action.name)) facts.push('Open to other agents.');
  out.push(facts.join(' '), '');
  const params = Object.entries(action.params) as Array<[string, z.ZodTypeAny]>;
  if (params.length) {
    out.push('| Parameter | Type | Required | What it is |', '| --- | --- | --- | --- |');
    for (const [name, schema] of params) {
      const { description } = unwrap(schema);
      out.push(`| \`${name}\` | ${inlineText(typeLabel(schema), { table: true })} | ${schema.isOptional() ? 'no' : 'yes'} | ${description ? inlineText(description, { table: true }) : ' '} |`);
    }
    out.push('');
  }
  const positional = (action.cli?.positional ?? []) as string[];
  out.push('```sh', `${cli} agent ${[action.name, ...positional.map((name) => `<${name}>`)].join(' ')}${params.length > positional.length ? ' [--param value]' : ''}`, '```', '');
  return out;
}

export function renderActionsReference(actions: readonly Action[]): string {
  const sorted = [...actions].sort((a, b) => a.name.localeCompare(b.name));
  const out = [
    frontmatter('Actions reference', `Every action ${APP_NAME}'s agents and your scripts can call, generated from the code.`),
    `Actions are how agents read and change your ${APP_NAME}: your tasks, notes, agents, chats, schedules and the rest. ` +
      `Each one is a tool on ${APP_NAME}'s MCP server and a command, \`${APP_SHORT_ID} agent <action>\`, with the same parameters and the same result.`,
    '',
    `- ${APP_NAME}'s main chat and each agent's main chat can use every action.`,
    `- A chat in an agent has the actions marked "A tool in every chat" as tools, and reaches the rest with \`${APP_SHORT_ID} agent\` from its shell.`,
    `- Other agents you connect in Settings, under ${APP_NAME} in other agents, get only the actions marked "Open to other agents": your tasks, notes, areas, the deck, search, adding to the Stream, and these docs. See [Use ${APP_NAME} from other agents](/docs/guides/other-agents).`,
    '',
    `Names come from the code, which calls an agent a workspace and a chat an execution or a session. ${INTEGRATION_LABELS.plural} are integrations. There are no delete actions: you archive instead.`,
    '',
    GENERATED_NOTE,
    '',
  ];
  for (const action of sorted) out.push(...renderAction(action, APP_SHORT_ID));
  return `${out.join('\n').trimEnd()}\n`;
}

// ── Running ─────────────────────────────────────────────────────

/** Both pages, rendered from this checkout's code. */
export async function renderReferences(): Promise<Record<keyof typeof REFERENCE_PAGES, string>> {
  const { buildProgram } = await import('@/cli/program');
  const { actionCatalog } = await import('@/lib/orchestrator/registry');
  // A personal Ri's actions, whatever kind of Home this computer has.
  return { cli: renderCliReference(buildProgram()), actions: renderActionsReference(actionCatalog(false)) };
}

async function main() {
  const check = process.argv.includes('--check');
  const pages = await renderReferences();
  let stale = 0;
  for (const [key, relative] of Object.entries(REFERENCE_PAGES) as Array<[keyof typeof REFERENCE_PAGES, string]>) {
    const file = path.join(repo, relative);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === pages[key]) continue;
    stale++;
    if (check) { console.error(`${relative} is stale. Run pnpm guide:reference.`); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, pages[key]);
    console.info(`Wrote ${relative}.`);
  }
  if (check && stale) process.exit(1);
  if (!stale) console.info('The reference pages are up to date.');
}

const invoked = (() => {
  try { return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1] ?? '')).href; } catch { return false; }
})();
if (invoked) {
  main().then(() => process.exit(0), (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
}

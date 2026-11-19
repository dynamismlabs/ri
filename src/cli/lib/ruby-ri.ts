/**
 * Ruby's `ri`, a good neighbor (docs/always-on-spec.md section 9.1).
 *
 * Ruby ships a documentation tool called `ri`, and Ri makes `ri` in a terminal
 * its own. So when Ri's `ri` gets what is plainly a Ruby documentation lookup
 * (`ri Array#each`, `ri File::Stat`, `ri -i`) rather than one of its commands,
 * it runs Ruby's `ri` with the same arguments, terminal and exit code, as long
 * as one is installed elsewhere on the PATH. Ri's own commands and anything
 * close to one (`ri statsu`, `ri Status`) are never handed over: those get
 * Ri's own error, which names Ruby's `ri` only when nothing of Ri's is close.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { untraced } from '@/lib/utils/untraced';

/** Set on Ruby's `ri` when Ri hands a call to it, so a wrapper that calls Ri
 * back can't bounce the call between the two forever. */
export const FORWARDED_ENV = 'RI_RUBY_RI_FORWARDED';

/** Every option Ruby's `ri` takes (`ri --help`, RDoc 6), except -h and -v,
 * which mean help and version to anyone. Ri's own options win over these. */
const RUBY_OPTIONS = new Set([
  '-i', '--interactive', '--no-interactive', '-a', '--all', '--no-all', '-l', '--list', '--no-list',
  '--pager', '--no-pager', '-T', '-w', '--width', '--server', '-f', '--format', '--list-doc-dirs', '--no-list-doc-dirs',
  '-d', '--doc-dir', '--no-standard-docs', '--system', '--no-system', '--site', '--no-site', '--gems', '--no-gems',
  '--home', '--no-home', '--profile', '--no-profile', '--dump',
]);

/** `String`, `File::Stat`, `Array#each`, `Array.new`, `Array.[]`, `Kernel::puts` */
const CONSTANT = /^(?:::)?[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*(?:(?:#|::|\.)\S+)?$/;
/** `#each`, `.new`, `::new`, `empty?`, `compact!`, `name=` */
const METHOD = /^(?:#|::|\.)\S+$|^[a-z_][A-Za-z0-9_]*[?!=]$/;
/** `rdoc:README`, `ruby:NEWS`, `rdoc:` (a gem's files), never a web address */
const PAGE = /^[a-z][\w.-]*:(?!\/\/)[\w./-]*$/;

export interface RiCommands { commands: string[]; options: string[] }

/** The names of Ri's top-level commands and the options `ri` alone takes. */
export function riCommands(program: Command): RiCommands {
  const commands = ['help', ...program.commands.flatMap(command => [command.name(), ...command.aliases()])];
  const start = program.commands.find(command => command.name() === 'start');
  const options = [program, ...(start ? [start] : [])].flatMap(command => command.options.flatMap(option => [option.short, option.long]))
    .filter((name): name is string => !!name);
  return { commands, options: [...options, '-h', '--help', '-V', '--version'] };
}

/** Edit distance with transpositions, so `statsu` is one step from `status`. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The Ri commands a mistyped word was probably meant to be, as commander
 * suggests them: the closest, at most 3 steps away and mostly the same. */
export function similarCommands(word: string, commands: string[]): string[] {
  let best = 3;
  let similar: string[] = [];
  for (const command of new Set(commands)) {
    if (command.length <= 1) continue;
    const distance = editDistance(word.toLowerCase(), command);
    const length = Math.max(word.length, command.length);
    if ((length - distance) / length <= 0.4) continue;
    if (distance < best) { best = distance; similar = [command]; } else if (distance === best) similar.push(command);
  }
  return similar.sort();
}

function optionName(arg: string) {
  return arg.startsWith('--') ? arg.split('=')[0] : arg.slice(0, 2);
}

/** Whether these arguments are a Ruby documentation lookup and not Ri's. */
export function isRubyLookup(args: string[], ri: RiCommands): boolean {
  const first = args[0];
  if (!first) return false;
  if (first.startsWith('-')) {
    const name = optionName(first);
    return RUBY_OPTIONS.has(name) && !ri.options.includes(name);
  }
  if (ri.commands.includes(first)) return false;
  // Ruby names start with a capital, Ri's commands never do, so `Status` or
  // `Strat` is Ri's command typed with a capital, and `Set` is Ruby's class.
  if (/^[A-Z]/.test(first) && ri.commands.some(command => editDistance(first.toLowerCase(), command) <= 1)) return false;
  return CONSTANT.test(first) || METHOD.test(first) || PAGE.test(first);
}

/** Whether a file is one of Ri's own `ri`s: the launcher, a chat's session
 * launcher, a link to this CLI, or a package manager's shim for it. */
export function isRiCommand(file: string, entry = process.argv[1]): boolean {
  try {
    const real = fs.realpathSync(/* turbopackIgnore: true */ file);
    if (entry && real === fs.realpathSync(/* turbopackIgnore: true */ entry)) return true;
    const fd = fs.openSync(/* turbopackIgnore: true */ real, 'r');
    try {
      const head = Buffer.alloc(1024);
      const text = head.subarray(0, fs.readSync(fd, head, 0, head.length, 0)).toString('utf8');
      return /^# Ri (?:command|session|stable runtime) launcher/m.test(text) || /(?:dist\/cli\/index\.mjs|src\/cli\/index\.ts)/.test(text);
    } finally { fs.closeSync(fd); }
  } catch {
    return false;
  }
}

/** The first `ri` on the PATH that isn't Ri's: Ruby's documentation tool, or a
 * version manager's shim for it. */
export function findRubyRi(searchPath = process.env.PATH ?? '', isRi: (file: string) => boolean = isRiCommand): string | null {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const file = path.join(/* turbopackIgnore: true */ dir, 'ri');
    try {
      if (!fs.statSync(/* turbopackIgnore: true */ file).isFile()) continue;
      fs.accessSync(/* turbopackIgnore: true */ file, fs.constants.X_OK);
    } catch { continue; }
    if (!isRi(file)) return file;
  }
  return null;
}

/** Run Ruby's `ri` in this terminal and return its exit code. Ctrl-C and
 * Ctrl-\ go to it alone, as they would if it had been run directly. */
export function runRubyRi(file: string, args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const ignore = () => {};
  process.on('SIGINT', ignore);
  process.on('SIGQUIT', ignore);
  try {
    const result = spawnSync(untraced(file), args, { stdio: 'inherit', env: { ...env, [FORWARDED_ENV]: '1' } });
    if (result.error) return 127;
    if (result.signal) {
      process.removeListener('SIGINT', ignore);
      process.removeListener('SIGQUIT', ignore);
      process.kill(process.pid, result.signal);
    }
    return result.status ?? 1;
  } finally {
    process.removeListener('SIGINT', ignore);
    process.removeListener('SIGQUIT', ignore);
  }
}

/** Ri's error for a word that isn't one of its commands. */
export function unknownCommandMessage(word: string, ri: RiCommands, ruby: string | null): string {
  const similar = similarCommands(word, ri.commands);
  if (similar.length) return `error: unknown command '${word}'\n(Did you mean ${similar.join(', ')}?)`;
  const lines = [`error: unknown command '${word}'. Run ri --help for Ri's commands.`];
  if (ruby) lines.push(`For Ruby's documentation, run ${ruby} ${word}`);
  return lines.join('\n');
}

export interface Outside { forward: string | null; error: string | null }

/**
 * What to do with arguments that aren't Ri's, before commander sees them:
 * hand a Ruby lookup to Ruby's `ri`, or explain a word that is no command.
 * Commander would run `start` for it and complain about its arguments.
 */
export function outsideRi(args: string[], ri: RiCommands, env: Record<string, string | undefined> = process.env, find = () => findRubyRi(env.PATH ?? '')): Outside {
  const first = args[0];
  const forwarded = env[FORWARDED_ENV] === '1';
  if (!forwarded && isRubyLookup(args, ri)) {
    const ruby = find();
    if (ruby) return { forward: ruby, error: null };
  }
  if (!first || first.startsWith('-') || ri.commands.includes(first)) return { forward: null, error: null };
  return { forward: null, error: unknownCommandMessage(first, ri, forwarded ? null : find()) };
}

/**
 * Which `ri` a new terminal runs, and the two lines that make it Ri's launcher
 * (docs/always-on-spec.md section 9.1).
 *
 * Ruby ships a documentation tool called `ri`. macOS keeps it in /usr/bin, and
 * rbenv, asdf, mise, chruby and Homebrew's Ruby put their own first on the
 * PATH, mise and chruby again at every prompt. So Ri asks the person's own
 * shell, started the way a new terminal starts it, which `ri` it runs. When
 * that isn't the launcher, two lines go at the end of the shell's startup
 * file: one puts the launcher's folder first on the PATH (for scripts and
 * `command -v`), and one defines `ri` as a shell function, which a shell runs
 * ahead of anything on the PATH whatever a prompt hook does to it later. Each
 * line ends with "# Added by Ri", so it can be found and removed.
 *
 * scripts/install.sh does the same in POSIX sh, with the same probes and the
 * same lines. terminal-command.shells.test.ts runs both against throwaway
 * homes in real shells and checks they write the same files.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { untraced } from '@/lib/utils/untraced';

export const MARK = '# Added by Ri';
/** A line Ri added: anything but a comment, ending with the mark. */
const OURS = /^[^#].* # Added by Ri$/;

export type ShellFamily = 'zsh' | 'bash' | 'fish' | 'posix' | 'other';
export type Syntax = 'sh' | 'posix' | 'fish';
type Env = Record<string, string | undefined>;

export interface PersonShell { name: string; family: ShellFamily; binary: string }

/** The shell a new terminal opens: the login shell named by SHELL. */
export function personShell(env: Env, platform: NodeJS.Platform): PersonShell {
  const binary = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const name = path.basename(binary);
  const family: ShellFamily = name === 'zsh' || name === 'bash' || name === 'fish' ? name
    : ['sh', 'dash', 'ash', 'ksh', 'ksh93', 'mksh', 'yash', 'busybox'].includes(name) ? 'posix' : 'other';
  return { name, family, binary };
}

/**
 * What a shell prints about `ri` after running its prompt hooks, as a terminal
 * does before the first command, into the file named by RI_PROBE_OUT. Kept
 * free of single quotes so install.sh can carry the same text.
 */
export const PROBE_SCRIPTS = {
  zsh: '{ (( ${+functions[precmd]} )) && precmd; for f in "${precmd_functions[@]:-}"; do "$f"; done; (( ${+functions[preexec]} )) && preexec ri ri ri; for f in "${preexec_functions[@]:-}"; do "$f" ri ri ri; done; } </dev/null >/dev/null 2>&1; { print -r -- "kind=${$(whence -w ri)#ri: }"; print -r -- "path=$(whence -p ri)"; print -r -- "config=${ZDOTDIR:-$HOME}"; print -r -- "definition:"; whence -c ri; } >"$RI_PROBE_OUT" 2>/dev/null',
  bash: 'if [ -n "${PROMPT_COMMAND:-}" ]; then for c in "${PROMPT_COMMAND[@]}"; do eval "$c"; done; fi </dev/null >/dev/null 2>&1; { printf "kind=%s\\n" "$(type -t ri)"; printf "path=%s\\n" "$(type -P ri)"; printf "config=\\n"; printf "definition:\\n"; type ri; } >"$RI_PROBE_OUT" 2>/dev/null',
  fish: 'begin; emit fish_prompt; emit fish_preexec ri; end </dev/null >/dev/null 2>&1; begin; printf "kind=%s\\n" (type -t ri 2>/dev/null); printf "path=%s\\n" (command -v ri 2>/dev/null); printf "config=%s\\n" $__fish_config_dir; printf "definition:\\n"; type ri 2>/dev/null; end >$RI_PROBE_OUT',
} as const;

/** The ways a new terminal starts this shell: macOS terminals open login
 * shells, Linux desktop terminals don't, and an SSH session does. */
export function probeFlags(family: ShellFamily, platform: NodeJS.Platform): string[][] {
  if (family === 'bash' && platform !== 'darwin') return [['-i', '-l'], ['-i']];
  return [['-i', '-l']];
}

export interface ProbeAnswer { kind: string; path: string; config: string; definition: string }

export function parseProbe(text: string): ProbeAnswer | null {
  const lines = text.split('\n');
  const value = (name: string) => lines.find(line => line.startsWith(`${name}=`))?.slice(name.length + 1);
  const kind = value('kind');
  if (kind === undefined) return null;
  const start = lines.indexOf('definition:');
  return { kind, path: value('path') ?? '', config: value('config') ?? '', definition: start < 0 ? '' : lines.slice(start + 1).join('\n') };
}

export type TerminalStatus = 'ri' | 'other' | 'missing' | 'unknown';
/** What a person's own `alias ri=...` is called, which no line of Ri's can outrank. */
export const ALIAS = 'a shell alias named ri';
export interface Judgment { status: TerminalStatus; found?: string }

/** Whether the `ri` a probe found is the launcher: the file itself, or a
 * function or alias that runs it (the line Ri adds, or the person's own). */
export function judgeProbe(answer: ProbeAnswer | null, launcher: string, expression: string | null): Judgment {
  if (!answer) return { status: 'unknown' };
  switch (answer.kind) {
    case 'file': case 'command': case 'hashed':
      return sameFile(answer.path, launcher) ? { status: 'ri' } : { status: 'other', found: answer.path };
    case 'function': case 'alias':
      return answer.definition.includes(launcher) || (expression !== null && answer.definition.includes(`${expression}/ri`))
        ? { status: 'ri' } : { status: 'other', found: `a shell ${answer.kind} named ri` };
    case 'none': case '':
      return { status: 'missing' };
    default:
      return { status: 'other', found: "the shell's own ri" };
  }
}

function sameFile(a: string, b: string) {
  if (a === b) return true;
  try { return fs.realpathSync(/* turbopackIgnore: true */ a) === fs.realpathSync(/* turbopackIgnore: true */ b); } catch { return false; }
}

const RANK: Record<TerminalStatus, number> = { ri: 0, unknown: 1, missing: 2, other: 3 };

export interface TerminalCheck extends Judgment {
  shell: PersonShell;
  /** Where zsh (ZDOTDIR) or fish keeps its startup files, when the probe said. */
  config?: string;
}

/** Runs one probe and returns what it wrote, or null when it said nothing in time. */
export type ProbeRunner = (shell: PersonShell, flags: string[], env: Record<string, string>, home: string) => Promise<string | null>;

export interface TerminalOptions {
  launcher: string;
  env?: Env;
  platform?: NodeJS.Platform;
  /** How long a probe may take, as a test terminal can hang on a startup file. */
  timeoutMs?: number;
  run?: ProbeRunner;
}

/** Which `ri` a new terminal of the person's shell runs, by asking that shell. */
export async function checkTerminal(options: TerminalOptions): Promise<TerminalCheck> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = env.HOME || os.homedir();
  const shell = personShell(env, platform);
  if (shell.family !== 'zsh' && shell.family !== 'bash' && shell.family !== 'fish') return { shell, status: 'unknown' };
  const expression = folderExpression(path.dirname(options.launcher), home);
  const run = options.run ?? ((s, flags, e, h) => runProbe(s, flags, e, h, options.timeoutMs ?? 10_000));
  let worst: TerminalCheck | null = null;
  let config: string | undefined;
  for (const flags of probeFlags(shell.family, platform)) {
    const answer = parseProbe(await run(shell, flags, probeEnvironment(env, platform, shell.binary, home), home) ?? '');
    config ||= answer?.config || undefined;
    const judged = judgeProbe(answer, options.launcher, expression);
    if (!worst || RANK[judged.status] > RANK[worst.status]) worst = { shell, ...judged };
  }
  return { ...worst!, ...(config ? { config } : {}) };
}

/** A new terminal's environment before any startup file runs: the system PATH,
 * the account, and the locale and folder settings a terminal inherits. */
export function probeEnvironment(env: Env, platform: NodeJS.Platform, shell: string, home: string): Record<string, string> {
  const user = env.USER || env.LOGNAME || safeUser();
  const term = env.TERM && env.TERM !== 'dumb' ? env.TERM : 'xterm-256color';
  const out: Record<string, string> = {
    HOME: home, USER: user, LOGNAME: env.LOGNAME || user, SHELL: shell, TERM: term,
    PATH: platform === 'darwin' ? '/usr/bin:/bin:/usr/sbin:/sbin' : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  };
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'XDG_CONFIG_HOME', 'ZDOTDIR']) if (env[name]) out[name] = env[name]!;
  return out;
}

function safeUser() {
  try { return os.userInfo().username; } catch { return ''; }
}

/**
 * Start the shell as a new terminal would, from the home folder, and read its
 * answer. Nothing it prints reaches the caller: no input, output to /dev/null,
 * and its own session (`detached`), so it can't open /dev/tty either. It and
 * everything it started are killed after `timeoutMs`.
 */
export async function runProbe(shell: PersonShell, flags: string[], env: Record<string, string>, home: string, timeoutMs: number): Promise<string | null> {
  const { family } = shell;
  if (family !== 'zsh' && family !== 'bash' && family !== 'fish') return null;
  const script = PROBE_SCRIPTS[family];
  const dir = fs.mkdtempSync(path.join(/* turbopackIgnore: true */ os.tmpdir(), 'ri-terminal-'));
  const out = path.join(/* turbopackIgnore: true */ dir, 'probe');
  try {
    await new Promise<void>((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(untraced(shell.binary), [...flags, '-c', script], {
          cwd: fs.existsSync(/* turbopackIgnore: true */ home) ? home : '/', env: { ...env, RI_PROBE_OUT: out } as unknown as NodeJS.ProcessEnv, stdio: 'ignore', detached: true,
        });
      } catch { resolve(); return; }
      const timer = setTimeout(() => {
        try { process.kill(-child.pid!, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
        resolve();
      }, timeoutMs);
      child.once('error', () => { clearTimeout(timer); resolve(); });
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    return fs.existsSync(/* turbopackIgnore: true */ out) ? fs.readFileSync(/* turbopackIgnore: true */ out, 'utf8') : null;
  } finally {
    fs.rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}

/** The folder as a startup file writes it: `$HOME/...` inside the home folder.
 * Null for a path no line can quote plainly. */
export function folderExpression(folder: string, home: string): string | null {
  if (/["$`\\\n]/.test(folder)) return null;
  return folder.startsWith(`${home}/`) ? `$HOME/${folder.slice(home.length + 1)}` : folder;
}

/** The two lines, in a file's own syntax: `sh` for zsh and bash, `posix` for
 * ~/.profile (read by every sh), or `fish`. */
export function terminalLines(syntax: Syntax, folder: string): string[] {
  if (syntax === 'fish') return [
    `set -gx PATH "${folder}" $PATH ${MARK}`,
    `function ri; if test -x "${folder}/ri"; "${folder}/ri" $argv; else; command ri $argv; end; end ${MARK}`,
  ];
  const run = `if [ -x "${folder}/ri" ]; then "${folder}/ri" "$@"; else command ri "$@"; fi; }`;
  // `function ri {` keeps zsh and bash from expanding an alias named ri into the definition.
  return [`export PATH="${folder}:$PATH" ${MARK}`, `${syntax === 'sh' ? 'function ri {' : 'ri() {'} ${run} ${MARK}`];
}

/** The file with Ri's lines at its end: any already there move, and every
 * other line stays as it is (a missing final newline is added, as grep does). */
export function withTerminalLines(current: string, lines: string[]): string {
  const kept = current === '' ? [] : current.replace(/\n$/, '').split('\n').filter(line => !OURS.test(line));
  return `${[...kept, ...lines].join('\n')}\n`;
}

export interface TerminalFile { file: string; syntax: Syntax }

/** The files a new terminal of this shell reads last. */
export function terminalFiles(family: ShellFamily, platform: NodeJS.Platform, home: string, env: Env, config?: string): TerminalFile[] {
  const at = (name: string) => path.join(/* turbopackIgnore: true */ home, name);
  switch (family) {
    case 'zsh': return [{ file: path.join(/* turbopackIgnore: true */ config || env.ZDOTDIR || home, '.zshrc'), syntax: 'sh' }];
    case 'bash': {
      const files: TerminalFile[] = [];
      // Linux desktop terminals read ~/.bashrc. Mac terminals open login shells, which don't.
      if (isFile(at('.bashrc')) || platform !== 'darwin') files.push({ file: at('.bashrc'), syntax: 'sh' });
      // Bash reads only the first of these at login, so a new one would hide the others.
      const login = ['.bash_profile', '.bash_login', '.profile'].find(name => isFile(at(name)));
      files.push(login ? { file: at(login), syntax: login === '.profile' ? 'posix' : 'sh' } : { file: at('.bash_profile'), syntax: 'sh' });
      return files;
    }
    case 'fish': return [{ file: path.join(/* turbopackIgnore: true */ config || path.join(/* turbopackIgnore: true */ env.XDG_CONFIG_HOME || at('.config'), 'fish'), 'config.fish'), syntax: 'fish' }];
    case 'posix': return [{ file: at('.profile'), syntax: 'posix' }];
    default: return [];
  }
}

function isFile(file: string) {
  try { return fs.statSync(/* turbopackIgnore: true */ file).isFile(); } catch { return false; }
}

/** Put the lines at the end of a file. Returns whether it changed, or null
 * when it can't be changed. Written in place, so a startup file that is a link
 * into a dotfiles folder stays one. */
export function writeTerminalLines(file: string, lines: string[]): boolean | null {
  let current = '';
  try {
    if (fs.existsSync(/* turbopackIgnore: true */ file) || isLink(file)) {
      if (!isFile(file)) return null;
      fs.accessSync(/* turbopackIgnore: true */ file, fs.constants.R_OK | fs.constants.W_OK);
      current = fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8');
    } else {
      fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });
    }
    const next = withTerminalLines(current, lines);
    if (fs.existsSync(/* turbopackIgnore: true */ file) && next === current) return false;
    fs.writeFileSync(/* turbopackIgnore: true */ file, next);
    return true;
  } catch {
    return null;
  }
}

function isLink(file: string) {
  try { return fs.lstatSync(/* turbopackIgnore: true */ file).isSymbolicLink(); } catch { return false; }
}

/** A path as a person reads it, with ~ for the home folder. */
export function shown(file: string, home = os.homedir()) {
  return file.startsWith(`${home}/`) ? `~/${file.slice(home.length + 1)}` : file;
}

/** What runs instead of Ri, named for a person: usually Ruby's documentation tool. */
export function describeFound(found: string | undefined, home = os.homedir()) {
  if (!found) return 'nothing';
  if (found === '/usr/bin/ri' || /ruby|rbenv|asdf|mise|rubies/.test(found)) return `Ruby's ri (${shown(found, home)})`;
  return shown(found, home);
}

export interface TerminalFix { check: TerminalCheck; changed: string[]; message: string }

/** Make `ri` in a new terminal run the launcher, and say plainly what changed.
 * Changes nothing when it already does. */
export async function fixTerminal(options: TerminalOptions): Promise<TerminalFix> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = env.HOME || os.homedir();
  const before = await checkTerminal(options);
  const { shell } = before;
  const folder = path.dirname(options.launcher);
  if (before.status === 'ri') return { check: before, changed: [], message: `A new ${shell.name} terminal runs it as \`ri\`.` };
  if (shell.family === 'other') {
    return { check: before, changed: [], message: `Ri can't set up ${shell.name} terminals. Put ${shown(folder, home)} first on its PATH, or run ${shown(options.launcher, home)}.` };
  }
  const expression = folderExpression(folder, home);
  if (!expression) return { check: before, changed: [], message: `Ri can't write ${folder} into a startup file. Put it first on your PATH, or run ${options.launcher}.` };
  const said = before.status === 'other' ? `In a new ${shell.name} terminal, \`ri\` ran ${describeFound(before.found, home)} instead of Ri. `
    : before.status === 'missing' ? `A new ${shell.name} terminal didn't find \`ri\`. ` : '';
  const files = terminalFiles(shell.family, platform, home, env, before.config);
  const changed: string[] = [];
  const failed: string[] = [];
  for (const { file, syntax } of files) {
    const result = writeTerminalLines(file, terminalLines(syntax, expression));
    if (result === null) failed.push(shown(file, home));
    else if (result) changed.push(shown(file, home));
  }
  if (failed.length) {
    return { check: before, changed, message: `${said}Ri couldn't change ${failed.join(' and ')}. Put ${shown(folder, home)} first on your PATH, or run ${shown(options.launcher, home)}.` };
  }
  const put = changed.length ? `Put 2 lines marked "${MARK}" at the end of ${changed.join(' and ')}`
    : `The lines marked "${MARK}" are already at the end of ${files.map(f => shown(f.file, home)).join(' and ')}`;
  const after = await checkTerminal(options);
  const message = after.status === 'other'
    ? `${said}${put}, but a new terminal still runs ${describeFound(after.found, home)}. ${stillOther(after.found, shown(options.launcher, home))}`
    : `${said}${put}, so \`ri\` runs Ri.${after.status === 'unknown' && shell.family !== 'posix' ? " Ri couldn't open a test terminal to check." : ''} Open a new terminal window to use it.`;
  return { check: after, changed, message };
}

/** Why `ri` still isn't Ri with its lines in place, and what always works. */
export function stillOther(found: string | undefined, launcher: string) {
  return found === ALIAS
    ? `A shell expands an alias before anything else, so remove that alias to use Ri as \`ri\`, or run ${launcher}.`
    : `Something after those lines takes \`ri\` over. ${launcher} always runs Ri.`;
}

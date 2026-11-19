/**
 * `ri` in real shells (docs/always-on-spec.md section 9.1). Each case builds a
 * throwaway home where Ruby's `ri` comes first the way a version manager puts
 * it there, repairs it with this module and, separately, with install.sh's
 * functions, then opens a fresh interactive shell that reads its commands from
 * a pipe, so prompt hooks run as at a real prompt, and types `ri`. Shells that
 * aren't installed are skipped (RI_TEST_FISH names a fish binary that isn't on
 * the PATH, RI_TEST_SH the sh that runs install.sh). Nothing here reads or
 * writes the real home folder.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkTerminal, fixTerminal, PROBE_SCRIPTS, terminalLines } from './terminal-command';

const INSTALL_SH = path.resolve(__dirname, '../../../scripts/install.sh');
const SYSTEM_PATH = process.platform === 'darwin' ? '/usr/bin:/bin:/usr/sbin:/sbin' : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const USER = os.userInfo().username;

function which(name: string) {
  const found = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
  return found.startsWith('/') ? found : null;
}

const SHELLS = [
  { name: 'zsh', binary: which('zsh') },
  { name: 'bash', binary: which('bash') },
  { name: 'fish', binary: process.env.RI_TEST_FISH || which('fish') },
] as const;

type Setup = 'rbenv' | 'mise' | 'homebrew';
const homes: string[] = [];
afterAll(() => { for (const home of homes) fs.rmSync(home, { recursive: true, force: true }); });

function script(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

/** The startup lines each kind of Ruby setup writes, in each shell's syntax. */
function rubyLines(shell: string, setup: Setup): string {
  if (shell === 'fish') return {
    // rbenv init - fish, once at startup
    rbenv: 'set -gx PATH $HOME/.rbenv/shims $PATH',
    // mise activate: Ruby first at startup and again at every prompt
    mise: 'function __ruby_first --on-event fish_prompt; set -gx PATH $HOME/.mise/ruby/bin $PATH; end; __ruby_first',
    homebrew: 'fish_add_path -g $HOME/brew/opt/ruby/bin',
  }[setup];
  return {
    rbenv: 'export PATH="$HOME/.rbenv/shims:${PATH}"',
    mise: shell === 'zsh'
      ? '__ruby_first() { PATH="$HOME/.mise/ruby/bin:$PATH"; }; precmd_functions=(__ruby_first $precmd_functions); __ruby_first'
      : '__ruby_first() { PATH="$HOME/.mise/ruby/bin:$PATH"; }; PROMPT_COMMAND="__ruby_first${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; __ruby_first',
    homebrew: 'export PATH="$HOME/brew/opt/ruby/bin:$PATH"',
  }[setup];
}

/** A home where Ruby's `ri` comes first, and Ri's launcher is installed. */
function rubyHome(shell: string, setup: Setup) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ri-shells-${shell}-${setup}-`)));
  homes.push(home);
  script(path.join(home, '.local/bin/ri'), '# Ri command launcher\necho "RI-LAUNCHER $*"');
  const ruby = { rbenv: '.rbenv/shims', mise: '.mise/ruby/bin', homebrew: 'brew/opt/ruby/bin' }[setup];
  script(path.join(home, ruby, 'ri'), 'echo "RUBY-RI $*"');
  const lines = `# the person's own setup\n${rubyLines(shell, setup)}\nexport EDITOR=vi\n`;
  if (shell === 'zsh') fs.writeFileSync(path.join(home, setup === 'homebrew' ? '.zprofile' : '.zshrc'), lines);
  if (shell === 'bash') {
    fs.writeFileSync(path.join(home, '.bashrc'), lines);
    fs.writeFileSync(path.join(home, '.bash_profile'), '[ -f ~/.bashrc ] && . ~/.bashrc\n');
  }
  if (shell === 'fish') {
    fs.mkdirSync(path.join(home, '.config/fish'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config/fish/config.fish'), lines.replace('export EDITOR=vi', 'set -gx EDITOR vi'));
  }
  return { home, launcher: path.join(home, '.local/bin/ri'), ruby: path.join(home, ruby, 'ri') };
}

/** install.sh's own functions, without its last line, which runs the install. */
function installer(home: string, shell: string, extra: Record<string, string> = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-shells-work-'));
  homes.push(work);
  const lines = fs.readFileSync(INSTALL_SH, 'utf8').trimEnd().split('\n');
  expect(lines.at(-1)).toBe('main "$@"');
  fs.writeFileSync(path.join(work, 'functions.sh'), `${lines.slice(0, -1).join('\n')}\n`);
  return spawnSync(process.env.RI_TEST_SH || '/bin/sh', ['-c', '. "$1" && ri_terminal "$2"', 'sh', path.join(work, 'functions.sh'), path.join(home, '.local/bin/ri')], {
    cwd: home, encoding: 'utf8', timeout: 60_000,
    env: { HOME: home, USER, SHELL: shell, PATH: process.env.PATH ?? SYSTEM_PATH, WORK: work, TERM: 'xterm-256color', ...extra } as unknown as NodeJS.ProcessEnv,
  });
}

/** A fresh interactive shell, typing at two prompts (fish draws none for a
 * pipe, so the input announces each one): what `ri` ran, what
 * `command -v ri` says, and what the PATH alone finds. */
function typeRi(shell: { name: string; binary: string }, home: string, flags: string[]) {
  const input = shell.name === 'fish'
    ? 'emit fish_prompt; ri first\nemit fish_prompt; ri second\necho "COMMANDV="(type -t ri)\necho "PATHFINDS="(command -v ri)\nexit\n'
    : shell.name === 'zsh'
      ? 'ri first\nri second\necho "COMMANDV=$(command -v ri)"\necho "DEFINITION=$(whence -c ri | tr \'\\n\' \' \')"\necho "PATHFINDS=$(whence -p ri)"\nexit\n'
      : 'ri first\nri second\necho "COMMANDV=$(command -v ri)"\necho "DEFINITION=$(type ri | tr \'\\n\' \' \')"\necho "PATHFINDS=$(type -P ri)"\nexit\n';
  const result = spawnSync(shell.binary, flags, {
    cwd: home, input, encoding: 'utf8', timeout: 60_000,
    env: { HOME: home, USER, LOGNAME: USER, SHELL: shell.binary, TERM: 'xterm-256color', PATH: SYSTEM_PATH } as unknown as NodeJS.ProcessEnv,
  });
  // fish puts its cwd notice (OSC 7) in front of the first output, so nothing here is anchored.
  const field = (name: string) => new RegExp(`${name}=(.*)$`, 'm').exec(result.stdout)?.[1]?.trim() ?? '';
  return { ran: result.stdout.match(/(?:RI-LAUNCHER|RUBY-RI) \w+/g) ?? [], commandV: field('COMMANDV'), definition: field('DEFINITION'), pathFinds: field('PATHFINDS') };
}

describe('install.sh and this module', () => {
  it('carry the same probes and the same lines', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-shells-same-'));
    homes.push(work);
    const lines = fs.readFileSync(INSTALL_SH, 'utf8').trimEnd().split('\n');
    fs.writeFileSync(path.join(work, 'functions.sh'), `${lines.slice(0, -1).join('\n')}\n`);
    const sh = (call: string) => spawnSync('/bin/sh', ['-c', `. "$1" && ${call}`, 'sh', path.join(work, 'functions.sh')], { encoding: 'utf8' }).stdout;
    for (const family of ['zsh', 'bash', 'fish'] as const) expect(sh(`ri_probe_script ${family}`)).toBe(PROBE_SCRIPTS[family]);
    for (const syntax of ['sh', 'posix', 'fish'] as const) {
      expect(sh(`ri_lines ${syntax} '$HOME/.local/bin'`)).toBe(`${terminalLines(syntax, '$HOME/.local/bin').join('\n')}\n`);
      expect(sh(`ri_lines ${syntax} '/opt/ri tools/bin'`)).toBe(`${terminalLines(syntax, '/opt/ri tools/bin').join('\n')}\n`);
    }
  });
});

const startupFiles = (home: string) => ['.zshrc', '.zprofile', '.bashrc', '.bash_profile', '.profile', '.config/fish/config.fish']
  .filter(file => fs.existsSync(path.join(home, file))).map(file => [file, fs.readFileSync(path.join(home, file), 'utf8')]);

for (const shell of SHELLS) {
  describe.skipIf(!shell.binary)(`${shell.name}`, () => {
    const binary = shell.binary!;
    const terminals = shell.name === 'bash' && process.platform !== 'darwin' ? [['-i', '-l'], ['-i']] : [['-i', '-l']];

    for (const setup of ['rbenv', 'mise', 'homebrew'] as const) {
      it(`puts Ri first over ${setup}-style Ruby, and install.sh writes the same lines`, async () => {
        const before = rubyHome(shell.name, setup);
        expect(typeRi({ name: shell.name, binary }, before.home, terminals[0]).ran).toEqual(['RUBY-RI first', 'RUBY-RI second']);

        const a = rubyHome(shell.name, setup);
        const fixed = await fixTerminal({ launcher: a.launcher, env: { HOME: a.home, USER, SHELL: binary }, timeoutMs: 30_000 });
        expect(fixed.message).toContain(`In a new ${shell.name} terminal, \`ri\` ran Ruby's ri (~/`);
        expect(fixed.message).toContain('so `ri` runs Ri. Open a new terminal window to use it.');
        expect(fixed.check.status).toBe('ri');

        const b = rubyHome(shell.name, setup);
        const sh = installer(b.home, binary);
        expect(sh.stderr).toBe('');
        expect(sh.stdout.trim().split('\n')).toEqual([fixed.message]);
        expect(startupFiles(b.home)).toEqual(startupFiles(a.home));
        expect((await checkTerminal({ launcher: b.launcher, env: { HOME: b.home, USER, SHELL: binary }, timeoutMs: 30_000 })).status).toBe('ri');
        // The person's own lines are all still there, in order.
        for (const [file, text] of startupFiles(a.home)) expect(text.replace(/^.* # Added by Ri\n/gm, '')).toBe(startupFiles(before.home).find(([f]) => f === file)?.[1] ?? '');

        for (const flags of terminals) {
          const typed = typeRi({ name: shell.name, binary }, a.home, flags);
          expect(typed.ran).toEqual(['RI-LAUNCHER first', 'RI-LAUNCHER second']);
          // `command -v ri` names Ri's function, which runs the launcher.
          if (shell.name === 'fish') expect(typed.commandV).toBe('function');
          else {
            expect(typed.commandV).toBe('ri');
            expect(typed.definition).toContain('$HOME/.local/bin/ri');
          }
          // The PATH line holds where Ruby is put first once at startup. A hook that
          // puts it back at every prompt (mise) is why the function is there too.
          if (setup !== 'mise') expect(typed.pathFinds).toBe(a.launcher);
        }

        // Running it again changes nothing.
        const again = installer(b.home, binary);
        expect(again.stdout).toBe('');
        expect((await fixTerminal({ launcher: a.launcher, env: { HOME: a.home, USER, SHELL: binary }, timeoutMs: 30_000 })).changed).toEqual([]);
      });
    }

    it('survives startup files that wait for input, hang or print, and says it could not check', async () => {
      const { home, launcher } = rubyHome(shell.name, 'rbenv');
      const rc = shell.name === 'zsh' ? '.zshrc' : shell.name === 'bash' ? '.bashrc' : '.config/fish/config.fish';
      fs.appendFileSync(path.join(home, rc), 'echo "Update now? [Y/n]"; read answer; echo noise >&2; echo hi > /dev/tty; sleep 30\n');
      const started = Date.now();
      const fixed = await fixTerminal({ launcher, env: { HOME: home, USER, SHELL: binary }, timeoutMs: 1500 });
      expect(fixed.message).toContain("Ri couldn't open a test terminal to check.");
      const sh = installer(home, binary, { RI_PROBE_SECONDS: '1' });
      expect(sh.stdout.trim().split('\n')).toHaveLength(1);
      expect(sh.stdout).toContain('The lines marked "# Added by Ri" are already at the end of');
      expect(sh.stderr).toBe('');
      expect(Date.now() - started).toBeLessThan(20_000);
    });
  });
}

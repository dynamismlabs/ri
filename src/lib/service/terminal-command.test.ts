import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  describeFound, fixTerminal, folderExpression, judgeProbe, parseProbe, personShell, probeEnvironment, probeFlags, runProbe,
  terminalFiles, terminalLines, withTerminalLines, writeTerminalLines, type ProbeRunner,
} from './terminal-command';

let home: string;
let launcher: string;
beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ri-terminal-unit-')));
  launcher = path.join(home, '.local/bin/ri');
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, '#!/bin/sh\n# Ri command launcher\n', { mode: 0o755 });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const SH_LINES = [
  'export PATH="$HOME/.local/bin:$PATH" # Added by Ri',
  'function ri { if [ -x "$HOME/.local/bin/ri" ]; then "$HOME/.local/bin/ri" "$@"; else command ri "$@"; fi; } # Added by Ri',
];

describe('which shell a new terminal opens', () => {
  it('reads SHELL, and falls back to each OS default', () => {
    expect(personShell({ SHELL: '/opt/homebrew/bin/fish' }, 'darwin')).toEqual({ name: 'fish', family: 'fish', binary: '/opt/homebrew/bin/fish' });
    expect(personShell({}, 'darwin')).toMatchObject({ name: 'zsh', family: 'zsh' });
    expect(personShell({}, 'linux')).toMatchObject({ name: 'bash', family: 'bash' });
    expect(personShell({ SHELL: '/bin/dash' }, 'linux').family).toBe('posix');
    expect(personShell({ SHELL: '/bin/tcsh' }, 'linux').family).toBe('other');
  });

  it('probes bash both ways on Linux, where desktop terminals skip the login files and SSH reads them', () => {
    expect(probeFlags('bash', 'linux')).toEqual([['-i', '-l'], ['-i']]);
    expect(probeFlags('bash', 'darwin')).toEqual([['-i', '-l']]);
    expect(probeFlags('zsh', 'linux')).toEqual([['-i', '-l']]);
  });

  it('starts the test terminal with the system PATH, not this process\'s', () => {
    const env = probeEnvironment({ HOME: home, USER: 'pat', PATH: '/somewhere:/usr/bin', TERM: 'dumb', ZDOTDIR: `${home}/.zsh`, SECRET: 'x' }, 'darwin', '/bin/zsh', home);
    expect(env).toEqual({ HOME: home, USER: 'pat', LOGNAME: 'pat', SHELL: '/bin/zsh', TERM: 'xterm-256color', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ZDOTDIR: `${home}/.zsh` });
    expect(probeEnvironment({ HOME: home, USER: 'pat' }, 'linux', '/bin/bash', home).PATH).toBe('/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
  });
});

describe('reading what the test terminal said', () => {
  it('parses a probe, and nothing from a shell that never answered', () => {
    expect(parseProbe('kind=function\npath=/usr/bin/ri\nconfig=/h\ndefinition:\nri () {\n\t"$HOME/.local/bin/ri" "$@"\n}\n')).toEqual({
      kind: 'function', path: '/usr/bin/ri', config: '/h', definition: 'ri () {\n\t"$HOME/.local/bin/ri" "$@"\n}\n',
    });
    expect(parseProbe('')).toBeNull();
  });

  it('counts the launcher, a link to it, and a function that runs it as Ri', () => {
    const answer = (kind: string, file: string, definition = '') => ({ kind, path: file, config: '', definition });
    expect(judgeProbe(answer('command', launcher), launcher, '$HOME/.local/bin')).toEqual({ status: 'ri' });
    const link = path.join(home, 'link-ri');
    fs.symlinkSync(launcher, link);
    expect(judgeProbe(answer('file', link), launcher, '$HOME/.local/bin')).toEqual({ status: 'ri' });
    expect(judgeProbe(answer('function', '/usr/bin/ri', `ri is a function\nri () { "$HOME/.local/bin/ri" "$@"; }`), launcher, '$HOME/.local/bin')).toEqual({ status: 'ri' });
    expect(judgeProbe(answer('function', '/usr/bin/ri', `ri () { ${launcher} "$@"; }`), launcher, null)).toEqual({ status: 'ri' });
  });

  it("names what runs instead: Ruby's ri, someone else's function or alias, or nothing", () => {
    const answer = (kind: string, file = '', definition = '') => ({ kind, path: file, config: '', definition });
    expect(judgeProbe(answer('command', '/usr/bin/ri'), launcher, '$HOME/.local/bin')).toEqual({ status: 'other', found: '/usr/bin/ri' });
    expect(judgeProbe(answer('alias', '', "ri: aliased to echo"), launcher, '$HOME/.local/bin')).toEqual({ status: 'other', found: 'a shell alias named ri' });
    expect(judgeProbe(answer('none'), launcher, '$HOME/.local/bin')).toEqual({ status: 'missing' });
    expect(judgeProbe(answer(''), launcher, '$HOME/.local/bin')).toEqual({ status: 'missing' });
    expect(judgeProbe(null, launcher, '$HOME/.local/bin')).toEqual({ status: 'unknown' });
    expect(describeFound('/usr/bin/ri', home)).toBe("Ruby's ri (/usr/bin/ri)");
    expect(describeFound(`${home}/.local/share/mise/installs/ruby/3.3.0/bin/ri`, home)).toBe("Ruby's ri (~/.local/share/mise/installs/ruby/3.3.0/bin/ri)");
    expect(describeFound('/opt/tools/ri', home)).toBe('/opt/tools/ri');
  });
});

describe('the lines Ri adds', () => {
  it('writes the folder from $HOME, and refuses one no line can quote', () => {
    expect(folderExpression(`${home}/.local/bin`, home)).toBe('$HOME/.local/bin');
    expect(folderExpression('/opt/ri bin', home)).toBe('/opt/ri bin');
    expect(folderExpression('/opt/$x', home)).toBeNull();
    expect(folderExpression('/opt/"x', home)).toBeNull();
  });

  it('has the same two lines in each syntax', () => {
    expect(terminalLines('sh', '$HOME/.local/bin')).toEqual(SH_LINES);
    expect(terminalLines('posix', '$HOME/.local/bin')[1]).toBe('ri() { if [ -x "$HOME/.local/bin/ri" ]; then "$HOME/.local/bin/ri" "$@"; else command ri "$@"; fi; } # Added by Ri');
    expect(terminalLines('fish', '$HOME/.local/bin')).toEqual([
      'set -gx PATH "$HOME/.local/bin" $PATH # Added by Ri',
      'function ri; if test -x "$HOME/.local/bin/ri"; "$HOME/.local/bin/ri" $argv; else; command ri $argv; end; end # Added by Ri',
    ]);
  });

  it('appends them once, moves its own to the end, and leaves every other line alone', () => {
    expect(withTerminalLines('', SH_LINES)).toBe(`${SH_LINES.join('\n')}\n`);
    expect(withTerminalLines('export EDITOR=vim', SH_LINES)).toBe(`export EDITOR=vim\n${SH_LINES.join('\n')}\n`);
    const once = withTerminalLines('eval "$(rbenv init - zsh)"\n', SH_LINES);
    expect(withTerminalLines(once, SH_LINES)).toBe(once);
    const later = `${once}export PATH="/opt/homebrew/opt/ruby/bin:$PATH"\n`;
    expect(withTerminalLines(later, SH_LINES)).toBe(`eval "$(rbenv init - zsh)"\nexport PATH="/opt/homebrew/opt/ruby/bin:$PATH"\n${SH_LINES.join('\n')}\n`);
    // An older install's comment line, and anyone else's comment, stay.
    const older = '\n# Added by Ri\nexport PATH="$HOME/.local/bin:$PATH"\n# notes # Added by Ri\n\n';
    expect(withTerminalLines(older, SH_LINES)).toBe(`${older}${SH_LINES.join('\n')}\n`);
  });

  it('writes through a link into a dotfiles folder, and never over a file it cannot read', () => {
    const dotfiles = path.join(home, 'dotfiles/zshrc');
    fs.mkdirSync(path.dirname(dotfiles));
    fs.writeFileSync(dotfiles, 'setopt autocd\n');
    fs.symlinkSync(dotfiles, path.join(home, '.zshrc'));
    expect(writeTerminalLines(path.join(home, '.zshrc'), SH_LINES)).toBe(true);
    expect(fs.lstatSync(path.join(home, '.zshrc')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(dotfiles, 'utf8')).toBe(`setopt autocd\n${SH_LINES.join('\n')}\n`);
    expect(writeTerminalLines(path.join(home, '.zshrc'), SH_LINES)).toBe(false);
    fs.mkdirSync(path.join(home, '.bashrc'));
    expect(writeTerminalLines(path.join(home, '.bashrc'), SH_LINES)).toBeNull();
    if (process.getuid?.() !== 0) {
      fs.writeFileSync(path.join(home, '.profile'), 'secret\n', { mode: 0o200 });
      expect(writeTerminalLines(path.join(home, '.profile'), SH_LINES)).toBeNull();
      fs.chmodSync(path.join(home, '.profile'), 0o600);
      expect(fs.readFileSync(path.join(home, '.profile'), 'utf8')).toBe('secret\n');
    }
  });

  it('picks the files each shell reads last', () => {
    const files = (family: Parameters<typeof terminalFiles>[0], platform: NodeJS.Platform, env = {}, config?: string) =>
      terminalFiles(family, platform, home, env, config).map(f => `${f.syntax} ${path.relative(home, f.file)}`);
    expect(files('zsh', 'darwin')).toEqual(['sh .zshrc']);
    expect(files('zsh', 'darwin', {}, `${home}/.config/zsh`)).toEqual(['sh .config/zsh/.zshrc']);
    expect(files('bash', 'darwin')).toEqual(['sh .bash_profile']);
    expect(files('bash', 'linux')).toEqual(['sh .bashrc', 'sh .bash_profile']);
    fs.writeFileSync(path.join(home, '.profile'), '');
    // A new ~/.bash_profile would stop bash reading ~/.profile at login.
    expect(files('bash', 'linux')).toEqual(['sh .bashrc', 'posix .profile']);
    fs.writeFileSync(path.join(home, '.bashrc'), '');
    expect(files('bash', 'darwin')).toEqual(['sh .bashrc', 'posix .profile']);
    expect(files('fish', 'linux', { XDG_CONFIG_HOME: `${home}/xdg` })).toEqual(['fish xdg/fish/config.fish']);
    expect(files('fish', 'linux', {}, `${home}/.config/fish`)).toEqual(['fish .config/fish/config.fish']);
    expect(files('posix', 'linux')).toEqual(['posix .profile']);
    expect(files('other', 'linux')).toEqual([]);
  });
});

describe('fixing a terminal', () => {
  const env = () => ({ HOME: home, SHELL: '/bin/zsh' });
  const said = (...answers: (string | null)[]): ProbeRunner => async () => answers.length > 1 ? answers.shift()! : answers[0];
  const ruby = 'kind=command\npath=/usr/bin/ri\nconfig=\ndefinition:\n';
  const ours = 'kind=function\npath=/usr/bin/ri\nconfig=\ndefinition:\nri () { "$HOME/.local/bin/ri" "$@" }\n';

  it('changes nothing when a new terminal already runs Ri', async () => {
    const fixed = await fixTerminal({ launcher, env: env(), platform: 'darwin', run: said(`kind=command\npath=${launcher}\nconfig=\ndefinition:\n`) });
    expect(fixed).toMatchObject({ changed: [], message: 'A new zsh terminal runs it as `ri`.' });
    expect(fs.existsSync(path.join(home, '.zshrc'))).toBe(false);
  });

  it('says when something after its lines still takes ri over', async () => {
    const alias = 'kind=alias\npath=/usr/bin/ri\nconfig=\ndefinition:\nri: aliased to /usr/bin/ri\n';
    const fixed = await fixTerminal({ launcher, env: env(), platform: 'darwin', run: said(ruby, alias) });
    expect(fixed.message).toBe("In a new zsh terminal, `ri` ran Ruby's ri (/usr/bin/ri) instead of Ri. Put 2 lines marked \"# Added by Ri\" at the end of ~/.zshrc, "
      + 'but a new terminal still runs a shell alias named ri. A shell expands an alias before anything else, so remove that alias to use Ri as `ri`, or run ~/.local/bin/ri.');
    const later = 'kind=function\npath=/usr/bin/ri\nconfig=\ndefinition:\nri () { /usr/bin/ri "$@" }\n';
    const again = await fixTerminal({ launcher, env: env(), platform: 'darwin', run: said(later, later) });
    expect(again.message).toBe('In a new zsh terminal, `ri` ran a shell function named ri instead of Ri. The lines marked "# Added by Ri" are already at the end of ~/.zshrc, '
      + 'but a new terminal still runs a shell function named ri. Something after those lines takes `ri` over. ~/.local/bin/ri always runs Ri.');
  });

  it("writes the lines and says so when the test terminal doesn't answer", async () => {
    const fixed = await fixTerminal({ launcher, env: env(), platform: 'darwin', run: said(null) });
    expect(fixed.changed).toEqual(['~/.zshrc']);
    expect(fixed.message).toBe('Put 2 lines marked "# Added by Ri" at the end of ~/.zshrc, so `ri` runs Ri. Ri couldn\'t open a test terminal to check. Open a new terminal window to use it.');
  });

  it('says a missing ri plainly, and repairs it', async () => {
    const fixed = await fixTerminal({ launcher, env: env(), platform: 'darwin', run: said('kind=none\npath=\nconfig=\ndefinition:\n', ours) });
    expect(fixed.message.startsWith("A new zsh terminal didn't find `ri`. Put 2 lines")).toBe(true);
    expect(fixed.check.status).toBe('ri');
  });

  it("leaves shells it can't set up alone", async () => {
    const fixed = await fixTerminal({ launcher, env: { HOME: home, SHELL: '/usr/bin/tcsh' }, platform: 'linux', run: said(null) });
    expect(fixed).toMatchObject({ changed: [], message: "Ri can't set up tcsh terminals. Put ~/.local/bin first on its PATH, or run ~/.local/bin/ri." });
  });
});

describe('the test terminal itself', () => {
  it('gives up on a startup file that hangs, and stops everything it started', async () => {
    const fake = path.join(home, 'zsh');
    const child = path.join(home, 'child.pid');
    fs.writeFileSync(fake, `#!/bin/sh\nsleep 60 &\necho $! > '${child}'\nsleep 60\n`, { mode: 0o755 });
    const started = Date.now();
    const answer = await runProbe({ name: 'zsh', family: 'zsh', binary: fake }, ['-i', '-l'], { HOME: home, PATH: '/usr/bin:/bin' }, home, 2000);
    expect(answer).toBeNull();
    expect(Date.now() - started).toBeLessThan(10_000);
    const pid = Number(fs.readFileSync(child, 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('runs with no input and no terminal to write to', async () => {
    const fake = path.join(home, 'bash');
    fs.writeFileSync(fake, [
      '#!/bin/sh',
      'read line && echo "read=$line" >> "$RI_PROBE_OUT"',
      '( : > /dev/tty ) 2>/dev/null && echo tty=yes >> "$RI_PROBE_OUT" || echo tty=no >> "$RI_PROBE_OUT"',
      'echo "noise on stdout"; echo "noise on stderr" >&2',
      'echo kind=file >> "$RI_PROBE_OUT"; echo "cwd=$(pwd -P)" >> "$RI_PROBE_OUT"',
    ].join('\n'), { mode: 0o755 });
    const answer = await runProbe({ name: 'bash', family: 'bash', binary: fake }, ['-i'], { HOME: home, PATH: '/usr/bin:/bin' }, home, 5000);
    expect(answer).toBe(`tty=no\nkind=file\ncwd=${home}\n`);
  });
});

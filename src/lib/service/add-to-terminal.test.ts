import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addToTerminal } from './add-to-terminal';
import type { ProbeRunner } from './terminal-command';

const mocks = vi.hoisted(() => ({ install: vi.fn() }));
vi.mock('./runtime', () => ({ installCommandLauncher: mocks.install, commandLauncherPath: () => '/nowhere/ri' }));
let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-terminal-'));
  mocks.install.mockReturnValue({ file: path.join(home, '.local/bin/ri'), installed: true });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

/** A zsh that runs Ruby's /usr/bin/ri until ~/.zshrc defines ri. */
const zsh: ProbeRunner = async () => {
  const rc = path.join(home, '.zshrc');
  const fn = fs.existsSync(rc) ? fs.readFileSync(rc, 'utf8').split('\n').find(line => line.startsWith('function ri')) : undefined;
  return fn ? `kind=function\npath=/usr/bin/ri\nconfig=${home}\ndefinition:\n${fn}\n` : `kind=command\npath=/usr/bin/ri\nconfig=${home}\ndefinition:\n/usr/bin/ri\n`;
};

it("puts Ri's lines in ~/.zshrc once, and says what it changed", async () => {
  const first = await addToTerminal({ HOME: home, SHELL: '/bin/zsh' }, 'darwin', { run: zsh });
  expect(first.changed).toEqual(['~/.local/bin/ri', '~/.zshrc']);
  expect(first.message).toBe("`ri` is ready at ~/.local/bin/ri. In a new zsh terminal, `ri` ran Ruby's ri (/usr/bin/ri) instead of Ri. "
    + 'Put 2 lines marked "# Added by Ri" at the end of ~/.zshrc, so `ri` runs Ri. Open a new terminal window to use it.');
  const written = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  expect(written).toBe('export PATH="$HOME/.local/bin:$PATH" # Added by Ri\n'
    + 'function ri { if [ -x "$HOME/.local/bin/ri" ]; then "$HOME/.local/bin/ri" "$@"; else command ri "$@"; fi; } # Added by Ri\n');
  const second = await addToTerminal({ HOME: home, SHELL: '/bin/zsh' }, 'darwin', { run: zsh });
  expect(second.changed).toEqual(['~/.local/bin/ri']);
  expect(second.message).toBe('`ri` is ready at ~/.local/bin/ri. A new zsh terminal runs it as `ri`.');
  expect(fs.readFileSync(path.join(home, '.zshrc'), 'utf8')).toBe(written);
});

it('keeps what the startup file already says', async () => {
  fs.writeFileSync(path.join(home, '.zshrc'), 'export EDITOR=vim');
  await addToTerminal({ HOME: home, SHELL: '/bin/zsh' }, 'darwin', { run: zsh });
  const written = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  expect(written.startsWith('export EDITOR=vim\nexport PATH="$HOME/.local/bin:$PATH" # Added by Ri\n')).toBe(true);
});

it('changes nothing when another program already sits at that path', async () => {
  mocks.install.mockReturnValue({ file: path.join(home, '.local/bin/ri'), installed: false, reason: 'Another program is already there.' });
  const result = await addToTerminal({ HOME: home, SHELL: '/bin/zsh' }, 'darwin', { run: zsh });
  expect(result).toEqual({ installed: false, changed: [], message: 'Another program is already there.' });
  expect(fs.existsSync(path.join(home, '.zshrc'))).toBe(false);
});

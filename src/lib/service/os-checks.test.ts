import os from 'node:os';
import { expect, it } from 'vitest';
import { commandCheck, diskCheck, linuxChecks, macChecks, type Run } from './os-checks';

const GiB = 1024 ** 3;
const outputs = (map: Record<string, string | null>): Run => (command, args) => map[`${command} ${args.join(' ')}`] ?? null;
const PMSET = ' System-wide power settings:\nCurrently in use:\n standby              0\n autorestart          1\n sleep                0\n disksleep            10\n';

it("finds a Mac that comes back on its own: the owner's Mini", () => {
  const checks = macChecks(outputs({
    '/usr/bin/defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser': 'agent\n',
    '/usr/bin/fdesetup status': 'FileVault is Off.\n',
    '/usr/bin/pmset -g': PMSET,
  }), 'agent');
  expect(checks.filter(check => check.warn)).toEqual([]);
  expect(checks.map(check => check.name)).toEqual(['Automatic login', 'FileVault', 'Restart after power failure', 'Sleep']);
});

it('says what keeps a Mac from coming back, and the fix', () => {
  const checks = macChecks(outputs({
    '/usr/bin/fdesetup status': 'FileVault is On.\n',
    '/usr/bin/pmset -g': PMSET.replace('autorestart          1', 'autorestart          0').replace('sleep                0', 'sleep                10'),
  }), 'trey');
  expect(checks.every(check => check.ok && check.warn)).toBe(true);
  expect(checks.map(check => check.detail)).toEqual([
    'off. After a restart or power cut, Ri waits until trey logs in. Turn it on in System Settings > Users & Groups for a Mac nobody sits at',
    'on. After an unplanned restart nothing starts until someone unlocks the disk. For a planned restart: sudo fdesetup authrestart',
    'off, so the Mac stays off after a power cut. To turn it on: sudo pmset -a autorestart 1',
    'after 10 min idle, which pauses Ri. To keep the Mac awake on power: ri service awake on',
  ]);
});

it('gives the linger command on Linux', () => {
  expect(linuxChecks(outputs({ 'loginctl show-user maya --property=Linger': 'Linger=no\n' }), 'maya')[0])
    .toMatchObject({ warn: true, detail: 'off, so Ri starts only once maya logs in. To start it at boot: sudo loginctl enable-linger maya' });
  expect(linuxChecks(outputs({ 'loginctl show-user maya --property=Linger': 'Linger=yes\n' }), 'maya')[0]).toMatchObject({ ok: true, detail: 'on for maya' });
});

it('warns under the larger of 20 GiB or the database, and fails near empty', () => {
  expect(diskCheck(40 * GiB, 21 * GiB)).toMatchObject({ ok: true, detail: '40.0 GiB free' });
  expect(diskCheck(15 * GiB, 21 * GiB)).toMatchObject({ ok: true, warn: true, detail: expect.stringContaining('under 21.0 GiB') });
  expect(diskCheck(1 * GiB, 1 * GiB)).toMatchObject({ ok: false });
});

it("names whatever a new terminal runs instead of the launcher, and the one command that fixes it", () => {
  const home = os.homedir();
  const launcher = `${home}/.local/bin/ri`;
  const zsh = { name: 'zsh', family: 'zsh', binary: '/bin/zsh' } as const;
  expect(commandCheck({ shell: zsh, status: 'ri' }, launcher, true)).toEqual({ name: 'The ri command', ok: true, detail: '~/.local/bin/ri, in a new zsh terminal' });
  expect(commandCheck({ shell: zsh, status: 'other', found: '/usr/bin/ri' }, launcher, true)).toMatchObject({ ok: true, warn: true,
    detail: "a new zsh terminal runs Ruby's ri (/usr/bin/ri), not Ri. To fix it: ~/.local/bin/ri doctor --fix" });
  expect(commandCheck({ shell: zsh, status: 'other', found: `${home}/.rbenv/shims/ri` }, launcher, true).detail).toContain("Ruby's ri (~/.rbenv/shims/ri)");
  // No line of Ri's outranks an alias, so the fix is the person's.
  expect(commandCheck({ shell: zsh, status: 'other', found: 'a shell alias named ri' }, launcher, true).detail)
    .toBe('a new zsh terminal runs a shell alias named ri, not Ri. A shell expands an alias before anything else, so remove that alias to use Ri as `ri`, or run ~/.local/bin/ri.');
  expect(commandCheck({ shell: zsh, status: 'missing' }, launcher, true).detail).toBe("a new zsh terminal doesn't find ri. To fix it: ~/.local/bin/ri doctor --fix");
  expect(commandCheck({ shell: zsh, status: 'unknown' }, launcher, true).detail).toContain("couldn't open a test zsh terminal");
  expect(commandCheck({ shell: { name: 'tcsh', family: 'other', binary: '/bin/tcsh' }, status: 'unknown' }, launcher, true).detail).toBe("Ri can't check tcsh terminals. ~/.local/bin has to come first on its PATH");
  expect(commandCheck(null, launcher, false).detail).toBe('not installed. `ri update` installs it at ~/.local/bin/ri');
});

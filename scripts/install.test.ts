/**
 * The install script as a download: `curl ... | sh` runs whatever arrived, so a
 * connection cut partway must run nothing (the rustup pattern: everything is a
 * function, and the last line calls main). Its terminal setup is tested in real
 * shells by src/lib/service/terminal-command.shells.test.ts.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';

const INSTALL_SH = path.join(__dirname, 'install.sh');
const text = fs.readFileSync(INSTALL_SH, 'utf8');
const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

function which(name: string) {
  const found = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
  return found.startsWith('/') ? found : null;
}

it('is valid POSIX sh for every sh it may meet', () => {
  for (const sh of ['/bin/sh', which('dash'), which('bash') && `${which('bash')} --posix`].filter(Boolean) as string[]) {
    const [command, ...args] = sh.split(' ');
    const result = spawnSync(command, [...args, '-n', INSTALL_SH], { encoding: 'utf8' });
    expect({ sh, status: result.status, stderr: result.stderr }).toEqual({ sh, status: 0, stderr: '' });
  }
});

it('runs nothing when the download stops partway', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-install-cut-'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-install-bin-'));
  dirs.push(home, bin);
  const record = path.join(bin, 'called');
  // Every program main reaches first, standing in to record that it ran.
  for (const tool of ['curl', 'tar', 'base64', 'mktemp', 'uname', 'shasum', 'sha256sum']) {
    fs.writeFileSync(path.join(bin, tool), `#!/bin/sh\necho ${tool} >> '${record}'\nexit 1\n`, { mode: 0o755 });
  }
  const run = (script: string) => {
    fs.rmSync(record, { force: true });
    const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin` } as unknown as NodeJS.ProcessEnv;
    spawnSync('/bin/sh', [], { input: script, env, encoding: 'utf8', timeout: 10_000 });
    return fs.existsSync(record);
  };
  // The whole script does reach the network, so the stand-ins work.
  expect(run(text)).toBe(true);
  const cuts = new Set<number>();
  let at = 0;
  for (const line of text.split('\n')) {
    cuts.add(at + Math.floor(line.length / 2));
    at += line.length + 1;
    cuts.add(at);
  }
  const ran = [...cuts].filter(cut => cut < text.length && !/\nmain(?: "\$@")?\n?$/.test(text.slice(0, cut)) && run(text.slice(0, cut)));
  expect(ran).toEqual([]);
  expect(fs.readdirSync(home)).toEqual([]);
});

it('ends by calling main', () => {
  expect(text.trimEnd().split('\n').at(-1)).toBe('main "$@"');
});

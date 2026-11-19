import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  editDistance, findRubyRi, FORWARDED_ENV, isRiCommand, isRubyLookup, outsideRi, riCommands, runRubyRi, similarCommands, unknownCommandMessage,
} from './ruby-ri';

/** Ri's command line as src/cli/index.ts builds it, in miniature. */
function program() {
  const ri = new Command().name('ri').version('1.0.0');
  ri.command('start', { isDefault: true }).option('--root <dir>').option('--foreground').option('-p, --port <number>').option('--no-open').option('--dev');
  for (const name of ['stop', 'restart', 'logs', 'status', 'setup', 'home', 'agent', 'skills', 'trigger', 'team', 'update', 'doctor', 'service', 'connect', 'pair', 'perf']) ri.command(name);
  return riCommands(ri);
}
const ri = program();

let dir: string;
beforeAll(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ri-ruby-'))); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function script(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

describe('telling a Ruby lookup from a Ri command', () => {
  it.each([
    'Array#each', 'String', 'File::Stat', 'Array.new', 'Array.[]', '::Kernel', 'Enumerable#each_slice', 'Hash#<=>', 'Set', 'Fil',
    '#each', '.new', 'compact!', 'empty?', 'rdoc:README', 'ruby:NEWS', 'rdoc:',
    '-i', '--interactive', '-a', '-l', '--list', '-T', '-f', '--format=markdown', '-w80', '--width', '--server', '--list-doc-dirs', '--no-pager', '-d', '--no-gems',
  ])('hands %s to Ruby', arg => {
    expect(isRubyLookup([arg], ri)).toBe(true);
  });

  it.each([
    // Ri's own commands, options and help
    'start', 'status', 'help', 'doctor', '--dev', '--root', '-p', '--port=4224', '--no-open', '--help', '-h', '-V', '--version',
    // typos of them, lowercase or capitalized
    'statsu', 'strat', 'Status', 'Start', 'Statsu', 'Strat', 'Setpu',
    // nothing that says Ruby
    'foo', 'each_slice', 'https://example.com', '-v', '-', '',
  ])('keeps %s', arg => {
    expect(isRubyLookup(arg ? [arg] : [], ri)).toBe(false);
  });

  it('reads Ri\'s own names from the command line itself', () => {
    expect(ri.commands).toEqual(expect.arrayContaining(['help', 'start', 'status', 'doctor']));
    expect(ri.options).toEqual(expect.arrayContaining(['-V', '--version', '-p', '--port', '--dev', '--no-open', '-h', '--help']));
    // An option Ri takes is never Ruby's, even when Ruby's ri has one by that name.
    expect(isRubyLookup(['--list'], { ...ri, options: [...ri.options, '--list'] })).toBe(false);
  });

  it('finds what a typo meant, the way commander does', () => {
    expect(editDistance('statsu', 'status')).toBe(1);
    expect(editDistance('set', 'setup')).toBe(2);
    expect(similarCommands('statsu', ri.commands)).toEqual(['status']);
    expect(similarCommands('Strat', ri.commands)).toEqual(['start']);
    expect(similarCommands('Array#each', ri.commands)).toEqual([]);
  });
});

describe("finding Ruby's ri", () => {
  it("skips every ri of Ri's own and takes the next one on the PATH", () => {
    const launcher = script(path.join(dir, 'local/bin/ri'), '# Ri command launcher\nexec node dist/cli/index.mjs "$@"');
    const session = script(path.join(dir, 'work/bin/ri'), '# Ri session launcher, written by the server');
    const shim = script(path.join(dir, 'pnpm/bin/ri'), 'exec node "$basedir/../ai-task-manager/dist/cli/index.mjs" "$@"');
    const entry = script(path.join(dir, 'checkout/dist/cli/index.mjs'), '');
    fs.mkdirSync(path.join(dir, 'linked'), { recursive: true });
    fs.symlinkSync(entry, path.join(dir, 'linked/ri'));
    const ruby = script(path.join(dir, 'rbenv/shims/ri'), 'exec rbenv exec ri "$@"');
    fs.writeFileSync(path.join(dir, 'notexec-ri'), '');
    fs.mkdirSync(path.join(dir, 'plain'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'notexec-ri'), path.join(dir, 'plain/ri'));
    for (const own of [launcher, session, shim]) expect(isRiCommand(own, entry)).toBe(true);
    expect(isRiCommand(path.join(dir, 'linked/ri'), entry)).toBe(true);
    expect(isRiCommand(ruby, entry)).toBe(false);
    const searchPath = ['relative/bin', path.dirname(launcher), path.dirname(session), path.dirname(shim), path.join(dir, 'linked'), path.join(dir, 'plain'), path.dirname(ruby), '/usr/bin'].join(':');
    expect(findRubyRi(searchPath, file => isRiCommand(file, entry))).toBe(ruby);
    expect(findRubyRi([path.dirname(launcher), path.dirname(session)].join(':'), file => isRiCommand(file, entry))).toBeNull();
  });
});

describe('handing the call over', () => {
  it('passes the same arguments, says it forwarded, and returns the same exit code', () => {
    const log = path.join(dir, 'ruby.log');
    const ruby = script(path.join(dir, 'ruby/bin/ri'), `printf '%s|' "$@" > '${log}'; echo "forwarded=$${FORWARDED_ENV}" >> '${log}'; exit 3`);
    expect(runRubyRi(ruby, ['Array#each', 'with space', '-T'])).toBe(3);
    expect(fs.readFileSync(log, 'utf8')).toBe('Array#each|with space|-T|forwarded=1\n');
  });

  it('forwards only what is Ruby, and only once', () => {
    const find = () => '/usr/bin/ri';
    expect(outsideRi(['Array#each'], ri, {}, find)).toEqual({ forward: '/usr/bin/ri', error: null });
    expect(outsideRi(['status'], ri, {}, find)).toEqual({ forward: null, error: null });
    expect(outsideRi(['--dev'], ri, {}, find)).toEqual({ forward: null, error: null });
    expect(outsideRi([], ri, {}, find)).toEqual({ forward: null, error: null });
    // A wrapper that calls Ri back gets Ri's own answer, not another round trip.
    expect(outsideRi(['Array#each'], ri, { [FORWARDED_ENV]: '1' }, find)).toEqual({ forward: null, error: "error: unknown command 'Array#each'. Run ri --help for Ri's commands." });
    // Without Ruby's ri, a Ruby name is just an unknown command.
    expect(outsideRi(['String'], ri, {}, () => null).error).toBe("error: unknown command 'String'. Run ri --help for Ri's commands.");
  });

  it("names Ruby's ri in the error only when nothing of Ri's is close", () => {
    expect(unknownCommandMessage('statsu', ri, '/usr/bin/ri')).toBe("error: unknown command 'statsu'\n(Did you mean status?)");
    expect(unknownCommandMessage('foo', ri, '/usr/bin/ri')).toBe("error: unknown command 'foo'. Run ri --help for Ri's commands.\nFor Ruby's documentation, run /usr/bin/ri foo");
    expect(unknownCommandMessage('foo', ri, null)).toBe("error: unknown command 'foo'. Run ri --help for Ri's commands.");
  });
});

describe('the real ri command', () => {
  const repo = path.resolve(__dirname, '../../..');
  const cli = (args: string[], ruby: string) => new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(path.join(repo, 'node_modules/.bin/tsx'), ['src/cli/index.ts', ...args], {
      cwd: repo, env: { ...process.env, PATH: `${path.dirname(ruby)}:${process.env.PATH}` },
    });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', code => resolve({ code, out }));
  });

  it("hands Ruby lookups to Ruby's ri and keeps its own commands", async () => {
    const ruby = script(path.join(dir, 'e2e/bin/ri'), 'echo "RUBY-RI $*"; exit 7');
    const [lookup, typo, unknown] = await Promise.all([cli(['Array#each'], ruby), cli(['Statsu'], ruby), cli(['foo'], ruby)]);
    expect(lookup).toEqual({ code: 7, out: 'RUBY-RI Array#each\n' });
    expect(typo).toMatchObject({ code: 1, out: expect.stringContaining('(Did you mean status?)') });
    expect(typo.out).not.toContain('RUBY-RI');
    expect(unknown).toMatchObject({ code: 1, out: expect.stringContaining(`For Ruby's documentation, run ${ruby} foo`) });
  });
});

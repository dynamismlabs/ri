#!/usr/bin/env node
/**
 * A stand-in for the app kit's own commands, as the kit's docs/safe-change.md describes them, so Ri's
 * tests run Ri's real install and remove paths without building an app: `serve --install [<ref>]`,
 * `change [<ref>]`, `status`, `restart` (each with `--json`) and `serve --uninstall`. The service is
 * a plain background process with a pid file, as the kit's `--service process` is, and the data
 * directory is `APP_DATA_DIR`, which uninstalling keeps.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dataDir = process.env.APP_DATA_DIR;
if (!dataDir) { console.error('This stand-in needs APP_DATA_DIR.'); process.exit(64); }
const releases = path.join(dataDir, 'releases');
const marker = path.join(releases, 'service.process');
const pidFile = path.join(releases, 'service.pid');
const current = path.join(releases, 'current.txt');
const configFile = path.join(dataDir, 'config.env');

const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pid = () => Number(fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf8') : 0);
const readConfig = () => Object.fromEntries((fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '').split('\n').filter(Boolean)
  .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const release = () => (fs.existsSync(current) ? fs.readFileSync(current, 'utf8').trim() : null);

async function stop() {
  const running = pid();
  if (running && alive(running)) {
    process.kill(running, 'SIGTERM');
    for (let waited = 0; alive(running) && waited < 15_000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    if (alive(running)) process.kill(running, 'SIGKILL');
  }
  fs.rmSync(pidFile, { force: true });
}

async function start() {
  const port = readConfig().PORT;
  const out = fs.openSync(path.join(dataDir, 'server.log'), 'a');
  const child = spawn(process.execPath, [path.join(process.cwd(), 'server.mjs')], {
    detached: true, stdio: ['ignore', out, out], env: { PATH: process.env.PATH, APP_DATA_DIR: dataDir, PORT: port },
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid));
  for (let attempt = 0; attempt < 400; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* Not yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The app didn’t answer after starting.');
}

async function install(ref, first) {
  const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  fs.mkdirSync(releases, { recursive: true });
  if (!first && !fs.existsSync(marker)) { say({ event: 'result', outcome: 'refused', message: 'It isn’t installed. Use serve --install.' }); process.exit(64); }
  // The settings the caller gave are merged into config.env, as the kit does.
  const settings = { ...readConfig(), ...Object.fromEntries(['PORT', 'APP_HOST'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])) };
  fs.writeFileSync(configFile, Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  const previous = release();
  for (const step of ['resolve', 'copy', 'install', 'typecheck', 'test', 'build', 'rehearse', 'stop', 'snapshot', 'switch']) say({ event: 'step', step, status: 'passed' });
  await stop();
  fs.writeFileSync(marker, 'process\n');
  fs.writeFileSync(current, commit.slice(0, 12));
  await start();
  say({ event: 'result', outcome: 'switched', release: commit.slice(0, 12), ...(previous ? { previous } : {}), message: `${commit.slice(0, 12)} is running.` });
}

const json = args.includes('--json');
const ref = args.find((arg, index) => index > 0 && !arg.startsWith('--')) ?? 'HEAD';
if (args[0] === 'serve' && args.includes('--uninstall')) {
  await stop();
  fs.rmSync(marker, { force: true });
  console.log('Service removed. Your data and releases were retained.');
} else if (args[0] === 'serve' && args.includes('--install')) {
  await install(args.find((arg, index) => index > 0 && !arg.startsWith('--') && args[index - 1] === '--install') ?? 'HEAD', true);
} else if (args[0] === 'change') {
  await install(ref, false);
} else if (args[0] === 'status' && json) {
  const installed = fs.existsSync(marker);
  const running = installed && alive(pid());
  const port = readConfig().PORT;
  say({ app: 'tide-log', installed, state: !installed ? 'not_installed' : running ? 'running' : 'stopped', pid: running ? pid() : null,
    release: release(), answering: running ? release() : null, dataDir, address: port ? `http://127.0.0.1:${port}` : null });
} else if (args[0] === 'restart' && json) {
  await stop();
  await start();
  say({ event: 'result', outcome: 'restarted', message: 'Restarted.' });
} else {
  console.error(`This stand-in doesn't know: ${args.join(' ')}`);
  process.exit(64);
}

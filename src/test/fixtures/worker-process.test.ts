import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { spawnWorkerProcess, startWorkerProcess } from './worker-process';

/**
 * The worker fixture never outlives its test. A real worker retries an
 * unreachable home for as long as it runs, so a fixture whose test was gone
 * kept heartbeating, and a `ps -ax` with each beat, until someone found it.
 * Nothing listens on the discard port, so these homes never answer.
 */

const UNREACHABLE = { homeUrl: 'http://127.0.0.1:9', homeId: 'home-that-never-answers', workerKey: 'key' };

const roots: string[] = [];
const children: ChildProcess[] = [];

function root(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-worker-fixture-'));
  roots.push(dir);
  return dir;
}

function exited(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The worker was still running after ${timeoutMs} ms`)), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('stops once the test that started it lets go of its stdin', async () => {
  const dir = root();
  const child = spawnWorkerProcess({ ...UNREACHABLE, root: dir });
  children.push(child);
  let out = '';
  child.stdout!.on('data', (d) => (out += d.toString()));
  child.stderr!.on('data', (d) => (out += d.toString()));
  // It writes down its own processes once its loop has started.
  const record = path.join(dir, '.work', 'worker-processes.json');
  const deadline = Date.now() + 60_000;
  while (!fs.existsSync(record)) {
    if (child.exitCode !== null) throw new Error(`The worker exited before it started:\n${out}`);
    if (Date.now() > deadline) throw new Error(`The worker never started its loop:\n${out}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // Still going against a home that never answers, as a real worker would be.
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(child.exitCode).toBeNull();
  // What the system does to the pipe when the test process ends, however it ends.
  child.stdin!.end();
  expect(await exited(child, 15_000)).toEqual({ code: 0, signal: null });
}, 90_000);

it('kills a worker that never connects before saying so', async () => {
  const dir = root();
  await expect(startWorkerProcess({ ...UNREACHABLE, root: dir, connectTimeoutMs: 1_000 }))
    .rejects.toThrow(/didn't connect within 1000 ms, so it was stopped/);
}, 30_000);

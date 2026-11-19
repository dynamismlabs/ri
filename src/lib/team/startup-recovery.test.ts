/** Probe: real instrumentation register() with an unsafe runner recovery, in its own process. */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { teamTRPC } from '@/lib/spaces/remote';

/** Resolves with how the child exited, once it has. */
function exited(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function boot(root: string, mode: 'team' | 'personal', plant: string, extra = '') {
  const repo = process.cwd();
  const osHome = path.join(root, 'os-home'); fs.mkdirSync(osHome, { recursive: true });
  // stdin is a pipe the fixture stops on when it closes, so the Home never
  // outlives this test process however it ends (unavailable-boot.ts).
  const child: ChildProcess = spawn(path.join(repo, 'node_modules/.bin/tsx'), [path.join(repo, 'src/test/fixtures/unavailable-boot.ts'), root, mode, plant, extra], {
    cwd: repo, env: { ...process.env, HOME: osHome, USERPROFILE: osHome, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin?.on('error', () => {});
  // The tsx wrapper passes SIGTERM on to the Home. Closing stdin reaches the
  // Home itself even if the wrapper is killed first.
  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    const done = exited(child);
    child.stdin?.end();
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    return done.then(() => {});
  };
  let output = '';
  const ready = await new Promise<{ url: string; token: string; problem: string | null; registerMs: number; chatId: string | null; turnId: string | null }>((resolve, reject) => {
    let timedOut = false;
    // A Home that hasn't booted in time is still starting: stop it before saying so.
    const timer = setTimeout(() => { timedOut = true; void stop(); }, 90_000);
    child.stdout?.on('data', (d: Buffer) => { output += String(d); const line = output.split('\n').find(l => l.startsWith('{')); if (line) { clearTimeout(timer); resolve(JSON.parse(line)); } });
    child.stderr?.on('data', (d: Buffer) => { output += String(d); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(timedOut ? `no boot within 90 s, so it was stopped:\n${output}` : `exited ${code}:\n${output}`)); });
  });
  return { ...ready, child, output: () => output, stop };
}

it.each(['corrupt', 'none'] as const)('a Team turn left running by a crash, booting with plant=%s', async plant => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ri-probe-boot-turn-`));
  let server: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    server = await boot(root, 'team', plant, 'running-turn');
    const client = teamTRPC(server.url, server.token);
    await new Promise(resolve => setTimeout(resolve, 500));
    const status = await client.sessions.runtimeStatusGet.query({ params: { id: server.chatId! } });
    const chats = await client.team.ai.chats.list.query();
    expect(status.running).toBe(false);
    expect(status.activeTurnId).toBeNull();
    expect(status.teamTurns?.find(turn => turn.id === server!.turnId)?.status).toBe('interrupted');
    expect(chats.find(chat => chat.id === server!.chatId)?.working).toBe(false);
    expect(Boolean(server.problem)).toBe(plant === 'corrupt');
    const created = await client.tasks.create.mutate({ title: 'Content still works', rawInput: 'Content still works' });
    expect((await client.tasks.get.query({ id: created.id })).title).toBe('Content still works');
  } finally { await server?.stop(); fs.rmSync(root, { recursive: true, force: true }); }
}, 180_000);

it('stops the Home once the test that started it lets go of its stdin', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ri-probe-boot-orphan-`));
  let server: Awaited<ReturnType<typeof boot>> | undefined;
  try {
    server = await boot(root, 'personal', 'none');
    expect((await fetch(`${server.url}/api/health`)).ok).toBe(true);
    // What the system does to the pipe when the test process ends, however it ends.
    server.child.stdin!.end();
    const exit = await Promise.race([
      exited(server.child),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`The Home was still running 15 s after its stdin closed:\n${server!.output()}`)), 15_000)),
    ]);
    expect(exit).toEqual({ code: 0, signal: null });
  } finally { await server?.stop(); fs.rmSync(root, { recursive: true, force: true }); }
}, 180_000);

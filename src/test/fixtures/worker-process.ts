/**
 * A connected device's worker, in a process of its own, for tests
 * (docs/homes-build.md, P2.4). It runs the real worker loop with the real
 * execution handlers and the real local runner, reporting to its own
 * journals, against a home over HTTP. The harness is the fake one, scripted
 * by the message it gets:
 *
 * - a message containing `ASK` asks for permission to run a command, and
 *   says whether it was allowed;
 * - one containing `LONG` works until interrupted;
 * - one containing `SERVERS` replies with the MCP servers its session was
 *   given, as JSON;
 * - one containing `INSTRUCTIONS` replies with its session instructions;
 * - one containing `SESSION_CONFIG` replies with its saved model/speed and native identity;
 * - one containing `SLOW` works for a second and a half, then replies
 *   `slow done`;
 * - anything else replies `ok: <message>`.
 *
 * Usage: `tsx src/test/fixtures/worker-process.ts <homeUrl> <homeId> <workerKey> <root>`.
 * `startWorkerProcess` in the test does this and waits for it to connect.
 *
 * It lives only as long as the test that started it. A real worker keeps
 * retrying an unreachable home for as long as it runs, and so does this one,
 * heartbeating every 300 ms with a `ps -ax` each time. So the test holds a pipe
 * to its stdin, and when that closes the worker stops. The pipe closes however
 * the test process ends, a timeout or a SIGKILL included, where an `afterEach`
 * never runs. Before this, interrupted runs left over a hundred of them going
 * on one Mac for hours, loading it until most other tests timed out.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/** How long a worker whose test has gone gets to stop on its own before it exits anyway. */
const ORPHAN_GRACE_MS = 3_000;

async function main(): Promise<void> {
  const [homeUrl, homeId, workerKey, root] = process.argv.slice(2);
  if (!homeUrl || !homeId || !workerKey || !root) throw new Error('usage: worker-process <homeUrl> <homeId> <workerKey> <root>');
  const controller = new AbortController();
  process.on('SIGTERM', () => controller.abort());
  process.on('SIGINT', () => controller.abort());
  // The test's end of stdin closed: it's gone, and its home with it. Stop as
  // Ctrl-C would, and exit regardless once the grace is up, since telling a
  // home that's gone can only wait.
  process.stdin.on('end', () => {
    controller.abort();
    setTimeout(() => process.exit(0), ORPHAN_GRACE_MS).unref();
  });
  process.stdin.on('error', () => {});
  process.stdin.resume();
  process.env.RI_ROOT = root;
  process.env.RI_CONFIG_DIR = path.join(root, '.config');
  process.env.RI_WORK_DIR = path.join(root, '.work');
  process.env.RI_DB_PATH = path.join(root, 'no-database-here.db');

  const { installFakeHarness, FAKE_MODEL_ID } = await import('./fake-harness');
  const fake = installFakeHarness('claude');
  fake.onTurn(async (turn) => {
    if (turn.message.includes('ASK')) {
      const answer = await turn.ask({ toolName: 'Bash', input: { command: 'ls' } });
      await turn.say(answer.allow ? 'allowed' : 'denied');
      return;
    }
    if (turn.message.includes('SLOW')) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (!turn.message.includes('SESSION_CONFIG')) {
        await turn.say('slow done');
        return;
      }
    }
    if (turn.message.includes('INSTRUCTIONS')) {
      const file = turn.session.ctx.config?.instructionsFile;
      await turn.say(file ? (await import('node:fs')).readFileSync(file, 'utf8') : '(none)');
      return;
    }
    if (turn.message.includes('SERVERS')) {
      await turn.say(JSON.stringify(turn.session.ctx.config?.mcpServers ?? []));
      return;
    }
    if (turn.message.includes('SESSION_CONFIG')) {
      await turn.say(JSON.stringify({
        serviceTier: turn.session.ctx.config?.serviceTier ?? null,
        model: turn.session.ctx.config?.model ?? null,
        nativeSessionId: turn.session.sessionId,
        sessionsStarted: fake.sessions.length,
      }));
      return;
    }
    if (turn.message.includes('LONG')) {
      await new Promise((_, reject) => turn.signal.addEventListener('abort', () => reject(turn.signal.reason)));
      return;
    }
    await turn.say(`ok: ${turn.message}`);
  });

  const { installRunnerSink } = await import('@/lib/runner/sink');
  const { executionHandlers, executionRequests } = await import('@/lib/worker/handlers');
  const { runWorker } = await import('@/lib/worker/run');

  const capability = { supported: true, status: 'supported' };
  const exit = await runWorker({
    target: { homeUrl, homeId, homeName: 'Test home', deviceName: 'Laptop', workerKey },
    version: 'test',
    signal: controller.signal,
    onSink: installRunnerSink,
    handlers: (journal, extras) => executionHandlers({ journal, ...extras }),
    requests: (journal) => executionRequests({ journal, homeId }),
    describe: async () => [
      {
        harness: 'claude',
        binary: { status: 'supported', version: FAKE_MODEL_ID },
        capabilities: {
          sessions: capability,
          concurrentSend: capability,
          strictMcpIsolation: capability,
          permissionRequests: capability,
          questionRequests: capability,
          planMode: capability,
          serviceTiers: capability,
        },
      },
    ],
    onStatus: (status) => {
      if (status.state === 'connected') process.stdout.write('WORKER_CONNECTED\n');
    },
    heartbeatMs: 300,
    backoffMinMs: 50,
    backoffMaxMs: 200,
    postRetryMs: 100,
  });
  // As the real worker does as it stops.
  const { finishWorker } = await import('@/lib/worker/run');
  await finishWorker({ homeUrl, homeId, homeName: 'Test home', deviceName: 'Laptop', workerKey }, 'test', exit);
  process.stdout.write(`WORKER_EXIT ${JSON.stringify(exit)}\n`);
  process.exit(0);
}

export interface WorkerProcess {
  child: ChildProcess;
  output: () => string;
  /** Stop it as Ctrl-C does: it closes its sessions and tells the home. */
  stop(): Promise<void>;
  /** Kill it outright, as a crash does: nothing runs on the way out. */
  kill(): Promise<void>;
}

interface WorkerProcessArgs {
  homeUrl: string;
  homeId: string;
  workerKey: string;
  root: string;
  /** Environment for that device, such as where its harnesses keep their history. */
  env?: Record<string, string>;
}

/**
 * Start a worker process without waiting for it. Its stdin is a pipe held by
 * this process, which it stops on when it closes (see the top of this file).
 */
export function spawnWorkerProcess(args: WorkerProcessArgs): ChildProcess {
  const repo = path.resolve(__dirname, '../../..');
  // Node itself, with tsx's loader, rather than the tsx wrapper: the wrapper
  // runs the script as a child of its own, so a SIGKILL meant as a crash
  // would kill only the wrapper and leave the worker running.
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(repo, 'src/test/fixtures/worker-process.ts'), args.homeUrl, args.homeId, args.workerKey, args.root], {
    cwd: repo,
    // The device's own gh, signed in with a placeholder rather than as whoever runs the tests, so gh
    // answers the same on every computer. Test repositories are never on GitHub, so gh needs no network
    // to say so ("none of the git remotes ... point to a known GitHub host"), where with no sign-in at
    // all it would only ask for one.
    env: { ...process.env, NODE_OPTIONS: '', GH_CONFIG_DIR: path.join(args.root, '.config', 'gh'), GH_TOKEN: 'placeholder-for-tests', ...args.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Nothing is ever written to it. A worker that already exited only makes it EPIPE.
  child.stdin!.on('error', () => {});
  return child;
}

/**
 * Start a worker process and wait until it has connected to the home. One
 * that doesn't connect in time is killed before this rejects, so a slow start
 * never leaves a worker retrying after its test.
 */
export async function startWorkerProcess(args: WorkerProcessArgs & { connectTimeoutMs?: number }): Promise<WorkerProcess> {
  const connectTimeoutMs = args.connectTimeoutMs ?? 30_000;
  const child = spawnWorkerProcess(args);
  let out = '';
  child.stdout!.on('data', (d) => (out += d.toString()));
  child.stderr!.on('data', (d) => (out += d.toString()));
  await new Promise<void>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, connectTimeoutMs);
    const check = () => {
      if (out.includes('WORKER_CONNECTED')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout!.on('data', check);
    // Rejects only once it has exited, so a caller never holds a failed start that's still running.
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(timedOut
        ? `The worker process didn't connect within ${connectTimeoutMs} ms, so it was stopped:\n${out}`
        : `The worker process exited (${code ?? signal}):\n${out}`));
    });
  });
  return {
    child,
    output: () => out,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
      }),
    kill: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGKILL');
      }),
  };
}

if (process.argv[1] && process.argv[1].endsWith('worker-process.ts')) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}

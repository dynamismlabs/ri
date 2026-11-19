/**
 * Pids a test's child processes write to files. `writeFileSync` creates the
 * file before it writes, so a reader that sees the file can still find it
 * empty, and `Number('')` is 0. Signalling pid 0, or -0, reaches every process
 * in the test's own process group: vitest and the pnpm that started it. A
 * cleanup that did that killed `pnpm test` mid-run on CI with no failure to
 * show (src/test/setup-env.ts now refuses it as well).
 */
import fs from 'node:fs';

/** The pid in `file` once it is complete, or undefined. */
export function pidIn(file: string): number | undefined {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
  } catch { return undefined; }
}

/** Every complete pid in a file with one per line. */
export function pidsIn(file: string): number[] {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').map(line => Number(line.trim())).filter(pid => Number.isSafeInteger(pid) && pid > 0);
  } catch { return []; }
}

/** Waits for a child to write its pid to `file`. */
export async function waitForPid(file: string, timeout = 10_000): Promise<number> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const pid = pidIn(file);
    if (pid) return pid;
    if (Date.now() > deadline) throw new Error(`No pid was written to ${file} within ${timeout} ms`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

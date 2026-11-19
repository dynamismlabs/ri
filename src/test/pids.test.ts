import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { pidIn, pidsIn, waitForPid } from './pids';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-test-pids-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

it('reads no pid from a file a child has created but not written yet', () => {
  const file = path.join(dir, 'child.pid');
  fs.writeFileSync(file, '');
  expect(pidIn(file)).toBeUndefined();
  expect(pidsIn(file)).toEqual([]);
  expect(pidIn(path.join(dir, 'missing.pid'))).toBeUndefined();
  fs.writeFileSync(file, '4242\n\n0\n4243\n');
  expect(pidsIn(file)).toEqual([4242, 4243]);
});

it('waits for the pid itself, not only the file', async () => {
  const file = path.join(dir, 'child.pid');
  fs.writeFileSync(file, '');
  setTimeout(() => fs.writeFileSync(file, '4242'), 50);
  expect(await waitForPid(file)).toBe(4242);
});

it("refuses to signal the test's own process group", () => {
  expect(() => process.kill(0, 'SIGKILL')).toThrow('holds the test runner itself');
  expect(() => process.kill(-0, 'SIGKILL')).toThrow('holds the test runner itself');
  expect(() => process.kill(-process.pid, 'SIGKILL')).toThrow('holds the test runner itself');
  expect(process.kill(process.pid, 0)).toBe(true);
});

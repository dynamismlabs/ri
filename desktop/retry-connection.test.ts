import { expect, it, vi } from 'vitest';
import { prepareRetry } from './retry-connection';
import type { ServiceStatus } from '../src/lib/service/client';

const timedOut = () => Object.assign(new Error('Service control request timed out'), { code: 'ETIMEDOUT' });
const waiting = { phase: 'restarting', error: 'Invalid local service endpoint configuration', restarts: { count: 3, last: { at: '', reason: '' }, crashLoop: false, nextAttemptAt: new Date().toISOString() } } as unknown as ServiceStatus;

it('connects again when the controller is too busy starting the Home to answer', async () => {
  // A Home's first database work held CI's Intel Mac controller past the 3 s probe.
  // Retry gave up there, and the window stayed blank after the Home came up.
  const restart = vi.fn();
  await expect(prepareRetry({ status: () => Promise.reject(timedOut()), restart })).resolves.toBeUndefined();
  expect(restart).not.toHaveBeenCalled();
});

it('asks a Home waiting for its next try to try now, and connects even if that answer is late', async () => {
  const restart = vi.fn(() => Promise.resolve({}));
  await prepareRetry({ status: async () => waiting, restart });
  expect(restart).toHaveBeenCalledOnce();
  await expect(prepareRetry({ status: async () => waiting, restart: () => Promise.reject(timedOut()) })).resolves.toBeUndefined();
});

it('leaves a running or absent service to the connection, and stops only where Retry cannot help', async () => {
  const restart = vi.fn();
  await prepareRetry({ status: async () => ({ phase: 'running' }) as ServiceStatus, restart });
  await prepareRetry({ status: async () => null, restart });
  expect(restart).not.toHaveBeenCalled();
  await expect(prepareRetry({ status: async () => ({ phase: 'failed' }) as ServiceStatus, restart })).rejects.toThrow('needs recovery');
  // Anything but a slow answer is still an error the person sees.
  const mismatch = new Error('Service identity or control protocol does not match this installation');
  await expect(prepareRetry({ status: () => Promise.reject(mismatch), restart })).rejects.toBe(mismatch);
  await expect(prepareRetry({ status: async () => waiting, restart: () => Promise.reject(new Error('This computer runs no Home to restart.')) })).rejects.toThrow('no Home');
});

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { servicePaths } from './paths';
import { awaitingRetry, serviceRequest, serviceStatus, ensureServiceStatus, ensureService, type ServiceStatus } from './client';

let directory: string;
let server: http.Server | undefined;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-control-client-'));
  vi.stubEnv('RI_ROOT', directory);
  for (const key of ['RI_DB_PATH', 'RI_CONFIG_DIR', 'RI_WORK_DIR']) vi.stubEnv(key, '');
});
afterEach(async () => {
  if (server?.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  server = undefined; vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true });
});
async function listen(handler: http.RequestListener) {
  server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(servicePaths().socket, resolve); });
}
it('retries a controller socket reset once using a fresh verified connection', async () => {
  let attempts = 0;
  await listen((request, response) => {
    if (++attempts === 1) { request.socket.destroy(); return; }
    response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, phase: 'running' }));
  });
  expect((await serviceStatus())?.phase).toBe('running');
  expect(attempts).toBe(2);
});
it('never pools a control connection across service replacement', async () => {
  const sockets = new Set();
  await listen((request, response) => { sockets.add(request.socket); response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, phase: 'running' })); });
  await serviceRequest('/status'); await serviceRequest('/status');
  expect(sockets.size).toBe(2);
});
it('does not mask an identity mismatch as a stopped or replaceable service', async () => {
  let requests = 0;
  await listen((_request, response) => { requests++; response.end(JSON.stringify({ protocol: 1, identity: { ...servicePaths().identity, root: '/other' } })); });
  await expect(serviceStatus()).rejects.toThrow('identity'); expect(requests).toBe(1);
});
it('reports an absent endpoint as stopped', async () => { expect(await serviceStatus()).toBeNull(); });

it('attaches a worker status without requesting local Home credentials', async () => {
  const routes: string[] = [];
  await listen((request, response) => { routes.push(request.url!); response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, phase: 'running', role: 'worker', home: { url: 'https://home.example', name: 'Home' } })); });
  expect((await ensureServiceStatus({ repo: '/repo', node: '/node' })).role).toBe('worker');
  expect(routes).not.toContain('/session');
  await expect(ensureService({ repo: '/repo', node: '/node' })).rejects.toThrow('Ri on another computer');
  expect(routes).not.toContain('/session');
});
it('returns a first-run status for setup without inventing a local session', async () => {
  await listen((_request, response) => response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, phase: 'running', role: 'first-run' })));
  expect((await ensureServiceStatus({ repo: '/repo', node: '/node' })).origin).toBeUndefined();
  await expect(ensureService({ repo: '/repo', node: '/node' })).rejects.toThrow('Choose how');
});
it('keeps waiting for the same starting controller after a short status probe times out', async () => {
  let attempts = 0;
  await listen((_request, response) => {
    attempts++;
    if (attempts === 2) return;
    response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, phase: attempts === 1 ? 'starting' : 'running' }));
  });
  expect((await ensureServiceStatus({ repo: '/repo', node: '/node', timeoutMs: 5_000 })).phase).toBe('running');
  expect(attempts).toBe(3);
  expect(server?.listening).toBe(true);
}, 10_000);

// A first start that failed: the controller waits for its next try, and never gives up (docs/always-on-spec.md 6.2).
const retrying = { phase: 'restarting', error: 'Invalid local service endpoint configuration',
  restarts: { count: 2, crashLoop: false, last: { at: '2026-11-17T12:00:00Z', reason: 'Invalid local service endpoint configuration' }, nextAttemptAt: '2026-11-17T12:00:05Z' } };
it('knows a Home waiting for its next try from one restarting right now', () => {
  expect(awaitingRetry(retrying as ServiceStatus)).toBe(true);
  // Mid-try the controller clears the error, and a planned restart has no next try.
  expect(awaitingRetry({ ...retrying, phase: 'starting', error: undefined } as ServiceStatus)).toBe(false);
  expect(awaitingRetry({ ...retrying, restarts: { ...retrying.restarts, nextAttemptAt: undefined } } as ServiceStatus)).toBe(false);
  expect(awaitingRetry({ ...retrying, phase: 'failed' } as ServiceStatus)).toBe(false);
  expect(awaitingRetry(null)).toBe(false);
});
it('hands a caller that asks the Home waiting for its next try, and otherwise waits with the reason', async () => {
  let attempts = 0;
  await listen((_request, response) => { attempts++; response.end(JSON.stringify({ protocol: 1, identity: servicePaths().identity, ...(attempts === 1 ? { phase: 'starting' } : retrying) })); });
  expect(await ensureServiceStatus({ repo: '/repo', node: '/node', timeoutMs: 5_000, untilRetrying: true })).toMatchObject({ phase: 'restarting', error: retrying.error });
  expect(attempts).toBe(2);
  await expect(ensureServiceStatus({ repo: '/repo', node: '/node', timeoutMs: 600 }))
    .rejects.toThrow('The service did not start: Invalid local service endpoint configuration. It keeps trying by itself.');
}, 10_000);

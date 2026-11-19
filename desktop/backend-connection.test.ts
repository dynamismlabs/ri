import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BackendMessage } from './config';

const f = vi.hoisted(() => ({
  setup: vi.fn(), status: vi.fn(), session: vi.fn(), send: vi.fn(), on: vi.fn(), once: vi.fn(), ensure: vi.fn(), stage: vi.fn(),
  attach: vi.fn(),
  owner: { phase: 'running', role: 'viewer', runId: 'same-run' },
}));
vi.mock('./config', () => ({ demoEnvironment: () => ({}), bundledCliCommand: vi.fn() }));
vi.mock('../src/lib/service/client', async original => ({ ...await original<typeof import('../src/lib/service/client')>(), serviceStatus: f.status, serviceRequest: f.session, ensureServiceStatus: f.ensure }));
vi.mock('./connection-setup', () => ({ connectionSetup: f.setup }));
vi.mock('./backend-selection', () => ({ attachExistingOwner: f.attach, runtimeForOwner: () => undefined }));
vi.mock('../src/lib/service/runtime', () => ({ installedRuntime: () => null }));
vi.mock('../src/lib/service/initialization', () => ({ stageFirstDesktopRuntime: f.stage }));

const viewer = { homeUrl: 'https://home.example', homeId: 'home', homeName: 'My Ri', deviceId: 'device', signInKey: 'test-sign-in' };
const messages = (type: BackendMessage['type']) => f.send.mock.calls.map(([message]) => message as BackendMessage).filter(message => message.type === type);
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  f.owner.role = 'viewer';
  f.attach.mockImplementation(async () => f.owner);
  // The IPC channel takes each message at once, and says so to a sender that waits.
  f.send.mockImplementation((_message: unknown, done?: unknown) => { if (typeof done === 'function') done(null); return true; });
  f.status.mockResolvedValue(f.owner);
  f.session.mockResolvedValue({ runId: 'same-run', origin: 'https://localhost:4224', certificate: 'cert', token: 'local', desktopClient: 'test-client' });
  f.setup.mockImplementation(async ({ action }) => action === 'inspect' ? { role: f.owner.role } : viewer);
  vi.stubGlobal('process', { ...process, env: { ...process.env, RI_DESKTOP_REPO: '/tmp/ri-backend-test' },
    connected: true, send: f.send, on: f.on, once: f.once });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reports typed remote failures and announces recovery even when the Home session is unchanged', async () => {
  await import('./backend'); await flush();
  expect(messages('ready')).toHaveLength(1);
  f.setup.mockImplementation(async ({ action }) => {
    if (action === 'session') throw Object.assign(new Error('Device access removed.'), { problem: 'unauthorized' });
    return { role: 'viewer' };
  });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(messages('error')).toEqual([expect.objectContaining({ issue: expect.objectContaining({ kind: 'sign_in', detail: 'Device access removed.' }) })]);
  f.setup.mockResolvedValue(viewer);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(messages('ready')).toHaveLength(2);
});

it('recovers a local session probe failure without requiring a controller restart', async () => {
  f.owner.role = 'home';
  await import('./backend'); await flush();
  expect(messages('ready')).toHaveLength(1);
  f.session.mockRejectedValueOnce(new Error('Temporary local service failure.'));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(messages('error')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(messages('ready')).toHaveLength(2);
});

it('retries a failed renderer sign-in even when the helper connection itself stayed healthy', async () => {
  await import('./backend'); await flush();
  expect(messages('ready')).toHaveLength(1);
  f.on.mock.calls.find(([event]) => event === 'message')![1]({ type: 'retry-session' });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(messages('ready')).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(messages('ready')).toHaveLength(2);
});

const retrying = { ...f.owner, phase: 'restarting', role: 'home', error: 'Invalid local service endpoint configuration',
  restarts: { count: 2, crashLoop: false, last: { at: '2026-11-17T12:00:00Z', reason: 'Invalid local service endpoint configuration' }, nextAttemptAt: '2026-11-17T12:00:05Z' } };

it('says why a local Home is waiting to retry its start, once, and connects when it comes up by itself', async () => {
  f.owner.role = 'home';
  f.attach.mockImplementation(async ({ retrying: hand }: { retrying: (owner: unknown) => unknown }) => hand(retrying));
  f.status.mockResolvedValue(retrying);
  await import('./backend'); await flush();
  expect(messages('error')).toEqual([expect.objectContaining({ message: retrying.error,
    issue: { kind: 'attention', message: 'Ri couldn’t start. It keeps trying by itself.', detail: retrying.error, retryable: true } })]);
  expect(messages('ready')).toHaveLength(0);
  // Each try clears the error for a moment, then sets the same one again: no repeat.
  f.status.mockResolvedValueOnce({ ...retrying, phase: 'starting', error: undefined }).mockResolvedValue(retrying);
  await vi.advanceTimersByTimeAsync(6_000);
  expect(messages('error')).toHaveLength(1);
  f.status.mockResolvedValue({ ...f.owner, phase: 'running' });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(messages('ready')).toHaveLength(1);
});

it('announces staging the bundled release, so the app times it on its own limit, and starts without waiting out retries', async () => {
  f.owner.role = 'home';
  process.env.RI_DESKTOP_RESOURCES = '/bundled/resources';
  f.status.mockResolvedValueOnce(null).mockResolvedValue(f.owner);
  f.ensure.mockResolvedValue(f.owner);
  const seenBeforeStaging: string[] = [];
  f.stage.mockImplementation(() => { seenBeforeStaging.push(...f.send.mock.calls.map(([message]) => (message as BackendMessage).type)); return undefined; });
  await import('./backend'); await flush();
  expect(f.stage).toHaveBeenCalledWith('/bundled/resources');
  expect(seenBeforeStaging).toEqual(['preparing']);
  expect(messages('prepared')).toHaveLength(1);
  expect(f.ensure).toHaveBeenCalledWith(expect.objectContaining({ untilRetrying: true }));
  expect(messages('ready')).toHaveLength(1);
});

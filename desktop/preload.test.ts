import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ expose: vi.fn(), on: vi.fn(), remove: vi.fn(), send: vi.fn(), invoke: vi.fn(), sendSync: vi.fn(() => 'local') }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: mocks.expose }, ipcRenderer: { on: mocks.on, removeListener: mocks.remove, send: mocks.send, invoke: mocks.invoke, sendSync: mocks.sendSync } }));
afterEach(() => vi.unstubAllGlobals());

it('passes no IPC event or sender to renderer resume callbacks and removes its exact listener', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1] as { onResume(callback: () => void): () => void };
  const callback = vi.fn();
  const remove = bridge.onResume(callback);
  const listener = mocks.on.mock.calls[0][1];
  listener({ sender: { invoke: vi.fn() } }, 'unexpected payload');
  expect(callback).toHaveBeenCalledExactlyOnceWith();
  remove();
  expect(mocks.remove).toHaveBeenCalledWith('desktop:resume', listener);
});

it('background readiness exposes only a boolean response and removes its exact listener', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1] as { onPrepareBackground(callback: () => boolean): () => void };
  const callback = vi.fn(() => true);
  const remove = bridge.onPrepareBackground(callback);
  const listener = mocks.on.mock.calls.find(call => call[0] === 'desktop:prepare-background')![1];
  listener({ sender: { invoke: vi.fn() } }, 'background-nonce');
  expect(callback).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.send).toHaveBeenLastCalledWith('desktop:background-ready', { nonce: 'background-nonce', ok: true });
  callback.mockReturnValue(false); listener({}, 'blocked');
  expect(mocks.send).toHaveBeenLastCalledWith('desktop:background-ready', { nonce: 'blocked', ok: false });
  callback.mockImplementation(() => { throw new Error('Unready'); }); listener({}, 'error');
  expect(mocks.send).toHaveBeenLastCalledWith('desktop:background-ready', { nonce: 'error', ok: false });
  remove(); expect(mocks.remove).toHaveBeenLastCalledWith('desktop:prepare-background', listener);
});

it('capture registers its listener before announcing readiness and never exposes the native event', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1] as { onQuickCapture(callback: () => void): () => void };
  const callback = vi.fn(); const remove = bridge.onQuickCapture(callback);
  const index = mocks.on.mock.calls.findIndex(call => call[0] === 'desktop:quick-capture');
  const listener = mocks.on.mock.calls[index][1];
  const ready = mocks.send.mock.calls.findIndex(call => call[0] === 'desktop:capture-ready');
  expect(mocks.on.mock.invocationCallOrder[index]).toBeLessThan(mocks.send.mock.invocationCallOrder[ready]);
  listener({ sender: { invoke: vi.fn() } }, 'untrusted payload');
  expect(callback).toHaveBeenCalledExactlyOnceWith();
  remove(); expect(mocks.remove).toHaveBeenLastCalledWith('desktop:quick-capture', listener);
});


it('remote Home viewers get save/capture hooks and may ask for notifications, without native settings', async () => {
  vi.resetModules(); mocks.expose.mockClear(); mocks.sendSync.mockReturnValue('viewer');
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1];
  expect(bridge.settings).toBeUndefined();
  expect(bridge.notificationStatus).toBeTypeOf('function');
  await bridge.notificationStatus('enable');
  expect(mocks.invoke).toHaveBeenLastCalledWith('desktop:notifications', 'status');
  // The request crosses as-is. The main process asks the person before anything turns on.
  await bridge.notifications('enable');
  expect(mocks.invoke).toHaveBeenLastCalledWith('desktop:notifications', 'enable');
  await bridge.openNotificationSettings();
  expect(mocks.invoke).toHaveBeenLastCalledWith('desktop:notification-settings');
  expect(bridge.onPrepareClose).toBeTypeOf('function');
  expect(bridge.onQuickCapture).toBeTypeOf('function');
  expect(bridge.connection).toBeTypeOf('function');
  expect(bridge.onConnectionChange).toBeTypeOf('function');
  await bridge.deviceSettings({ type: 'status' });
  expect(mocks.invoke).toHaveBeenLastCalledWith('desktop:device-settings', { type: 'status' });
  mocks.sendSync.mockReturnValue('local');
});

it('answers a close check with ok only for true, and passes on what the page says is unsaved', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1] as { onPrepareClose(callback: () => Promise<boolean | string>): () => void };
  const callback = vi.fn<() => Promise<boolean | string>>(async () => true);
  const remove = bridge.onPrepareClose(callback);
  const listener = mocks.on.mock.calls.find(call => call[0] === 'desktop:prepare-close')![1];
  const answer = async (nonce: string) => { listener({ sender: { invoke: vi.fn() } }, nonce); await vi.waitFor(() => expect(mocks.send).toHaveBeenLastCalledWith('desktop:prepared', expect.objectContaining({ nonce }))); return mocks.send.mock.lastCall![1]; };
  expect(await answer('clean')).toEqual({ nonce: 'clean', ok: true });
  callback.mockResolvedValue('request');
  expect(await answer('typing')).toEqual({ nonce: 'typing', ok: false, waitingFor: 'request' });
  // A page from before it could name anything.
  callback.mockResolvedValue(false);
  expect(await answer('older')).toEqual({ nonce: 'older', ok: false });
  callback.mockRejectedValue(new Error('broken page'));
  expect(await answer('broken')).toEqual({ nonce: 'broken', ok: false });
  remove();
  expect(mocks.remove).toHaveBeenLastCalledWith('desktop:prepare-close', listener);
});

it('opens the in-app settings tab from the native menu without exposing the IPC event', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1];
  const callback = vi.fn();
  const off = bridge.onOpenSettings(callback);
  const listener = mocks.on.mock.calls.find(call => call[0] === 'desktop:open-settings')![1];
  expect(mocks.send).toHaveBeenLastCalledWith('desktop:settings-ready');
  listener({ sender: { invoke: vi.fn() } }, 'ignored');
  expect(callback).toHaveBeenCalledExactlyOnceWith();
  off();
  expect(mocks.remove).toHaveBeenLastCalledWith('desktop:open-settings', listener);
  expect(mocks.send).toHaveBeenLastCalledWith('desktop:settings-closed');
});

it('connection updates expose only presentation data and remove their exact listener', async () => {
  vi.stubGlobal('process', { ...process, isMainFrame: true });
  await import('./preload');
  const bridge = mocks.expose.mock.calls[0][1];
  const callback = vi.fn();
  const off = bridge.onConnectionChange(callback);
  const listener = mocks.on.mock.calls.find(call => call[0] === 'desktop:connection')![1];
  const state = { phase: 'failed', issue: null, showNotice: false };
  listener({ sender: { invoke: vi.fn() } }, state);
  expect(callback).toHaveBeenCalledExactlyOnceWith(state);
  off();
  expect(mocks.remove).toHaveBeenLastCalledWith('desktop:connection', listener);
});

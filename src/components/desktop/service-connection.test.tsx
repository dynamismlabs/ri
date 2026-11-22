import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeSettings, useSettingsStore } from '@/components/settings/settings-store';
import { ServiceConnection } from './service-connection';

const mocks = vi.hoisted(() => ({ version: vi.fn(), status: vi.fn(), update: vi.fn(), touch: vi.fn(), save: vi.fn(), reload: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ api: { get: mocks.version } }));
vi.mock('@/lib/trpc/client', () => ({ trpcClient: { service: {
  list: { query: mocks.status }, updatePost: { mutate: mocks.update }, touchPost: { mutate: mocks.touch },
} } }));
vi.mock('@/lib/client/document-saves', () => ({ documentSaves: { flushAll: mocks.save } }));
vi.mock('@/lib/client/version-reload', () => ({ reloadVersion: mocks.reload }));

let root: Root;
let container: HTMLElement;
let client: QueryClient;
const waiting = () => ({ phase: 'running', canUseUpdates: true, update: {
  phase: 'waiting', automatic: true, release: { version: '0.2.0', notes: 'Faster chats and clearer updates.' },
} });

beforeEach(() => {
  vi.clearAllMocks();
  closeSettings();
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Event', window.Event);
  mocks.version.mockResolvedValue({ release: { build: 'old-build' }, apiProtocols: [1, 2] });
  mocks.status.mockResolvedValue(waiting());
  mocks.update.mockResolvedValue({}); mocks.touch.mockResolvedValue({}); mocks.save.mockResolvedValue(undefined);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.unstubAllGlobals(); });

function Fixture() {
  const settings = useSettingsStore();
  return createElement('main', null, createElement(ServiceConnection), createElement('output', null, settings.open ? settings.section : 'closed'));
}
async function mount() {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fixture))));
}
function button(text: string) { return [...container.querySelectorAll('button')].find(element => element.textContent === text)!; }

it('shows the version, notes and actions as soon as a downloaded update is waiting', async () => {
  await mount();
  expect(container.textContent).toContain('Ri 0.2.0 is ready to update');
  expect(container.textContent).toContain('Faster chats and clearer updates.');
  expect(container.textContent).toContain('after a minute of inactivity');
  expect(container.textContent).not.toContain('will update in');
  expect(button('View update')).toBeDefined();
  expect(button('Not now')).toBeDefined();
  expect(button('Update now')).toBeDefined();
});

it('opens update details and keeps the ready card out of the way while reading them', async () => {
  await mount();
  await act(async () => button('View update').click());
  expect(container.querySelector('output')?.textContent).toBe('updates');
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it('postpones the update and hides its card', async () => {
  await mount();
  await act(async () => button('Not now').click());
  expect(mocks.update).toHaveBeenCalledWith({ body: { action: 'later' } });
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it('saves drafts before asking to update, without forcing running chats to end', async () => {
  await mount();
  await act(async () => button('Update now').click());
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith({ body: { action: 'apply' } });
  expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
});

it('hides the card during a hold and for people who cannot manage updates', async () => {
  mocks.status.mockResolvedValue({ ...waiting(), canUseUpdates: false });
  await mount();
  expect(container.querySelector('[role="status"]')).toBeNull();
  mocks.status.mockResolvedValue({ ...waiting(), update: { ...waiting().update, heldUntil: new Date(Date.now() + 60_000).toISOString() } });
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it('offers a safe refresh and update details after the serving build changes', async () => {
  await mount();
  mocks.version.mockResolvedValue({ release: { build: 'new-build' }, apiProtocols: [1, 2] });
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(container.textContent).toContain('Ri was updated');
  expect(container.textContent).toContain('Your drafts will be saved before reloading');
  expect(button('View update')).toBeDefined();
  await act(async () => button('Refresh').click());
  expect(mocks.reload).toHaveBeenCalledWith(expect.any(Function), true);
});

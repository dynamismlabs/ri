/** An app's builder offers the shared model menu and opens the chosen harness in the same app. */
import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HarnessChatSession } from '@/components/chat/harness-chat';

const h = vi.hoisted(() => ({
  props: null as ComponentProps<typeof HarnessChatSession> | null,
  create: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/components/chat/harness-chat', () => ({
  HarnessChatSession: (props: NonNullable<typeof h.props>) => { h.props = props; return null; },
}));
vi.mock('./new-app-dialog', () => ({ ensureAppBuilderChat: async () => ({ id: 'opencode-chat' }) }));
vi.mock('./app-catalog', () => ({ useCatalogApp: () => null, useCatalogUpdate: () => ({}) }));
vi.mock('./app-status', () => ({ AppStatusLine: () => null }));
vi.mock('./app-progress', () => ({ AppProgress: () => null }));
vi.mock('./allow-app', () => ({ useAllowApp: () => ({ dialog: null }) }));
vi.mock('./use-open-app', () => ({ useOpenApp: () => () => {} }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => () => {} }));
vi.mock('sonner', () => ({ toast: { error: h.error } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    appBuilds: {
      get: { queryOptions: () => ({ queryKey: ['source'], queryFn: async () => ({ id: 'source-1', name: 'Tide Log', folder: '/apps/tide-log', createdByRi: true }) }) },
      status: { queryOptions: () => ({ queryKey: ['status'], queryFn: async () => null }) },
      pathKey: () => ['appBuilds'],
    },
    personalApps: { get: { queryOptions: () => ({ queryKey: ['personalApp'], queryFn: async () => null }) } },
  },
  trpcClient: { documentChat: { create: { mutate: h.create } } },
}));

let client: QueryClient;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  notifyManager.setScheduler(queueMicrotask);
  const dom = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  h.props = null;
  h.create.mockReset();
  h.error.mockReset();
  const { AppBuildPage } = await import('./app-build-page');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.getElementById('root')!);
  cleanup = () => act(async () => { root.unmount(); client.clear(); });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(AppBuildPage, { sourceId: 'source-1', navigate: () => {} }))));
  await vi.waitFor(() => expect(h.props?.sessionId).toBe('opencode-chat'));
});

afterEach(async () => {
  await cleanup?.();
  notifyManager.setScheduler(cb => setTimeout(cb, 0));
  vi.unstubAllGlobals();
});

it('switches from OpenCode to the selected harness, carrying every model setting and showing the new thread', async () => {
  let finish!: (value: { session: { id: string } }) => void;
  h.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  expect(h.props!.onSwitchProvider).toBeTypeOf('function');
  await act(async () => h.props!.onSwitchProvider!({ harness: 'codex', model: 'gpt-6.1-sol', variant: 'thinking', effort: 'xhigh', serviceTier: 'priority' }));
  expect(h.create).toHaveBeenCalledExactlyOnceWith({ body: {
    entityType: 'app-builder', entityId: 'source-1', providerId: 'codex',
    model: 'gpt-6.1-sol', variant: 'thinking', effort: 'xhigh', serviceTier: 'priority',
  } });
  await vi.waitFor(() => expect(h.props!.switchingProvider).toBe(true));
  await act(async () => finish({ session: { id: 'codex-chat' } }));
  await vi.waitFor(() => expect(h.props!.sessionId).toBe('codex-chat'));
  expect(client.getQueryData(['app-builder-chat', 'source-1'])).toEqual({ id: 'codex-chat' });
  expect(h.props!.switchingProvider).toBe(false);
});

it('keeps the current thread and shows the error if the new chat cannot start', async () => {
  h.create.mockRejectedValue(new Error('Codex is not connected.'));
  await act(async () => h.props!.onSwitchProvider!({ harness: 'codex', model: 'gpt-6.1-sol' }));
  await vi.waitFor(() => expect(h.error).toHaveBeenCalledWith('Could not start a new chat', { description: 'Codex is not connected.' }));
  expect(h.props!.sessionId).toBe('opencode-chat');
  expect(h.props!.switchingProvider).toBe(false);
});

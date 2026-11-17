/** The chat beside a schedule's form offers every provider, and a pick starts its new chat there. */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  props: null as null | { onSwitchProvider?: (next: Record<string, unknown>) => void; switchingProvider?: boolean },
  created: [] as unknown[],
}));

vi.mock('@/components/chat/harness-chat', () => ({
  HarnessChatSession: (props: NonNullable<typeof h.props>) => { h.props = props; return null; },
}));
vi.mock('@/hooks/use-execution', () => ({
  useRuntimeStatus: () => ({ data: undefined }),
  useSession: () => ({ data: undefined }),
}));
vi.mock('@/lib/trpc/client', () => ({
  trpcClient: { documentChat: {
    list: { query: async () => ({ session: { id: 'schedule-chat', surfaceRef: 'new' } }) },
    create: { mutate: async (input: unknown) => { h.created.push(input); return { session: { id: 'fresh-chat', surfaceRef: 'new' } }; } },
  } },
}));

let cleanup: (() => Promise<void>) | null = null;

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  const dom = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  h.props = null;
  h.created = [];
});

afterEach(async () => {
  await cleanup?.();
  notifyManager.setScheduler(cb => setTimeout(cb, 0));
  vi.unstubAllGlobals();
});

it('lets the schedule chat switch to any provider, starting its new chat on the pick', async () => {
  const { useScheduleChat } = await import('./use-schedule-chat');
  const { ScheduleChatPanel } = await import('./schedule-chat-panel');
  function Panel() {
    return createElement(ScheduleChatPanel, { chat: useScheduleChat('new'), scheduleRef: 'new' });
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.getElementById('root')!);
  cleanup = () => act(async () => { root.unmount(); client.clear(); });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Panel))));
  await vi.waitFor(() => expect(h.props).not.toBeNull());

  // Without a switch handler the composer only lists the chat's own provider.
  expect(h.props!.onSwitchProvider).toBeTypeOf('function');
  await act(async () => h.props!.onSwitchProvider!({ harness: 'opencode', model: 'anthropic/claude-opus-5-5', variant: 'high' }));
  await vi.waitFor(() => expect(h.created).toHaveLength(1));
  expect(h.created[0]).toEqual({ body: {
    entityType: 'trigger', entityId: 'new',
    providerId: 'opencode', model: 'anthropic/claude-opus-5-5', variant: 'high', effort: undefined, serviceTier: undefined,
  } });
});

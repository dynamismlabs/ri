/**
 * Ri in other agents says Connected only once Ri has heard from the agent.
 * Writing Ri into an agent's configuration isn't enough: an agent that can't
 * reach Ri (an address it refuses, a session not restarted) never uses its
 * key, and the person should see that here instead of finding out in the agent.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseHTML } from 'linkedom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiClientView } from '@/lib/db/queries';
import type { LocalAgentState } from '@/lib/external-ai/local-setup';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { ConnectAgents, waitingForAgent } from './connect-agents';

let root: Root;
let container: HTMLElement;
let client: QueryClient;

beforeEach(() => {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // The accordion measures its content on the next frame.
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => setTimeout(() => run(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('getComputedStyle', () => ({ animationName: 'none', getPropertyValue: () => '' }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});

const key = (lastUsedAt: string | null): AiClientView => ({ keyId: 'k1', name: 'Antigravity on Test Mac', createdAt: '2026-11-16T10:00:00Z', lastUsedAt, client: 'antigravity' });

const agent = (patch: Partial<LocalAgentState>): LocalAgentState => ({
  kind: 'antigravity', installed: true, connection: null, stale: null,
  config: '~/.gemini/config/mcp_config.json', next: 'Start a new Antigravity conversation.', ...patch,
});

async function render(keys: AiClientView[], antigravity: LocalAgentState, engine: 'antigravity' | 'codex' | null = null) {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ConfirmProvider, null, createElement(ConnectAgents, {
    target: { space: { kind: 'personal' }, mcpUrl: 'http://127.0.0.1:42243/api/orchestrator/mcp', server: 'ri', tokenVar: 'RI_TOKEN', reachable: false },
    keys,
    createKey: vi.fn(),
    revokeKey: vi.fn(),
    onChanged: vi.fn(),
    local: { device: 'Test Mac', agents: [antigravity], loading: false, setUp: vi.fn(), disconnect: vi.fn() },
    engine,
  })))));
  const item = container.querySelector('[data-agent-client="antigravity"]')!;
  await act(async () => (item.querySelector('button') as HTMLButtonElement).click());
  return item.textContent ?? '';
}

describe('an agent Ri set up on this computer', () => {
  it('waits, with the one thing to do, until the agent reaches Ri', async () => {
    const text = await render([key(null)], agent({ connection: key(null) }));
    expect(text).not.toContain('Connected');
    expect(text).toContain('Not used yet');
    expect(text).toContain('Waiting for Antigravity to reach Ri. Start a new Antigravity conversation.');
  });

  it('is Connected once its key is used', async () => {
    const used = new Date().toISOString();
    const text = await render([key(used)], agent({ connection: key(null) }));
    // The key list is read more often than the agent's files, so it wins.
    expect(text).toContain('Connected');
    expect(text).toContain('Used just now');
    expect(text).not.toContain('Waiting for');
  });

  it('asks to be set up again when it has an old address for Ri', async () => {
    const text = await render([key('2026-11-14T10:00:00Z')], agent({ stale: 'moved' }));
    expect(text).not.toContain('Connected');
    expect(text).toContain('Antigravity has an old address for Ri. Set it up again to reconnect.');
    expect(text).toContain('Set up');
  });
});

describe('what the item says it is for', () => {
  it('names the agent Ri runs on, which needs nothing here to chat with', async () => {
    const text = await render([], agent({}), 'antigravity');
    expect(text).toContain('Ri runs on this');
    expect(text).not.toContain('Installed');
    expect(text).toContain('Ri already runs on Antigravity, so you can chat with it in Ri now. Set this up only if you also use Antigravity on its own');
  });

  it('says nothing of the kind for an agent Ri doesn’t run on', async () => {
    const text = await render([], agent({}), 'codex');
    expect(text).toContain('Installed');
    expect(text).not.toContain('Ri runs on this');
    expect(text).not.toContain('already runs on');
  });

  it('gives one thing to ask once the agent has a key', async () => {
    const text = await render([key(null)], agent({ connection: key(null) }));
    expect(text).toContain('Try it: ask Antigravity “What’s on my plate in Ri?”');
  });

  it('gives nothing to ask before it has a key', async () => {
    expect(await render([], agent({}))).not.toContain('Try it');
  });
});

describe('waitingForAgent', () => {
  it('is true while an agent Ri set up hasn’t used its key, by the fresher key list', () => {
    const waiting = agent({ connection: key(null) });
    expect(waitingForAgent([waiting], [key(null)])).toBe(true);
    expect(waitingForAgent([waiting], [key('2026-11-16T10:01:00Z')])).toBe(false);
    expect(waitingForAgent([agent({})], [])).toBe(false);
    expect(waitingForAgent(undefined, undefined)).toBe(false);
  });
});

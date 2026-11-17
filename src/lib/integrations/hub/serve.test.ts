import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as q from '@/lib/db/queries';
import type { RiMcpServer, RiMcpToolHandler } from '@/lib/mcp/http-server';
import { serveHub } from './serve';
import { readAuthConfig, writeAuthConfig } from '@/lib/auth/config-file';
import { INVOCATION_META, invocationContext, withStartedBy } from './origin';

const action = (id: string, mutating = false) => ({ id, description: id, input: z.object({ query: z.string().optional() }), mutating });
const runtime = (runAction: (...args: unknown[]) => Promise<unknown>) => ({
  getToolkits: () => [
    { id: 'gmail', providerId: 'google', displayName: 'Gmail', actions: [action('gmail.search_messages'), action('gmail.send_email', true)] },
    { id: 'app_finances', providerId: 'app_finances', displayName: 'Finances', actions: [action('app_finances.list')] },
  ],
  listConnections: async () => [
    { id: 'c-home', providerId: 'google', accountId: 'home', email: 'me@example.com', status: 'active' },
    { id: 'c-work', providerId: 'google', accountId: 'work', email: 'me@work.example', status: 'active' },
    { id: 'c-gone', providerId: 'google', accountId: 'gone', email: 'gone@example.com', status: 'needs_reauth' },
    { id: 'c-fin', providerId: 'app_finances', accountId: 'place:ri', status: 'active' },
  ],
  runAction,
});

function registrar() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: RiMcpToolHandler }>();
  const server = { era: 'modern', registerTool: (name: string, config: Record<string, unknown>, handler: RiMcpToolHandler) => tools.set(name, { config, handler }) } as unknown as RiMcpServer;
  return { server, tools };
}
const context = (meta?: Record<string, unknown>) => ({ signal: new AbortController().signal, headers: undefined, era: 'modern' as const, meta });

describe('the hub surface an app sees', () => {
  it('serves only granted tools, each on the accounts it was granted on, as the app, with every call logged', async () => {
    const app = q.upsertHubApp({
      clientId: `bloom-${crypto.randomUUID()}`, name: 'Bloom', clientUri: 'http://127.0.0.1:4391',
      grant: {
        accounts: [
          { connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages', 'gmail__send_email'] },
          { connectionId: 'c-work', toolkitId: 'gmail', tools: ['gmail__search_messages'] },
          { connectionId: 'c-gone', toolkitId: 'gmail', tools: ['gmail__search_messages'] },
          // Another personal app is never reachable through the hub, whatever a grant says.
          { connectionId: 'c-fin', toolkitId: 'app_finances', tools: ['app_finances__list'] },
        ],
        services: ['list_tasks'],
      },
    });
    const runAction = vi.fn(async () => ({ ok: true, result: { messages: [] } }));
    const { server, tools } = registrar();
    await serveHub(server, runtime(runAction) as never, app, { ownerId: 'local', redirectUris: [] });
    expect([...tools.keys()].sort()).toEqual(['gmail__search_messages', 'gmail__send_email', 'ri__list_tasks']);
    // Search is on two accounts, so the app names one. Send is on one, so there's nothing to choose.
    expect(Object.keys(tools.get('gmail__search_messages')!.config.inputSchema as object)).toContain('account');
    expect(Object.keys(tools.get('gmail__send_email')!.config.inputSchema as object)).not.toContain('account');
    expect(String(tools.get('gmail__send_email')!.config.description)).toContain('asks the person before every call');
    expect(String(tools.get('gmail__search_messages')!.config.description)).not.toContain('asks');

    await tools.get('gmail__search_messages')!.handler({ query: 'from:clinic', account: 'me@work.example' }, context({ 'app/job': 'import_messages', 'app/jobRun': 'run-7' }));
    expect(runAction).toHaveBeenLastCalledWith('gmail.search_messages', { query: 'from:clinic' }, expect.objectContaining({
      allowedConnectionIds: ['c-home', 'c-work'], account: 'me@work.example',
      caller: { type: 'app', id: `hub:${app.id}`, hubApp: { appId: app.id, startedBy: { kind: 'job', label: 'import_messages', id: 'run-7' } } },
    }));
    // The app passes back the context Ri gave it when a chat called it: the approval shows in that chat.
    if (!readAuthConfig()?.localToken) writeAuthConfig({ localToken: 'hub-serve-test-token' });
    const fromChat = invocationContext({ kind: 'chat', id: 'chat-9' }, 'http://127.0.0.1:4391/mcp')!;
    await tools.get('gmail__send_email')!.handler({ query: 'x' }, context({ [INVOCATION_META]: fromChat }));
    expect(runAction).toHaveBeenLastCalledWith('gmail.send_email', { query: 'x' }, expect.objectContaining({
      connectionId: 'c-home', caller: expect.objectContaining({ hubApp: { appId: app.id, startedBy: { kind: 'chat', id: 'chat-9' } } }),
    }));
    // Without it, even while Ri is busy with a chat, the call is the app's own.
    await withStartedBy({ kind: 'chat', id: 'chat-9' }, () => tools.get('gmail__send_email')!.handler({ query: 'y' }, context()));
    expect(runAction).toHaveBeenLastCalledWith('gmail.send_email', { query: 'y' }, expect.objectContaining({
      caller: expect.objectContaining({ hubApp: { appId: app.id, startedBy: { kind: 'app' } } }),
    }));
    expect(q.listHubCalls(app.id).map(call => [call.tool, call.status, call.startedByKind, call.startedByLabel]).reverse()).toEqual([
      ['gmail__search_messages', 'ok', 'job', 'import_messages'], ['gmail__send_email', 'ok', 'chat', null], ['gmail__send_email', 'ok', 'app', null],
    ]);
  });

  it('creates a Ri task for an app without asking, as Ri\'s own services follow the person\'s settings', async () => {
    const app = q.upsertHubApp({ clientId: `bloom-${crypto.randomUUID()}`, name: 'Bloom', grant: { accounts: [], services: ['create_task'] } });
    const runAction = vi.fn();
    const { server, tools } = registrar();
    await serveHub(server, runtime(runAction) as never, app, { ownerId: 'local', redirectUris: [] });
    const answer = await tools.get('ri__create_task')!.handler({ title: 'Book the pediatrician', operationId: crypto.randomUUID() }, context());
    expect(answer.isError, JSON.stringify(answer.content)).toBeFalsy();
    const task = JSON.parse((answer.content[0] as { text: string }).text) as { id: string; title: string };
    expect(task.title).toBe('Book the pediatrician');
    expect(q.getTask(task.id)).toBeTruthy();
    // No connected service, no approval gate.
    expect(runAction).not.toHaveBeenCalled();
    expect(q.listHubCalls(app.id)[0]).toMatchObject({ tool: 'ri__create_task', status: 'ok' });
  });

  it('tells an app a message is gone as not_found with its HTTP status, still an error', async () => {
    const app = q.upsertHubApp({ clientId: `travel-${crypto.randomUUID()}`, name: 'Travel', grant: { accounts: [{ connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__search_messages'] }], services: [] } });
    const { server, tools } = registrar();
    await serveHub(server, runtime(vi.fn(async () => ({ ok: false, reason: 'error', code: 'not_found', message: 'provider error 410 for GET /gmail/v1/users/me/history', status: 410 }))) as never, app, { ownerId: 'local', redirectUris: [] });
    const answer = await tools.get('gmail__search_messages')!.handler({}, context());
    expect(answer.isError).toBe(true);
    expect(JSON.parse((answer.content[0] as { text: string }).text)).toEqual({ status: 'error', code: 'not_found', httpStatus: 410, message: 'provider error 410 for GET /gmail/v1/users/me/history' });
    expect(q.listHubCalls(app.id)[0]).toMatchObject({ tool: 'gmail__search_messages', status: 'error' });
  });

  it('answers a write waiting for the person the way the kit retries it', async () => {
    const app = q.upsertHubApp({ clientId: `bloom-${crypto.randomUUID()}`, name: 'Bloom', grant: { accounts: [{ connectionId: 'c-home', toolkitId: 'gmail', tools: ['gmail__send_email'] }], services: [] } });
    const { server, tools } = registrar();
    await serveHub(server, runtime(vi.fn(async () => ({ ok: false, reason: 'approval_required', approvalId: 'a-1' }))) as never, app, { ownerId: 'local', redirectUris: [] });
    const answer = await tools.get('gmail__send_email')!.handler({}, context());
    expect(answer.isError).toBeFalsy();
    expect(JSON.parse((answer.content[0] as { text: string }).text)).toMatchObject({ status: 'approval_required', approvalId: 'a-1' });
    expect(q.listHubCalls(app.id)[0]).toMatchObject({ status: 'approval_required', startedByKind: 'app' });
  });
});

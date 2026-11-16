/**
 * What started a hub call (docs/personal-apps.md "The hub"): a chat only when the call is verifiably
 * tied to it, through the signed context Ri adds to its own call into the app.
 */
import { describe, expect, it, vi } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { riMcpHandler } from '@/lib/mcp/http-server';
import { INVOCATION_META, INVOCATION_TTL_MS, invocationContext, invocationMeta, startedByFor, verifyInvocation, withStartedBy } from './origin';

// The home's local token, which signs the context. Never the real home's.
vi.mock('@/lib/auth/config-file', () => ({ readAuthConfig: () => ({ localToken: 'local-token-for-tests' }) }));

const KEY = 'local-token-for-tests';
const APP_A = 'http://127.0.0.1:4391/mcp';
const now = Date.UTC(2026, 10, 16, 12);

describe('what started a hub call', () => {
  it('is the chat a valid context names, when the app it was issued for passes it back', () => {
    const context = invocationContext({ kind: 'chat', id: 'chat-c' }, APP_A, { key: KEY, now })!;
    // The app calls the hub from its localhost alias, carrying the context from Ri's call.
    expect(verifyInvocation(context, ['http://localhost:4391/oauth/callback'], { key: KEY, now: now + 60_000 })).toEqual({ kind: 'chat', id: 'chat-c' });
    expect(verifyInvocation(invocationContext({ kind: 'person' }, APP_A, { key: KEY, now })!, [APP_A], { key: KEY, now })).toEqual({ kind: 'person' });
  });

  it('names nobody when the context was issued for another app, has expired, or was changed', () => {
    const context = invocationContext({ kind: 'chat', id: 'chat-c' }, APP_A, { key: KEY, now })!;
    // App B on another port of the same host can't use app A's context.
    expect(verifyInvocation(context, ['http://127.0.0.1:4392'], { key: KEY, now })).toBeNull();
    expect(verifyInvocation(context, [APP_A], { key: KEY, now: now + INVOCATION_TTL_MS + 1 })).toBeNull();
    expect(verifyInvocation(context, [APP_A], { key: 'another-home', now })).toBeNull();
    const [body, signature] = context.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), i: 'chat-other' })).toString('base64url');
    expect(verifyInvocation(`${forged}.${signature}`, [APP_A], { key: KEY, now })).toBeNull();
    expect(verifyInvocation('chat-c', [APP_A], { key: KEY, now })).toBeNull();
  });

  it('never guesses a chat from Ri calling the app at the same time', () => {
    // The reviewer's case: Ri is calling app A for chat C while app B, or A's own background work,
    // calls the hub with no context. That's the app on its own, not chat C.
    let during;
    withStartedBy({ kind: 'chat', id: 'chat-c' }, () => { during = startedByFor(['https://apps.example/app-b'], undefined); });
    expect(during).toEqual({ kind: 'app' });
    expect(startedByFor([APP_A], { 'app/job': 'import_receipts', 'app/jobRun': 'run-1' })).toEqual({ kind: 'job', label: 'import_receipts', id: 'run-1' });
    expect(startedByFor([APP_A], undefined)).toEqual({ kind: 'app' });
  });

  it('adds the context to Ri\'s own call into an app only while acting for a chat or the person', () => {
    expect(invocationMeta(APP_A)).toBeUndefined();
    const meta = withStartedBy({ kind: 'chat', id: 'chat-c' }, () => invocationMeta(APP_A));
    expect(Object.keys(meta ?? {})).toEqual([INVOCATION_META]);
    expect(startedByFor([APP_A], meta)).toEqual({ kind: 'chat', id: 'chat-c' });
    expect(invocationContext({ kind: 'job', label: 'x' }, APP_A, { key: KEY })).toBeNull();
    expect(invocationContext({ kind: 'chat', id: 'chat-c' }, APP_A, { key: null })).toBeNull();
  });

  it('follows each chat\'s request through Ri\'s MCP server to its call into the app, side by side', async () => {
    // The chat-facing endpoint runs each chat's request inside withStartedBy, and Ri's call into an
    // app reads it from there (runtime.ts). The context has to survive the SDK's request handling,
    // and two chats calling at once must each get their own.
    const handler = riMcpHandler(server => {
      server.registerTool('call_app', { description: 'Call the app as Ri would' }, async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { content: [{ type: 'text', text: JSON.stringify(invocationMeta(APP_A) ?? null) }] };
      });
    }, { name: 'ri-test', version: '1.0.0' });
    const callAs = async (chat: string | null) => {
      const client = new Client({ name: 'chat', version: '1' }, { versionNegotiation: { mode: 'auto' } });
      await client.connect(new StreamableHTTPClientTransport(new URL('http://ri.test/api/integrations/mcp'), {
        fetch: (url, init) => chat ? withStartedBy({ kind: 'chat', id: chat }, () => handler(new Request(url, init))) : handler(new Request(url, init)),
      }));
      try {
        const result = await client.callTool({ name: 'call_app', arguments: {} });
        return JSON.parse((result.content as { text: string }[])[0]!.text) as Record<string, unknown> | null;
      } finally { await client.close(); }
    };
    const [a, b, none] = await Promise.all([callAs('chat-a'), callAs('chat-b'), callAs(null)]);
    // The app passes the context back on its hub calls, from its own address.
    expect(startedByFor(['http://localhost:4391'], a ?? undefined)).toEqual({ kind: 'chat', id: 'chat-a' });
    expect(startedByFor(['http://localhost:4391'], b ?? undefined)).toEqual({ kind: 'chat', id: 'chat-b' });
    expect(none).toBeNull();
  });
});

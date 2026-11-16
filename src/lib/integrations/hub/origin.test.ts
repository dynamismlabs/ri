/**
 * What started a hub call (docs/personal-apps.md "The hub"): a chat only when the call is verifiably
 * tied to it, through the signed context Ri adds to its own call into the app.
 */
import { describe, expect, it } from 'vitest';
import { INVOCATION_META, INVOCATION_TTL_MS, invocationContext, invocationMeta, startedByFor, verifyInvocation, withStartedBy } from './origin';

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
    // The test home may have no local token. With one, the context names the chat.
    if (meta) expect(startedByFor([APP_A], meta)).toEqual({ kind: 'chat', id: 'chat-c' });
    expect(meta === undefined || typeof meta[INVOCATION_META] === 'string').toBe(true);
    expect(invocationContext({ kind: 'job', label: 'x' }, APP_A, { key: KEY })).toBeNull();
  });
});

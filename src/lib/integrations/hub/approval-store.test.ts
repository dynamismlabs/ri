import { expect, it } from 'vitest';
import * as q from '@/lib/db/queries';
import { hubApprovalStore } from './approval-store';

it('keeps an app\'s request, its answer and its one use within the day, in the database', () => {
  const app = q.upsertHubApp({ clientId: `bloom-${crypto.randomUUID()}`, name: 'Bloom', grant: { accounts: [], services: [] } });
  const request = {
    id: crypto.randomUUID(), appId: app.id, callKey: 'local|gmail.send_email|c-1|digest|v1|hub', actionId: 'gmail.send_email', connectionId: 'c-1',
    ownerId: 'local', providerId: 'google', risk: 'medium', preview: { to: 'clinic@example.com' }, account: 'me@example.com',
    sessionId: null, startedBy: { kind: 'job' as const, label: 'send_reminders' }, createdAt: Date.now(),
  };
  hubApprovalStore.insertPending(request);
  expect(hubApprovalStore.listPending().find(row => row.id === request.id)).toEqual(request);
  const now = Date.now();
  expect(hubApprovalStore.takeGrant(app.id, request.callKey, now)).toBeNull();
  hubApprovalStore.decide(request.id, 'approved', now + 24 * 60 * 60_000);
  expect(hubApprovalStore.listPending().some(row => row.id === request.id)).toBe(false);
  // Another app, or the same app's different call, can't spend it.
  expect(hubApprovalStore.takeGrant('another-app', request.callKey, now)).toBeNull();
  expect(hubApprovalStore.takeGrant(app.id, 'another-call', now)).toBeNull();
  // Expired, it's spent by nobody. In time, once.
  expect(hubApprovalStore.takeGrant(app.id, request.callKey, now + 24 * 60 * 60_000 + 1)).toBeNull();
  expect(hubApprovalStore.takeGrant(app.id, request.callKey, now + 60_000)).toBe(request.id);
  expect(hubApprovalStore.takeGrant(app.id, request.callKey, now + 120_000)).toBeNull();
  // A declined call is remembered for the window, by its ID.
  const declined = { ...request, id: crypto.randomUUID(), callKey: 'declined-call' };
  hubApprovalStore.insertPending(declined);
  hubApprovalStore.decide(declined.id, 'denied', null);
  expect(hubApprovalStore.deniedSince(app.id, 'declined-call', now - 60_000)).toBe(declined.id);
  expect(hubApprovalStore.deniedSince(app.id, 'declined-call', now + 24 * 60 * 60_000)).toBeNull();
  // Taking an app's access away drops what it was waiting on.
  const waiting = { ...request, id: crypto.randomUUID(), callKey: 'other' };
  hubApprovalStore.insertPending(waiting);
  hubApprovalStore.drop(app.id);
  expect(hubApprovalStore.listPending().some(row => row.id === waiting.id)).toBe(false);
  // Turning an account off drops every app's waiting and approved requests on it, and only on it.
  const onAccount = { ...request, id: crypto.randomUUID(), callKey: 'on-account' };
  const approvedOnAccount = { ...request, id: crypto.randomUUID(), callKey: 'approved-on-account' };
  const elsewhere = { ...request, id: crypto.randomUUID(), callKey: 'elsewhere', connectionId: 'c-other' };
  for (const row of [onAccount, approvedOnAccount, elsewhere]) hubApprovalStore.insertPending(row);
  hubApprovalStore.decide(approvedOnAccount.id, 'approved', now + 60 * 60_000);
  hubApprovalStore.dropForConnections([request.connectionId]);
  expect(hubApprovalStore.listPending().map(row => row.id)).toEqual([elsewhere.id]);
  expect(hubApprovalStore.takeGrant(app.id, 'approved-on-account', now)).toBeNull();
});

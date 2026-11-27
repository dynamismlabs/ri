import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { getRawDb, resetDb } from '@/lib/db';
import * as q from '@/lib/db/queries';
import { runTick } from '@/lib/scheduler/runner';
import { rateLimitRecovery, scheduleRateLimitResume, cancelRateLimitResume } from './rate-limit-resume';
import { RESUME_RESET_UNKNOWN } from '@/lib/runs/rate-limit-resume';

const dispatch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/executor/adapter', () => ({ dispatch, abort: vi.fn() }));
const telemetry = vi.hoisted(() => ({ entries: [] as import('@/lib/harness/rate-limits').HarnessRateLimits[], read: vi.fn(async () => []) }));
vi.mock('@/lib/harness/rate-limits', () => ({
  getHarnessRateLimits: () => telemetry.entries,
  readHarnessRateLimits: telemetry.read,
  recordRateLimits: vi.fn(),
}));

let home: TestHome;
beforeEach(async () => {
  home = await createTestHome();
  telemetry.entries = [];
  telemetry.read.mockClear();
  dispatch.mockClear();
});
afterEach(async () => home.cleanup());

function fixture(harness: 'claude' | 'codex' | 'antigravity' = 'claude', known = true) {
  const session = q.createChatSession({ harness, type: 'coordinator' });
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const event = q.insertChatEvent({
    sessionId: session.id, role: 'system', source: 'rate_limit', toolIsError: true, content: 'Rate limit reached',
    raw: { providerType: harness, rateLimitContext: { accountId: 'account-a' }, ...(known ? { resetAt } : {}) },
  })!;
  const input = { sessionId: session.id, eventId: event.id, prompt: 'Continue with tests' };
  return { session, event, resetAt, input };
}

function reportLimit(observedAt: Date, resetAt?: string, accountId = 'account-a') {
  telemetry.entries = [{ harness: 'claude', accountId, observedAt: observedAt.toISOString(), buckets: [{
    id: 'seven_day', observedAt: observedAt.toISOString(), owner: { kind: 'account' }, applicability: { kind: 'all_models' }, usedPercent: 100, resetAt,
  }] }];
}

it('persists one schedule per failure, survives reopening, and sends once in the original chat', async () => {
  const { session, input, resetAt } = fixture();
  const [first, retry] = await Promise.all([scheduleRateLimitResume(input), scheduleRateLimitResume(input)]);
  expect(retry.trigger?.id).toBe(first.trigger?.id);
  const trigger = first.trigger!;
  expect(trigger).toMatchObject({ targetKind: 'session', targetSessionId: session.id, kind: 'at' });
  expect(Date.parse(trigger.runAt!)).toBe(Date.parse(resetAt) + 60_000);
  resetDb();
  expect((await rateLimitRecovery(input)).trigger?.id).toBe(trigger.id);
  const due = Date.parse(trigger.runAt!);
  expect(await runTick(new Date(due - 1))).toBe(0);
  expect(await runTick(new Date(due))).toBe(1);
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  const [run] = q.listRuns({ triggerId: trigger.id });
  expect(run.chatSessionId).toBe(session.id);
  expect(dispatch).toHaveBeenCalledWith(session.id, expect.stringContaining(input.prompt), expect.objectContaining({ sourceEventId: run.id }));
  expect(await runTick(new Date(due + 1000))).toBe(0);
});

it('pauses when a newly reported blocking limit has an unknown reset', async () => {
  const { input } = fixture();
  const { trigger } = await scheduleRateLimitResume(input);
  const due = new Date(trigger!.runAt!);
  reportLimit(due);
  expect(await runTick(due)).toBe(0);
  expect(q.getTrigger(trigger!.id)).toMatchObject({ enabled: false, disabledReason: RESUME_RESET_UNKNOWN });
  expect(dispatch).not.toHaveBeenCalled();
  expect(cancelRateLimitResume(input)).toEqual({ cancelled: true });
  expect(q.getTrigger(trigger!.id)).toBeUndefined();
});

it('honors the full buffer even when the newly reported reset has just passed', async () => {
  const { input } = fixture();
  const { trigger } = await scheduleRateLimitResume(input);
  const due = Date.parse(trigger!.runAt!);
  reportLimit(new Date(due), new Date(due - 20_000).toISOString());
  expect(await runTick(new Date(due))).toBe(0);
  expect(q.getTrigger(trigger!.id)?.nextRunAt).toBe(new Date(due + 40_000).toISOString());
  expect(dispatch).not.toHaveBeenCalled();
});

it('requires a future chosen time when Gemini via Antigravity has no reset', async () => {
  const { input } = fixture('antigravity', false);
  await expect(scheduleRateLimitResume(input)).rejects.toThrow('future time');
  const runAt = new Date(Date.now() + 60_000).toISOString();
  expect((await scheduleRateLimitResume({ ...input, runAt })).trigger?.runAt).toBe(runAt);
  expect(telemetry.read).not.toHaveBeenCalled();
});

it('only uses matching account data from the device that runs the chat', async () => {
  const { session, input, resetAt } = fixture();
  const later = new Date(Date.now() + 90_000).toISOString();
  reportLimit(new Date(), later, 'account-b');
  expect((await rateLimitRecovery(input)).resumeAt).toBe(new Date(Date.parse(resetAt) + 60_000).toISOString());
  reportLimit(new Date(), later);
  expect((await rateLimitRecovery(input)).resumeAt).toBe(new Date(Date.parse(later) + 60_000).toISOString());
  const device = q.createDevice({ name: 'Laptop', kind: 'computer' });
  q.updateChatSession(session.id, { deviceId: device.id });
  expect((await rateLimitRecovery(input, true)).resumeAt).toBe(new Date(Date.parse(resetAt) + 60_000).toISOString());
  expect(telemetry.read).not.toHaveBeenCalled();
});

it('ignores later worker-clock timestamps and records manual continuation as skipped', async () => {
  const { session, input } = fixture();
  const { trigger } = await scheduleRateLimitResume(input);
  q.insertChatEvent({ sessionId: session.id, role: 'user', source: 'user', content: 'Continue now', createdAt: '2020-01-01T00:00:00.000Z' });
  expect(await runTick(new Date(trigger!.runAt!))).toBe(1);
  expect(q.listRuns({ triggerId: trigger!.id })[0]).toMatchObject({ status: 'skipped', statusReason: 'chat_already_continued' });
  expect(dispatch).not.toHaveBeenCalled();
});

it('leaves no scheduled run after cancelling and bounds the latest-event query', async () => {
  const { input } = fixture();
  const { trigger } = await scheduleRateLimitResume(input);
  expect(cancelRateLimitResume(input)).toEqual({ cancelled: true });
  expect(await runTick(new Date(trigger!.runAt!))).toBe(0);
  const plan = getRawDb().prepare('EXPLAIN QUERY PLAN SELECT id, source FROM chat_events INDEXED BY idx_chat_events_session_cursor WHERE session_id = ? ORDER BY rowid DESC LIMIT 150')
    .all(input.sessionId) as { detail: string }[];
  expect(plan.map(row => row.detail).join(' ')).toMatch(/SEARCH chat_events USING INDEX idx_chat_events_session_cursor/);
  expect(plan.map(row => row.detail).join(' ')).not.toMatch(/TEMP B-TREE/);
});

import { afterEach, expect, it, vi } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { installFakeHarness, FAKE_MODEL_ID, type FakeHarness } from '@/test/fixtures/fake-harness';
import type { HarnessId } from '@/lib/harness/registry';
import { toChatEventDTO } from '@/lib/api/dto/chat-event';
import * as q from '@/lib/db/queries';
import { dispatch, _resetExecutorState } from '@/lib/executor/adapter';
import { installHomeSink } from '@/lib/executor/home-sink';
import { acquireApiLease, releaseApiLease, getApiLeaseStats, _resetApiLeaseState } from './rate-lease';
import { runTick } from '@/lib/scheduler/runner';
import { cancelRateLimitResume, scheduleRateLimitResume } from '@/lib/server/operations/rate-limit-resume';

vi.mock('@/lib/harness/rate-limits', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/harness/rate-limits')>(),
  readHarnessRateLimits: vi.fn(async () => []),
}));

let home: TestHome;
let harness: FakeHarness;
let held = 0;

afterEach(async () => {
  while (held > 0) { releaseApiLease(); held--; }
  for (const session of harness.sessions) await session.drain();
  _resetExecutorState();
  harness.restore();
  await home.cleanup();
});

async function fixture(provider: HarnessId) {
  home = await createTestHome();
  harness = installFakeHarness(provider);
  installHomeSink();
  _resetApiLeaseState();
  const workspace = q.createWorkspace({ name: 'Recovery', cwd: home.root, isGit: false });
  return q.createExecutionWithChat({
    workspaceId: workspace.id, harness: provider, model: FAKE_MODEL_ID,
    modelCatalog: [{ id: FAKE_MODEL_ID, label: 'Fake model' }], label: 'Original chat',
  });
}

it.each(['claude', 'codex', 'antigravity'] as const)('resumes a failed %s turn in its actual chat once', async provider => {
  const { session, execution } = await fixture(provider);
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  harness.script = async turn => {
    if (turn.message.includes('Continue testing')) {
      await turn.say('Finished after the reset');
      return;
    }
    if (provider === 'claude') await turn.emit({
      type: 'assistant', text: "You've hit your 5-hour limit · resets 11:40pm (America/Denver) · out of usage credits",
      raw: { type: 'assistant', error: 'rate_limit', is_api_error_message: true, api_error_status: 429,
        api_error_params: { rate_limit_info: { status: 'rejected', resetsAt: Date.parse(resetAt) / 1000 } } },
    });
    if (provider === 'codex') await turn.emit({
      type: 'unknown', subtype: 'error', raw: { method: 'error', params: {
        willRetry: false, error: { message: 'You have hit your usage limit.', codexErrorInfo: 'usageLimitExceeded', resetsAt: resetAt },
      } },
    });
    return {
      status: 'failed', errorCode: 'rate_limited', errorMessage: provider === 'antigravity' ? 'RESOURCE_EXHAUSTED: model quota exceeded' : 'Rate limit',
    };
  };
  const initial = q.insertChatEvent({ sessionId: session.id, role: 'user', source: 'user', content: 'Run the tests' })!;
  await expect(dispatch(session.id, initial.content!, { sourceEventId: initial.id, actor: { source: 'human' } })).rejects.toThrow();
  const warning = q.listRecentChatEvents(session.id, 30).map(toChatEventDTO).find(event => event.rateLimitFailure)!;
  expect(warning).toMatchObject({ sessionId: session.id, source: 'rate_limit', rateLimitFailure: true });
  const { trigger } = await scheduleRateLimitResume({
    sessionId: session.id, eventId: warning.id, prompt: 'Continue testing',
    ...(provider === 'antigravity' ? { runAt: resetAt } : {}),
  });
  expect(trigger?.runAt).toBe(provider === 'antigravity' ? resetAt : new Date(Date.parse(resetAt) + 60_000).toISOString());

  const due = Date.parse(trigger!.runAt!);
  expect(await runTick(new Date(due))).toBe(1);
  await vi.waitFor(() => expect(q.listRuns({ triggerId: trigger!.id })[0]?.status).toBe('completed'));
  expect(await runTick(new Date(due + 1000))).toBe(0);
  const sent = harness.sessions.flatMap(handle => handle.messages);
  expect(sent.filter(message => message.includes('Continue testing'))).toHaveLength(1);
  expect(q.listChatSessions({ executionId: execution.id })).toHaveLength(1);
  expect(q.listRecentChatEvents(session.id, 30).some(event => event.content === 'Finished after the reset')).toBe(true);
});

it.each(['cancel', 'continue', 'restart'] as const)('handles %s while the resume waits for capacity', async action => {
  const { session } = await fixture('claude');
  const failure = q.insertChatEvent({ sessionId: session.id, role: 'system', source: 'rate_limit', toolIsError: true, content: 'Rate limit reached' })!;
  const input = { sessionId: session.id, eventId: failure.id, prompt: 'Scheduled follow-up' };
  const { trigger } = await scheduleRateLimitResume({ ...input, runAt: new Date(Date.now() + 60_000).toISOString() });
  for (let i = 0; i < getApiLeaseStats().capacity; i++) { await acquireApiLease(); held++; }
  expect(await runTick(new Date(trigger!.runAt!))).toBe(1);
  await vi.waitFor(() => expect(getApiLeaseStats().waiters).toBe(1));
  if (action === 'cancel') {
    expect(cancelRateLimitResume(input).cancelled).toBe(true);
  } else if (action === 'continue') {
    const message = q.insertChatEvent({ sessionId: session.id, role: 'user', source: 'user', content: 'Human continuation' })!;
    await dispatch(session.id, message.content!, { sourceEventId: message.id, actor: { source: 'human' } });
  } else {
    expect(q.reapStaleRunningRuns()).toBe(1);
    expect(q.getRun(q.getTrigger(trigger!.id)!.lastRunId!)).toMatchObject({ status: 'failed', errorCode: 'process_restart' });
  }
  releaseApiLease(); held--;
  await vi.waitFor(() => expect(q.listRuns({ triggerId: trigger!.id })[0]?.status).toBe('failed'));
  expect(harness.sessions.flatMap(handle => handle.messages).some(message => message.includes(input.prompt))).toBe(false);
});

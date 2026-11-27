import type { TriggerRecord } from '@/db/types';
import { assertPersonalCapability } from '@/lib/home/authority';
import * as q from '@/lib/db/queries';
import { isRunning } from '@/lib/executor/live-state';
import { refreshChatRateLimits } from '@/lib/runner/local-runner';
import { readHarnessRateLimits } from '@/lib/harness/rate-limits';
import { isChatRateLimitFailure, supportsRateLimitResume } from '@/lib/harness/rate-limit-failure';
import { OperationError } from '@/lib/server/operation';
import { withdrawQueuedSend } from '@/lib/workers/undelivered';
import { canScheduleChat } from '@/lib/triggers/chat-schedule';
import { rateLimitResumeBlock, rateLimitResumeTiming, RESUME_CANCELLED, RESUME_RESET_UNKNOWN } from '@/lib/runs/rate-limit-resume';

type ResumeTarget = { sessionId: string; eventId: string };

function recoveryTarget({ sessionId, eventId }: ResumeTarget) {
  assertPersonalCapability('Schedules');
  const session = q.getChatSession(sessionId);
  const event = q.getChatEventById(eventId);
  if (!session || !event || event.sessionId !== sessionId) {
    throw new OperationError(404, { error: 'Chat or rate limit message not found.' });
  }
  if (!supportsRateLimitResume(session.harness) || !isChatRateLimitFailure(event)) {
    throw new OperationError(400, { error: 'This message cannot schedule a resume.' });
  }
  return { session, event };
}

async function readForChat(session: NonNullable<ReturnType<typeof q.getChatSession>>) {
  if (session.harness === 'antigravity' || q.getChatDeviceId(session.id) !== null) return;
  if (!await refreshChatRateLimits(session.id)) await readHarnessRateLimits(Date.now(), session.harness);
}

export async function rateLimitRecovery(input: ResumeTarget, refresh = false) {
  const { session, event } = recoveryTarget(input);
  const unresolved = () => canScheduleChat(session) && q.isUnresolvedRateLimitEvent(session.id, event.id);
  if (refresh && unresolved() && !isRunning(session.id)) await readForChat(session);
  const trigger = q.getRateLimitResumeTrigger(event.id) ?? null;
  const run = trigger?.lastRunId ? q.getRun(trigger.lastRunId) : undefined;
  return {
    actionable: unresolved() && !isRunning(session.id),
    resumeAt: rateLimitResumeTiming(session, event, Date.now()).resumeAt,
    trigger,
    run: run ? { status: run.status, reason: run.statusReason, error: run.errorMessage } : null,
  };
}

export async function scheduleRateLimitResume(input: ResumeTarget & { prompt: string; runAt?: string }) {
  const status = await rateLimitRecovery(input, true);
  const existing = q.getRateLimitResumeTrigger(input.eventId);
  if (existing) return { ...status, trigger: existing };
  const { session, event } = recoveryTarget(input);
  if (!canScheduleChat(session) || !q.isUnresolvedRateLimitEvent(session.id, event.id) || isRunning(session.id)) {
    throw new OperationError(409, { error: 'This chat has already continued or is unavailable.' });
  }
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 20_000) throw new OperationError(400, { error: 'Enter a resume message of up to 20,000 characters.' });
  const runAt = input.runAt ?? status.resumeAt;
  if (!runAt || !Number.isFinite(Date.parse(runAt)) || Date.parse(runAt) <= Date.now()) {
    throw new OperationError(400, { error: 'Choose a future time to resume.' });
  }
  if (status.resumeAt && Date.parse(runAt) < Date.parse(status.resumeAt)) {
    throw new OperationError(400, { error: 'Choose a time after the reported limit resets.' });
  }
  const at = new Date(runAt).toISOString();
  const name = `Resume ${session.label?.slice(0, 55) || 'chat'}`;
  const trigger = q.createTrigger({
    name: q.findTriggerByName(name) ? `${name} (${event.id.slice(-8)})` : name,
    description: 'Resume this chat after its rate limit resets',
    harness: session.harness,
    targetKind: 'session',
    targetSessionId: session.id,
    resumeEventId: event.id,
    prompt,
    kind: 'at',
    runAt: at,
    nextRunAt: at,
    concurrencyPolicy: 'skip_if_running',
  });
  return { ...status, trigger };
}

export function cancelRateLimitResume(input: ResumeTarget) {
  const { event } = recoveryTarget(input);
  const trigger = q.getRateLimitResumeTrigger(event.id);
  if (!trigger) return { cancelled: true };
  if (!trigger.lastFiredAt) return { cancelled: q.deleteTrigger(trigger.id) };
  const run = trigger.lastRunId ? q.getRun(trigger.lastRunId) : undefined;
  if (!run || !['running', 'queued'].includes(run.status) || run.statusReason === 'rate_limit_resume_accepted') {
    throw new OperationError(409, { error: 'The scheduled message has already started or finished.' });
  }
  q.updateTrigger(trigger.id, { enabled: false, disabledReason: RESUME_CANCELLED });
  const queued = q.getSendForEvent(run.id);
  if (queued?.state === 'queued') withdrawQueuedSend(queued.id, 'The scheduled resume was cancelled.');
  return { cancelled: true };
}

/** Re-read if possible, then reload the row because the person could cancel during that read. */
export async function prepareRateLimitResume(snapshot: TriggerRecord, now: Date): Promise<boolean> {
  if (!snapshot.resumeEventId || !snapshot.targetSessionId) return false;
  const chat = q.getChatSession(snapshot.targetSessionId);
  const event = q.getChatEventById(snapshot.resumeEventId);
  if (chat && event && q.isUnresolvedRateLimitEvent(chat.id, event.id)) await readForChat(chat);
  const trigger = q.getTrigger(snapshot.id);
  if (!trigger?.enabled || !trigger.nextRunAt || Date.parse(trigger.nextRunAt) > now.getTime()) return false;
  if (!chat || !event || !q.isUnresolvedRateLimitEvent(chat.id, event.id)) return true;
  const block = rateLimitResumeBlock(trigger, chat, event, now.getTime());
  if (block?.kind === 'unknown') {
    q.updateTrigger(trigger.id, { enabled: false, disabledReason: RESUME_RESET_UNKNOWN });
    return false;
  }
  if (block?.kind === 'later') {
    q.updateTrigger(trigger.id, { runAt: block.at, nextRunAt: block.at });
    return false;
  }
  return true;
}

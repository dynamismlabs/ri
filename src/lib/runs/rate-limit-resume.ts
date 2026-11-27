import type { ChatEventRecord, ChatSessionRecord, RunRecord, TriggerRecord } from '@/db/types';
import * as q from '@/lib/db/queries';
import { isRunning } from '@/lib/executor/live-state';
import { recoveryRateLimits, sameRateLimitAccount } from '@/lib/harness/rate-limit-recovery';
import { getHarnessRateLimits } from '@/lib/harness/rate-limits';
import { chatRateLimitSnapshot } from '@/lib/runner/local-runner';
import { canScheduleChat } from '@/lib/triggers/chat-schedule';

export const RESUME_BUFFER_MS = 60_000;
export const RESUME_RESET_UNKNOWN = 'rate_limit_reset_unknown';
export const RESUME_CANCELLED = 'rate_limit_resume_cancelled';
const SNAPSHOT_MAX_AGE_MS = 10 * 60_000;

export function rateLimitResumeTiming(chat: ChatSessionRecord, event: ChatEventRecord, now: number) {
  const snapshots = q.getChatDeviceId(chat.id) === null
    ? [chatRateLimitSnapshot(chat.id), getHarnessRateLimits().find(entry => entry.harness === chat.harness)]
    : [];
  const snapshot = snapshots
    .filter(entry => entry != null)
    .filter(entry => sameRateLimitAccount(event, entry))
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  const buckets = snapshot?.buckets.filter(bucket => Date.parse(bucket.observedAt) >= now - SNAPSHOT_MAX_AGE_MS) ?? [];
  const { resetAt, unknownObservedAt } = recoveryRateLimits(event, buckets, chat.model);
  return {
    resumeAt: resetAt ? new Date(Date.parse(resetAt) + RESUME_BUFFER_MS).toISOString() : null,
    unknownObservedAt,
  };
}

export function rateLimitResumeBlock(trigger: TriggerRecord, chat: ChatSessionRecord, event: ChatEventRecord, now: number) {
  const timing = rateLimitResumeTiming(chat, event, now);
  if (timing.unknownObservedAt > Date.parse(trigger.createdAt)) return { kind: 'unknown' } as const;
  if (timing.resumeAt && Date.parse(timing.resumeAt) > now) return { kind: 'later', at: timing.resumeAt } as const;
  return null;
}

export function rateLimitResumeSiblingBusy(chat: ChatSessionRecord, exceptRunId?: string): boolean {
  if (!chat.executionId) return false;
  return !!q.findActiveRunForExecution(chat.executionId, exceptRunId)
    || q.listChatSessions({ executionId: chat.executionId }).some(s => s.id !== chat.id && isRunning(s.id));
}

export function isRateLimitResumeRun(run: RunRecord | undefined): boolean {
  return !!(run && typeof run.triggerPayload === 'object' && run.triggerPayload?.rateLimitResume === true);
}

/** The written input and the run share one id, including on a connected device. */
export function rateLimitResumeAdmission(runId: string | null | undefined): string | null {
  const run = runId ? q.getRun(runId) : undefined;
  if (!run || !isRateLimitResumeRun(run)) return null;
  const trigger = run.triggerId ? q.getTrigger(run.triggerId) : undefined;
  const chat = run.chatSessionId ? q.getChatSession(run.chatSessionId) : undefined;
  if (!trigger?.enabled || !trigger.resumeEventId || !chat || !canScheduleChat(chat)
    || chat.id !== trigger.targetSessionId || chat.harness !== trigger.harness
    || (chat.executionId && q.getExecution(chat.executionId)?.status !== 'active')
    || (run.status !== 'queued' && run.status !== 'running')) {
    return 'The original chat or resume schedule is no longer available.';
  }
  if (chat.coordinationHeldAt) return 'The chat is on Hold.';
  if (!q.isUnresolvedRateLimitEvent(chat.id, trigger.resumeEventId, run.id)) return 'This chat already continued.';
  if (rateLimitResumeSiblingBusy(chat, run.id)) return 'Another chat in this execution is working.';
  const failure = q.getChatEventById(trigger.resumeEventId);
  if (failure && rateLimitResumeBlock(trigger, chat, failure, Math.max(Date.now(), Date.parse(trigger.lastFiredAt ?? '') || 0))) {
    return 'The provider reported a limit that may still block this chat. Check the reset time and schedule again.';
  }
  return null;
}

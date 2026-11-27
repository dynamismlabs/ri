'use client';

import { useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Callout } from '@/components/system/callout';
import { Field } from '@/components/system/field';
import { TextArea } from '@/components/system/text-area';
import type { ChatEventDTO } from '@/lib/api/dto/chat-event';
import { useRateLimitResume } from '@/hooks/use-rate-limit-resume';

const formatTime = (at: string) => new Date(at).toLocaleString([], {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

export function RateLimitResume({ event }: { event: Pick<ChatEventDTO, 'id' | 'sessionId' | 'content'> }) {
  const { status, schedule, cancel } = useRateLimitResume(event.sessionId, event.id);
  const [prompt, setPrompt] = useState('Continue');
  const [time, setTime] = useState('');
  const data = status.data;
  const trigger = data?.trigger;
  const run = data?.run;
  const now = Date.now();
  const needsTime = !data?.resumeAt || Date.parse(data.resumeAt) <= now;
  const busy = schedule.isPending || cancel.isPending;
  const sending = run?.status === 'running' || run?.status === 'queued';
  const error = schedule.error ?? cancel.error ?? status.error;
  const chosenTime = time ? new Date(time) : null;
  const validTime = !!chosenTime && chosenTime.getTime() > now;

  return (
    <Callout tone="warning" padding="md" density="comfortable" className="space-y-2 text-xs">
      <p className="font-medium whitespace-pre-wrap">{event.content ?? 'Rate limit reached'}</p>
      {status.isPending && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Checking reset time…</p>}
      {trigger ? <>
        {!trigger.enabled ? <p>
          {trigger.disabledReason === 'rate_limit_reset_unknown'
            ? 'Resume paused. The provider reported another limit without a reset time.'
            : trigger.disabledReason === 'rate_limit_resume_cancelled' ? 'Resume cancelled.' : 'Resume paused.'}
        </p> : trigger.nextRunAt ? <p className="flex items-center gap-1.5"><Clock size={13} /> Resume scheduled for {formatTime(trigger.nextRunAt)}</p>
          : sending ? <p>{run.reason === 'rate_limit_resume_accepted' ? 'Resume message sent.' : 'Waiting to send the resume message.'}</p>
          : run?.status === 'skipped' ? <p>{run.reason === 'chat_already_continued' ? 'Resume skipped because the chat already continued.' : 'Resume skipped. See the run in Schedules.'}</p>
          : run?.status === 'failed' ? <p>{run.error ?? 'The scheduled resume failed. See the run in Schedules.'}</p>
          : <p>Resume message sent.</p>}
        {trigger.enabled && trigger.nextRunAt && <p className="whitespace-pre-wrap text-muted-foreground">{trigger.prompt}</p>}
        {(!trigger.lastFiredAt || (trigger.enabled && sending && run.reason !== 'rate_limit_resume_accepted')) && (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => {
            setPrompt(trigger.prompt);
            cancel.mutate();
          }}>{trigger.disabledReason === 'rate_limit_reset_unknown' && data.actionable ? 'Choose a new time' : 'Cancel resume'}</Button>
        )}
      </> : data?.actionable && <div className="space-y-2">
        <p className="text-muted-foreground">{needsTime
          ? 'Choose a time to resume this chat. There is no upcoming reset time from the provider.'
          : `Resume this chat after the limit resets, at ${formatTime(data.resumeAt!)}.`}</p>
        <TextArea label="Resume message" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          rows={2} maxLength={20_000} required disabled={busy} controlClassName="w-full" />
        {needsTime && <Field label="Resume time" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} required disabled={busy} />}
        <Button type="button" variant="primary" size="sm" disabled={busy || !prompt.trim() || (needsTime && !validTime)}
          onClick={() => schedule.mutate({ prompt, ...(needsTime && chosenTime ? { runAt: chosenTime.toISOString() } : {}) })}>
          {schedule.isPending ? <Loader2 className="animate-spin" /> : <Clock />} Schedule resume
        </Button>
        <p className="text-muted-foreground">Sends once in this chat while Ri is running. Continuing sooner skips the scheduled message.</p>
      </div>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
    </Callout>
  );
}

'use client';
import { TextArea } from '@/components/system/text-area';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
/**
 * Schedule this chat: the clock in a chat's header. It opens a small form
 * (how often, the message, and whether each run starts a new chat) and,
 * once the chat has a schedule, becomes a chip that says when it next runs.
 * The form and the chip both cover schedules that send into this chat. One
 * that starts a new chat each time lives in the Schedules window like any
 * other. The composer's + menu opens the same form, in a dialog, since not
 * every chat has a header (`ScheduleChatDialog`).
 */

import { useState } from 'react';
import { Clock, Loader2, Pause, Pencil, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tip';
import { APP_NAME } from '@/constants/app';
import type { TriggerWithLastRun } from '@/db/types';
import { useSession } from '@/hooks/use-execution';
import { useCreateTrigger, useTriggers, useUpdateTrigger } from '@/hooks/use-triggers';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { openSchedulesWindow } from '@/lib/client/schedules-window';
import { describeFrequency } from '@/lib/scheduler/frequency';
import { CHECK_IN_MESSAGE, canScheduleChat, chatScheduleInput } from '@/lib/triggers/chat-schedule';
import { cn } from '@/lib/utils';
import { TriggerScheduleFields, scheduleChoiceResult, type ScheduleChoice } from './trigger-schedule-fields';

/** What a chat can be scheduled on: no manual or webhook runs, it's about time. */
const CHAT_KINDS = ['every', 'cron', 'at'] as const;

function nextRunLabel(trigger: Pick<TriggerWithLastRun, 'kind' | 'nextRunAt' | 'timezone'>): string | null {
  if (!trigger.nextRunAt) return null;
  const at = new Date(trigger.nextRunAt);
  // A one-time run past its time goes as soon as it can, usually when the chat is free.
  if (trigger.kind === 'at' && at <= new Date()) return 'waiting';
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ScheduleChatButton({
  sessionId,
  compact = false,
  size = "sm",
  className,
}: {
  sessionId: string | null;
  /** A phone header: the clock alone, lit while scheduled, so the title keeps its room. */
  compact?: boolean;
  size?: "xs" | "sm" | "md" | "touch";
  className?: string;
}) {
  const { data: chat } = useSession(sessionId);
  const { data: triggers } = useTriggers({ targetKind: 'session' });
  const [open, setOpen] = useState(false);
  if (!chat || !canScheduleChat(chat)) return null;

  const mine = (triggers ?? []).filter((t) => t.targetSessionId === chat.id);
  const live = mine.filter((t) => t.enabled);
  const first = live[0];
  const chip = live.length > 1
    ? `${live.length} schedules`
    : first
      ? [describeFrequency(first), nextRunLabel(first)].filter(Boolean).join(' · next ')
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tip label={chip ? 'This chat is scheduled. Change or pause it.' : 'Send this chat a message on a schedule'}>
          <Button
            type="button"
            aria-label={chip ? `Scheduled: ${chip}` : 'Schedule'}
            variant={chip && !compact ? "secondary" : "ghost"}
            size={size}
            icon={compact || !chip}
            className={cn("flex min-w-0 flex-shrink-0 items-center gap-1", className)}
          >
            <Clock size={compact ? 16 : 13} className={chip ? 'text-primary' : undefined} />
            {chip && !compact && <span className="max-w-[12rem] truncate">{chip}</span>}
          </Button>
        </Tip>
      </PopoverTrigger>
      {/* Built only while open: every chat header carries this button. */}
      {open && <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] max-h-[min(80vh,40rem)] overflow-y-auto p-0">
        <ChatSchedules chat={chat} mine={mine} onDone={() => setOpen(false)} />
      </PopoverContent>}
    </Popover>
  );
}

/** The same form from the composer's + menu, built only while open. */
export function ScheduleChatDialog({ sessionId, open, onOpenChange }: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-sm">
        <DialogTitle className="sr-only">Schedule this chat</DialogTitle>
        {open && <ScheduleDialogBody sessionId={sessionId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialogBody({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const { data: chat } = useSession(sessionId);
  const { data: triggers } = useTriggers({ targetKind: 'session' });
  if (!chat) return null;
  return (
    <div className="max-h-[min(80vh,40rem)] overflow-y-auto">
      <ChatSchedules chat={chat} mine={(triggers ?? []).filter((t) => t.targetSessionId === chat.id)} onDone={onDone} />
    </div>
  );
}

function ChatSchedules({ chat, mine, onDone }: {
  chat: Parameters<typeof chatScheduleInput>[0];
  mine: TriggerWithLastRun[];
  onDone: () => void;
}) {
  return (
    <>
      {mine.length > 0 && (
        <div className="border-b border-border p-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Scheduled for this chat</p>
          {mine.map((t) => <ScheduledRow key={t.id} trigger={t} onEdit={() => { onDone(); openSchedulesWindow({ triggerId: t.id }); }} />)}
        </div>
      )}
      <NewChatSchedule chat={chat} startOpen={mine.length === 0} onDone={onDone} />
    </>
  );
}

function ScheduledRow({ trigger, onEdit }: { trigger: TriggerWithLastRun; onEdit: () => void }) {
  const update = useUpdateTrigger();
  const next = trigger.enabled ? nextRunLabel(trigger) : null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-2">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground">
          {describeFrequency(trigger)}
          <span className="font-normal text-muted-foreground">{trigger.enabled ? (next ? ` · next ${next}` : '') : ' · paused'}</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{trigger.prompt}</p>
      </div>

        <IconButton
          type="button"
          onClick={() => update.mutate({ id: trigger.id, enabled: !trigger.enabled })}
          disabled={update.isPending}
          label={trigger.enabled ? 'Pause schedule' : 'Resume schedule'}
          tooltip={trigger.enabled ? 'Pause' : 'Resume'}
          variant="ghost"
          size="sm"
        >
          {trigger.enabled ? <Pause size={12} /> : <Play size={12} />}
        </IconButton>

        <IconButton
          type="button"
          onClick={onEdit}
          label="Edit schedule"
          tooltip="Change everything about it in Schedules"
          variant="ghost"
          size="sm"
        >
          <Pencil size={12} />
        </IconButton>

    </div>
  );
}

function NewChatSchedule({
  chat,
  startOpen,
  onDone,
}: {
  chat: Parameters<typeof chatScheduleInput>[0];
  startOpen: boolean;
  onDone: () => void;
}) {
  const create = useCreateTrigger();
  const { data: workspaces } = useWorkspaces();
  const [expanded, setExpanded] = useState(startOpen);
  const [schedule, setSchedule] = useState<ScheduleChoice>(() => ({
    kind: 'every', intervalSeconds: 3600, time: '09:00', weekday: 1, dayOfMonth: 1, cronExpression: '0 9 * * 1-5',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }));
  const [prompt, setPrompt] = useState(CHECK_IN_MESSAGE);
  const [freshChat, setFreshChat] = useState(false);

  if (!expanded) {
    return (
      <div className="p-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-muted/60"
        >
          Add another schedule
        </button>
      </div>
    );
  }

  const result = scheduleChoiceResult(schedule);
  const agent = workspaces?.find((w) => w.id === chat.workspaceId);
  const where = agent ? `the ${agent.name} agent` : APP_NAME;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!result.schedule || !prompt.trim()) return;
    create.mutate(chatScheduleInput(chat, { prompt, freshChat, schedule: result.schedule, timezone: schedule.timezone }), {
      onSuccess: ({ trigger }) => {
        onDone();
        toast.success(freshChat ? 'Scheduled a new chat each time' : 'Scheduled this chat', {
          description: describeFrequency(trigger),
          action: { label: 'Edit', onClick: () => openSchedulesWindow({ triggerId: trigger.id }) },
        });
      },
    });
  }

  return (
    <form onSubmit={save} className="space-y-3 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Schedule this chat</p>
      <TriggerScheduleFields value={schedule} onChange={setSchedule} kinds={CHAT_KINDS} disabled={create.isPending} />
      <TextArea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        required
        placeholder={
          freshChat ? 'What should each new chat do?' : 'What should this chat do each time?'
        }
        controlClassName="block w-full"
        resize="vertical"
        label="Message"
        className="block"
      />
      <div className="flex items-start gap-2">
        <Switch
          id={`fresh-chat-${chat.id}`}
          size="sm"
          checked={freshChat}
          onCheckedChange={(next) => {
            setFreshChat(next);
            // The check-in message only makes sense in this chat.
            if (next && prompt === CHECK_IN_MESSAGE) setPrompt('');
            if (!next && !prompt.trim()) setPrompt(CHECK_IN_MESSAGE);
          }}
          className="mt-0.5"
        />
        <label htmlFor={`fresh-chat-${chat.id}`} className="min-w-0 text-[12px]">
          <span className="font-medium text-foreground">Start a new chat each time</span>
          <span className="block text-[11px] text-muted-foreground">
            {freshChat
              ? `Each run starts a fresh chat in ${where} with only this message.`
              : 'Each run arrives here as a message, and this chat picks up where it left off. A run while it\u2019s busy is skipped.'}
          </span>
        </label>
      </div>
      {create.error && <p role="alert" className="text-[12px] text-destructive">{(create.error as Error).message}</p>}
      <div className="flex items-center justify-end gap-2">
        {!startOpen && (
          <Button
            type="button"
            onClick={() => setExpanded(false)}
            variant="ghost"
            size="sm"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={!result.schedule || !prompt.trim() || create.isPending}
          variant="primary"
          size="md"
          className="inline-flex items-center gap-1.5"
        >
          {create.isPending && <Loader2 size={12} className="animate-spin" />}
          Schedule it
        </Button>
      </div>
    </form>
  );
}

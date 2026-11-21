'use client';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
/**
 * The Schedules window. Opened from the rail and from a chat's Schedule
 * button (src/lib/client/schedules-window.ts), mounted once in the
 * dashboard. Its body is one of:
 *
 *   - `list`: every schedule, with pause/resume and "New scheduled task"
 *   - `edit`: one schedule, every field editable (`TriggerDetail`), with
 *     its builder chat beside it
 *   - `new`: the empty form with the new-schedule chat beside it. When the
 *     chat creates the schedule, the window opens it and the conversation
 *     comes along (`useScheduleChat`'s `movedTo`).
 *   - `webhook`: a new webhook's secret, shown only once
 *
 * The /triggers pages show the same parts for deep links.
 */

import { useEffect, useLayoutEffect, useRef, useState, type MouseEventHandler } from 'react';
import { ArrowLeft, Clock, Pause, Play, Plus, X } from 'lucide-react';
import { useTrigger, useTriggers, useUpdateTrigger } from '@/hooks/use-triggers';
import { describeFrequency } from '@/lib/scheduler/frequency';
import { closeSchedulesWindow, useSchedulesWindow } from '@/lib/client/schedules-window';
import { NEW_SCHEDULE_REF } from '@/lib/triggers/schedule-chat';
import {
  TriggerCreateForm,
  WebhookCredentialsPanel,
  type WebhookCredentials,
} from './trigger-create-form';
import { TriggerDetail } from './trigger-detail';
import { ScheduleChatPanel } from './schedule-chat-panel';
import { useAdoptMovedScheduleChat, useScheduleChat } from './use-schedule-chat';
import { cn } from '@/lib/utils';
import type { TriggerWithLastRun } from '@/db/types';
import { isReservedTrigger } from '@/lib/triggers/reserved';
import { isTriggerInactive } from '@/lib/triggers/inactive';
import { overdueLabel } from '@/lib/triggers/lateness';
import { useFoldShown } from '@/lib/client/rail-fold';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { FoldRow } from '@/components/workspaces/fold-row';
import { findProvider } from '@/lib/harness/options';
import { AwakeNote } from '@/components/triggers/awake-note';
import { Tip } from '@/components/ui/tip';

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'webhook'; credentials: WebhookCredentials };

export function TriggersModal() {
  const { open, openId, triggerId } = useSchedulesWindow();
  if (!open) return null;
  return <SchedulesWindow key={openId} triggerId={triggerId} />;
}

function SchedulesWindow({ triggerId }: { triggerId: string | null }) {
  const [view, setView] = useState<View>(() => triggerId ? { kind: 'edit', id: triggerId } : { kind: 'list' });
  const listButton = useRef<HTMLButtonElement | null>(null);
  const backButton = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (view.kind === 'list') listButton.current?.focus({ preventScroll: true });
    else backButton.current?.focus({ preventScroll: true });
  }, [view.kind]);

  // Escape closes the window, unless something inside it (a menu, the
  // chat's composer) already used the key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeSchedulesWindow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const withChat = view.kind === 'new' || view.kind === 'edit';
  const toList = () => setView({ kind: 'list' });

  return (
    <div data-slot="dialog-overlay"
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closeSchedulesWindow}
      role="dialog"
      aria-modal="true"
      aria-label="Schedules and Triggers"
    >
      <div
        data-slot="dialog-content"
        // Height: capped at 88% of the viewport and ~896px, floored for short
        // screens, in rem so it scales with the user's font size. A steady
        // height keeps the window from jumping between views; the body
        // scrolls instead. Wider with the chat beside the form.
        className={cn(
          'w-full h-[min(88vh,56rem)] min-h-[36rem] bg-background border border-border rounded-lg shadow-2xl flex flex-col',
          withChat ? 'max-w-6xl' : 'max-w-4xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Header view={view} onBack={toList} backButton={backButton} />

        {/* Keep the list's scroll position and buttons when switching to a detail. */}
        <div hidden={view.kind !== 'list'} className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          <ListBody
            onNew={(e) => {
              listButton.current = e.currentTarget;
              setView({ kind: 'new' });
            }}
            onOpen={(id, button) => {
              listButton.current = button;
              setView({ kind: 'edit', id });
            }}
          />
        </div>
        {view.kind === 'new' && (
          <NewBody
            onOpen={(id) => setView({ kind: 'edit', id })}
            onWebhook={(credentials) => setView({ kind: 'webhook', credentials })}
            onCancel={toList}
          />
        )}
        {view.kind === 'edit' && <EditBody key={view.id} id={view.id} onGone={toList} />}
        {view.kind === 'webhook' && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <WebhookCredentialsPanel
              publicId={view.credentials.publicId}
              secret={view.credentials.secret}
              onContinue={toList}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** The form on the left and the schedule's chat on the right; stacked on a phone. */
function WithChat({ children, chat }: { children: React.ReactNode; chat: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
      <div className="md:flex-1 md:min-w-0 md:overflow-y-auto px-6 py-5">{children}</div>
      <div className="h-[32rem] md:h-auto md:w-[26rem] flex-shrink-0 border-t md:border-t-0 md:border-l border-border min-h-0">
        {chat}
      </div>
    </div>
  );
}

function NewBody({
  onOpen,
  onWebhook,
  onCancel,
}: {
  onOpen: (id: string) => void;
  onWebhook: (credentials: WebhookCredentials) => void;
  onCancel: () => void;
}) {
  const chat = useScheduleChat(NEW_SCHEDULE_REF);
  const adopt = useAdoptMovedScheduleChat();
  // The chat made the schedule: open it, with the conversation beside it.
  const movedTo = chat.movedTo;
  useEffect(() => {
    if (!movedTo) return;
    adopt(NEW_SCHEDULE_REF, movedTo);
    onOpen(movedTo);
  }, [movedTo, adopt, onOpen]);

  return (
    <WithChat chat={<ScheduleChatPanel chat={chat} scheduleRef={NEW_SCHEDULE_REF} />}>
      <TriggerCreateForm
        onCreated={(trigger, webhook) => (webhook ? onWebhook(webhook) : onOpen(trigger.id))}
        onCancel={onCancel}
      />
    </WithChat>
  );
}

function EditBody({ id, onGone }: { id: string; onGone: () => void }) {
  const { data: trigger, isLoading, error } = useTrigger(id);
  const chat = useScheduleChat(id);
  return (
    <WithChat chat={<ScheduleChatPanel chat={chat} scheduleRef={id} />}>
      {trigger ? (
        <TriggerDetail trigger={trigger} onDeleted={onGone} onNavigateAway={closeSchedulesWindow} />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{error ? 'This schedule could not be loaded.' : 'This schedule no longer exists.'}</p>
          <Button
            type="button"
            onClick={onGone}
            variant="link"
            size="sm"
          >
            Back to all schedules
          </Button>
        </div>
      )}
    </WithChat>
  );
}

// ── Window chrome ────────────────────────────────────────────

function Header({ view, onBack, backButton }: {
  view: View;
  onBack: () => void;
  backButton: React.Ref<HTMLButtonElement>;
}) {
  const editing = view.kind === 'edit' ? view.id : null;
  const { data: trigger } = useTrigger(editing);
  const title =
    view.kind === 'list'
      ? 'Schedules and Triggers'
      : view.kind === 'new'
        ? 'New scheduled task'
        : view.kind === 'webhook'
          ? 'Webhook ready'
          : trigger?.name ?? 'Schedule';

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      {view.kind !== 'list' ? (
        <Button
          ref={backButton}
          type="button"
          onClick={onBack}
          variant="secondary"
          size="sm"
          className="flex shrink-0 items-center gap-1.5"
        >
          <ArrowLeft size={16} />
          All schedules
        </Button>
      ) : (
        <Clock size={16} className="text-primary mx-1.5" />
      )}
      <h2 className="text-sm font-semibold truncate">{title}</h2>
      {trigger && view.kind === 'edit' && (
        <span className="hidden sm:block flex-shrink-0 text-[11px] text-muted-foreground truncate">
          {describeFrequency(trigger)}
          {trigger.enabled ? '' : ' · paused'}
        </span>
      )}
      <div className="flex-1" />
      <IconButton
        type="button"
        onClick={closeSchedulesWindow}
        label="Close"
        variant="secondary"
        size="sm"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}

// ── List body ────────────────────────────────────────────────

function ListBody({
  onNew,
  onOpen,
}: {
  onNew: MouseEventHandler<HTMLButtonElement>;
  onOpen: (id: string, button: HTMLButtonElement) => void;
}) {
  const { data: triggers, isLoading } = useTriggers();
  const updateTrigger = useUpdateTrigger();
  // Paused triggers and one-time ones that already fired fold below the rest,
  // the same toggle as every other list (src/lib/triggers/inactive.ts).
  const [inactiveShown, setInactiveShown] = useFoldShown('inactive:triggers');

  const hasContent = !!triggers && triggers.length > 0;
  const active = (triggers ?? []).filter((t) => !isTriggerInactive(t));
  const inactive = (triggers ?? []).filter((t) => isTriggerInactive(t));
  const row = (s: TriggerWithLastRun) => (
    <Row
      key={s.id}
      trigger={s}
      onToggle={(enabled) => updateTrigger.mutate({ id: s.id, enabled })}
      onOpen={(e) => onOpen(s.id, e.currentTarget)}
    />
  );

  return (
    <div className="space-y-3">
      {hasContent && (
        // With existing rows above/below, the "+ New" button lives in
        // a header strip — auto-width, right-aligned so it doesn't
        // dominate the visual hierarchy.
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            {triggers.length} trigger{triggers.length === 1 ? '' : 's'}
          </p>
          <NewTriggerButton onClick={onNew} />
        </div>
      )}
      {hasContent && <AwakeNote lead="Schedules run" />}

      {isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
      )}

      {!isLoading && !hasContent && <EmptyState onNew={onNew} />}

      {hasContent && (
        <div className="space-y-1.5">
          {active.map(row)}
          {inactive.length > 0 && (
            <>
              {inactiveShown && <div className="space-y-1.5 opacity-60">{inactive.map(row)}</div>}
              <FoldRow
                label={`${inactive.length} paused or finished`}
                shown={inactiveShown}
                onToggle={() => setInactiveShown(!inactiveShown)}
                rowClassName="py-1.5 text-[11px]"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewTriggerButton({ onClick }: { onClick: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="primary"
      size="md"
      className="inline-flex items-center gap-1.5"
    >
      <Plus size={14} />
      New scheduled task
    </Button>
  );
}

function EmptyState({ onNew }: { onNew: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3">
      <div className="p-3 rounded-full bg-primary/10 text-primary">
        <Plus size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">No triggers yet</p>
        <p className="text-[12px] text-muted-foreground max-w-xs">
          Save a prompt that runs on a cadence or on demand. Daily
          briefings, inbox triage, webhook handlers, anything the
          agent can do.
        </p>
      </div>
      <NewTriggerButton onClick={onNew} />
    </div>
  );
}

function Row({
  trigger,
  onToggle,
  onOpen,
}: {
  trigger: TriggerWithLastRun;
  onToggle: (enabled: boolean) => void;
  onOpen: MouseEventHandler<HTMLButtonElement>;
}) {
  const cadence = describeFrequency({
    kind: trigger.kind,
    cronExpression: trigger.cronExpression,
    intervalSeconds: trigger.intervalSeconds,
    runAt: trigger.runAt,
    timezone: trigger.timezone,
  });
  const overdue = overdueLabel(trigger);
  return (
    <div data-slot="schedule-row" className="flex items-center gap-3 p-3 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors">

        <IconButton
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!trigger.enabled);
          }}
          label={trigger.enabled ? 'Pause' : 'Resume'}
          tooltip={trigger.enabled ? 'Pause trigger' : 'Resume trigger'}
          variant="secondary"
          size="sm"
          className="flex-shrink-0"
        >
          {trigger.enabled ? <Play size={12} /> : <Pause size={12} />}
        </IconButton>


      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{trigger.name}</p>
          {isReservedTrigger(trigger.id) && (
            <Tip label="Managed by the app. Its schedule and who runs it can change, the rest is fixed.">
              <span
                data-slot="status-badge"
                className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-medium bg-muted text-muted-foreground"
              >
                Managed
              </span>
            </Tip>
          )}
          {trigger.lastRunStatus && (
            <span data-slot="status-badge"
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-medium',
                trigger.lastRunStatus === 'completed' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                trigger.lastRunStatus === 'failed' && 'bg-destructive/10 text-destructive',
                trigger.lastRunStatus === 'skipped' && 'bg-muted text-muted-foreground',
              )}
            >
              {trigger.lastRunStatus}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {cadence}
          {trigger.targetKind === 'session'
            ? ' · sends to a chat'
            : trigger.provider && ` · ${findProvider(trigger.provider)?.name ?? trigger.provider}`}
          {trigger.lastFiredAt && ` · ran ${ranAgo(trigger.lastFiredAt)}`}
        </p>
        {overdue && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 truncate">{overdue}</p>}
      </button>

    </div>
  );
}

/** "now", "5m ago", "3d ago", or a date for anything older than a month. */
function ranAgo(at: string): string {
  const rel = formatCompactRelative(at);
  return rel === 'now' || /^[A-Z]/.test(rel) ? rel : `${rel} ago`;
}

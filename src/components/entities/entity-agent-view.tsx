'use client';
import { MenuAction } from '@/components/system/menu-action';

import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea';
import { TextArea } from '@/components/system/text-area';

import { SegmentedControl } from '@/components/system/segmented-control';

import { Button } from '@/components/system/button';
import type { DocumentChatHandle } from '@/components/ai-elements/slideout-chat';
import { HarnessChatSession } from '@/components/chat/harness-chat';
import { EntityBriefCard } from '@/components/entities/entity-brief-card';
import { EntityChangeBanner } from '@/components/chat-ui/edits/entity-change-banner';
import { AreaSelect } from '@/components/shared/area-select';
import { LifecycleStatusControl } from '@/components/tasks/lifecycle-status-control';
import { SubtaskSection } from '@/components/tasks/subtask-section';
import type { Effort, Energy, TaskRecord } from '@/db/types';
import { useEntityBrief } from '@/hooks/use-entity-brief';
import { useSendMessage, useSessionEvents } from '@/hooks/use-execution';
import { useNote, useUpdateNote } from '@/hooks/use-notes';
import { useTask, useUpdateTask } from '@/hooks/use-tasks';
import { apiErrorStatus, apiErrorText } from '@/lib/api/client';
import { calendarDaysUntil, formatLocalDate, isPastDate } from '@/lib/dates';
import { TaskDatePicker } from '@/components/tasks/task-date-field';
import { cn } from '@/lib/utils';
import { Clock, Flame, Loader2, RefreshCw, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The agent-first surface for one note or task.
 *
 * The inversion this trial tests: the document is not what you look at, it is
 * what the agent maintains. What you look at is the agent's brief of it, and
 * what you do is talk. Reading, adding, changing, and removing all go through
 * the focused conversation, whose edits are versioned with diff + undo. The
 * classic editor ("Document") is one click away for the words themselves.
 *
 * Two regions: a top region (title, the few exact fields worth a click, the
 * brief) that takes the space it needs up to about half the height, and the
 * conversation below it. Single column, so it is the same on a phone.
 */
export function EntityAgentView({
  entityType,
  entityId,
  chat,
  onOpenDocument,
  onOpenTask,
}: {
  entityType: 'task' | 'note';
  entityId: string;
  chat: DocumentChatHandle;
  onOpenDocument: () => void;
  onOpenTask?: (id: string) => void;
}) {
  const { data: task } = useTask(entityType === 'task' ? entityId : null);
  const { data: note } = useNote(entityType === 'note' ? entityId : null);
  const entity = entityType === 'task' ? task : note;
  const aiBusy = chat.status === 'streaming' || chat.status === 'submitted';
  const updateTask = useUpdateTask();
  const updateNote = useUpdateNote();
  const setArea = useCallback(
    (areaId: string | null) => {
      if (entityType === 'task') updateTask.mutate({ id: entityId, areaId });
      else updateNote.mutate({ id: entityId, areaId });
    },
    [entityType, entityId, updateTask, updateNote],
  );
  // A narrow screen gets the short placeholder. Enter follows the device in
  // the editor itself (`useTouchFirst`), the same in every chat.
  const narrow = useIsNarrow();

  const brief = useEntityBrief(entityType, entityId);
  const sendMessage = useSendMessage(chat.sessionId ?? '');
  const canSend = !!chat.sessionId && !aiBusy;
  // Only to know whether the conversation is empty (for the hint); the
  // transcript inside HarnessChatSession reads the same cache.
  const { data: events, isLoading: eventsLoading } = useSessionEvents(chat.sessionId);
  const conversationEmpty = !!chat.sessionId && !eventsLoading && (events?.length ?? 0) === 0 && !aiBusy;

  const sendSuggestion = useCallback(
    (text: string) => {
      if (!chat.sessionId) return;
      void sendMessage.mutateAsync(text);
    },
    [chat.sessionId, sendMessage],
  );

  const isNew = !!entity && !(entity.title ?? '').trim() && !(entity.body ?? '').trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top region: identity, exact fields, brief. */}
      <div className="flex-[0_1_auto] min-h-0 max-h-[55dvh] overflow-y-auto border-b border-border/60">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-3 md:px-8">
          {!entity ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <EntityChangeBanner entityType={entityType} entityId={entityId} />
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">
                  {entityType === 'task' ? ((task as TaskRecord).parentId ? 'Subtask' : 'Task') : 'Note'}
                </span>
                <span className="text-muted-foreground/30">&middot;</span>
                <AreaSelect value={entity.areaId} onChange={setArea} />
              </div>

              <EntityTitle entityType={entityType} entityId={entityId} title={entity.title ?? ''} disabled={aiBusy} />

              {entityType === 'task' && task && <TaskMetaStrip task={task} />}
              {entityType === 'task' && task && (
                <div className="-mx-4 md:-mx-12">
                  <SubtaskSection parentId={task.id} onOpenTask={(id) => onOpenTask?.(id)} />
                </div>
              )}

              <div className="pt-3">
                <EntityBriefCard
                  entityType={entityType}
                  body={entity.body ?? ''}
                  brief={brief}
                  onSuggestion={sendSuggestion}
                  onOpenDocument={onOpenDocument}
                  canSend={canSend}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Conversation: the way in. */}
      <div className="relative flex min-h-[220px] flex-1 flex-col">
        {conversationEmpty && entity && (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-0 px-6 text-center text-[11.5px] text-muted-foreground/60">
            {isNew
              ? 'Nothing here yet. Tell me about it and I will write it up.'
              : `Nothing asked yet. Ask a question, add a thought, or pick a suggestion above. Every edit I make shows a diff you can undo.`}
          </div>
        )}
        {chat.isLoading || chat.newChat.isPending || !entity ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : chat.error || !chat.sessionId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <p className="text-[12px] font-semibold text-foreground">Couldn&apos;t start the agent.</p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {apiErrorStatus(chat.error) !== undefined ? apiErrorText(chat.error) : 'The agent may not be set up yet.'}
              </p>
              <Button
                onClick={() => chat.refetch()}
                variant="ghost"
                size="sm"
                className="mt-3 inline-flex items-center gap-1"
              >
                <RefreshCw size={11} /> Retry
              </Button>
            </div>
          </div>
        ) : (
          <HarnessChatSession
            sessionId={chat.sessionId}
            // Existing document: the conversation is the front door, so the
            // caret lands here. New document: the title wins (see EntityTitle).
            autoFocusComposer={!isNew}
            composerPlaceholder={
              narrow
                ? isNew
                  ? `Describe this ${entityType}`
                  : 'Ask or add anything. Or just talk.'
                : isNew
                  ? `Describe this ${entityType}, or paste anything in. I'll write it up.`
                  : `Ask, add, change, or remove anything in this ${entityType}. Or just talk.`
            }
            onSwitchProvider={(next) =>
              chat.newChat.mutate({
                providerId: next.harness,
                model: next.model,
                variant: next.variant,
                effort: next.effort,
                serviceTier: next.serviceTier,
              })
            }
            switchingProvider={chat.newChat.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ─── Title ────────────────────────────────────────────────────────

/**
 * Uncontrolled, debounced, autosized title. Kept editable in the agent view
 * because renaming is cheap and exact; routing it through a model turn would
 * be silly. Enter moves the caret to the composer (the next thing you do).
 */
function EntityTitle({
  entityType,
  entityId,
  title,
  disabled,
}: {
  entityType: 'task' | 'note';
  entityId: string;
  title: string;
  disabled: boolean;
}) {
  const { element: ref, ref: attachTitle, resize } = useAutosizeTextarea();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateTask = useUpdateTask();
  const updateNote = useUpdateNote();

  // Seed and sync from the record when it changes elsewhere (agent rename).
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.value.trim() !== title.trim()) el.value = title.trim() ? title : '';
    resize();
  }, [title, entityId, resize, ref]);

  // A brand-new entity: the title owns the caret.
  useEffect(() => {
    const el = ref.current;
    if (!el || title.trim()) return;
    const raf = requestAnimationFrame(() => el.focus());
    return () => cancelAnimationFrame(raf);
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(
    (value: string) => {
      if (entityType === 'task') updateTask.mutate({ id: entityId, title: value });
      else updateNote.mutate({ id: entityId, title: value });
    },
    [entityType, entityId, updateTask, updateNote],
  );

  return (
    <TextArea
      ref={attachTitle}
      aria-label={entityType === 'task' ? 'Task title' : 'Note title'}
      rows={1}
      defaultValue={title.trim() ? title : ''}
      disabled={disabled}
      placeholder={entityType === 'task' ? 'Task title' : 'Untitled note'}
      onInput={(e) => {
        resize();
        const value = e.currentTarget.value.trim();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save(value), 500);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) return;
        // Hand the caret to the composer; the app's own ⌘I listener owns it.
        const composer = document.querySelector<HTMLElement>(
          '[data-chat-composer] [contenteditable="true"]',
        );
        (
          composer ?? document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]')
        )?.focus();
      }}
      className="mt-1 w-full"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      purpose="title"
      titleSize="entity"
      autoSize
    />
  );
}

// ─── Task fields ──────────────────────────────────────────────────

const ENERGY_OPTIONS: { value: Energy; label: string; icon: typeof Flame; color: string }[] = [
  { value: 'deep', label: 'Deep', icon: Flame, color: 'text-orange-500' },
  { value: 'light', label: 'Light', icon: Zap, color: 'text-sky-400' },
];

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: 'trivial', label: 'XS' },
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
  { value: 'epic', label: 'XL' },
];

/**
 * The exact fields worth a click: status, deadline, energy, effort. These are
 * cheap and precise, so they stay direct instead of going through a model
 * turn. Everything about the body goes through the conversation.
 */
function TaskMetaStrip({ task }: { task: TaskRecord }) {
  const updateTask = useUpdateTask();
  const save = useCallback(
    (patch: Partial<TaskRecord>) => updateTask.mutate({ id: task.id, ...patch } as Parameters<typeof updateTask.mutate>[0]),
    [task.id, updateTask],
  );

  const deadlineLabel = (() => {
    const days = calendarDaysUntil(task.hardDeadline);
    if (days === null) return null;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return formatLocalDate(task.hardDeadline, { month: 'short', day: 'numeric' });
  })();

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      <LifecycleStatusControl taskId={task.id} status={task.status} className="-ml-1.5" />
      <span className="text-muted-foreground/30">&middot;</span>

      <TaskDatePicker
        label="Deadline"
        value={task.hardDeadline}
        onChange={(hardDeadline) => save({ hardDeadline } as Partial<TaskRecord>)}
      >
        <MenuAction density="compact" tone="error"
          type="button"
          className={cn("inline-flex items-center gap-1", isPastDate(task.hardDeadline) ? "" : "")}
        >
          <Clock size={10} />
          {deadlineLabel ?? 'Deadline'}
        </MenuAction>
      </TaskDatePicker>

      <span className="text-muted-foreground/30">&middot;</span>
      <SegmentedControl<Energy>
        mode="choice"
        allowEmpty
        ariaLabel="Energy"
        value={task.energy}
        onChange={(energy) => save({ energy })}
        options={ENERGY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label, icon: <opt.icon /> }))}
      />

      <span className="text-muted-foreground/30">&middot;</span>
      <SegmentedControl<Effort>
        mode="choice"
        allowEmpty
        ariaLabel="Effort"
        value={task.effort}
        onChange={(effort) => save({ effort })}
        options={EFFORT_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          hint: 'Effort: ' + opt.value,
        }))}
      />
    </div>
  );
}

// ─── Viewport ─────────────────────────────────────────────────────

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return narrow;
}

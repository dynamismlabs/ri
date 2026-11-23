"use client";

import { Meta, MetaItem } from '@/components/system/meta';
import { InlineAction } from '@/components/system/inline-action';
import { StreamToolbar, type StreamViewFilter as ViewFilter } from './stream-toolbar';

import { IconButton } from '@/components/system/icon-button';

/**
 * The stream tab: a calm ledger of captures, not a work queue (spec §3.12).
 *
 * - Default view is Recent. "Needs your call" appears only when non-empty.
 *   Power filters (per-status history) live behind a small dropdown.
 * - No unprocessed-count badges anywhere — the ambient signal is binary.
 * - Raw text is immutable: no editing affordance. Corrections happen on the
 *   derived task/note.
 * - Every row shows its consequences ("Became a task", "Added to …") with
 *   tap-through, and undo/reopen where applicable.
 */

import { useState, useCallback } from 'react';
import {
  Loader2, Mic, MessageSquare, Inbox, Archive, BookOpen,
  RotateCcw, RefreshCw, Target, FileText, Clock,
} from 'lucide-react';
import {
  useStream,
  useProposedDecisions,
  useTriageDecide,
  useReopenStream,
  useRetryStream,
  useStartTriageSweep,
} from '@/hooks/use-stream';
import { useDashboard } from '@/contexts/dashboard-context';
import { cn } from '@/lib/utils';
import { StreamTriage } from './stream-triage';
import { StreamDigest } from './stream-digest';
import { TaskActions, NoteActions } from './promote-actions';
import { StreamAttachments } from './stream-attachments';
import type { StreamRecordWithOutcomes, StreamStatus } from '@/db/types';
import { Tip } from '@/components/ui/tip';

const SOURCE_ICONS: Record<string, typeof Mic> = {
  capture: Inbox,
  chat: MessageSquare,
  webhook: Inbox,
};

/** Calm vocabulary (spec §1.10). Internal status names never render. */
const STATUS_LABELS: Record<StreamStatus, string> = {
  pending: 'Captured',
  proposed: 'Needs your call',
  promoted: '',
  reviewed: 'Kept as a thought',
  dismissed: 'Set aside',
  incubating: 'Kept for later',
};

const STATUS_COLORS: Record<StreamStatus, string> = {
  pending: 'bg-amber-500',
  proposed: 'bg-primary',
  promoted: 'bg-emerald-500',
  reviewed: 'bg-violet-400',
  dismissed: 'bg-muted-foreground',
  incubating: 'bg-sky-400',
};

function isPreprocessingPlaceholder(item: StreamRecordWithOutcomes): boolean {
  const head = item.rawText.trimStart();
  return (
    head.startsWith('[Voice memo, transcription failed]') ||
    head.startsWith('[Voice memo, pending transcription]') ||
    head.startsWith('[Images, extraction pending]')
  );
}

export function StreamList() {
  const { theme, openTask, openNote } = useDashboard();
  const isDark = theme === 'dark';

  const [view, setView] = useState<ViewFilter>('recent');
  const [triageOpen, setTriageOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filter = view === 'recent' || view === 'needs_call'
    ? {}
    : { status: view as StreamStatus };
  const { data: items, isLoading, error } = useStream(filter);
  const { data: proposals } = useProposedDecisions();
  const proposalCount = proposals?.length ?? 0;

  const decide = useTriageDecide();
  const reopen = useReopenStream();
  const retry = useRetryStream();
  const sweep = useStartTriageSweep();

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const handleSweep = useCallback(() => {
    sweep.mutate(undefined, {
      onSuccess: (result) => {
        if (result.started) showNotice('Working on it. The digest will appear here when done.');
        else if (result.reason === 'empty') showNotice('Nothing waiting to triage.');
        else if (result.reason === 'already_running') showNotice('A triage pass is already running.');
        else showNotice('Could not start triage right now.');
      },
      onError: () => showNotice('Could not start triage right now.'),
    });
  }, [sweep, showNotice]);

  const handleReopen = useCallback((id: string) => {
    reopen.mutate(id, {
      onError: (err) => showNotice(err instanceof Error ? err.message : 'Could not reopen this capture.'),
    });
  }, [reopen, showNotice]);

  const visibleItems = (items ?? []).filter((item) => {
    if (view === 'needs_call') return item.status === 'proposed';
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <StreamToolbar view={view} onViewChange={setView} hasProposals={proposalCount > 0}
        onReview={() => setTriageOpen(true)} onTriage={handleSweep} triaging={sweep.isPending}
        notice={notice} isDark={isDark}/>

      {/* Review slide-over (proposals + manual) */}
      <StreamTriage open={triageOpen} onOpenChange={setTriageOpen} />

      <div className="flex-1 overflow-y-auto pb-4">
        {/* Digest: what triage did, graduation offers */}
        {view === "recent" && <StreamDigest />}

        <div className="p-4">
          {isLoading && (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-32 text-destructive text-[11px]">
              Failed to load stream
            </div>
          )}
          {visibleItems.length === 0 && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Inbox size={20} className="opacity-30" />
              <p className="text-[11px]">
                {view === "needs_call" ? "Nothing needs you." : "Nothing here yet. Capture anything."}
              </p>
            </div>
          )}

          {visibleItems.length > 0 && (
            <div className="space-y-3 relative px-2 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border">
              {visibleItems.map((item) => (
                <StreamRow
                  key={item.id}
                  item={item}
                  onOpenEntity={(type, id) => (type === "task" ? openTask(id) : openNote(id))}
                  onKeepAsThought={() => decide.mutate({ disposition: "journal", streamItemIds: [item.id] })}
                  onDismiss={() => decide.mutate({ disposition: "dismiss", streamItemIds: [item.id] })}
                  onPromoteTask={(status) =>
                    decide.mutate({
                      disposition: "promote_task",
                      streamItemIds: [item.id],
                      draft: {
                        title: item.rawText.trim().split("\n")[0]?.slice(0, 200) || "Untitled",
                        body: item.rawText,
                        status,
                      },
                    })
                  }
                  onPromoteNote={() =>
                    decide.mutate({ disposition: "promote_note", streamItemIds: [item.id] })
                  }
                  onMergeTask={(taskId) =>
                    decide.mutate({
                      disposition: "merge_task",
                      streamItemIds: [item.id],
                      targetType: "task",
                      targetId: taskId,
                      draft: { asSubtask: true, title: item.rawText.trim().split("\n")[0]?.slice(0, 200) },
                    })
                  }
                  onMergeNote={(noteId) =>
                    decide.mutate({
                      disposition: "merge_note",
                      streamItemIds: [item.id],
                      targetType: "note",
                      targetId: noteId,
                    })
                  }
                  onReopen={() => handleReopen(item.id)}
                  onRetry={() =>
                    retry.mutate(item.id, {
                      onError: () =>
                        showNotice("Still not able to read it. The original is safe, try again later."),
                    })
                  }
                  onReview={() => setTriageOpen(true)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamRow({
  item,
  onOpenEntity,
  onKeepAsThought,
  onDismiss,
  onPromoteTask,
  onPromoteNote,
  onMergeTask,
  onMergeNote,
  onReopen,
  onRetry,
  onReview,
}: {
  item: StreamRecordWithOutcomes;
  onOpenEntity: (type: 'task' | 'note', id: string) => void;
  onKeepAsThought: () => void;
  onDismiss: () => void;
  onPromoteTask: (status: 'consider' | 'todo') => void;
  onPromoteNote: () => void;
  onMergeTask: (taskId: string) => void;
  onMergeNote: (noteId: string) => void;
  onReopen: () => void;
  onRetry: () => void;
  onReview: () => void;
}) {
  const SourceIcon = item.media === 'voice' ? Mic : (SOURCE_ICONS[item.source] ?? Inbox);
  const isPending = item.status === 'pending';
  const isProposed = item.status === 'proposed';
  const isSettled = item.status === 'promoted' || item.status === 'reviewed' || item.status === 'dismissed' || item.status === 'incubating';
  const needsRetry = isPending && isPreprocessingPlaceholder(item);
  const label = STATUS_LABELS[item.status];

  return (
    <div className="pl-6 relative group">
      <div className={cn(
        'absolute left-[5px] top-1.5 w-2 h-2 rounded-full z-10 ring-2 ring-background',
        STATUS_COLORS[item.status] ?? 'bg-muted-foreground',
        item.status === 'promoted' && 'opacity-40',
      )} />

      <div className={cn('flex items-start gap-2', item.status === 'promoted' && 'opacity-60', item.status === 'dismissed' && 'opacity-40')}>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[11.5px] leading-snug',
            isPending || isProposed ? 'text-foreground' : 'text-muted-foreground',
          )}>
            {item.rawText}
          </p>
          <StreamAttachments attachments={item.attachments} />

          <Meta className="flex items-center gap-2 mt-0.5 flex-wrap">
            <MetaItem kind="time"><SourceIcon aria-hidden />
              {new Date(item.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </MetaItem>

            {needsRetry && (
              <MetaItem kind="processing">
                Your recording is saved. Reading it needs another try.
              </MetaItem>
            )}

            {isProposed && (
              <MetaItem as={InlineAction} appearance="link"
                onClick={onReview}
              >
                {STATUS_LABELS.proposed}
              </MetaItem>
            )}

            {label && !isProposed && item.status !== 'pending' && (
              <MetaItem kind="status">{label}</MetaItem>
            )}

            {/* Consequences: where this capture went. */}
            {item.outcomes.map((o) => (
              <Tip key={`${o.entityType}:${o.entityId}:${o.relation}`} label={o.relation === 'created' ? 'Created from this capture' : 'This capture was added to it'}>
                <MetaItem as={InlineAction} appearance="link"
                  onClick={() => onOpenEntity(o.entityType, o.entityId)}
                  tone="success"
                  className="inline-flex items-center gap-1"
                >
                  {o.entityType === 'task' ? <Target size={8} /> : <FileText size={8} />}
                  {o.relation === 'merged_into' ? 'Added to ' : ''}
                  {o.entityTitle ?? o.entityType}
                </MetaItem>
              </Tip>
            ))}

            {item.status === 'incubating' && item.resurfaceAt && (
              <MetaItem kind="resurface" tone="info" className="inline-flex items-center gap-1">
                <Clock size={8} />
                back {new Date(item.resurfaceAt).toLocaleDateString()}
              </MetaItem>
            )}
          </Meta>
        </div>

        {/* Row actions */}
        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
          {needsRetry && (
              <IconButton
                onClick={onRetry}
                label="Try reading it again"
                tooltip="Try reading it again"
                tipSide="bottom"
                variant="ghost"
                size="sm"
              >
                <RefreshCw size={12} />
              </IconButton>
          )}
          {isPending && !needsRetry && (
            <>
              <TaskActions onPromote={onPromoteTask} onMerge={onMergeTask} />
              <NoteActions onPromote={onPromoteNote} onMerge={onMergeNote} />

                <IconButton
                  onClick={onKeepAsThought}
                  label="Keep as a thought"
                  tooltip="Keep as a thought"
                  tipSide="bottom"
                  variant="ghost"
                  size="sm"
                >
                  <BookOpen size={12} />
                </IconButton>

                <IconButton
                  onClick={onDismiss}
                  label="Set aside"
                  tooltip="Set aside"
                  tipSide="bottom"
                  variant="ghost"
                  size="sm"
                >
                  <Archive size={12} />
                </IconButton>

            </>
          )}
          {isSettled && (
              <IconButton
                onClick={onReopen}
                label="Bring it back"
                tooltip="Bring it back"
                tipSide="bottom"
                variant="ghost"
                size="sm"
              >
                <RotateCcw size={12} />
              </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}

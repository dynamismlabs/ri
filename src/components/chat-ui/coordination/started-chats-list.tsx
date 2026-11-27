'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Tip } from '@/components/ui/tip';
import { StatusPip } from '@/components/workspaces/chat-status';
import { ChatAskSize, ChatStatusLine } from '@/components/workspaces/chat-status-line';
import { FoldRow } from '@/components/workspaces/fold-row';
import { WorkspaceAvatar } from '@/components/workspaces/workspace-avatar';
import { coverAttachmentUrl } from '@/lib/attachments/view';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { isSessionUnread } from '@/lib/utils/session-sort';
import { cn } from '@/lib/utils';
import type { StartedChatRow as StartedChat } from '@/lib/db/coordination-queries';
import { isArchivableStartedChat, startedChatState, type StartedChatState } from '@/lib/sessions/started-chat-state';

export interface StartedChatsListProps {
  rows: readonly StartedChat[];
  /** The runtime's live sets: who waits on you, who's running. */
  live: { pending: ReadonlySet<string>; streaming: ReadonlySet<string> };
  /** Who started them, in the list's first line: "This chat" or "The main chat". */
  starter: string;
  onOpen: (row: StartedChat) => void;
  onArchive: (row: StartedChat) => void;
  onArchiveFinished: () => void;
  archivingFinished?: boolean;
  loading?: boolean;
}

const ORDER: Record<StartedChatState, number> = { needs_you: 0, working: 1, returned: 2, failed: 2, cancelled: 2 };

const STATE_WORD: Partial<Record<StartedChatState, { word: string; tone: string }>> = {
  working: { word: 'Working', tone: 'text-emerald-700 dark:text-emerald-400' },
  returned: { word: 'Returned', tone: 'text-foreground/75' },
  failed: { word: 'Failed', tone: 'text-rose-600 dark:text-rose-400' },
  cancelled: { word: 'Cancelled', tone: 'text-foreground/75' },
};

/**
 * Every chat a starter started (docs/started-chats.md): waiting on you
 * first, then working, then the rest newest first. The second line says
 * where each stands. Archive finished takes the ones that returned or
 * stopped that you never wrote in. Archived ones fold behind one line, the
 * one rule this list hides by.
 */
export function StartedChatsList({ rows, live, starter, onOpen, onArchive, onArchiveFinished, archivingFinished = false, loading = false }: StartedChatsListProps) {
  const [showArchived, setShowArchived] = useState(false);
  const withState = rows.map((row) => ({ row, state: startedChatState(row, live) }));
  const open = withState
    .filter(({ row }) => row.status === 'active')
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.index - b.index);
  const archived = withState.filter(({ row }) => row.status !== 'active');
  const finished = open.filter(({ row, state }) => isArchivableStartedChat(row, state)).length;

  if (loading && !rows.length) {
    return <div aria-busy="true" aria-label="Loading started chats" className="m-3 h-24 animate-pulse rounded-lg bg-muted/60" />;
  }
  if (!rows.length) {
    return (
      <p className="px-4 py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        {starter} hasn’t started any chats. When it hands work to another chat, that chat shows here.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-started-chats-list>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
          {starter} started {rows.length}. Their answers come back to it.
        </p>
        {finished > 0 && (
          <Tip label="Archives the ones that returned or stopped and that you never wrote in">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={archivingFinished}
              onClick={onArchiveFinished}
              className="flex flex-shrink-0 items-center gap-1.5"
            >
              <Archive size={12} aria-hidden />
              Archive finished ({finished})
            </Button>
          </Tip>
        )}
      </div>
      <div className="flex flex-col px-1.5 pb-2">
        {open.map(({ row, state }) => (
          <StartedChatRow key={row.requestId} row={row} state={state} onOpen={onOpen} onArchive={onArchive} />
        ))}
        {archived.length > 0 && (
          <FoldRow
            label={`${archived.length} archived`}
            shown={showArchived}
            onToggle={() => setShowArchived((v) => !v)}
            className="mt-1 px-0.5"
          />
        )}
        {showArchived && archived.map(({ row, state }) => (
          <StartedChatRow key={row.requestId} row={row} state={state} onOpen={onOpen} onArchive={onArchive} />
        ))}
      </div>
    </div>
  );
}

function StartedChatRow({ row, state, onOpen, onArchive }: { row: StartedChat; state: StartedChatState; onOpen: (row: StartedChat) => void; onArchive: (row: StartedChat) => void }) {
  const isArchived = row.status !== 'active';
  const unread = !isArchived && state !== 'needs_you' && state !== 'working' && isSessionUnread(row);
  const title = row.label ?? row.executionLabel ?? 'Untitled chat';
  const word = STATE_WORD[state];
  const said = state === 'failed' || state === 'cancelled' ? firstLine(row.outcome) : row.turnStatus?.line ?? null;
  const canArchive = !isArchived && state !== 'working' && state !== 'needs_you';
  const agentName = row.workspaceName ?? 'Agent removed';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      data-started-chat={row.sessionId}
      className={cn(
        'group/started relative flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none',
        isArchived && 'opacity-60',
      )}
    >
      <span className="relative flex-shrink-0">
        <Tip label={agentName}>
          <span className="flex">
            <WorkspaceAvatar wsImage={coverAttachmentUrl(row.workspaceAttachments)} wsEmoji={row.workspaceEmoji} wsName={agentName} />
          </span>
        </Tip>
        {!isArchived && (state === 'needs_you' || state === 'working' || unread) && (
          <span className="absolute -top-1 -right-1 flex rounded-full bg-background p-[2px]">
            <StatusPip isPending={state === 'needs_you'} isStreaming={state === 'working'} isUnread={unread} isBackground={false} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground/90', unread && 'font-semibold text-foreground')}>{title}</span>
          <span className={cn('flex-shrink-0 text-[10.5px] text-muted-foreground/60', canArchive && 'group-hover/started:hidden group-focus-within/started:hidden')}>
            {formatCompactRelative(row.lastActivityAt ?? row.startedAt)}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground/75">
          {state === 'needs_you' ? (
            row.turnStatus?.needsYou ? (
              <>
                <ChatStatusLine status={row.turnStatus} />
                <ChatAskSize status={row.turnStatus} />
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Needs you</span>
            )
          ) : (
            <>
              {word && <span className={cn('flex-shrink-0 font-medium', word.tone)}>{word.word}</span>}
              {said && <><span aria-hidden className="text-muted-foreground/40">·</span><span className="truncate">{said}</span></>}
              {row.personWrote && !isArchived && state !== 'working' && (
                <><span aria-hidden className="text-muted-foreground/40">·</span><span className="flex-shrink-0">you wrote in it</span></>
              )}
            </>
          )}
        </div>
      </div>
      {canArchive && (
        <Tip label="Archive">
          <Button
            type="button"
            aria-label={`Archive ${title}`}
            variant="ghost"
            size="sm"
            icon
            onClick={(e) => {
              e.stopPropagation();
              onArchive(row);
            }}
            className="-my-0.5 hidden flex-shrink-0 group-hover/started:inline-flex group-focus-within/started:inline-flex"
          >
            <Archive size={13} />
          </Button>
        </Tip>
      )}
    </div>
  );
}

function firstLine(text: string | null): string | null {
  const line = text?.split('\n').find((l) => l.trim())?.trim();
  if (!line) return null;
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

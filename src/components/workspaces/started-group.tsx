'use client';

import { ChevronRight } from 'lucide-react';
import { MenuAction } from '@/components/system/menu-action';
import { useDashboard } from '@/contexts/dashboard-context';
import { useCoordinatorName } from '@/hooks/use-user-state';
import type { RailSession } from '@/lib/api/sessions';
import { HOME_VIEW } from '@/lib/client/active-view';
import { coverAttachmentUrl } from '@/lib/attachments/view';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { isSessionUnread } from '@/lib/utils/session-sort';
import { startedByTitle, type StartedBy } from '@/lib/sessions/started-by';
import { cn } from '@/lib/utils';
import { CoordinatorAvatar } from '@/components/shared/coordinator-mark';
import { HistoryRow, sessionRankedAt, WorkspaceAvatar } from './history-row';

/**
 * What a folded group's chats are doing, counted the way their dots are:
 * waiting on you, unread, working.
 */
export function startedGroupCounts(children: readonly RailSession[], pending: ReadonlySet<string>, streaming: ReadonlySet<string>) {
  let needs = 0;
  let unread = 0;
  let working = 0;
  for (const s of children) {
    if (s.status !== 'active') continue;
    if (pending.has(s.id)) needs++;
    else if (streaming.has(s.id)) working++;
    else if (isSessionUnread(s)) unread++;
  }
  return { needs, unread, working };
}

/**
 * The line under a chat that started others: how many, and what they're
 * doing. A click opens them in place and folds them again. Its counts are
 * the only summary a folded group needs: the header's pills list a chat
 * that waits on you directly.
 */
export function StartedFoldLine({
  count,
  needs,
  unread,
  working,
  open,
  onToggle,
  className,
}: {
  count: number;
  needs: number;
  unread: number;
  working: number;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const sep = <span aria-hidden className="text-[9.5px] text-muted-foreground/40">·</span>;
  return (
    <MenuAction
      density="compact"
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      data-started-fold
      className={cn('flex min-w-0 items-center gap-1 text-left', className)}
    >
      <ChevronRight size={10} aria-hidden className={cn('flex-shrink-0 text-muted-foreground/75 transition-transform', open && 'rotate-90')} />
      <span className="flex-shrink-0 text-[9.5px] text-muted-foreground/75">{count} started</span>
      {needs > 0 && <>{sep}<span className="flex-shrink-0 text-[9.5px] text-amber-600 dark:text-amber-400">{needs} {needs === 1 ? 'needs' : 'need'} you</span></>}
      {unread > 0 && <>{sep}<span className="flex-shrink-0 text-[9.5px] font-medium text-foreground/80">{unread} unread</span></>}
      {working > 0 && <>{sep}<span className="flex-shrink-0 text-[9.5px] text-emerald-700 dark:text-emerald-400">{working} working</span></>}
    </MenuAction>
  );
}

/**
 * A main chat as the head of the chats it started. Recent lists an agent's
 * chats, not its main chat, so this row stands in for it while it has
 * started chats in the list. It opens that main chat.
 */
function StarterRow({ startedBy, newest }: { startedBy: StartedBy; newest: RailSession }) {
  const { openAgent, setActiveView } = useDashboard();
  const coordinatorName = useCoordinatorName();
  const title = startedByTitle(startedBy, coordinatorName);
  const open = () => (startedBy.kind === 'agent' && startedBy.workspaceId ? openAgent(startedBy.workspaceId) : setActiveView(HOME_VIEW));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      data-starter-row={startedBy.address}
      className="relative flex cursor-pointer items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
    >
      {startedBy.kind === 'home' ? (
        <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center"><CoordinatorAvatar size="sm" /></span>
      ) : (
        <WorkspaceAvatar
          wsImage={coverAttachmentUrl(startedBy.workspaceAttachments)}
          wsEmoji={startedBy.workspaceEmoji}
          wsName={startedBy.workspaceName ?? 'Agent'}
        />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground/90">{title}</span>
          <span className="flex-shrink-0 text-[9px] text-muted-foreground/60">{formatCompactRelative(sessionRankedAt(newest))}</span>
        </div>
        <div className="mt-0.5 truncate text-[9.5px] text-muted-foreground/70">{startedBy.kind === 'home' ? 'Main chat' : startedBy.workspaceName}</div>
      </div>
    </div>
  );
}

/** A starter's row, the fold line under it, and its started chats when open. */
export function RecentGroup({
  parent,
  startedBy,
  childSessions,
  newest,
  open,
  onToggle,
  onOpenWorkspaceSettings,
  onOpenLauncher,
}: {
  parent: RailSession | null;
  startedBy: StartedBy;
  childSessions: RailSession[];
  newest: RailSession;
  open: boolean;
  onToggle: () => void;
  onOpenWorkspaceSettings?: (workspaceId: string) => void;
  onOpenLauncher?: (workspaceId: string) => void;
}) {
  const { pendingInputSessionIds, streamingSessionIds } = useDashboard();
  const counts = startedGroupCounts(childSessions, pendingInputSessionIds, streamingSessionIds);
  return (
    <div className="flex flex-col" data-started-group={startedBy.address}>
      {parent ? (
        <HistoryRow session={parent} onOpenWorkspaceSettings={onOpenWorkspaceSettings} onOpenLauncher={onOpenLauncher} />
      ) : (
        <StarterRow startedBy={startedBy} newest={newest} />
      )}
      <StartedFoldLine
        count={childSessions.length}
        {...counts}
        open={open}
        onToggle={onToggle}
        className="ml-[30px] mr-1"
      />
      {open && (
        <div className="mb-1 ml-[18px] mt-0.5 border-l border-border pl-1">
          {childSessions.map((s) => (
            <HistoryRow
              key={s.id}
              session={s}
              groupAddress={startedBy.address}
              onOpenWorkspaceSettings={onOpenWorkspaceSettings}
              onOpenLauncher={onOpenLauncher}
            />
          ))}
        </div>
      )}
    </div>
  );
}

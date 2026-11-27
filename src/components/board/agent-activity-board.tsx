'use client';
import { Card } from '@/components/system/card';
import { MenuAction } from '@/components/system/menu-action';

import { Button } from '@/components/system/button';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { useActivityBuckets } from '@/hooks/use-activity-buckets';
import { useRailSessions, useWorkspaces } from '@/hooks/use-workspaces';
import { useBoardColumns, revealedColumns } from '@/hooks/use-board-columns';
import { BUCKET_ORDER, BUCKET_CONFIG, type BucketId } from '@/components/workspaces/bucket-config';
import { AgentIcon } from '@/components/agents/agent-icon';
import { activityDestination, startedByOfActivity, type ActivityItem } from '@/lib/sessions/activity-buckets';
import { stackStartedChats, type StartedBy } from '@/lib/sessions/started-by';
import { StartedFromLine } from '@/components/workspaces/started-mark';
import { clearBoardFocus, closeTaskBoard } from '@/lib/client/task-board';
import { latestActivityAt } from '@/lib/utils/session-sort';
import { formatCompactRelative } from '@/lib/utils/relative-time';
import { agentVoice } from '@/lib/utils/agent-rail';
import { cn } from '@/lib/utils';
import { ColumnPicker, HiddenColumnsEmpty } from './column-picker';
import { ListToolbar } from '@/components/shared/list-toolbar';

const COLUMN_OPTIONS = BUCKET_ORDER.map((id) => ({ id, label: BUCKET_CONFIG[id].label }));

export function AgentActivityBoard({ focusBucket }: { focusBucket: BucketId | null }) {
  const buckets = useActivityBuckets();
  const rail = useRailSessions();
  const agents = useWorkspaces({ status: 'active' });
  const { visible, setVisible } = useBoardColumns('ri.board.columns.activity', BUCKET_ORDER, BUCKET_ORDER);
  const columns = revealedColumns(BUCKET_ORDER, visible, focusBucket);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!focusBucket) return;
    const frame = requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
      targetRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusBucket]);

  const loading = rail.isPending || agents.isPending;
  const error = rail.isError || agents.isError;
  return <div className="flex min-h-0 flex-1 flex-col">
    <ListToolbar className="flex-wrap">
      <p className="mr-auto text-xs text-muted-foreground">Live conversations by attention and activity</p>
      <ColumnPicker columns={COLUMN_OPTIONS} visible={columns} onChange={(next) => {
        // A deliberate picker change adopts the currently displayed selection.
        setVisible(next);
        clearBoardFocus();
      }} />
    </ListToolbar>
    {focusBucket && !visible.includes(focusBucket) && <p className="px-4 pt-2 text-xs text-muted-foreground" role="status">
      Showing {BUCKET_CONFIG[focusBucket].label} for this visit. Your saved columns are unchanged.
    </p>}
    {error && <div role="alert" className="px-4 py-2 text-xs text-destructive">
      Activity could not be refreshed. <Button
        type="button"
        onClick={() => void Promise.all([rail.refetch(), agents.refetch()])}
        variant="link"
        size="sm"
      >Try again</Button>
    </div>}
    <div className="min-h-0 flex-1 overflow-x-auto p-3">
      <div className="flex h-full gap-3">
        {columns.length === 0 && <HiddenColumnsEmpty onShowAll={() => setVisible([...BUCKET_ORDER])} />}
        {columns.map((id) => {
          const cfg = BUCKET_CONFIG[id];
          return <section key={id} aria-label={cfg.label} tabIndex={-1}
            ref={id === focusBucket ? targetRef : undefined}
            className={cn('flex min-h-0 min-w-[280px] flex-1 flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring', id === focusBucket && 'ring-1 ring-primary/50')}>
            <div className={cn('mb-2 flex items-center gap-2 px-2 py-1', cfg.accentClass)}>
              {cfg.icon}<h2 className="flex-1 text-xs font-semibold">{cfg.label}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{loading ? '' : buckets[id].length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-2 [scrollbar-width:thin]">
              {loading && !buckets[id].length ? <div aria-busy="true" aria-label={`Loading ${cfg.label}`} className="h-28 animate-pulse rounded-lg bg-muted" /> : null}
              {!loading && !error && !buckets[id].length && <p className="px-3 py-8 text-center text-xs text-muted-foreground">No conversations here</p>}
              {stackStartedChats(buckets[id], id, startedByOfActivity).map((entry) => entry.kind === 'stack'
                ? <ActivityStack key={entry.key} startedBy={entry.startedBy} rows={entry.items} />
                : <ActivityCard key={entry.item.id} row={entry.item} />)}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}

function ActivityCard({ row, showFrom = true }: { row: ActivityItem; showFrom?: boolean }) {
  const { openExecution, openAgent } = useDashboard();
  const main = row.kind === 'agent' ? row.item : null;
  const session = row.kind === 'execution' ? row.session : null;
  const name = main?.workspace.name ?? session?.workspaceName ?? 'No agent';
  const identity = main?.workspace ?? {
    name, attachments: session?.workspaceAttachments ?? [], emoji: session?.workspaceEmoji ?? null, areaId: session?.workspaceAreaId ?? null,
  };
  const title = main ? `${name}'s main chat` : session?.execution?.label ?? session?.label ?? 'Untitled chat';
  const context = main ? agentVoice({ activity: main.activity, waitingOn: main.chat.waitingOn, preview: main.chat.preview, purpose: main.workspace.purpose }).text
    : session?.waitingOn ?? (session?.label !== title ? session?.label : null);
  const at = main ? latestActivityAt(main.chat) : session?.lastActivityAt ?? session?.startedAt;
  const ago = formatCompactRelative(at);
  const destination = activityDestination(row);
  // The column says the state, so the card carries no status line. Time rides the agent row.
  return <Card as="button" padding="md" shadow  type="button" onClick={() => {
    closeTaskBoard();
    if (destination.kind === 'agent') openAgent(destination.id);
    else openExecution(destination.id);
  }} className="w-full text-left">
    <span className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
      <AgentIcon workspace={identity} size="sm" /><span className="min-w-0 flex-1 truncate">{name}</span>
      {at && ago && <time dateTime={at} className="shrink-0 text-[11px] tabular-nums">{ago}</time>}
    </span>
    <span className="line-clamp-3 block text-sm font-medium">{title}</span>
    {showFrom && session?.startedBy && <StartedFromLine startedBy={session.startedBy} className="mt-1 text-xs" />}
    {context && <span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{context}</span>}
  </Card>;
}

/**
 * Two or more chats one chat started, in one column: a card with more behind
 * it, opening in place to show each (docs/started-chats.md). The column's
 * count still counts each.
 */
function ActivityStack({ startedBy, rows }: { startedBy: StartedBy; rows: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const sessions = rows.flatMap((row) => (row.kind === 'execution' ? [row.session] : []));
  const first = sessions[0];
  if (!first) return null;
  if (open) {
    return <div className="flex flex-col gap-1.5" data-started-stack={startedBy.address}>
      <MenuAction density="compact" type="button" aria-expanded onClick={() => setOpen(false)} className="flex w-full items-center gap-1.5 text-left">
        <ChevronRight size={12} aria-hidden className="flex-shrink-0 rotate-90 text-muted-foreground" />
        <StartedFromLine startedBy={startedBy} className="min-w-0 flex-1 text-xs" />
        <span className="text-xs tabular-nums text-muted-foreground">{sessions.length}</span>
      </MenuAction>
      <div className="ml-2 flex flex-col gap-2 border-l border-border pl-2">
        {rows.map((row) => <ActivityCard key={row.id} row={row} showFrom={false} />)}
      </div>
    </div>;
  }
  const name = first.workspaceName ?? 'No agent';
  const ago = formatCompactRelative(first.lastActivityAt ?? first.startedAt);
  return <div className="relative pb-2" data-started-stack={startedBy.address}>
    {/* The cards behind it say there are more. */}
    <div aria-hidden className="absolute inset-x-3 bottom-0 h-4 rounded-b-lg border border-border bg-card" />
    <div aria-hidden className="absolute inset-x-1.5 bottom-1 h-4 rounded-b-lg border border-border bg-card" />
    <Card as="button" padding="md" shadow type="button" aria-expanded={false} onClick={() => setOpen(true)} className="relative w-full text-left">
      <span className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <AgentIcon workspace={{ name, attachments: first.workspaceAttachments ?? [], emoji: first.workspaceEmoji ?? null, areaId: first.workspaceAreaId ?? null }} size="sm" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {ago && <span className="shrink-0 text-[11px] tabular-nums">{ago}</span>}
      </span>
      <span className="flex items-center gap-1 text-sm font-medium">
        {sessions.length} started chats
        <ChevronRight size={13} aria-hidden className="flex-shrink-0 text-muted-foreground" />
      </span>
      <StartedFromLine startedBy={startedBy} className="mt-1 text-xs" />
      <span className="mt-1.5 block truncate text-xs text-muted-foreground/80">
        {sessions.map((s) => s.execution?.label ?? s.label ?? 'Untitled chat').join(', ')}
      </span>
    </Card>
  </div>;
}

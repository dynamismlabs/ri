'use client';
import { MenuAction } from '@/components/system/menu-action';
import { InlineAction } from '@/components/system/inline-action';

import { StatusBadge } from '@/components/system/status-badge';

import { TeamLabel } from '@/components/spaces/team-label';
import { useState } from 'react';
import { AlertTriangle, CalendarClock, Ban, Loader2, ListTree } from 'lucide-react';
import { useDeadlines } from '@/hooks/use-tasks';
import { useDashboard } from '@/contexts/dashboard-context';
import { formatLocalDate } from '@/lib/dates';
import type { DeadlineTask } from '@/db/types';
import { cn } from '@/lib/utils';

/**
 * Deadline band — the always-on trust floor above the deck.
 *
 * Renders every REAL hard deadline that is overdue or due soon, fetched
 * deterministically from `/api/tasks/deadlines` (no model call). It survives a
 * failed/absent Deck generation, an offline model, and a fresh day with no new
 * deck, so a genuine deadline is always findable on the normal attention
 * surface. It stays deliberately slim (urgent rows shown, "due soon" collapsed)
 * so it never crowds out the deck's judgment — the AI is still free to sequence
 * and triage below. Self-hides when there is nothing with a real deadline.
 */

/** How many urgent (overdue + due today) rows to show before collapsing the
 * rest behind a "+N more" toggle, so a large pile stays a strip, not a wall. */
const MAX_URGENT_VISIBLE = 6;

export function DeadlineBand() {
  const { data: deadlines, isLoading } = useDeadlines();
  const { openTask } = useDashboard();
  const [soonExpanded, setSoonExpanded] = useState(false);
  const [urgentExpanded, setUrgentExpanded] = useState(false);

  // Nothing to show (and nothing loading on first paint): render nothing.
  if (!deadlines || deadlines.length === 0) {
    if (isLoading) return null; // avoid a flash of an empty band while fetching
    return null;
  }

  // Already sorted earliest-deadline-first by the query, so overdue precedes
  // due-today precedes due-soon.
  const urgent = deadlines.filter((d) => d.daysUntil <= 0);
  const soon = deadlines.filter((d) => d.daysUntil > 0);
  const overdueCount = deadlines.filter((d) => d.overdue).length;

  const visibleUrgent = urgentExpanded ? urgent : urgent.slice(0, MAX_URGENT_VISIBLE);
  const hiddenUrgent = urgent.length - visibleUrgent.length;
  // When there is nothing urgent, the soon items are the only content — show
  // them outright rather than hiding the whole band behind a toggle.
  const showSoon = soonExpanded || urgent.length === 0;

  return (
    <section data-slot="deadline-band" className="px-4 pt-3">
      <div data-slot="deadline-head" className="mb-1.5 flex items-center gap-2 px-1">
        <CalendarClock size={12} className="text-amber-600 dark:text-amber-500" />
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">
          Deadlines
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {overdueCount > 0 && (
            <span className="font-semibold text-red-600 dark:text-red-400">{overdueCount} late</span>
          )}
          {overdueCount > 0 && deadlines.length - overdueCount > 0 && ' · '}
          {deadlines.length - overdueCount > 0 && `${deadlines.length - overdueCount} upcoming`}
        </span>
        <div className="ml-1 h-px flex-1 bg-border" />
      </div>

      <ul className="space-y-1">
        {visibleUrgent.map((d) => (
          <DeadlineRow key={d.id} d={d} onOpen={openTask} />
        ))}

        {hiddenUrgent > 0 && (
          <li>
            <MenuAction density="compact"
              onClick={() => setUrgentExpanded(true)}
              className="w-full text-left"
            >
              +{hiddenUrgent} more overdue or due today
            </MenuAction>
          </li>
        )}

        {showSoon
          ? soon.map((d) => <DeadlineRow key={d.id} d={d} onOpen={openTask} />)
          : soon.length > 0 && (
              <li>
                <MenuAction density="compact"
                  onClick={() => setSoonExpanded(true)}
                  className="w-full text-left"
                >
                  {soon.length} more due soon
                </MenuAction>
              </li>
            )}
      </ul>
    </section>
  );
}

// ─── Row ──────────────────────────────────────────────────────────

/** Late, today or soon: the one fact the row's color says. */
function deadlineUrgency(d: DeadlineTask): 'late' | 'today' | 'soon' {
  return d.overdue ? 'late' : d.dueToday ? 'today' : 'soon';
}

function DeadlineRow({ d, onOpen }: { d: DeadlineTask; onOpen: (id: string) => void }) {
  const tint = d.overdue
    ? 'border-red-500/25 bg-red-500/[0.05] hover:border-red-500/45'
    : d.dueToday
      ? 'border-amber-500/25 bg-amber-500/[0.05] hover:border-amber-500/45'
      : 'border-border bg-muted/20 hover:border-border/80';

  return (
    <li
      data-slot="deadline-row"
      data-urgency={deadlineUrgency(d)}
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors',
        tint,
      )}
    >
      <InlineAction  onClick={() => onOpen(d.id)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {d.title || 'Untitled'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <DeadlinePill d={d} />
          <TeamLabel teamId={d.sourceTeamId} sourceArea={d.sourceArea} />
          {d.blocked && (
            <StatusBadge tone={"error"} className="inline-flex items-center gap-0.5">
              <Ban size={9} /> Blocked
            </StatusBadge>
          )}
          {d.status === 'in_progress' && (
            <StatusBadge tone={"status-progress"} className="inline-flex items-center gap-0.5">
              <Loader2 size={9} /> In progress
            </StatusBadge>
          )}
          {d.parentId && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <ListTree size={9} /> subtask
            </span>
          )}
        </span>
      </InlineAction>
    </li>
  );
}

/** The honest late/today/soon pill. Shows relative distance plus the calendar
 * date so "late" always reads as late, never as a neutral date. */
function DeadlinePill({ d }: { d: DeadlineTask }) {
  const date = formatLocalDate(d.hardDeadline) ?? d.hardDeadline;
  let label: string;
  let cls: string;
  if (d.overdue) {
    const n = Math.abs(d.daysUntil);
    label = `${n} day${n === 1 ? '' : 's'} late`;
    cls = 'bg-red-500/15 text-red-600 dark:text-red-400';
  } else if (d.dueToday) {
    label = 'Due today';
    cls = 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  } else {
    label = d.daysUntil === 1 ? 'Due tomorrow' : `Due in ${d.daysUntil} days`;
    cls = 'bg-muted text-muted-foreground';
  }
  return (
    <span data-slot="deadline-when" data-urgency={deadlineUrgency(d)} className={cn('inline-flex items-center gap-1 rounded-sm px-1 py-px text-[9px] font-medium', cls)}>
      {d.overdue && <AlertTriangle size={9} />}
      {label}
      <span className="opacity-60">· {date}</span>
    </span>
  );
}

"use client";
import { StatusBadge } from '@/components/system/status-badge';

import { Button } from '@/components/system/button';
/**
 * The HUD button's popover: compact day strip + today's agenda + summary.
 * Read-only glance surface over real commitments — the full experience lives
 * in the calendar tab.
 */

import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMinutes, minutesToLabel } from '@/lib/deck/calendar';
import { eventWindowOnDate } from '@/lib/calendar/layout';
import type { CalendarEvent, CalendarRangeResult } from '@/lib/calendar/types';
import { DayShapeStrip } from './day-shape-strip';
import { stripeStyle } from './event-color';

interface AgendaRow {
  key: string;
  startMinute: number;
  timeLabel: string;
  title: string;
  dimmed: boolean;
  declined: boolean;
  color: string | null;
  joinUrl?: string | null;
}

export function HudDayPeek({
  data,
  onOpenDay,
  onOpenWeek,
}: {
  data: CalendarRangeResult;
  /** Open the full-screen calendar on today (in place, over any surface). */
  onOpenDay: () => void;
  /** Open the full-screen calendar on this week. */
  onOpenWeek: () => void;
}) {
  const day = data.days[0];

  const rows: AgendaRow[] = [];
  if (day) {
    for (const e of day.events) {
      const w = eventWindowOnDate(e, day.date);
      if (!w) continue;
      rows.push({
        key: `e-${e.id}`,
        startMinute: w.startMinute,
        timeLabel: minutesToLabel(w.startMinute),
        title: e.title,
        dimmed: !e.countsAsBusy,
        declined: e.rsvp === 'declined',
        color: e.color,
        joinUrl: e.joinUrl,
      });
    }
    rows.sort((a, b) => a.startMinute - b.startMinute);
  }

  const staleAsOf = formatAsOf(data.asOf);

  return (
    <div className="flex flex-col">
      <DayShapeStrip items={[]} showPairing={false} onOpenCalendar={onOpenDay} />

      <div className="max-h-72 overflow-y-auto py-1">
        {day && day.allDay.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 py-1.5">
            {day.allDay.map((e: CalendarEvent) => (
              <StatusBadge
                key={e.id}
                className="truncate max-w-36"
                style={stripeStyle(e.color, 2)}
              >
                {e.title}
              </StatusBadge>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground/60">Nothing scheduled today</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2.5 px-3 py-1">
              <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
                {row.timeLabel}
              </span>
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={row.color ? { backgroundColor: row.color } : undefined}
              />
              <span
                className={cn(
                  'flex-1 truncate text-xs',
                  row.dimmed && 'text-muted-foreground/50',
                  row.declined && 'line-through',
                )}
              >
                {row.title}
              </span>
              {row.joinUrl && (
                <Button asChild variant="secondary" size="sm" className="flex items-center gap-1"><a href={row.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}>
                  <Video size={10} />
                  Join
                </a></Button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
        <span className="text-[10px] text-muted-foreground/70">
          {day
            ? `${formatMinutes(day.freeMinutes)} open · largest gap ${formatMinutes(day.largestGapMinutes)}`
            : `As of ${staleAsOf}`}
        </span>
        <span className="flex items-center gap-3">
          <Button
            type="button"
            onClick={onOpenDay}
            variant="link"
            size="sm"
          >
            Day view
          </Button>
          <Button
            type="button"
            onClick={onOpenWeek}
            variant="link"
            size="sm"
          >
            Week view
          </Button>
        </span>
      </div>
    </div>
  );
}

function formatAsOf(asOf: string): string {
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return 'earlier';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

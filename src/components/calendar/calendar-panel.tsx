"use client";

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
/**
 * The phone's calendar (More, Calendar) — purely a calendar, and purely a
 * DAY: an hour axis fits a phone's width, seven columns never will. Every
 * door on a larger screen opens the full-screen calendar (`CalendarModal`),
 * and so does the Week button here where it shows (md and up). Read-only
 * over external events: the deck never renders here — it's a ranked stack,
 * not a schedule (see the retrenchment note in docs/calendar-view-spec.md).
 */

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDayShape, usePrefetchDayShape, useRefreshDayShape } from '@/hooks/use-day-shape';
import { todayLocalDate } from '@/lib/deck/date';
import { addDaysLocal, formatDayLabel, mondayOf } from '@/lib/calendar/dates';
import { openCalendarModal } from '@/lib/client/calendar-modal';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/system/tooltip';
import { CalendarConnectPrompt } from './calendar-connect-prompt';
import { DayView } from './day-view';

const STALE_MS = 15 * 60_000;

export function CalendarPanel() {
  const today = todayLocalDate();
  const [anchor, setAnchor] = useState(today);
  const [refreshing, setRefreshing] = useState(false);

  const { data } = useDayShape(anchor, 1);
  const refresh = useRefreshDayShape();
  const prefetch = usePrefetchDayShape();

  // Warm the week range so the Week button opens instantly.
  useEffect(() => {
    prefetch(mondayOf(today), 7);
  }, [prefetch, today]);

  const step = (dir: -1 | 1) => setAnchor((a) => addDaysLocal(a, dir));

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh(anchor, 1);
    } finally {
      setRefreshing(false);
    }
  };

  const stale = data ? Date.now() - Date.parse(data.asOf) > STALE_MS : false;
  const degraded = data?.status === 'degraded' || data?.status === 'error';

  if (data?.status === 'no_providers') {
    return <CalendarConnectPrompt />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
          <div className="flex items-center">
            <IconButton
              type="button"
              onClick={() => step(-1)}
              label="Previous day"
              variant="ghost"
              size="sm"
            >
              <ChevronLeft size={14} />
            </IconButton>
            <Button
              type="button"
              onClick={() => setAnchor(today)}
              variant="secondary"
              size="sm"
            >
              Today
            </Button>
            <IconButton
              type="button"
              onClick={() => step(1)}
              label="Next day"
              variant="ghost"
              size="sm"
            >
              <ChevronRight size={14} />
            </IconButton>
          </div>

          <span className="text-xs font-medium text-foreground truncate">
            {formatDayLabel(anchor)}
          </span>

          <div className="flex-1" />

          {/* Week look-ahead — opens the full-screen calendar (needs width) */}
          <Button
            type="button"
            onClick={() => openCalendarModal({ view: 'week', date: anchor })}
            variant="secondary"
            size="sm"
            className="hidden md:flex items-center gap-1.5"
          >
            <Columns3 size={11} />
            Week
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={handleRefresh}
                aria-label="Refresh calendar"
                variant="secondary"
                size="sm"
                className="relative"
              >
                <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
                {(stale || degraded) && (
                  <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-500/80" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="">
              {data ? `Updated ${formatAsOf(data.asOf)}${degraded ? ' · some calendars unreachable' : ''}` : 'Refresh'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Body — always the day */}
        <div className="flex-1 min-h-0">
          <DayView
            date={anchor}
            day={data?.days[0]}
            workday={data?.workday ?? { start: '09:00', end: '18:00' }}
            isToday={anchor === today}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function formatAsOf(asOf: string): string {
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return 'earlier';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

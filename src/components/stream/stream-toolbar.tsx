'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ClipboardCheck, ListChecks, ListFilter } from 'lucide-react';
import { ChipButton } from '@/components/system/chip-button';
import { IconButton } from '@/components/system/icon-button';
import { SegmentedControl } from '@/components/system/segmented-control';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tip } from '@/components/ui/tip';
import type { StreamStatus } from '@/db/types';
import { cn } from '@/lib/utils';

export type StreamViewFilter = 'recent' | 'needs_call' | StreamStatus;
const HISTORY_FILTERS: Array<{ id: StreamViewFilter; label: string }> = [
  { id: 'pending', label: 'Captured' },
  { id: 'promoted', label: 'Added' },
  { id: 'reviewed', label: 'Kept as thoughts' },
  { id: 'incubating', label: 'Kept for later' },
  { id: 'dismissed', label: 'Set aside' },
];

export interface StreamToolbarProps {
  view: StreamViewFilter;
  onViewChange: (value: StreamViewFilter) => void;
  hasProposals: boolean;
  onReview: () => void;
  onTriage: () => void;
  triaging: boolean;
  notice: string | null;
  isDark: boolean;
}

export function StreamToolbar({
  view,
  onViewChange,
  hasProposals,
  onReview,
  onTriage,
  triaging,
  notice,
  isDark,
}: StreamToolbarProps) {
  const bar = useRef<HTMLDivElement | null>(null);
  const actions = useRef<HTMLDivElement | null>(null);
  const history = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fullActionsWidth = useRef<number | null>(null);
  const historyWidth = useRef(0);

  const measuredActionCount = useRef(0);
  const hasNotice = !!notice;
  useLayoutEffect(() => {
    const row = bar.current,
      group = actions.current;
    const primary = row?.querySelector('[aria-label="Stream view"]');
    if (!row || !group || !primary) return;
    const update = () => {
      // Re-measure full labels when a proposal adds or removes Review.
      if (measuredActionCount.current !== group.childElementCount) {
        measuredActionCount.current = group.childElementCount;
        fullActionsWidth.current = null;
        if (compact) {
          setCompact(false);
          return;
        }
      }
      if (!compact) fullActionsWidth.current = group.getBoundingClientRect().width;
      if (fullActionsWidth.current === null) return;
      const shownHistory = history.current?.getBoundingClientRect().width ?? 0;
      if (shownHistory) historyWidth.current = shownHistory;
      const style = getComputedStyle(row),
        gap = parseFloat(style.columnGap) || 0;
      const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const buttons = [...group.querySelectorAll('button')];
      const iconWidth =
        buttons.reduce((sum, button) => sum + button.getBoundingClientRect().height, 0) +
        Math.max(0, buttons.length - 1) * (parseFloat(getComputedStyle(group).columnGap) || 0);
      const fixed =
        primary.getBoundingClientRect().width + historyWidth.current + (3 + Number(hasNotice)) * gap;
      const nextCompact = available + 0.5 < fixed + fullActionsWidth.current;
      setCompact(nextCompact);
      const nextHistoryVisible =
        available + 0.5 >= fixed + (nextCompact ? iconWidth : fullActionsWidth.current);
      setHistoryVisible(nextHistoryVisible);
      if (!nextHistoryVisible) setHistoryOpen(false);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(group);
    observer.observe(primary);
    return () => observer.disconnect();
  }, [compact, historyVisible, hasProposals, hasNotice]);

  return (
    <div
      ref={bar}
      data-slot="list-toolbar"
      className={cn(
        'px-3 py-2 border-b border-border flex items-center gap-2 flex-shrink-0',
        isDark ? 'bg-card/50' : 'bg-muted',
      )}
    >
      <div className="shrink-0">
        <SegmentedControl<StreamViewFilter>
          mode="choice"
          ariaLabel="Stream view"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'recent', label: 'Recent' },
            ...(hasProposals ? [{ value: 'needs_call' as const, label: 'Needs your call' }] : []),
          ]}
        />
      </div>
      <div ref={history} hidden={!historyVisible} className="shrink-0">
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <IconButton label="History" variant="ghost" size="sm" disclosure>
              <ListFilter />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-0" sideOffset={4}>
            <div className="py-1">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onViewChange(f.id)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[10.5px] hover:bg-muted transition-colors',
                    view === f.id ? 'text-primary font-semibold' : 'text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="min-w-0 flex-1" />
      {notice && (
        <span className="min-w-0 text-[9.5px] text-muted-foreground truncate max-w-[45%]">{notice}</span>
      )}
      <div ref={actions} className="flex shrink-0 items-center gap-2">
        {hasProposals && (
          <Tip label={compact ? 'Review' : undefined}>
            <ChipButton
              label="Review"
              iconOnly={compact}
              onClick={onReview}
              variant="secondary"
              size="compact"
            >
              {compact && <ClipboardCheck />}
            </ChipButton>
          </Tip>
        )}
        <Tip label="Have the assistant triage waiting captures">
          <ChipButton
            label="Triage"
            iconOnly={compact}
            onClick={onTriage}
            disabled={triaging}
            variant="secondary"
            size="compact"
          >
            <ListChecks />
          </ChipButton>
        </Tip>
      </div>
    </div>
  );
}

"use client";
import { MenuAction } from '@/components/system/menu-action';

import { SegmentedControl } from '@/components/system/segmented-control';

import { ChipButton } from '@/components/system/chip-button';
import { IconButton } from '@/components/system/icon-button';
import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, RefreshCw, Clock, Check, SlidersHorizontal } from 'lucide-react';

import { useAreas } from '@/hooks/use-areas';
import { useMorningDeck, useUpdateMorningDeck } from '@/hooks/use-morning-deck';
import { openSettings } from '@/components/settings/settings-store';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { WorkMode } from '@/types/dashboard';
import { Tip } from '@/components/ui/tip';

// ─── Urgency for Generate New Deck button ───────────────────────

type Urgency = 'low' | 'medium' | 'high' | 'critical';

function getUrgency(generatedAt: string | undefined, now: number): Urgency {
  if (!generatedAt) return 'low';
  const hoursAgo = (now - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo >= 24) return 'critical';
  if (hoursAgo >= 4) return 'high';
  if (hoursAgo >= 2) return 'medium';
  return 'low';
}

// ─── Component ──────────────────────────────────────────────────

interface DeckConductorProps {
  areaFilter: string | null;
  onAreaFilterChange: (areaId: string | null) => void;
  workMode: WorkMode;
  onWorkModeChange: (mode: WorkMode) => void;
  filterDueToday: boolean;
  dueTodayCount: number;
  onFilterDueTodayChange: (value: boolean) => void;
  onReplan?: () => void;
  generatedAt?: string;
}

export function DeckConductor({
  areaFilter,
  onAreaFilterChange,
  workMode,
  onWorkModeChange,
  filterDueToday,
  dueTodayCount,
  onFilterDueTodayChange,
  onReplan,
  generatedAt,
}: DeckConductorProps) {
  const { data: areas } = useAreas();
  const selectedArea = areas?.find(a => a.id === areaFilter);

  // Urgency is read from a clock that ticks each minute, never from the wall
  // clock while rendering. A minute is far finer than any urgency threshold.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const urgency = getUrgency(generatedAt, now);

  // Morning auto-refresh (cron) config — shared cache with the settings pane.
  const { data: morning } = useMorningDeck();
  const updateMorning = useUpdateMorningDeck();
  const toggleMorning = useCallback(() => {
    updateMorning.mutate({ enabled: !(morning?.enabled ?? false) });
  }, [morning?.enabled, updateMorning]);

  // Sized by its own width, not the window's: Home's panel is wide, the
  // column beside other screens is 340px (docs/scratchpad.md). Below 30rem
  // the labels stay on one line, Generate New Deck keeps only its icon, and
  // the actions wrap under the filters rather than clip.
  return (
    <div className="@container/conductor border-b border-border">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 @max-[30rem]/conductor:gap-x-1.5 @max-[30rem]/conductor:px-3">
      <div className="flex items-center gap-2 @max-[30rem]/conductor:gap-1.5">
        {/* Energy toggle: Light / Deep */}
        <SegmentedControl mode="choice" allowEmpty ariaLabel="Energy" value={workMode} onChange={onWorkModeChange} options={[{value:'light',label:'Light'},{value:'deep',label:'Deep'}]} />

        {/* Area filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ChipButton
              variant="secondary"
              size="compact"
              className="flex items-center gap-1.5 @max-[30rem]/conductor:gap-1"
            >
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest @max-[30rem]/conductor:tracking-wide">
                {selectedArea ? selectedArea.name : 'All areas'}
              </span>
              <ChevronDown size={9} className="text-muted-foreground" />
            </ChipButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <MenuAction kind="menu"
              onClick={() => onAreaFilterChange(null)}
              selected={!!(!areaFilter)}
            >
              All areas
            </MenuAction>
            <DropdownMenuSeparator />
            {areas?.map(area => (
              <MenuAction kind="menu"
                key={area.id}
                onClick={() => onAreaFilterChange(area.id)}
                selected={!!(area.id === areaFilter)}
              >
                {area.name}
              </MenuAction>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Due today filter toggle */}
        <Tip
          label={dueTodayCount === 0
            ? 'No hard deadlines today'
            : `${dueTodayCount} hard deadline${dueTodayCount === 1 ? '' : 's'} today`}
          side="bottom"
        >
          <ChipButton
            onClick={() => dueTodayCount > 0 && onFilterDueTodayChange(!filterDueToday)}
            disabled={dueTodayCount === 0}
            aria-pressed={filterDueToday}
            variant="secondary"
            size="compact"
            tone="attention"
          >
            Due today
          </ChipButton>
        </Tip>
      </div>

      <div className="ml-auto flex items-center gap-1.5 @max-[30rem]/conductor:gap-1">
        {/* Morning auto-refresh toggle (opt-in cron) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>

              <IconButton
                data-on={morning?.enabled || undefined}
                label="Morning auto-refresh"
                tooltip="Morning auto-refresh"
                variant="ghost"
                size="xs"
                className="flex items-center justify-center"
              >
                <Clock size={12} />
              </IconButton>

          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <MenuAction kind="menu" onClick={toggleMorning} className="gap-2">
              <span className="flex-1">Auto-refresh each morning</span>
              {morning?.enabled && <Check size={12} className="text-primary" />}
            </MenuAction>
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground/70 leading-snug">
              {morning?.enabled
                ? `Reconciles yesterday into today around ${morning.time} (while the app is running).`
                : 'Off: the deck still deals itself the first time you open it each day.'}
            </div>
            <DropdownMenuSeparator />
            <MenuAction kind="menu" onClick={() => openSettings('profile')} className="gap-2">
              <SlidersHorizontal size={12} className="text-muted-foreground" />
              <span className="flex-1">Edit deck sources…</span>
            </MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>

        {onReplan && (
          <Tip label="Generate New Deck" onlyWhenTextHidden>
            <ChipButton
              onClick={onReplan}
              aria-label="Generate New Deck"
              variant={urgency === "critical" ? "primary" : urgency === "low" ? "ghost" : "secondary"}
              size="compact"
            >
              <RefreshCw size={10} />
              <span className="@max-[30rem]/conductor:hidden">Generate New Deck</span>
            </ChipButton>
          </Tip>
        )}
      </div>
    </div>
    </div>
  );
}

"use client";

import { ButtonGroup } from '@/components/system/button-group';

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { MessageSquare, Search, X } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { useLatestExecutionId } from '@/hooks/use-latest-execution';
import { HOTKEYS } from '@/constants/commands';
import { CreateMenu } from './create-menu';
import { RailStatusPills } from './rail-status-pills';
import { BudgetWarningPill } from './budget-warning-pill';
import { RateLimitsPill } from './rate-limits-pill';
import { HudDayButton } from '@/components/calendar/hud-day-button';
import { WorkHudPill } from '@/components/calendar/work/work-hud-pill';
import { DesktopNavButtons } from '@/components/desktop/desktop-nav-buttons';
import { DeckBesideButton, ScratchpadButton } from '@/components/scratchpad/scratchpad-host';
import { Tip } from '@/components/ui/tip';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { Kbd } from '@/components/ui/kbd';

// What's happening, from every view: work by status, the way out of (or
// back into) an execution, today's work in human time, the next calendar
// event, the budget. Places (Board, Calendar, Schedules and Triggers) and
// Settings live in the left rail (docs/rail.md). Create (tasks, notes, quick
// capture) and ⌘K search stay here for now, beside the rail's own Create and
// Search. The deck and scratchpad buttons share the column beside every
// screen (docs/scratchpad.md).

export function TopHud() {
  const team = useOptionalHomeContext()?.home.kind === 'team';
  const { activeView, goHome, openExecution } = useDashboard();
  // The agent, execution, skill and app views all close back to Home.
  const closeLabel =
    activeView.kind === 'execution'
      ? 'Close chat'
      : activeView.kind === 'agent'
        ? 'Close agent'
        : activeView.kind === 'skill'
          ? 'Close skill'
          : activeView.kind === 'apps'
            ? activeView.route === '' || activeView.route === 'new'
              ? 'Close apps'
              : activeView.route.startsWith('drafts/')
                ? 'Close builder'
                : 'Close app'
            : null;
  const latestExecutionId = useLatestExecutionId();

  return (
    <header data-desktop-titlebar data-slot="top-hud" className="flex-shrink-0 h-10 border-b border-border flex items-center px-4 gap-2 bg-background z-50">
      {/* Desktop app only, right after the window controls. */}
      <DesktopNavButtons className="-ml-1 shrink-0" />

      {/* Query the space left after native chrome and history navigation,
          rather than the screen width. The phone has its own header. */}
      <div className="top-hud-content min-w-0 flex-1">
        <div className="top-hud-row flex h-full items-center gap-4 whitespace-nowrap [&_svg]:shrink-0">
          <div className="flex shrink-0 items-center gap-1">
            <RailStatusPills />
            {!team && <RateLimitsPill />}
          </div>

          {closeLabel ? (
            <Tip label={closeLabel} shortcut={HOTKEYS.closeView.label} onlyWhenTextHidden>
              <Button
                type="button"
                onClick={goHome}
                aria-label={closeLabel}
                variant="secondary"
                size="sm"
                className="flex shrink-0 items-center gap-1.5"
              >
                <X size={12} />
                <span className="hud-view-label text-[11px] font-medium">{closeLabel}</span>
                <Kbd aria-hidden className="hud-shortcut ml-0.5 bg-background/60">
                  {HOTKEYS.closeView.label}
                </Kbd>
              </Button>
            </Tip>
          ) : latestExecutionId ? (
            <Tip label="Open latest chat" shortcut={HOTKEYS.closeView.label} onlyWhenTextHidden>
              <Button
                type="button"
                onClick={() => openExecution(latestExecutionId)}
                aria-label="Open latest chat"
                variant="ghost"
                size="sm"
                className="flex shrink-0 items-center gap-1.5"
              >
                <MessageSquare size={12} />
                <span className="hud-view-label text-[11px] font-medium">Open latest chat</span>
                <Kbd aria-hidden className="hud-shortcut">
                  {HOTKEYS.closeView.label}
                </Kbd>
              </Button>
            </Tip>
          ) : null}

          <div className="min-w-4 flex-1" aria-hidden />

          {!team && <div className="shrink-0"><WorkHudPill /></div>}

          {!team && <><div className="hud-calendar min-w-0"><HudDayButton /></div><BudgetWarningPill /></>}

          <div className="flex shrink-0 items-center gap-2">
            <ButtonGroup variant="toolbar">

              <IconButton
                type="button"
                onClick={() => document.dispatchEvent(new CustomEvent('open-search'))}
                label="Search"
                tooltip="Search tasks, notes and commands"
                shortcut={HOTKEYS.search.label}
                variant="secondary"
                size="sm"
              >
                <Search size={14} />
              </IconButton>

            {!team && <><DeckBesideButton /><ScratchpadButton /></>}
            </ButtonGroup>
            <CreateMenu />
          </div>
        </div>
      </div>
    </header>
  );
}

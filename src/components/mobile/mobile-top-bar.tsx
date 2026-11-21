"use client";
import { Button } from '@/components/system/button';

import { IconButton } from '@/components/system/icon-button';
import { Search } from 'lucide-react';
import { SpaceSelector } from '@/components/spaces/space-selector';
import { useOptionalHomeContext } from '@/components/home/home-context';
import { useSettingsLink } from '@/components/settings/settings-destination';
import { Settings } from 'lucide-react';
import { ScratchpadButton } from '@/components/scratchpad/scratchpad-host';

/**
 * The phone's top bar: My Ri and its teams, Search, and the scratchpad.
 * Search fits the tab: chats on Agents (by name or message,
 * `ChatSearchModal`), tasks, notes and areas everywhere else.
 */
export function MobileTopBar({ onSearch = () => document.dispatchEvent(new CustomEvent('open-search')), searchLabel = 'Search tasks, notes, areas…', onOpenSettings, onOpenAccount }: { onSearch?: () => void; searchLabel?: string; onOpenSettings?: () => void; onOpenAccount?: () => void }) {
  const team = useOptionalHomeContext()?.home.kind === 'team';
  const settings = useSettingsLink();
  return (
    // pt: respect the safe-area on devices that report one (notch/island),
    // floor at 0.75rem so non-PWA browsers — which evaluate env() to 0 —
    // don't render the bar flush against the viewport edge.
    <header
      className="flex-shrink-0 px-3 pb-2 bg-background flex items-center gap-2"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
    >
      {/* My Ri and its teams, once one is connected (docs/homes-spec.md §3.2). */}
      <SpaceSelector variant="phone" onOpenSettings={onOpenSettings} onOpenAccount={team ? onOpenAccount : undefined} />
      <Button variant="secondary" size="touch"
        onClick={onSearch}

        className="min-w-0 flex-1 flex items-center justify-start gap-2.5"
        aria-label={searchLabel.replace(/…$/, '')}
      >
        <Search size={15} className="flex-shrink-0" />
        <span className="truncate text-sm text-muted-foreground/70">{searchLabel}</span>
      </Button>
      {team ? <IconButton
        type="button"
        onClick={onOpenSettings ?? settings ?? undefined}
        label="Settings"
        variant="secondary"
        size="touch"
        className="flex items-center justify-center"
      ><Settings size={16} /></IconButton> : <ScratchpadButton variant="phone" />}
    </header>
  );
}

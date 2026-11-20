"use client";

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
      <button
        onClick={onSearch}
        data-slot="search-field"
        className="min-w-0 flex-1 h-10 flex items-center gap-2.5 px-3.5 rounded-lg border border-border text-muted-foreground active:bg-muted/60 transition-colors"
        aria-label={searchLabel.replace(/…$/, '')}
      >
        <Search size={15} className="flex-shrink-0" />
        <span className="truncate text-sm text-muted-foreground/70">{searchLabel}</span>
      </button>
      {team ? <button type="button" aria-label="Settings" data-slot="icon-button" onClick={onOpenSettings ?? settings ?? undefined} className="flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground"><Settings size={16} /></button> : <ScratchpadButton variant="phone" />}
    </header>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, type LucideIcon } from 'lucide-react';
import { useDashboard } from '@/contexts/dashboard-context';
import { cn } from '@/lib/utils';
import { SECTIONS, type SectionId } from './settings-sections';
import { closeSettings } from './settings-store';

/** Shared desktop sidebar and mobile navigation for personal and team settings. */
export interface SettingsNavItem<Id extends string> {
  id: Id;
  label: string;
  title: string;
  /** Searched with the label and title, so a word like MCP finds its section. */
  description?: string;
  icon: LucideIcon;
  badge?: string;
}

export function SettingsNavigation<Id extends string>({
  active, onSelect, sections, label = 'Settings',
}: {
  active: Id;
  onSelect: (id: Id) => void;
  sections: readonly SettingsNavItem<Id>[];
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const activeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeButton.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? sections.filter((s) => [s.label, s.title, s.description ?? ''].some((text) => text.toLowerCase().includes(q)))
    : sections;

  return (
    <nav
      data-slot="settings-nav"
      aria-label={label}
      className={cn(
        'mr-12 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/20 p-2',
        'sm:mr-0 sm:w-56 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3',
      )}
    >
      <div className="relative mb-1 hidden sm:block">
        <Search
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label={`Search ${label.toLowerCase()}`}
          className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {matches.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            ref={isActive ? activeButton : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
              isActive
                ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            <Icon size={15} className={cn('shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} />
            <span>{section.label}</span>
            {section.badge && (
              <span className="ml-auto hidden rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
                {section.badge}
              </span>
            )}
          </button>
        );
      })}

      {matches.length === 0 && (
        <p className="hidden px-2 py-3 text-[12px] text-muted-foreground sm:block">No settings match “{query}”.</p>
      )}
    </nav>
  );
}

/** Personal settings link Plugins to the Apps library. */
export function SettingsNav({ active, onSelect }: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const { setActiveView } = useDashboard();
  const select = (id: SectionId) => {
    if (id === 'plugins') {
      closeSettings();
      setActiveView({ kind: 'apps', route: '' });
    } else onSelect(id);
  };
  return <SettingsNavigation active={active} onSelect={select} sections={SECTIONS} />;
}

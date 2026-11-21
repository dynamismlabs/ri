'use client';
import { MenuAction } from '@/components/system/menu-action';
import { StatusBadge } from '@/components/system/status-badge';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';

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
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

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
      <Field
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        aria-label={`Search ${label.toLowerCase()}`}
        className="relative mb-1 hidden w-full sm:flex"
        leading={<Search />}
        size={compactFieldSize}
      />

      {matches.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === active;
        return (
          <MenuAction
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            ref={isActive ? activeButton : undefined}
            aria-current={isActive ? 'page' : undefined}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-left"
          >
            <Icon size={15} className={cn('shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} />
            <span>{section.label}</span>
            {section.badge && (
              <StatusBadge className="ml-auto hidden sm:inline-block">
                {section.badge}
              </StatusBadge>
            )}
          </MenuAction>
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

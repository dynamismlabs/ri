"use client";
import { MenuAction } from '@/components/system/menu-action';

import { MetaItem, useInMeta } from '@/components/system/meta';
import { Button } from '@/components/system/button';
import { ChevronDown } from 'lucide-react';
import { useAreas } from '@/hooks/use-areas';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator } from '@/components/system/menu';

interface AreaSelectProps {
  value: string | null;
  onChange: (areaId: string | null) => void;
  className?: string;
  /** Offer New area… at the end of the list. */
  onNewArea?: () => void;
}

export function AreaSelect({ value, onChange, className, onNewArea }: AreaSelectProps) {
  const inMeta = useInMeta();
  const { data: areas } = useAreas();
  const selected = areas?.find(a => a.id === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {inMeta ? (
          <MetaItem as="button" kind="area" type="button" className={className} onClick={(e) => e.stopPropagation()}>
            {selected ? selected.name : 'No area'}
          </MetaItem>
        ) : (
          <Button type="button" size="xs" variant="secondary" className={className} onClick={(e) => e.stopPropagation()}>
            {selected ? selected.name : 'No area'}<ChevronDown aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <MenuAction kind="menu"
          onClick={(e) => { e.stopPropagation(); onChange(null); }}
          selected={!!(!value)}
        >
          No area
        </MenuAction>
        <DropdownMenuSeparator />
        {areas?.map(area => (
          <MenuAction kind="menu"
            key={area.id}
            onClick={(e) => { e.stopPropagation(); onChange(area.id); }}
            selected={!!(area.id === value)}
          >
            {area.name}
          </MenuAction>
        ))}
        {onNewArea && (
          <>
            {areas && areas.length > 0 && <DropdownMenuSeparator />}
            <MenuAction kind="menu" onClick={(e) => { e.stopPropagation(); onNewArea(); }} >
              New area…
            </MenuAction>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';
import { MenuAction } from '@/components/system/menu-action';

import type { ReactNode } from 'react';
import { IconButton } from '@/components/system/icon-button';
import { Archive, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_HEADER } from './entity-header';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/system/menu';

/** Shared task/note chrome. Audience, navigation and contextual controls are slots. */
export function EntityDetailHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-entity-header
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2',
        ENTITY_HEADER,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Archive/delete keep the same menu and accessibility in every document surface. */
export function EntityActionsMenu({ onArchive, onDelete, archiveLabel = 'Archive', deleteLabel = 'Delete', children }: {
  onArchive?: () => void; onDelete?: () => void; archiveLabel?: string; deleteLabel?: string; children?: ReactNode;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><IconButton label="More actions" size="sm"><MoreHorizontal /></IconButton></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      {children}
      {onArchive && <MenuAction kind="menu" onSelect={onArchive}><Archive size={13} /> {archiveLabel}</MenuAction>}
      {onDelete && <MenuAction tone="error" kind="menu" onSelect={onDelete} ><Trash2 size={13} /> {deleteLabel}</MenuAction>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

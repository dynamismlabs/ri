"use client";

/**
 * Shared control row for the tasks and notes list surfaces.
 *
 * Both lists used to hand-roll their own toolbar with one-off pixel sizes
 * (`text-[8.5px]`, `p-1.5`, `text-xs`), so the two drifted and every control
 * was a slightly different size. This module is the single source of truth for
 * that row: consistent sizing from the Button family, and a
 * primary segmented control that stays usable as the panel narrows.
 *
 * Responsiveness keys off the PANEL, not the viewport. The lists render inside
 * a multi-panel dashboard where a panel is a fraction of the window, so
 * viewport breakpoints (`md:`) fire at the wrong moments — a wide window can
 * still hold a cramped panel. `ListToolbar` opens a named container (`@.../lt`)
 * and the controls collapse against it with container queries.
 */

import { Search } from 'lucide-react';
import { ChipButton } from '@/components/system/chip-button';
import { IconButton } from '@/components/system/icon-button';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

/** The control row. Owns the container context the controls collapse against. */
export function ListToolbar({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="list-toolbar"
      className={cn(
        '@container/lt flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 flex-shrink-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small dot that flags a filter as active when its label is hidden for space. */
export function ToolbarActiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-1.5 shrink-0 rounded-full bg-primary', className)}
    />
  );
}

/** Icon-only search button, right-pinned by convention. */
export function ToolbarSearchButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <IconButton type="button" label={label} onClick={onClick} variant="ghost" size="sm"><Search /></IconButton>;
}

/** A pressable filter toggle (Decisions, Archived) with the shared sizing. */
export function ToolbarToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Tip label={title}>
      <ChipButton type="button" onClick={onClick} pressed={active} variant="ghost">
        {children}
      </ChipButton>
    </Tip>
  );
}

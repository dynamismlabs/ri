'use client';

import { IconButton } from '@/components/system/icon-button';
import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An icon button in the collapsed strip (and the wide rail's collapse
 * toggle). The tooltip names it. Extra button props pass through, so it can
 * be a popover trigger. `mark` draws in place of the icon (an app's tile).
 */
export function RailIconButton({
  icon: Icon,
  mark,
  label,
  shortcut,
  hideTip = false,
  active = false,
  badge,
  className,
  'aria-label': ariaLabel,
  ...props
}: Omit<ComponentProps<'button'>, 'children' | 'title'> & {
  icon?: LucideIcon;
  mark?: ReactNode;
  /** Tooltip. Doubles as the accessible name unless `aria-label` is set. */
  label: string;
  /** Shown in the tooltip, e.g. `HOTKEYS.toggleRail.label`. */
  shortcut?: string;
  /** No tooltip, e.g. while the button's own card is open. */
  hideTip?: boolean;
  active?: boolean;
  /** Drawn on the icon's top-right corner. */
  badge?: ReactNode;
}) {
  return (
      <IconButton
        type="button"
        label={ariaLabel ?? label}
        tooltip={hideTip ? false : label}
        shortcut={shortcut}
        aria-current={active ? 'page' : undefined}
        {...props}
        variant="ghost"
        size="sm"
        pressed={active}
        className={cn("relative flex-shrink-0", className)}
      >
        {mark ?? (Icon && <Icon size={14} />)}
        {badge}
      </IconButton>
  );
}

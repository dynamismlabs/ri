'use client';

import { Button } from '@/components/system/button';
import { Loader2 } from 'lucide-react';

import { Tip } from '@/components/ui/tip';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  /** Optional count badge (e.g. `(3)` for ahead-by-three). */
  count?: number;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
  /** Visual variant — `primary` for the headline action, `secondary` for the rest. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Tooltip / aria-label. */
  title?: string;
}

/**
 * Shared button used across the action bar. Keeps the spacing,
 * pending-spinner, and count-badge treatment identical for every action
 * so the bar reads as one coherent unit.
 */
export function ActionButton({
  icon,
  label,
  count,
  onClick,
  pending,
  disabled,
  variant = 'secondary',
  title,
}: ActionButtonProps) {
  const isDisabled = !!disabled || !!pending;
  return (
    <Tip label={title}>
      <Button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        variant={variant}
        size="sm"
        className="min-w-0"
      >
        {pending ? <Loader2 size={11} className="animate-spin" /> : icon}
        <span className="truncate">{label}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold tabular-nums text-muted-foreground bg-muted/60">
            {count}
          </span>
        )}
      </Button>
    </Tip>
  );
}

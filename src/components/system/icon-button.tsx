'use client';

import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tip } from '@/components/ui/tip';
import { cn } from '@/lib/utils';

type TipOptions = Pick<ComponentProps<typeof Tip>, 'shortcut' | 'side' | 'align'>;

export type IconButtonProps = Omit<ButtonProps, 'icon' | 'aria-label'> & {
  /** The accessible name and default tooltip. Always describe the action. */
  label: string;
  /** Additional context, when the existing tooltip says more than the name. */
  tooltip?: ReactNode;
  shortcut?: TipOptions['shortcut'];
  tipSide?: TipOptions['side'];
  tipAlign?: TipOptions['align'];
  /** A menu affordance with room for a trailing chevron beside its icon. */
  disclosure?: boolean;
};

/** A named icon action, including keyboard focus and a disabled-state tooltip. */
export function IconButton({ label, tooltip, shortcut, tipSide, tipAlign, disclosure, children, className, variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <Tip label={tooltip ?? label} shortcut={shortcut} side={tipSide} align={tipAlign}>
      <Button {...props} variant={variant} icon aria-label={label} className={cn(disclosure && 'ri-button--disclosure', className)}>
        {disclosure ? <>{children}<ChevronDown className="ri-disclosure-chevron" /></> : children}
      </Button>
    </Tip>
  );
}

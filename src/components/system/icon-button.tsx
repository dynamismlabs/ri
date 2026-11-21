'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tip } from '@/components/ui/tip';

type TipOptions = Pick<ComponentProps<typeof Tip>, 'shortcut' | 'side' | 'align'>;

export type IconButtonProps = Omit<ButtonProps, 'icon' | 'aria-label'> & {
  /** The accessible name and default tooltip. Always describe the action. */
  label: string;
  /** Additional context, when the existing tooltip says more than the name. */
  tooltip?: ReactNode;
  shortcut?: TipOptions['shortcut'];
  tipSide?: TipOptions['side'];
  tipAlign?: TipOptions['align'];
};

/** A named icon action, including keyboard focus and a disabled-state tooltip. */
export function IconButton({ label, tooltip, shortcut, tipSide, tipAlign, variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <Tip label={tooltip ?? label} shortcut={shortcut} side={tipSide} align={tipAlign}>
      <Button {...props} variant={variant} icon aria-label={label} />
    </Tip>
  );
}

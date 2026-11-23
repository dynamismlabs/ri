'use client';
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { OverlaySurface } from './overlay';
const variants = cva('ri-menu-surface', {
  variants: { density: { normal: '', compact: 'ri-menu-surface--compact' } },
  defaultVariants: { density: 'normal' },
});
/** Menu paint for existing editor suggestion and positioning engines. */
export function MenuSurface({
  density,
  className,
  padding,
  empty = false,
  ...props
}: ComponentProps<typeof OverlaySurface> & VariantProps<typeof variants> & { empty?: boolean }) {
  return (
    <OverlaySurface
      data-empty={empty || undefined}
      kind="menu"
      padding={padding ?? (density === 'compact' ? 'xs' : 'sm')}
      data-slot="suggestion-menu"
      data-density={density ?? 'normal'}
      className={cn(variants({ density }), className)}
      {...props}
    />
  );
}

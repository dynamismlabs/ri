'use client';

import {
  createElement,
  type ComponentPropsWithRef,
  type ElementType,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const overlayVariants = cva('ri-overlay', {
  variants: {
    kind: {
      dialog: 'ri-overlay--dialog',
      sheet: 'ri-overlay--sheet',
      popover: 'ri-overlay--popover',
      menu: 'ri-overlay--menu',
      preview: 'ri-overlay--preview',
      toast: 'ri-overlay--toast',
      tooltip: 'ri-overlay--tooltip',
    },
    padding: {
      none: 'ri-overlay-inset--none',
      xs: 'ri-overlay-inset--xs',
      sm: 'ri-overlay-inset--sm',
      md: 'ri-overlay-inset--md',
      lg: 'ri-overlay-inset--lg',
      xl: 'ri-overlay-inset--xl',
    },
  },
});
export type OverlayDrawing = VariantProps<typeof overlayVariants>;
type SurfaceProps<E extends ElementType> = OverlayDrawing & {
  as?: E;
  className?: string;
} & Omit<ComponentPropsWithRef<E>, keyof OverlayDrawing | 'as' | 'className'>;
/** A frame for an existing custom positioning or dismissal engine. */
export function OverlaySurface<E extends ElementType = 'div'>({
  as,
  kind = 'popover',
  padding = 'none',
  className,
  ...props
}: SurfaceProps<E>) {
  return createElement(as ?? 'div', {
    ...props,
    className: cn(overlayVariants({ kind, padding }), className),
  });
}
export function OverlayScrim({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={cn('ri-overlay-scrim', className)} {...props} />;
}

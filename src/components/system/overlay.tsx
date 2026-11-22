'use client';

import {
  createElement,
  type ComponentPropsWithRef,
  type ElementType,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { toneClass, type ContentTone } from './callout';

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
      toolbar: 'ri-overlay--toolbar',
    },
    phonePage: { true: 'ri-overlay--phone-page' },
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
  tone?: ContentTone;
} & Omit<ComponentPropsWithRef<E>, keyof OverlayDrawing | 'as' | 'className'>;
/** A frame for an existing custom positioning or dismissal engine. */
export function OverlaySurface<E extends ElementType = 'div'>({
  as,
  kind = 'popover',
  padding = 'none',
  className,
  tone,
  phonePage,
  ...props
}: SurfaceProps<E>) {
  return createElement(as ?? 'div', {
    'data-slot': 'overlay-surface',
    ...props,
    className: cn(
      overlayVariants({ kind, padding, phonePage }),
      toneClass(tone),
      className,
    ),
  });
}
export function OverlayScrim({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={cn('ri-overlay-scrim', className)} {...props} />;
}

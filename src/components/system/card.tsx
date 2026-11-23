import { createElement, type ComponentPropsWithRef, type ElementType } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Card as CardPrimitive } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const cardVariants = cva('ri-card block flex-row gap-0 overflow-visible p-0 ring-0', {
  variants: {
    padding: { none: 'ri-inset--none', xs: 'ri-inset--xs', sm: 'ri-inset--sm', md: 'ri-inset--md', lg: 'ri-inset--lg', xl: 'ri-inset--xl', form: 'ri-inset--form' },
    density: { compact: 'ri-density--compact', row: 'ri-density--row', comfortable: 'ri-density--comfortable' },
    surface: { raised: '', pane: 'ri-surface--pane', card: 'ri-surface--card', track: 'ri-surface--track', plain: 'ri-surface--plain' },
    dimmed: { true: 'ri-content--dimmed' },
    dragging: { true: 'ri-card--dragging' },
    selected: { true: 'ri-content--selected' },
    shadow: { true: 'ri-card--shadow', false: '' },
    purpose: { content: '', code: 'ri-content--code' },
  },
  defaultVariants: { padding: 'md', surface: 'raised', shadow: false, purpose: 'content' },
});
type OwnProps<E extends ElementType> = VariantProps<typeof cardVariants> & { as?: E; className?: string };
export type CardProps<E extends ElementType = 'div'> = OwnProps<E> & Omit<ComponentPropsWithRef<E>, keyof OwnProps<E>>;

/** Content stays rectangular, including when the whole panel is a press target. */
export function Card<E extends ElementType = 'div'>({ as, className, padding, density, surface, selected, shadow, purpose, dimmed, dragging, ...props }: CardProps<E>) {
  return <CardPrimitive asChild className={cn(cardVariants({ padding, density, surface, selected, shadow, purpose, dimmed, dragging }), className)}>
    {createElement(as ?? 'div', props)}
  </CardPrimitive>;
}

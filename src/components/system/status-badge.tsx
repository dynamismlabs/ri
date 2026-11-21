import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { Badge } from '@/components/ui/badge';
import { toneClass, type ContentTone } from './callout';
import { cn } from '@/lib/utils';
const variants = cva('ri-status-badge', {
  variants: { appearance: { soft: '', plain: 'ri-status-badge--plain', solid: 'ri-status-badge--solid' }, size: { compact: '', count: 'ri-status-badge--count' } },
  defaultVariants: { appearance: 'soft', size: 'compact' },
});
export type StatusBadgeProps = Omit<ComponentProps<typeof Badge>, 'variant'> & {
  tone?: ContentTone;
  appearance?: 'soft' | 'plain' | 'solid';
  size?: 'compact' | 'count';
  code?: boolean;
};
/** A fact, never an action. Interactive status chips use ChipButton. */
export function StatusBadge({ tone = 'neutral', appearance, size, code, className, ...props }: StatusBadgeProps) {
  return <Badge {...props} variant="secondary" className={cn(variants({ appearance, size }), toneClass(tone), code && 'ri-content--code', className)} />;
}

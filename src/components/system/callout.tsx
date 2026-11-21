import type { ElementType } from 'react';
import { Card, type CardProps } from './card';
import type { ButtonTone } from './button';
import { cn } from '@/lib/utils';

export type ContentTone = ButtonTone | 'error';
export function toneClass(tone: ContentTone = 'neutral') { return tone === 'neutral' ? undefined : `ri-tone--${tone === 'error' ? 'danger' : tone}`; }
export type CalloutProps<E extends ElementType = 'div'> = CardProps<E> & { tone?: ContentTone };
/** A notice within the page. Live announcements remain an explicit caller choice. */
export function Callout<E extends ElementType = 'div'>({ tone = 'neutral', className, ...props }: CalloutProps<E>) {
  return <Card<E> {...(props as CardProps<E>)} className={cn('ri-callout', toneClass(tone), className)} />;
}

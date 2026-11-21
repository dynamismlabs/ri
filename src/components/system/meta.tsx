'use client';
import { createContext, createElement, useContext, type ComponentPropsWithRef, type ElementType } from 'react';
import { cn } from '@/lib/utils';
import { toneClass, type ContentTone } from './callout';
const Context = createContext(false);
export const useInMeta = () => useContext(Context);
export function Meta({className, ...props}: ComponentPropsWithRef<'div'>) {
  return <Context.Provider value={true}><div {...props} className={cn('ri-meta flex flex-wrap items-center', className)} /></Context.Provider>;
}
type Own<E extends ElementType> = { as?: E; kind?: string; tone?: ContentTone; urgency?: 'late' | 'today' | 'soon'; energy?: 'light' | 'deep'; className?: string };
export type MetaItemProps<E extends ElementType = 'span'> = Own<E> & Omit<ComponentPropsWithRef<E>, keyof Own<E>>;
/** Plain facts and inline property actions share type, wrapping and separators. */
export function MetaItem<E extends ElementType = 'span'>({ as, kind, tone = 'neutral', urgency, energy, className, ...props }: MetaItemProps<E>) {
  return createElement(as ?? 'span', {...props, 'data-kind': kind, 'data-urgency': urgency, 'data-energy': energy, className: cn('ri-meta-item', toneClass(tone), className)});
}

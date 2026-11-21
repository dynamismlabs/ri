'use client';
import type { ComponentProps, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { ActionPrimitive } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toneClass, type ContentTone } from './callout';
import { cn } from '@/lib/utils';
const variants = cva('ri-menu-action', {
  variants: { density: { compact: 'ri-menu-action--compact', normal: '', comfortable: 'ri-menu-action--comfortable', none: 'ri-menu-action--flush' }, selected: { true: 'ri-content--selected' }, separator: { true: 'ri-menu-action--separator' } },
});
type Own = { tone?: ContentTone; density?: 'compact' | 'normal' | 'comfortable' | 'none'; selected?: boolean; separator?: boolean; label?: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode };
export type MenuActionProps = Own & (
  | ({ kind?: 'action' } & ComponentProps<typeof ActionPrimitive>)
  | ({ kind: 'menu' } & Omit<ComponentProps<typeof DropdownMenuItem>, 'variant'>)
);
/** Radix owns actual menu interaction. Plain list actions stay real buttons. */
export function MenuAction({ tone = 'neutral', density, selected, separator, label, description, leading, trailing, children, className, ...props }: MenuActionProps) {
  const content = <>{leading}{label || description ? <span className="ri-choice-copy">{label && <span className="ri-choice-title">{label}</span>}{description && <span className="ri-choice-description">{description}</span>}{children}</span> : children}{trailing}</>;
  const classes = cn(variants({ density, selected, separator }), toneClass(tone), className);
  if (props.kind === 'menu') { const {kind, ...menu} = props; return <DropdownMenuItem {...menu} data-action-kind={kind} className={classes}>{content}</DropdownMenuItem>; }
  const {kind, ...action} = props;
  return <ActionPrimitive {...action} data-action-kind={kind} type={action.type ?? 'button'} className={classes}>{content}</ActionPrimitive>;
}

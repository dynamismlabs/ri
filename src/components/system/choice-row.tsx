'use client';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { RadioGroup as RadioPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { ActionPrimitive } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const variants = cva('ri-choice-row', {
  variants: {
    density: { compact: 'ri-choice-row--compact', normal: '', comfortable: 'ri-choice-row--comfortable', spacious: 'ri-choice-row--spacious', list: 'ri-choice-row--list' },
    surface: { track: '', plain: 'ri-choice-row--plain' },
    size: { compact: '', touch: 'ri-choice-row--touch' },
    selected: { true: 'ri-content--selected' },
  }, defaultVariants: { density: 'normal', surface: 'track', size: 'compact' },
});
type RowProps = Omit<ComponentProps<typeof ActionPrimitive>, 'title'> & {
  title?: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode;
  selected?: boolean; density?: 'compact' | 'normal' | 'comfortable' | 'spacious' | 'list'; surface?: 'track' | 'plain'; size?: 'compact' | 'touch';
};
export type ChoiceRowProps = RowProps & ({ selection?: 'pressed'; value?: never } | { selection: 'radio'; value: string });
export function ChoiceRow({ title, description, leading, trailing, children, selected, density, surface, size, className, selection, value, asChild, ...props }: ChoiceRowProps) {
  const id = useId();
  // A content row may contain its own controls. Slot keeps that existing
  // container instead of creating an invalid button around other buttons.
  if (asChild) return <ActionPrimitive {...props} asChild className={cn(variants({density, surface, size, selected}), className)}>{children}</ActionPrimitive>;
  const row = <ActionPrimitive {...props} type={props.type ?? 'button'}
    aria-labelledby={props['aria-labelledby'] ?? (title ? `${id}-title` : undefined)}
    aria-describedby={[props['aria-describedby'], description ? `${id}-description` : undefined].filter(Boolean).join(' ') || undefined}
    className={cn(variants({ density, surface, size, selected }), className)}>
    {selection === 'radio' ? <span aria-hidden className="ri-choice-indicator" /> : leading}
    {title || description ? <span className="ri-choice-copy">{title && <span id={`${id}-title`} className="ri-choice-title">{title}</span>}{description && <span id={`${id}-description`} className="ri-choice-description">{description}</span>}{children}</span> : children}
    {trailing}
  </ActionPrimitive>;
  return selection === 'radio' ? <RadioPrimitive.Item value={value!} asChild>{row}</RadioPrimitive.Item> : row;
}
export function ChoiceGroup(props: ComponentProps<typeof RadioGroup>) { return <RadioGroup {...props} />; }

'use client';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { RadioGroup as RadioPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { Check } from 'lucide-react';
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
  indicator?: 'checkbox' | 'radio';
};
export type ChoiceRowProps = RowProps & ({ selection?: 'pressed'; value?: never } | { selection: 'radio'; value: string });
export function ChoiceRow({ title, description, leading, trailing, children, selected, density, surface, size, indicator, className, selection, value, asChild, ...props }: ChoiceRowProps) {
  const id = useId();
  // A content row may contain its own controls. Slot keeps that existing
  // container instead of creating an invalid button around other buttons.
  if (asChild) return <ActionPrimitive {...props} asChild data-content-size={size} className={cn(variants({density, surface, size, selected}), 'ri-choice-row--container', className)}>{children}</ActionPrimitive>;
  const row = <ActionPrimitive {...props} data-content-size={size} type={props.type ?? 'button'}
    aria-labelledby={props['aria-labelledby'] ?? (title ? `${id}-title` : undefined)}
    aria-describedby={[props['aria-describedby'], description ? `${id}-description` : undefined].filter(Boolean).join(' ') || undefined}
    className={cn(variants({ density, surface, size, selected }), className)}>
    {selection === 'radio' || indicator ? <ChoiceIndicator kind={indicator ?? 'radio'} checked={selected || props['aria-checked'] === true || props['aria-pressed'] === true} /> : leading}
    {title || description ? <span className="ri-choice-copy">{title && <span id={`${id}-title`} className="ri-choice-title">{title}</span>}{description && <span id={`${id}-description`} className="ri-choice-description">{description}</span>}{children}</span> : children}
    {trailing}
  </ActionPrimitive>;
  return selection === 'radio' ? <RadioPrimitive.Item value={value!} asChild>{row}</RadioPrimitive.Item> : row;
}
export function ChoiceGroup(props: ComponentProps<typeof RadioGroup>) { return <RadioGroup {...props} />; }

/** Decorative selection mark for a rich row whose container already owns input. */
export function ChoiceIndicator({ kind, checked }: { kind: 'checkbox' | 'radio'; checked?: boolean }) {
  return <span aria-hidden className={cn('ri-choice-indicator', kind === 'checkbox' && 'ri-choice-indicator--checkbox')} data-checked={checked || undefined}>{kind === 'checkbox' && checked && <Check />}</span>;
}

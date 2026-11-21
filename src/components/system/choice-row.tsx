'use client';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { RadioGroup as RadioPrimitive } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

const variants = cva('ri-choice-row', {
  variants: {
    density: { compact: 'ri-choice-row--compact', normal: '', comfortable: 'ri-choice-row--comfortable' },
    surface: { track: '', plain: 'ri-choice-row--plain' },
    size: { compact: '', touch: 'ri-choice-row--touch' },
    selected: { true: 'ri-content--selected' },
  }, defaultVariants: { density: 'normal', surface: 'track', size: 'compact' },
});
type RowProps = Omit<ComponentProps<typeof Button>, 'size' | 'variant' | 'title'> & {
  title?: ReactNode; description?: ReactNode; leading?: ReactNode; trailing?: ReactNode;
  selected?: boolean; density?: 'compact' | 'normal' | 'comfortable'; surface?: 'track' | 'plain'; size?: 'compact' | 'touch';
};
export type ChoiceRowProps = RowProps & ({ selection?: 'pressed'; value?: never } | { selection: 'radio'; value: string });
export function ChoiceRow({ title, description, leading, trailing, children, selected, density, surface, size, className, selection, value, ...props }: ChoiceRowProps) {
  const id = useId();
  const row = <Button {...props} type={props.type ?? 'button'} variant="ghost"
    aria-labelledby={props['aria-labelledby'] ?? (title ? `${id}-title` : undefined)}
    aria-describedby={[props['aria-describedby'], description ? `${id}-description` : undefined].filter(Boolean).join(' ') || undefined}
    className={cn(variants({ density, surface, size, selected }), className)}>
    {leading}
    {title || description ? <span className="ri-choice-copy">{title && <span id={`${id}-title`} className="ri-choice-title">{title}</span>}{description && <span id={`${id}-description`} className="ri-choice-description">{description}</span>}{children}</span> : children}
    {trailing}
  </Button>;
  return selection === 'radio' ? <RadioPrimitive.Item value={value!} asChild>{row}</RadioPrimitive.Item> : row;
}
export function ChoiceGroup(props: ComponentProps<typeof RadioGroup>) { return <RadioGroup {...props} />; }

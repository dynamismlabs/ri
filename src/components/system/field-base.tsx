'use client';

import { useId, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Field as PrimitiveField, FieldLabel, FieldError } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { useViewportTier } from '@/hooks/use-viewport-tier';

export const fieldVariants = cva('ri-field-control w-full min-w-0', {
  variants: {
    size: { sm: 'ri-field--sm', md: 'ri-field--md', touch: 'ri-field--touch' },
    purpose: { title: 'ri-field--title', code: 'ri-field--code', embedded: 'ri-field--embedded' },
    titleSize: {
      inline: 'ri-field-title--inline',
      form: 'ri-field-title--form',
      entity: 'ri-field-title--entity',
      document: 'ri-field-title--document',
    },
    align: { start: '', center: 'ri-field--center' },
    completed: { true: 'ri-field--completed' },
  },
  defaultVariants: { size: 'md', align: 'start' },
});
export type FieldDrawing = VariantProps<typeof fieldVariants>;
export function useFieldSize(size: FieldDrawing['size']) {
  const tier = useViewportTier();
  return size ?? (tier === 'phone' ? 'touch' : 'md');
}
export interface FieldInfo {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  labelId?: string;
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
  descriptionPosition?: 'before' | 'after';
}
// Metadata props stay present while their values change, keeping the control
// mounted when validation messages appear or clear. Bare controls keep their DOM.
export function hasFieldInfo(props: FieldInfo) {
  return 'label' in props || 'description' in props || 'error' in props;
}
export function useFieldInfo(
  props: FieldInfo & {
    id?: string;
    'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    'aria-label'?: string;
  },
) {
  const autoId = useId();
  const id = props.id ?? `field-${autoId}`;
  const labelId = props.labelId ?? `${id}-label`;
  const descriptionId = props.descriptionId ?? `${id}-description`;
  const errorId = props.errorId ?? `${id}-error`;
  return {
    id,
    labelId,
    'aria-labelledby':
      props['aria-labelledby'] ?? (!props['aria-label'] && props.label ? labelId : undefined),
    descriptionId,
    errorId,
    'aria-invalid': props.error ? true : (props.invalid ?? props['aria-invalid']),
    'aria-describedby':
      [props['aria-describedby'], props.description ? descriptionId : null, props.error ? errorId : null]
        .filter(Boolean)
        .join(' ') || undefined,
  };
}
export function FieldFrame({
  info,
  label,
  description,
  error,
  children,
  className,
  descriptionPosition = 'after',
  framed,
}: FieldInfo & {
  framed: boolean;
  info: ReturnType<typeof useFieldInfo>;
  children: ReactNode;
  className?: string;
}) {
  if (!framed) return children;
  const help = description && (
    <div id={info.descriptionId} className="ri-field-description">
      {description}
    </div>
  );
  return (
    <PrimitiveField
      orientation={null}
      data-slot="system-field"
      data-invalid={info['aria-invalid'] || undefined}
      className={cn('ri-field-frame min-w-0', className)}
    >
      {descriptionPosition === 'before' && help}
      {label && (
        <FieldLabel id={info.labelId} htmlFor={info.id} className="ri-field-label">
          {label}
        </FieldLabel>
      )}
      {children}
      {descriptionPosition === 'after' && help}
      {error && (
        <FieldError id={info.errorId} className="ri-field-error">
          {error}
        </FieldError>
      )}
    </PrimitiveField>
  );
}

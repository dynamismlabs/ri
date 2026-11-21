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
  labelAction?: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  labelClassName?: string;
  description?: ReactNode;
  error?: ReactNode;
  labelId?: string;
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
  counter?: { value: number; max: number; id?: string; unit?: string };
  messagePosition?: 'before-label' | 'before-control' | 'after-control';
}
// Metadata props stay present while their values change, keeping the control
// mounted when validation messages appear or clear. Bare controls keep their DOM.
export function hasFieldInfo(props: FieldInfo) {
  return (
    'label' in props ||
    'description' in props ||
    'error' in props ||
    'counter' in props ||
    'labelAction' in props
  );
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
  const counterId = props.counter?.id ?? `${id}-count`;
  return {
    id,
    labelId,
    'aria-labelledby':
      props['aria-labelledby'] ?? (!props['aria-label'] && props.label ? labelId : undefined),
    descriptionId,
    errorId,
    counterId,
    'aria-invalid': props.error ? true : (props.invalid ?? props['aria-invalid']),
    'aria-describedby':
      [
        ...new Set([
          ...(props['aria-describedby']?.split(/\s+/) ?? []),
          props.description ? descriptionId : null,
          props.error ? errorId : null,
          props.counter ? counterId : null,
        ]),
      ]
        .filter(Boolean)
        .join(' ') || undefined,
  };
}
const fieldFrameVariants = cva('ri-field-frame min-w-0 flex', {
  variants: { orientation: { vertical: '', horizontal: 'ri-field-frame--horizontal' } },
});
export function FieldFrame({
  info,
  label,
  labelAction,
  orientation = 'vertical',
  labelClassName,
  counter,
  description,
  error,
  children,
  className,
  messagePosition = 'after-control',
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
  const messages = (
    <>
      {help}
      {error && (
        <FieldError id={info.errorId} className="ri-field-error">
          {error}
        </FieldError>
      )}
    </>
  );
  return (
    <PrimitiveField
      orientation={null}
      data-slot="system-field"
      data-invalid={info['aria-invalid'] || undefined}
      className={cn(fieldFrameVariants({ orientation }), className)}
    >
      {messagePosition === 'before-label' && messages}
      {(label || counter || labelAction) && (
        <div
          className={cn(
            'ri-field-label-row',
            orientation === 'horizontal' ? 'w-auto' : 'w-full',
            labelClassName,
          )}
        >
          {label && (
            <FieldLabel id={info.labelId} htmlFor={info.id} className="ri-field-label">
              {label}
            </FieldLabel>
          )}
          <div className="ri-field-label-actions">
            {counter && (
              <span
                id={info.counterId}
                className="ri-field-counter"
                data-over={counter.value > counter.max || undefined}
              >
                {counter.value.toLocaleString()} / {counter.max.toLocaleString()}
                {counter.unit && ` ${counter.unit}`}
              </span>
            )}
            {labelAction}
          </div>
        </div>
      )}
      {messagePosition === 'before-control' && messages}
      {children}
      {messagePosition === 'after-control' && messages}
    </PrimitiveField>
  );
}

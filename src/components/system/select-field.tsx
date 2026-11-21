'use client';

import type { ComponentProps } from 'react';
import { SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  FieldFrame,
  hasFieldInfo,
  fieldVariants,
  useFieldInfo,
  useFieldSize,
  type FieldDrawing,
  type FieldInfo,
} from './field-base';

export type SelectFieldProps = Omit<ComponentProps<typeof SelectTrigger>, 'size'> &
  FieldInfo &
  FieldDrawing & { controlClassName?: string };

/** Keep the installed Radix Select engine while owning its field drawing. */
export function SelectField(fieldProps: SelectFieldProps) {
  const {
    label,
    labelAction,
    orientation,
    labelClassName,
    description,
    error,
    labelId,
    descriptionId,
    errorId,
    invalid,
    messagePosition,
    errorPosition,
    counter,
    size: requestedSize,
    purpose,
    titleSize,
    align,
    completed,
    className,
    controlClassName,
    ...props
  } = fieldProps;
  const size = useFieldSize(requestedSize);
  const info = useFieldInfo({
    ...props,
    label,
    description,
    error,
    labelId,
    descriptionId,
    errorId,
    invalid,
    counter,
  });
  const framed = hasFieldInfo(fieldProps);
  return (
    <FieldFrame
      info={info}
      framed={framed}
      counter={counter}
      label={label}
      labelAction={labelAction}
      orientation={orientation}
      labelClassName={labelClassName}
      description={description}
      error={error}
      messagePosition={messagePosition}
      errorPosition={errorPosition}
      className={className}
    >
      <SelectTrigger
        {...props}
        id={info.id}
        aria-invalid={info['aria-invalid']}
        aria-describedby={info['aria-describedby']}
        {...(info['aria-labelledby'] ? { 'aria-labelledby': info['aria-labelledby'] } : {})}
        data-slot="field-control"
        className={cn(
          fieldVariants({ size, purpose, titleSize, align, completed }),
          'ri-field-select-trigger',
          !framed && className,
          controlClassName,
        )}
      />
    </FieldFrame>
  );
}

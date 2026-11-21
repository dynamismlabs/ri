'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import {
  fieldVariants,
  FieldFrame,
  hasFieldInfo,
  useFieldInfo,
  useFieldSize,
  type FieldDrawing,
  type FieldInfo,
} from './field-base';

export type NativeSelectProps = Omit<ComponentProps<'select'>, 'size'> &
  FieldInfo &
  FieldDrawing & { htmlSize?: number; controlClassName?: string };
export function NativeSelect(fieldProps: NativeSelectProps) {
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
    htmlSize,
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
      <select
        {...props}
        id={info.id}
        aria-invalid={info['aria-invalid']}
        aria-describedby={info['aria-describedby']}
        {...(info['aria-labelledby'] ? { 'aria-labelledby': info['aria-labelledby'] } : {})}
        size={htmlSize}
        data-slot="field-control"
        className={cn(
          fieldVariants({ size, purpose, titleSize, align, completed }),
          'ri-field-select',
          !framed && className,
          controlClassName,
        )}
      />
    </FieldFrame>
  );
}

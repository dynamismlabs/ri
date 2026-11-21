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
  FieldDrawing & { htmlSize?: number };
export function NativeSelect(fieldProps: NativeSelectProps) {
  const {
    label,
    description,
    error,
    labelId,
    descriptionId,
    errorId,
    invalid,
    descriptionPosition,
    size: requestedSize,
    purpose,
    titleSize,
    align,
    completed,
    htmlSize,
    className,
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
  });
  const framed = hasFieldInfo(fieldProps);
  return (
    <FieldFrame
      info={info}
      framed={framed}
      label={label}
      description={description}
      error={error}
      descriptionPosition={descriptionPosition}
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
        )}
      />
    </FieldFrame>
  );
}

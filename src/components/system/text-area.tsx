'use client';

import type { ComponentProps, CSSProperties } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cva } from 'class-variance-authority';
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

const areaVariants = cva('ri-field-textarea', {
  variants: {
    autoSize: { true: 'ri-field-textarea--auto' },
    resize: { none: '', vertical: 'ri-field-textarea--resize' },
  },
});
export type TextAreaProps = Omit<ComponentProps<typeof Textarea>, 'size'> &
  FieldInfo &
  FieldDrawing & {
    autoSize?: boolean;
    resize?: 'none' | 'vertical';
    /** Keep an auto-sizing editor within a readable number of lines. */
    maxRows?: number;
  };
export function TextArea(fieldProps: TextAreaProps) {
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
    rows = 3,
    autoSize = false,
    resize = 'none',
    maxRows,
    className,
    style,
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
      <Textarea
        {...props}
        id={info.id}
        aria-invalid={info['aria-invalid']}
        aria-describedby={info['aria-describedby']}
        {...(info['aria-labelledby'] ? { 'aria-labelledby': info['aria-labelledby'] } : {})}
        rows={rows}
        data-slot="field-control"
        className={cn(
          fieldVariants({ size, purpose, titleSize, align, completed }),
          areaVariants({ autoSize, resize }),
          !framed && className,
        )}
        style={{ '--field-rows': rows, '--field-max-rows': maxRows, ...style } as CSSProperties}
      />
    </FieldFrame>
  );
}

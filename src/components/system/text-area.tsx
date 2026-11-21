'use client';

import { useCallback, type ComponentProps, type CSSProperties } from 'react';
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea';
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

const areaVariants = cva('ri-field-textarea block', {
  variants: {
    autoSize: { true: 'ri-field-textarea--auto' },
    resize: { none: '', vertical: 'ri-field-textarea--resize' },
  },
});
export type TextAreaProps = Omit<ComponentProps<typeof Textarea>, 'size'> &
  FieldInfo &
  FieldDrawing & {
    controlClassName?: string;
    autoSize?: boolean;
    resize?: 'none' | 'vertical';
    /** Keep an auto-sizing editor within a readable number of lines. */
    maxRows?: number;
  };
export function TextArea(fieldProps: TextAreaProps) {
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
    rows = 3,
    autoSize = false,
    resize = 'none',
    maxRows,
    className,
    controlClassName,
    style,
    ref,
    onInput,
    ...props
  } = fieldProps;
  const { ref: autosizeRef, resize: resizeArea } = useAutosizeTextarea(props.value?.toString());
  const attach = useCallback(
    (element: HTMLTextAreaElement | null) => {
      const previousSizing = element?.style.getPropertyValue('field-sizing') ?? '';
      const previousHeight = element?.style.height ?? '';
      const cleanup = autoSize ? autosizeRef(element) : undefined;
      const cleanupRef = typeof ref === 'function' ? ref(element) : undefined;
      if (ref && typeof ref !== 'function') ref.current = element;
      return () => {
        cleanup?.();
        if (element && autoSize) {
          element.style.setProperty('field-sizing', previousSizing);
          element.style.height = previousHeight;
        }
        if (typeof cleanupRef === 'function') cleanupRef();
        else if (typeof ref === 'function') ref(null);
        else if (ref) ref.current = null;
      };
    },
    [autoSize, autosizeRef, ref],
  );
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
      <Textarea
        {...props}
        ref={attach}
        onInput={(event) => {
          onInput?.(event);
          if (autoSize) resizeArea();
        }}
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
          controlClassName,
        )}
        style={{ '--field-rows': rows, '--field-max-rows': maxRows, ...style } as CSSProperties}
      />
    </FieldFrame>
  );
}

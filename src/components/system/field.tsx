'use client';

import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
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

type InputProps = Omit<ComponentProps<typeof Input>, 'size'>;
type FieldBaseProps = Omit<InputProps, 'children'> &
  Omit<FieldInfo, 'label'> &
  FieldDrawing & {
    /** Layout for the control when the label and messages span a wider frame. */
    controlClassName?: string;
    /** Native character count, when the form needs it. */
    htmlSize?: number;
    leading?: ReactNode;
    trailing?: ReactNode;
    /** Parser feedback stays inside date and recurrence controls. */
    inlineMessage?: boolean;
  };

export type FieldProps = FieldBaseProps &
  (
    | { asChild?: false; label?: ReactNode; children?: never }
    | { asChild: true; purpose: 'embedded'; label?: never; children: ReactElement }
  );

export function Field(fieldProps: FieldProps) {
  const {
    label,
    description,
    error,
    labelId,
    descriptionId,
    errorId,
    invalid,
    descriptionPosition,
    inlineMessage,
    size: requestedSize,
    purpose,
    titleSize,
    align,
    completed,
    htmlSize,
    leading,
    trailing,
    asChild,
    children,
    className,
    controlClassName,
    ...props
  } = fieldProps;
  const size = useFieldSize(requestedSize);
  const child = asChild && isValidElement<InputProps>(children) ? children : null;
  const info = useFieldInfo({
    ...child?.props,
    ...props,
    label,
    description,
    error,
    labelId,
    descriptionId,
    errorId,
    invalid,
  });
  const framed = 'label' in fieldProps || (!inlineMessage && hasFieldInfo(fieldProps));
  const grouped = !!inlineMessage || 'leading' in fieldProps || 'trailing' in fieldProps;
  const Control = asChild ? Slot.Root : Input;
  const control = (
    <Control
      {...props}
      id={info.id}
      aria-invalid={info['aria-invalid']}
      aria-describedby={info['aria-describedby']}
      {...(info['aria-labelledby'] ? { 'aria-labelledby': info['aria-labelledby'] } : {})}
      size={htmlSize}
      data-slot="field-control"
      className={cn(
        fieldVariants({ size, purpose, titleSize, align, completed }),
        !framed && !grouped && className,
        !grouped && controlClassName,
      )}
    >
      {child
        ? cloneElement(child, {
            id: info.id,
            'aria-invalid': info['aria-invalid'],
            ...(info['aria-labelledby'] ? { 'aria-labelledby': info['aria-labelledby'] } : {}),
            'aria-describedby': info['aria-describedby'],
          })
        : children}
    </Control>
  );
  return (
    <FieldFrame
      info={info}
      framed={framed}
      label={label}
      description={!inlineMessage && description}
      error={!inlineMessage && error}
      descriptionPosition={descriptionPosition}
      className={className}
    >
      {grouped ? (
        <InputGroup
          data-slot="field-shell"
          aria-invalid={info['aria-invalid']}
          data-disabled={props.disabled || undefined}
          className={cn('ri-field-shell', `ri-field--${size}`, !framed && className, controlClassName)}
        >
          {leading && (
            <InputGroupAddon className="ri-field-addon" align="inline-start">
              {leading}
            </InputGroupAddon>
          )}
          {control}
          {(trailing || (inlineMessage && (description || error))) && (
            <InputGroupAddon className="ri-field-addon" align="inline-end">
              {trailing}
              {inlineMessage && description && (
                <span id={info.descriptionId} aria-live="polite">
                  {description}
                </span>
              )}
              {inlineMessage && error && (
                <span id={info.errorId} role="alert">
                  {error}
                </span>
              )}
            </InputGroupAddon>
          )}
        </InputGroup>
      ) : (
        control
      )}
    </FieldFrame>
  );
}

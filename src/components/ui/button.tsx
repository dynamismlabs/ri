'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Product button drawing. Call sites pass layout, named variants and state. */
const buttonVariants = cva('ri-button', {
  variants: {
    variant: {
      primary: 'ri-button--primary',
      secondary: 'ri-button--secondary',
      ghost: 'ri-button--ghost',
      destructive: 'ri-button--destructive',
      link: 'ri-button--link',
    },
    size: {
      xs: 'ri-button--xs',
      sm: 'ri-button--sm',
      md: 'ri-button--md',
      touch: 'ri-button--touch',
    },
    icon: { true: 'ri-button--icon' },
    pressed: { true: 'ri-button--pressed' },
    floating: { true: 'ri-button--floating' },
    clip: { true: 'ri-button--clip' },
    reveal: { true: 'ri-button--reveal', nav: 'ri-button--reveal-nav', tag: 'ri-button--reveal-tag', fold: 'ri-button--reveal-fold' },
    focus: { inside: 'ri-button--focus-inside', outside: '' },
    tone: {
      neutral: '',
      attention: 'ri-tone--attention',
      warning: 'ri-tone--warning',
      danger: 'ri-tone--danger',
      success: 'ri-tone--success',
      working: 'ri-tone--working',
      info: 'ri-tone--info',
      'energy-light': 'ri-tone--energy-light',
      'energy-deep': 'ri-tone--energy-deep',
      'mode-auto': 'ri-tone--mode-auto',
      'mode-edits': 'ri-tone--mode-edits',
      'mode-ask': 'ri-tone--mode-ask',
      'mode-plan': 'ri-tone--mode-plan',
      'status-consider': 'ri-tone--status-consider',
      'status-todo': 'ri-tone--status-todo',
      'status-progress': 'ri-tone--status-progress',
      'status-done': 'ri-tone--status-done',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'sm', tone: 'neutral', focus: 'outside' },
});

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
};
export type ButtonTone = NonNullable<ButtonProps['tone']>;
export type ButtonSize = NonNullable<ButtonProps['size']>;

function Button({
  className,
  variant = 'secondary',
  size = 'sm',
  tone = 'neutral',
  icon = false,
  pressed,
  floating,
  clip,
  reveal,
  focus = 'outside',
  asChild = false,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      aria-pressed={pressed ?? props['aria-pressed']}
      aria-disabled={asChild && disabled ? true : props['aria-disabled']}
      disabled={disabled}
      tabIndex={asChild && disabled ? -1 : props.tabIndex}
      className={cn(buttonVariants({ variant, size, tone, icon, pressed, floating, clip, reveal, focus }), className)}
      onClickCapture={(event) => {
        if (asChild && disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onClickCapture?.(event);
      }}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}

export { Button, buttonVariants };

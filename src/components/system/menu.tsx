'use client';
import type { ComponentProps } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  DropdownMenuContentPrimitive,
  DropdownMenuSubContentPrimitive,
  DropdownMenuSubTriggerPrimitive,
  DropdownMenuLabelPrimitive,
  DropdownMenuSeparatorPrimitive,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DropdownMenuCheckboxItem as CheckboxItem, DropdownMenuRadioItem as RadioItem } from '@/components/ui/dropdown-menu';
import { toneClass, type ContentTone } from './callout';
import { overlayVariants, type OverlayDrawing } from './overlay';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
} from '@/components/ui/dropdown-menu';
export function DropdownMenuContent({
  className,
  padding = 'xs',
  align = 'start',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuContentPrimitive> &
  Omit<OverlayDrawing, 'kind'>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuContentPrimitive
        data-slot="dropdown-menu-content"
        data-motion
        align={align}
        sideOffset={sideOffset}
        className={cn(
          overlayVariants({ kind: 'menu', padding }),
          'z-50 min-w-48 w-(--radix-dropdown-menu-trigger-width) max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto outline-none',
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}
export function DropdownMenuSubContent({
  className,
  padding = 'xs',
  ...props
}: ComponentProps<typeof DropdownMenuSubContentPrimitive> &
  Omit<OverlayDrawing, 'kind'>) {
  return (
    <DropdownMenuSubContentPrimitive
      data-slot="dropdown-menu-sub-content"
      data-motion
      className={cn(
        overlayVariants({ kind: 'menu', padding }),
        'z-50 min-w-36 overflow-hidden outline-none',
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuSubTriggerPrimitive> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuSubTriggerPrimitive
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn('ri-menu-action', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" />
    </DropdownMenuSubTriggerPrimitive>
  );
}
export function DropdownMenuLabel({
  className,
  inset,
  tone,
  ...props
}: ComponentProps<typeof DropdownMenuLabelPrimitive> & { inset?: boolean; tone?: ContentTone }) {
  return (
    <DropdownMenuLabelPrimitive
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn('ri-menu-label', toneClass(tone), className)}
      {...props}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuSeparatorPrimitive>) {
  return (
    <DropdownMenuSeparatorPrimitive
      data-slot="dropdown-menu-separator"
      className={cn('ri-menu-separator', className)}
      {...props}
    />
  );
}
export function DropdownMenuShortcut({
  className,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ri-menu-shortcut', className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({className, ...props}: ComponentProps<typeof CheckboxItem>) {
  return <CheckboxItem className={cn('ri-menu-action ri-menu-action--indicator', className)} {...props} />;
}
export function DropdownMenuRadioItem({className, ...props}: ComponentProps<typeof RadioItem>) {
  return <RadioItem className={cn('ri-menu-action ri-menu-action--indicator', className)} {...props} />;
}

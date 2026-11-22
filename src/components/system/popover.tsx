'use client';
import type { ComponentProps } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverClose,
  PopoverContentPrimitive,
  PopoverPortal,
  PopoverAnchor,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { overlayVariants, type OverlayDrawing } from './overlay';
export { Popover, PopoverTrigger, PopoverClose, PopoverPortal, PopoverAnchor };
export function PopoverFrame({
  className,
  padding = 'md',
  sideOffset = 4,
  align = 'center',
  ...props
}: ComponentProps<typeof PopoverContentPrimitive> &
  Omit<OverlayDrawing, 'kind'>) {
  return (
    <PopoverContentPrimitive
      data-slot="popover-content"
      sideOffset={sideOffset}
      align={align}
      className={cn(
        overlayVariants({ kind: 'popover', padding }),
        'z-50 w-72 outline-none',
        className,
      )}
      {...props}
    />
  );
}
export function PopoverContent(props: ComponentProps<typeof PopoverFrame>) {
  return (
    <PopoverPortal>
      <PopoverFrame {...props} />
    </PopoverPortal>
  );
}
export const PopoverPrimitive = {
  Root: Popover,
  Trigger: PopoverTrigger,
  Close: PopoverClose,
  Portal: PopoverPortal,
  Anchor: PopoverAnchor,
  Content: PopoverFrame,
};

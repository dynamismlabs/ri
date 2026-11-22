'use client';
import type { ComponentProps } from 'react';
import {
  Tooltip as TooltipRoot,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
  TooltipContentPrimitive,
  TooltipPortal,
  TooltipArrow,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { overlayVariants } from './overlay';
export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
export function TooltipFrame({
  className,
  sideOffset = 0,
  children,
  ...props
}: ComponentProps<typeof TooltipContentPrimitive>) {
  return (
    <TooltipContentPrimitive
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn(
        overlayVariants({ kind: 'tooltip', padding: 'sm' }),
        'z-50',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipArrow className="ri-tooltip-arrow" />
    </TooltipContentPrimitive>
  );
}

export function TooltipContent(props: ComponentProps<typeof TooltipFrame>) {
  return (
    <TooltipPortal>
      <TooltipFrame {...props} />
    </TooltipPortal>
  );
}
export const TooltipPrimitive = {
  Root: TooltipRoot,
  Provider: TooltipProviderPrimitive,
  Trigger: TooltipTriggerPrimitive,
  Content: TooltipFrame,
  Portal: TooltipPortal,
  Arrow: TooltipArrow,
};

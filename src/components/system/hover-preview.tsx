'use client';
import type { ComponentProps } from 'react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContentPrimitive,
  HoverCardPortal,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { overlayVariants, type OverlayDrawing } from './overlay';
export { HoverCard, HoverCardTrigger };
export function HoverPreviewFrame({
  className,
  padding = 'lg',
  ...props
}: ComponentProps<typeof HoverCardContentPrimitive> &
  Omit<OverlayDrawing, 'kind'>) {
  return (
    <HoverCardContentPrimitive
      data-slot="hover-preview"
      className={cn(
        overlayVariants({ kind: 'preview', padding }),
        'z-50 outline-none',
        className,
      )}
      {...props}
    />
  );
}
export function HoverPreviewContent(
  props: ComponentProps<typeof HoverPreviewFrame>,
) {
  return (
    <HoverCardPortal>
      <HoverPreviewFrame {...props} />
    </HoverCardPortal>
  );
}
export const HoverCardPrimitive = {
  Root: HoverCard,
  Trigger: HoverCardTrigger,
  Portal: HoverCardPortal,
  Content: HoverPreviewFrame,
};

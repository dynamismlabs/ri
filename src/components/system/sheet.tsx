'use client';
import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContentPrimitive,
  SheetOverlayPrimitive,
  SheetPortalPrimitive,
  SheetTitlePrimitive,
  SheetDescriptionPrimitive,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';
import { overlayVariants, type OverlayDrawing } from './overlay';
export { Sheet, SheetTrigger, SheetClose };
const sheetVariants = cva('ri-sheet', {
  variants: {
    side: {
      right: 'ri-sheet--right',
      left: 'ri-sheet--left',
      top: 'ri-sheet--top',
      bottom: 'ri-sheet--bottom',
    },
  },
  defaultVariants: { side: 'right' },
});
type SheetFrameProps = ComponentProps<typeof SheetContentPrimitive> &
  VariantProps<typeof sheetVariants> &
  Omit<OverlayDrawing, 'kind'> & { animated?: boolean; safeArea?: boolean };
export function SheetFrame({
  side = 'right',
  padding = 'none',
  className,
  animated = false,
  safeArea = false,
  ...props
}: SheetFrameProps) {
  return (
    <SheetContentPrimitive
      data-slot="sheet-content"
      data-side={side}
      data-motion={animated || undefined}
      className={cn(
        overlayVariants({ kind: 'sheet', padding }),
        sheetVariants({ side }),
        safeArea && 'ri-sheet--safe-area',
        className,
      )}
      {...props}
    />
  );
}
export function SheetContent({
  showCloseButton = true,
  children,
  ...props
}: SheetFrameProps & { showCloseButton?: boolean }) {
  return (
    <SheetPortalPrimitive>
      <SheetOverlayPrimitive
        data-slot="sheet-overlay"
        className="ri-overlay-scrim fixed inset-0 z-50"
      />
      <SheetFrame animated {...props}>
        {children}
        {showCloseButton && (
          <SheetClose asChild>
            <IconButton
              label="Close"
              size="sm"
              className="absolute right-4 top-4"
            >
              <X />
            </IconButton>
          </SheetClose>
        )}
      </SheetFrame>
    </SheetPortalPrimitive>
  );
}
export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('ri-sheet-header', className)}
      {...props}
    />
  );
}
export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('ri-sheet-footer ri-dialog-footer', className)}
      {...props}
    />
  );
}
export function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetTitlePrimitive>) {
  return (
    <SheetTitlePrimitive
      data-slot="sheet-title"
      className={cn('ri-overlay-title', className)}
      {...props}
    />
  );
}
export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetDescriptionPrimitive>) {
  return (
    <SheetDescriptionPrimitive
      data-slot="sheet-description"
      className={cn('ri-overlay-description', className)}
      {...props}
    />
  );
}

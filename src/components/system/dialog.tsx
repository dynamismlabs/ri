'use client';

import type { ComponentProps } from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogContentPrimitive,
  DialogOverlayPrimitive,
  DialogTitlePrimitive,
  DialogDescriptionPrimitive,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { IconButton } from './icon-button';
import { Button } from './button';
import { overlayVariants, frameHeightVariants, type FrameHeight, type OverlayDrawing } from './overlay';
export { Dialog, DialogTrigger, DialogPortal, DialogClose };

const dialogVariants = cva('ri-dialog', {
  variants: {
    placement: {
      custom: '',
      viewport: 'ri-dialog--viewport',
      center: 'ri-dialog--center',
      page: 'ri-dialog--page',
      search: 'ri-dialog--search',
    },
    size: {
      sm: 'ri-dialog--sm',
      md: 'ri-dialog--md',
      lg: 'ri-dialog--lg',
      wide: 'ri-dialog--wide',
      full: 'ri-dialog--full',
    },
  },
  defaultVariants: { placement: 'center', size: 'md' },
});
type FrameProps = ComponentProps<typeof DialogContentPrimitive> &
  VariantProps<typeof dialogVariants> & FrameHeight &
  Omit<OverlayDrawing, 'kind'> & { animated?: boolean };
export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogOverlayPrimitive>) {
  return (
    <DialogOverlayPrimitive
      data-slot="dialog-overlay"
      className={cn('ri-overlay-scrim fixed inset-0 z-50', className)}
      {...props}
    />
  );
}
/** Existing portals can compose this content without a second portal or scrim. */
export function DialogFrame({
  className,
  padding = 'xl',
  placement,
  size,
  height,
  animated = false,
  ...props
}: FrameProps) {
  return (
    <DialogContentPrimitive
      data-slot="dialog-content"
      data-motion={animated || undefined}
      className={cn(
        overlayVariants({ kind: 'dialog', padding }),
        placement !== 'custom' && dialogVariants({ placement, size }),
        frameHeightVariants({ height }),
        className,
      )}
      {...props}
    />
  );
}
export function DialogContent({
  children,
  showCloseButton = true,
  ...props
}: FrameProps & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogFrame animated {...props}>
        {children}
        {showCloseButton && (
          <DialogClose asChild>
            <IconButton
              label="Close"
              className="absolute right-4 top-4"
              size="sm"
            >
              <X />
            </IconButton>
          </DialogClose>
        )}
      </DialogFrame>
    </DialogPortal>
  );
}
export function DialogHeader({
  className,
  divider = false,
  padding = 'none',
  closeSpace = false,
  ...props
}: ComponentProps<'div'> & { divider?: boolean; padding?: 'none' | 'lg' | 'panel'; closeSpace?: boolean }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'ri-dialog-header',
        padding !== 'none' && `ri-dialog-section--${padding}`,
        closeSpace && 'ri-dialog-header--close',
        divider && 'ri-overlay-divider--bottom',
        className,
      )}
      {...props}
    />
  );
}
export function DialogBody({ className, padding = 'none', compact = false, ...props }: ComponentProps<'div'> & { padding?: 'none' | 'panel'; compact?: boolean }) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('ri-dialog-body', padding === 'panel' && 'ri-dialog-body--panel', compact && 'ri-dialog-body--compact', className)}
      {...props}
    />
  );
}
export function DialogFooter({
  className,
  showCloseButton = false,
  divider = false,
  padding = 'none',
  children,
  ...props
}: ComponentProps<'div'> & { showCloseButton?: boolean; divider?: boolean; padding?: 'none' | 'md' | 'panel' }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'ri-dialog-footer',
        padding !== 'none' && `ri-dialog-section--${padding}`,
        divider && 'ri-overlay-divider--top',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="secondary">Close</Button>
        </DialogClose>
      )}
    </div>
  );
}
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogTitlePrimitive>) {
  return (
    <DialogTitlePrimitive
      data-slot="dialog-title"
      className={cn('ri-overlay-title', className)}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogDescriptionPrimitive>) {
  return (
    <DialogDescriptionPrimitive
      data-slot="dialog-description"
      className={cn('ri-overlay-description', className)}
      {...props}
    />
  );
}
export const DialogPrimitive = {
  Root: Dialog,
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Close: DialogClose,
  Overlay: DialogOverlay,
  Content: DialogFrame,
  Title: DialogTitle,
  Description: DialogDescription,
};

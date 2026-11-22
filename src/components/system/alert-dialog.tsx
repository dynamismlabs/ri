'use client';
import type { ComponentProps } from 'react';
import {
  AlertDialogPortal,
  AlertDialogContentPrimitive,
  AlertDialogOverlayPrimitive,
  AlertDialogTitlePrimitive,
  AlertDialogDescriptionPrimitive,
  AlertDialogHeader as HeaderPrimitive,
  AlertDialogFooter as FooterPrimitive,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { overlayVariants, type OverlayDrawing } from './overlay';
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogMedia,
  AlertDialogPortal,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof AlertDialogOverlayPrimitive>) {
  return (
    <AlertDialogOverlayPrimitive
      data-slot="alert-dialog-overlay"
      className={cn('ri-overlay-scrim fixed inset-0 z-50', className)}
      {...props}
    />
  );
}
export function AlertDialogContent({
  className,
  padding = 'xl',
  size = 'default',
  ...props
}: ComponentProps<typeof AlertDialogContentPrimitive> &
  Omit<OverlayDrawing, 'kind'> & { size?: 'default' | 'sm' }) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogContentPrimitive
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          overlayVariants({ kind: 'dialog', padding }),
          'ri-dialog ri-dialog--center group/alert-dialog-content',
          size === 'sm' ? 'ri-alert-dialog--sm' : 'ri-alert-dialog--default',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}
export function AlertDialogHeader({className,...props}: ComponentProps<typeof HeaderPrimitive>) {
  return <HeaderPrimitive className={cn('ri-alert-dialog-header',className)} {...props} />;
}
export function AlertDialogFooter({className,...props}: ComponentProps<typeof FooterPrimitive>) {
  return <FooterPrimitive className={cn('ri-alert-dialog-footer',className)} {...props} />;
}
export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogTitlePrimitive>) {
  return (
    <AlertDialogTitlePrimitive
      data-slot="alert-dialog-title"
      className={cn('ri-overlay-title', className)}
      {...props}
    />
  );
}
export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogDescriptionPrimitive>) {
  return (
    <AlertDialogDescriptionPrimitive
      data-slot="alert-dialog-description"
      className={cn('ri-overlay-description', className)}
      {...props}
    />
  );
}

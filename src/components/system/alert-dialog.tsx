'use client';
import type { ComponentProps } from 'react';
import {
  AlertDialogPortal,
  AlertDialogContentPrimitive,
  AlertDialogOverlayPrimitive,
  AlertDialogTitlePrimitive,
  AlertDialogDescriptionPrimitive,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { overlayVariants, type OverlayDrawing } from './overlay';
import { DialogHeader, DialogFooter } from './dialog';
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
        className={cn(
          overlayVariants({ kind: 'dialog', padding }),
          'ri-dialog ri-dialog--center',
          size === 'sm' ? 'ri-dialog--sm' : 'ri-dialog--md',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}
export function AlertDialogHeader(props: ComponentProps<typeof DialogHeader>) {
  return <DialogHeader {...props} />;
}
export function AlertDialogFooter(props: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter {...props} />;
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

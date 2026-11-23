'use client';
import type { ComponentProps } from 'react';
import { Toaster as ToasterPrimitive } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { OverlaySurface } from './overlay';
export function Toaster({
  toastOptions,
  ...props
}: ComponentProps<typeof ToasterPrimitive>) {
  return (
    <ToasterPrimitive
      {...props}
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn('ri-toast', toastOptions?.classNames?.toast),
          title: cn('ri-toast-title', toastOptions?.classNames?.title),
          description: cn(
            'ri-toast-description',
            toastOptions?.classNames?.description,
          ),
        },
      }}
    />
  );
}
export function ToastSurface(props: ComponentProps<typeof OverlaySurface>) {
  return <OverlaySurface kind="toast" padding="lg" {...props} />;
}

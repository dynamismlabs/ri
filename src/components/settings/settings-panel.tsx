'use client';

import { FormFooterHost } from '@/components/system/form-actions';

import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/system/dialog';

/**
 * Navigation and settings operations belong to the active Home's adapter.
 *
 * Centered with `inset-0 m-auto`, not the shared dialog's translate: a transform
 * makes this box the frame for every `position: fixed` inside it, so its
 * `overflow-hidden` cuts off an in-tree popover at the dialog's edge (see
 * LauncherPopoverContent).
 */
export function SettingsPanel({ navigation, title, description, children, compact, bodyRef, bodyClassName, onOpenAutoFocus }: {
  navigation?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  compact?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  bodyClassName?: string;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return <DialogContent padding="none"
    className={cn('inset-0 m-auto flex max-h-[92dvh] w-full max-w-[calc(100%-1rem)] translate-none flex-col gap-0 overflow-hidden', compact ? 'h-fit sm:max-w-xl' : 'h-[800px] sm:max-w-6xl sm:flex-row')}
    onOpenAutoFocus={onOpenAutoFocus}
  >
    {navigation}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DialogHeader className="gap-1 border-b px-5 py-4 pr-12 text-left">
        <DialogTitle className="text-balance">{title}</DialogTitle>
        <DialogDescription className="">{description}</DialogDescription>
      </DialogHeader>
      <FormFooterHost>
      <div ref={bodyRef} data-slot="settings-body" data-settings-scroll className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5 pt-5', bodyClassName)}>
        {children}
      </div>
      </FormFooterHost>
    </div>
  </DialogContent>;
}

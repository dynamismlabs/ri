'use client';
import type { ComponentProps } from 'react';
import {
  SelectContent as Content,
  SelectItem as Item,
  SelectLabel as Label,
  SelectSeparator as Separator,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { overlayVariants } from './overlay';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '@/components/ui/select';
export function SelectContent({
  className,
  ...props
}: ComponentProps<typeof Content>) {
  return (
    <Content
      className={cn(
        overlayVariants({ kind: 'menu', padding: 'none' }),
        'rounded-xl border-0 ring-0 shadow-(--shadow-pop)',
        className,
      )}
      {...props}
    />
  );
}
export function SelectItem({
  className,
  ...props
}: ComponentProps<typeof Item>) {
  return <Item className={cn('ri-menu-action ri-menu-action--indicator', className)} {...props} />;
}
export function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return <Label className={cn('ri-menu-label py-2', className)} {...props} />;
}
export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof Separator>) {
  return (
    <Separator className={cn('ri-menu-separator', className)} {...props} />
  );
}

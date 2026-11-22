import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
/** A title beside a choice or switch uses the same type as a Field label. */
export function FormLabel({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="form-label"
      className={cn('ri-field-label', className)}
      {...props}
    />
  );
}
export function FormDescription({
  className,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span className={cn('ri-field-description block', className)} {...props} />
  );
}

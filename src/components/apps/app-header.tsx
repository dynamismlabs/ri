'use client';

import { Button } from '@/components/system/button';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The header the library's surfaces share, in the shape of the agent and
 * skill headers: a mark, a name, one quiet line under it, and the actions at
 * the right. `onBack` is the way to the library, kept for every layout since
 * the phone hides the top bar here.
 */
export function AppHeader({
  onBack,
  mark,
  title,
  subtitle,
  children,
}: {
  onBack?: () => void;
  mark: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="@container min-w-0 flex-shrink-0 border-b border-border">
      <div className="flex min-w-0 items-center gap-3 px-4 py-2">
        {onBack && (
          <Button
            type="button"
            onClick={onBack}
            variant="secondary"
            size="sm"
            className="-ml-1.5 flex flex-shrink-0 items-center gap-1"
          >
            <ArrowLeft size={12} aria-hidden />
            Apps
          </Button>
        )}
        {mark}
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold text-foreground">{title}</h1>
          {subtitle && <div className="truncate text-[10.5px] text-muted-foreground/75">{subtitle}</div>}
        </div>
        <div className="flex-1" />
        <div className="flex flex-shrink-0 items-center gap-1.5">{children}</div>
      </div>
    </header>
  );
}

/** The header's primary verb: the one thing this surface is for. */
export function PrimaryAction({
  icon,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { icon?: ReactNode }) {
  return (
    <Button
      type="button"
      {...props}
      variant="primary"
      size="sm"
      className={cn("flex flex-shrink-0 items-center gap-1.5", className)}
    >
      {icon}
      {children}
    </Button>
  );
}

/** A quiet labeled action beside the primary one, or a toggle when `pressed` is set. */
export function QuietAction({
  icon,
  pressed,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { icon?: ReactNode; pressed?: boolean }) {
  return (
    <Button
      type="button"
      aria-pressed={pressed}
      {...props}
      variant="secondary"
      size="sm"
      className={cn("flex flex-shrink-0 items-center gap-1.5", className)}
    >
      {icon}
      {children}
    </Button>
  );
}

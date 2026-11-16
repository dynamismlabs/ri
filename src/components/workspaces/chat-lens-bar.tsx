'use client';

import type { ReactNode } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Which chats a list shows, as a row of tabs over it (docs/chat-lenses.md):
 * Unread, Working and everything. Each tab carries its count, so the row
 * itself answers "anything for me?" and "anything running?" before a tap.
 *
 * `ChatLenses` holds the choice, `ChatLensBar` is the row and `ChatLensPanel`
 * one tab's list. Radix Tabs underneath, so arrows move between tabs and a
 * screen reader hears a tab list.
 */
export function ChatLenses<T extends string>({
  value,
  onChange,
  className,
  children,
}: {
  value: T;
  onChange: (next: T) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      activationMode="automatic"
      className={className}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export interface ChatLensOption<T extends string> {
  value: T;
  label: string;
  /** Shown when above zero. An empty tab says so when picked. */
  count?: number;
  /** Amber for what wants you, green for what's running. Plain otherwise. */
  tone?: 'attention' | 'working';
  /** Something is blocked on you: the count pulses, as the rail's does. */
  pulse?: boolean;
}

export function ChatLensBar<T extends string>({
  options,
  label,
  size = 'compact',
  className,
}: {
  options: ReadonlyArray<ChatLensOption<T>>;
  label: string;
  /** `touch` for the phone: taller tabs and larger text. */
  size?: 'touch' | 'compact';
  className?: string;
}) {
  const touch = size === 'touch';
  return (
    <TabsPrimitive.List
      aria-label={label}
      // Full width on the phone, the iOS norm. Inline elsewhere, like the
      // rail's Agents | Recent switch.
      className={cn('items-center gap-0.5 rounded-lg bg-muted/60 p-0.5', touch ? 'flex' : 'inline-flex', className)}
    >
      {options.map((option) => (
        <TabsPrimitive.Trigger
          key={option.value}
          value={option.value}
          data-lens={option.value}
          className={cn(
            'flex min-w-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap',
            'text-muted-foreground transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            // Raised above the track: white in light, a lighter gray in dark.
            'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-input',
            touch ? 'h-9 flex-1 px-2 text-[13px]' : 'h-6 px-2.5 text-[11px]',
          )}
        >
          <span className="truncate">{option.label}</span>
          <LensCount option={option} touch={touch} />
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

function LensCount<T extends string>({ option, touch }: { option: ChatLensOption<T>; touch: boolean }) {
  const count = option.count ?? 0;
  if (count <= 0) return null;
  return (
    <span
      data-lens-count={option.tone ?? 'plain'}
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full px-1.5 font-semibold tabular-nums leading-none',
        touch ? 'h-[18px] min-w-[18px] text-[11px]' : 'h-[15px] min-w-[15px] text-[9.5px]',
        option.tone === 'attention'
          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : option.tone === 'working'
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        option.pulse && 'animate-pulse',
      )}
    >
      {count}
    </span>
  );
}

/** One tab's list. Mounted only while picked. */
export function ChatLensPanel<T extends string>({
  value,
  className,
  children,
}: {
  value: T;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Content value={value} className={cn('outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

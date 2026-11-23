
import { StatusBadge } from '@/components/system/status-badge';
import { cn } from '@/lib/utils';

/** What a rail count means: work in flight (blue) or something waiting on you (amber). */
export type RailTone = 'live' | 'attention';

const DOT = {
  live: 'bg-blue-500',
  attention: 'bg-amber-500',
} as const;

/** A live count beside a label in the wide rail. */
export function RailCount({ count, tone, className }: { count: number; tone: RailTone; className?: string }) {
  return (
    <StatusBadge tone={({live:"info",attention:"warning"} as const)[tone]}
      className={cn("inline-flex items-center gap-1 tabular-nums", className)}
      aria-label={tone === 'attention' ? `${count} waiting on you` : `${count} active`}
    >
      <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden />
      {count}
    </StatusBadge>
  );
}

/** The same count as a dot on an icon in the collapsed strip. */
export function RailDot({ tone }: { tone: RailTone }) {
  return <span className={cn('absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background', DOT[tone])} aria-hidden />;
}

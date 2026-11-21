'use client';

import { StatusBadge } from '@/components/system/status-badge';
import { MetaItem, useInMeta } from '@/components/system/meta';
import { Ban, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import type { TaskAttentionSignals } from '@/db/types';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tip';

// Priority order (highest human-attention first), per the attention contract:
// Blocked, then Update, then Stalled, then Working. ("Needs input" is omitted —
// pending agent input is not durably tracked, so we do not fabricate it.)
// The review signal reads as "Update" because it is an execution-level
// workstream checkpoint, not proof this exact task needs task-scoped review.
const BADGES = [
  { key: 'blocked', label: 'Blocked', title: 'Blocked by an unresolved dependency', icon: Ban, tone: 'error' },
  { key: 'stalled', label: 'Stalled', title: 'The agent workstream stalled', icon: AlertTriangle, tone: 'warning' },
  { key: 'review', label: 'Update', title: 'Workstream update. The agent posted output to review', icon: Eye, tone: 'status-progress' },
  { key: 'working', label: 'Working', title: 'An agent is actively working this', icon: Loader2, tone: 'success' },
] as const;

/**
 * Derived attention badges for a task in Current Work (and on In-progress rows).
 * Truthful and quiet: renders nothing when there's nothing to flag. Multiple
 * badges can coexist (e.g. Blocked + Working).
 */
export function TaskBadges({
  signals,
  className,
}: {
  signals?: TaskAttentionSignals | null;
  className?: string;
  size?: 'sm' | 'xs';
}) {
  const inMeta = useInMeta();
  if (!signals) return null;
  const active = BADGES.filter((b) => signals[b.key]);
  if (active.length === 0) return null;
  return (
    <MetaItem kind="attention" className={cn('flex-wrap', className)}>
      {active.map((b) => (
        <Tip key={b.key} label={b.title}>
          <StatusBadge tone={b.tone} appearance={inMeta ? 'plain' : 'soft'}>
            <b.icon className={b.key === 'working' ? 'animate-spin [animation-duration:2.5s] motion-reduce:animate-none' : ''} aria-hidden />
            {b.label}
          </StatusBadge>
        </Tip>
      ))}
    </MetaItem>
  );
}

import { AlertCircle, Circle, Clock, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BucketId } from '@/lib/sessions/classification';
export { bucketSessions, classifySession, executionActivity, type BucketId } from '@/lib/sessions/classification';

// Shared identity for the HUD's status pills and Agent Activity in Board.
// Both use the same classified sessions and agent main-chat attention.

// Left-to-right order of the header pills. Reorder by editing this array.
export const BUCKET_ORDER: readonly BucketId[] = [
  'needsApproval',
  'unread',
  'working',
  'waiting',
] as const;

export interface BucketConfig {
  id: BucketId;
  tone: 'neutral' | 'attention' | 'success';
  label: string;
  accentClass: string;
  /** Faint tint behind the pill popover's header for the "hot" buckets.
   *  Passive buckets leave this undefined. */
  headerBgClass?: string;
  icon: ReactNode;
}

export const BUCKET_CONFIG: Record<BucketId, BucketConfig> = {
  needsApproval: {
    id: 'needsApproval',
    tone: 'attention',
    label: 'Needs approval',
    accentClass: 'text-amber-600 dark:text-amber-400',
    headerBgClass: 'bg-amber-500/[0.06] dark:bg-amber-400/[0.08]',
    icon: <AlertCircle size={13} className="text-amber-500" />,
  },
  unread: {
    id: 'unread',
    tone: 'attention',
    label: 'Unread',
    accentClass: 'text-amber-600 dark:text-amber-400',
    icon: <Circle size={11} className="fill-amber-500 text-amber-500" />,
  },
  waiting: {
    id: 'waiting',
    tone: 'neutral',
    label: 'Waiting response',
    accentClass: 'text-foreground',
    icon: <Clock size={13} className="text-foreground" />,
  },
  working: {
    id: 'working',
    tone: 'success',
    label: 'Working',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
    icon: <Zap size={13} className="text-emerald-500" />,
  },
};

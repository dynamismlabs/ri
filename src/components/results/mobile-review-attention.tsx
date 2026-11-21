'use client';

import { Button } from '@/components/system/button';
import { HomeLink as Link } from '@/components/home/home-link';
import { ClipboardCheck } from 'lucide-react';
import { useRailSessions } from '@/hooks/use-workspaces';
import type { RailResponse } from '@/lib/api/sessions';

type ReviewAttention = NonNullable<RailResponse['resultReviewAttention']>[number];

/**
 * One AI review of a result, in the phone's Agents tab: under Unread when it
 * needs your answer or failed, under Working while it runs
 * (docs/chat-lenses.md). Opens the result.
 */
export function MobileReviewRow({ review }: { review: ReviewAttention }) {
  const { data: rail } = useRailSessions();
  const waiting = rail?.pendingSessionIds.includes(review.sessionId) ?? false;
  const state = waiting
    ? 'Needs your response'
    : review.statusReason?.replaceAll('_', ' ')
      ?? (review.status === 'running' ? 'Reviewing with AI' : review.status === 'queued' ? 'Queued' : 'Review failed');
  return (
    <Button asChild variant="secondary" size="sm" className="flex items-start gap-2"><Link href={`/results/${review.resultId}`}>
      <span className="flex h-[18px] w-4 flex-shrink-0 items-center justify-center text-muted-foreground">
        <ClipboardCheck size={13} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-[18px]">{review.label ?? 'AI review'}</span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">{state}</span>
      </span>
    </Link></Button>
  );
}

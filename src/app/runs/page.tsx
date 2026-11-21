'use client';
import { Card } from '@/components/system/card';
import { StatusBadge } from '@/components/system/status-badge';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { SegmentedControl } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
/**
 * Runs list at /runs.
 *
 * Newest-first across all triggers. Filter pills:
 *   all | manual | scheduled (= cron/every/at) | webhook
 *
 * Per docs/async-agents-v1.md §4.8 the goal is a single executions view
 * with trigger badges; in V1 we surface this as a dedicated /runs page
 * since the existing executions view is mid-refactor. The TopHud's
 * `Clock` icon entry routes to /triggers; runs are linked from each
 * trigger's detail view and via the TopHud "Active runs" indicator.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Activity, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useRuns } from '@/hooks/use-triggers';

import type { RunRecord, RunTrigger } from '@/db/types';
import { RunActivityBadge } from '@/components/runs/run-activity-badge';

type Filter = 'all' | 'manual' | 'scheduled' | 'webhook';

const SCHEDULED_TRIGGERS: RunTrigger[] = ['cron', 'every', 'at'];

export default function RunsPage() {
  const tier = useViewportTier();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: runs, isLoading } = useRuns(
    filter === 'all'
      ? { limit: 100 }
      : filter === 'scheduled'
        ? { trigger: SCHEDULED_TRIGGERS, limit: 100 }
        : { trigger: filter, limit: 100 },
  );

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3 sticky top-0 bg-background z-10">
        <IconButton
          onClick={() => router.push('/')}
          label="Back to home"
          variant="ghost"
          size="sm"
        >
          <ArrowLeft size={16} />
        </IconButton>
        <Activity size={16} className="text-primary" />
        <h1 className="text-base font-semibold">Runs</h1>
        <div className="flex-1" />
        <Link
          href="/triggers"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Manage triggers →
        </Link>
      </header>

      <div className="px-6 py-3 border-b border-border flex items-center gap-2">
        <SegmentedControl mode="choice" ariaLabel="Run trigger" size={tier === 'phone' ? 'touch' : 'compact'} value={filter} onChange={setFilter} options={(['all','manual','scheduled','webhook'] as Filter[]).map(value => ({value,label:value[0].toUpperCase()+value.slice(1)}))} />
      </div>

      <main className="px-6 py-6 max-w-4xl mx-auto">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!isLoading && (!runs || runs.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <Hourglass size={20} className="mx-auto opacity-40 mb-2" />
            <p className="text-sm">No runs matching this filter.</p>
          </div>
        )}
        {runs && runs.length > 0 && (
          <div className="space-y-1">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RunRow({ run }: { run: RunRecord }) {
  // For terminal runs we pass the status directly so the badge skips
  // the observe-polling round-trip. For active runs (running/queued)
  // it polls and surfaces "Working", "Bash · 4 min", "Quiet · 12 min",
  // etc. — the actual signal, not just the wall-clock status.
  const terminal =
    run.status === 'completed' || run.status === 'failed' || run.status === 'skipped' || run.status === 'cancelled'
      ? run.status
      : undefined;
  return (
    <Card as={Link} padding="md" shadow
      href={run.chatSessionId ? `/?session=${run.chatSessionId}` : `/runs/${run.id}`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:flex-nowrap md:gap-3"
    >
      <TriggerBadge trigger={run.triggerKind} />
      <RunActivityBadge runId={run.id} terminalStatus={terminal} />
      <span className="order-first basis-full min-w-0 flex-1 whitespace-normal break-words text-t3 text-[12px] md:order-none md:basis-auto md:truncate">
        {run.status === 'failed' ? run.errorMessage ?? run.summary ?? '-' : run.summary ?? '-'}
      </span>
      <span className="text-[11px] md:text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
        {run.startedAt ? humanize(run.startedAt) : '-'}
      </span>
      {run.costUsd != null && run.costUsd > 0 && (
        <span className="text-[11px] md:text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          ${(run.costUsd ?? 0).toFixed(4)}
        </span>
      )}
    </Card>
  );
}

function TriggerBadge({ trigger }: { trigger: RunTrigger }) {
  if (trigger === 'manual') {
    return null; // default — no badge clutter
  }
  return (
    <StatusBadge tone={(trigger === 'webhook' ? "warning" : "info")}

    >
      {trigger}
    </StatusBadge>
  );
}

function humanize(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

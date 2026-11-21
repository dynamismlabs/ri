'use client';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
/**
 * Triggers list view at /triggers.
 *
 * Cards/rows with name, cadence (humanized), next fire, last status
 * pill, enabled toggle. "+ New trigger" navigates to /triggers/new.
 * Failure warning icon at consecutive_failures >= 3 (task #25).
 */

import { useRouter } from 'next/navigation';
import { Clock, AlertTriangle, ArrowLeft, ChevronRight, Pause, Play, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTriggers, useUpdateTrigger } from '@/hooks/use-triggers';

import type { TriggerWithLastRun } from '@/db/types';
import { describeFrequency } from '@/lib/scheduler/frequency';
import { findProvider } from '@/lib/harness/options';
import { isReservedTrigger } from '@/lib/triggers/reserved';
import { overdueLabel } from '@/lib/triggers/lateness';
import { AwakeNote } from '@/components/triggers/awake-note';
import { Tip } from '@/components/ui/tip';

export default function TriggersPage() {
  const router = useRouter();
  const { data: triggers, isLoading } = useTriggers();
  const updateTrigger = useUpdateTrigger();

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3 sticky top-0 bg-background z-10">
        <IconButton
          onClick={() => router.push('/')}
          label="Back to dashboard"
          variant="secondary"
          size="sm"
        >
          <ArrowLeft size={16} />
        </IconButton>
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h1 className="text-base font-semibold">Schedules and Triggers</h1>
        </div>
        <div className="flex-1" />
        <Button asChild variant="primary" size="md" className="flex items-center gap-1.5"><Link href="/triggers/new">
          <Plus size={14} />
          New trigger
        </Link></Button>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!isLoading && (!triggers || triggers.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-3">No triggers yet.</p>
            <Button asChild variant="secondary" size="sm" className="inline-flex items-center gap-1.5"><Link href="/triggers/new">
              <Plus size={14} />
              Create your first trigger
            </Link></Button>
          </div>
        )}
        {triggers && triggers.length > 0 && <AwakeNote lead="Schedules run" className="mb-3" />}
        {triggers && triggers.length > 0 && (
          <div className="space-y-2">
            {triggers.map((s) => (
              <TriggerRow
                key={s.id}
                trigger={s}
                onToggle={(enabled) =>
                  updateTrigger.mutate({ id: s.id, enabled })
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TriggerRow({
  trigger,
  onToggle,
}: {
  trigger: TriggerWithLastRun;
  onToggle: (enabled: boolean) => void;
}) {
  const failing = trigger.consecutiveFailures >= 3;
  const overdue = overdueLabel(trigger);
  return (
    <Link
      href={`/triggers/${trigger.id}`}
      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:border-muted-foreground/30 transition-colors"
    >

        <IconButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(!trigger.enabled);
          }}
          label={trigger.enabled ? 'Pause trigger' : 'Resume trigger'}
          tooltip={trigger.enabled ? 'Pause trigger' : 'Resume trigger'}
          variant="secondary"
          size="sm"
          className="flex-shrink-0"
        >
          {trigger.enabled ? <Play size={14} /> : <Pause size={14} />}
        </IconButton>


      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{trigger.name}</p>
          {isReservedTrigger(trigger.id) && (
            <Tip label="Managed by the app. Change its schedule in Settings › General.">
              <span
                className="flex-shrink-0 px-1.5 py-0.5 text-[10px] rounded-md bg-muted text-muted-foreground"
              >
                Managed
              </span>
            </Tip>
          )}
          {failing && (
            <Tip label={`${trigger.consecutiveFailures} consecutive failures`}>
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md bg-destructive/10 text-destructive"
              >
                <AlertTriangle size={10} />
                {trigger.consecutiveFailures} failed
              </span>
            </Tip>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {humanizeCadence(trigger)}
          {trigger.targetKind === 'session'
            ? ' · sends to a chat'
            : trigger.provider && ` · ${findProvider(trigger.provider)?.name ?? trigger.provider}`}
          {trigger.nextRunAt && !overdue && ` · next ${humanize(trigger.nextRunAt)}`}
          {trigger.lastRunStatus && ` · last ${trigger.lastRunStatus}`}
        </p>
        {overdue && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 truncate">{overdue}</p>}
      </div>

      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

function humanizeCadence(s: TriggerWithLastRun): string {
  return describeFrequency({
    kind: s.kind,
    cronExpression: s.cronExpression,
    intervalSeconds: s.intervalSeconds,
    runAt: s.runAt,
    timezone: s.timezone,
  });
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

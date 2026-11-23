'use client';
import { Callout } from '@/components/system/callout';

import { AlertCircle, CheckCircle2, Circle, CircleDashed, Hand, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { APP_NAME } from '@/constants/app';
import { cn } from '@/lib/utils';
import { progressRows, type ProgressJob, type ProgressRow } from './app-steps';

export interface ProgressOutcomeJob extends ProgressJob {
  result?: { outcome: string; message: string; log?: string };
  error?: string;
}

function RowIcon({ status }: { status: ProgressRow['status'] }) {
  if (status === 'passed') return <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" aria-label="Done" />;
  if (status === 'failed') return <XCircle size={16} className="text-destructive" aria-label="Failed" />;
  if (status === 'started') return <Loader2 size={16} className="animate-spin text-foreground" aria-label="Running now" />;
  if (status === 'waiting') return <Hand size={16} className="text-amber-600 dark:text-amber-400" aria-label="Waiting for you" />;
  if (status === 'skipped') return <MinusCircle size={16} className="text-muted-foreground" aria-label="Not needed" />;
  return <CircleDashed size={16} className="text-muted-foreground/60" aria-label="To come" />;
}

/** What the page's heading says about the job. */
export function progressTitle(job: ProgressOutcomeJob | null, name: string, version: string | null, connected: boolean, installed = true): string {
  const at = version ? ` ${version}` : '';
  if (!job) return !installed ? name : connected ? `${name} is ready` : `${name} is installed`;
  if (job.kind === 'change') {
    if (job.state === 'running') return `Updating ${name}${version ? ` to ${version}` : ''}`;
    return job.state === 'done' ? `${name} is up to date` : `${name} wasn’t updated`;
  }
  if (job.state === 'running') return `Installing ${name}${at}`;
  if (job.state === 'failed') return `${name} didn’t install`;
  return connected ? `${name} is ready` : `${name} is installed`;
}

/**
 * A catalog app being installed or updated (docs/personal-apps.md "The catalog"): every step down
 * the page, the one running now spinning and the done ones checked, each with what it does in plain
 * words, then how it ended and what to do next. The builder chat is for changing an app, so it
 * isn't the main view here.
 */
export function AppProgress({
  name, version, description, job, installed, connected, computer, actions,
}: {
  name: string;
  version: string | null;
  description?: string | null;
  job: ProgressOutcomeJob | null;
  /** Whether the app is installed, for a page with no install or update to show. */
  installed: boolean;
  connected: boolean;
  computer: string | null;
  /** What to do next, under the outcome: Allow, Open app, Ask the builder. */
  actions?: React.ReactNode;
}) {
  const rows = job ? progressRows(job, name, connected) : [];
  const where = computer ? ` on ${computer}` : '';
  const ready = { tone: 'done', text: `${name}${version ? ` ${version}` : ''} is running${where}, and ${APP_NAME} can use it.` };
  const waiting = { tone: 'waiting', text: `${name} is running${where}. Allow ${APP_NAME} in it to finish connecting.` };
  // No install or update to show (the server restarted since): where it stands now.
  const outcome = !job ? (!installed ? { tone: 'muted', text: `${name} isn’t installed yet.` } : connected ? ready : waiting)
    : job.state === 'running' ? { tone: 'muted', text: 'This takes a few minutes. It keeps going if you leave this page.' }
    : job.state === 'failed' ? {
      tone: 'error',
      text: `${job.kind === 'change' ? `Nothing changed: the ${name} you had is still running. ` : ''}${job.result?.message || job.error || 'It stopped before it finished.'}`,
    }
    : job.kind === 'change' ? { tone: 'done', text: job.result?.outcome === 'unchanged' ? `${name} already had this version.` : `${name} is now on ${version ?? 'the new version'}.` }
    : connected ? ready : waiting;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-tight">{progressTitle(job, name, version, connected, installed)}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {rows.length > 0 && (
          <ol aria-label="Steps" className="space-y-0.5">
            {rows.map((row) => (
              <li key={row.key} aria-current={row.status === 'started' ? 'step' : undefined}
                className={cn('flex items-start gap-3 rounded-lg px-3 py-2', row.status === 'started' && 'bg-muted/50', row.status === 'pending' && 'opacity-60')}>
                <span className="mt-0.5 shrink-0"><RowIcon status={row.status} /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', row.status === 'started' || row.status === 'waiting' || row.status === 'failed' ? 'font-medium' : '')}>{row.label}</span>
                  {row.doing && <span className="block text-xs text-muted-foreground">{row.doing}</span>}
                  {row.detail && <span className="mt-1 block whitespace-pre-wrap break-words font-mono text-[11px] text-destructive">{row.detail.trim().split('\n').slice(-6).join('\n')}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {outcome && (
          <Callout padding="lg" tone={(outcome.tone === 'error' ? "error" : "neutral")} role={outcome.tone === 'error' ? 'alert' : 'status'} className="space-y-3">
            <p className="flex items-start gap-2">
              {outcome.tone === 'error' ? <AlertCircle size={15} className="mt-0.5 shrink-0 text-destructive" />
                : outcome.tone === 'done' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                : outcome.tone === 'waiting' ? <Hand size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                : <Circle size={15} className="mt-0.5 shrink-0 text-muted-foreground" />}
              <span className={outcome.tone === 'muted' ? 'text-muted-foreground' : undefined}>{outcome.text}</span>
            </p>
            {job?.state === 'failed' && job.result?.log && <p className="text-xs text-muted-foreground">The full log is at <span className="break-all font-mono">{job.result.log}</span>.</p>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </Callout>
        )}
      </div>
    </div>
  );
}

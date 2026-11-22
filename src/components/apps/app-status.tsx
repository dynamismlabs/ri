'use client';
import { InlineAction } from '@/components/system/inline-action';

import { MenuAction } from '@/components/system/menu-action';

import { Card } from '@/components/system/card';

import { SegmentedRoot, SegmentedList, SegmentedPanel } from '@/components/system/segmented-control';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpCircle, Info, Loader2, MoreHorizontal, RotateCcw, ScrollText, Server } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/system/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/system/menu';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tip';
import { ageLabel } from '@/lib/harness/rate-limit-display';
import { versionLabel } from '@/lib/apps/version-label';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { AppMark } from './app-mark';

type Status = Awaited<ReturnType<typeof trpcClient.appBuilds.status.query>>;
type Source = Awaited<ReturnType<typeof trpcClient.appBuilds.list.query>>[number];

const LABELS: Record<Status['state'], string> = {
  running: 'Running', starting: 'Starting', stopped: 'Stopped', not_installed: 'Not installed', unknown: 'State unknown',
};

function dotClass(status: Status) {
  if (status.lastError) return 'bg-destructive';
  if (status.state === 'running') return 'bg-emerald-500';
  if (status.state === 'starting') return 'bg-amber-500';
  return 'bg-muted-foreground/50';
}

/**
 * What the status says in words: its state on the computer it runs on, its version when it came from
 * the catalog, and how long it's been up. The kit's release (a commit) is for the tooltip.
 */
export function statusSummary(status: Pick<Status, 'state' | 'since'> & { computer?: string | null }, options: { version?: string | null; since?: boolean } = {}): string {
  const where = status.computer && (status.state === 'running' || status.state === 'starting' || status.state === 'stopped') ? ` on ${status.computer}` : '';
  const parts = [`${LABELS[status.state]}${where}`];
  if (options.version) parts.push(versionLabel(options.version));
  if (options.since !== false && status.state === 'running' && status.since) parts.push(`since ${ageLabel(status.since)}`);
  return parts.join(' · ');
}

/** An installed app's state from the kit, and its Restart and Logs, shared by its page and its card. */
function useAppControls(sourceId: string) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useQuery({ ...trpc.appBuilds.job.queryOptions({ id: jobId ?? '' }), enabled: !!jobId, refetchInterval: (query) => query.state.data?.state === 'running' ? 1000 : false });
  const restarting = !!jobId && (!job.data || job.data.state === 'running');
  const status = useQuery(trpc.appBuilds.status.queryOptions({ id: sourceId }, { refetchInterval: restarting ? 3000 : 15_000 }));
  const restart = useMutation({
    mutationFn: () => trpcClient.appBuilds.restart.mutate({ id: sourceId }),
    onSuccess: (started) => { setError(null); setJobId(started.id); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  useEffect(() => {
    if (!job.data || job.data.state === 'running') return;
    void queryClient.invalidateQueries({ queryKey: trpc.appBuilds.status.queryKey({ id: sourceId }) });
    void queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() });
  }, [job.data, queryClient, sourceId]);
  const data = status.data;
  return {
    data, restarting, restart, logsOpen, setLogsOpen,
    failure: error ?? (job.data?.state === 'failed' ? job.data.error ?? job.data.result?.message ?? 'Restart didn’t finish.' : null),
    restarted: job.data?.state === 'done' ? job.data.result?.message ?? null : null,
    canControl: !!data && data.problem !== 'kit_too_old' && data.problem !== 'not_prepared' && data.problem !== 'no_folder' && data.state !== 'not_installed',
  };
}

/** The state in words with its dot, and the running release on hover. */
function StatusText({ data, restarting, name, version, since = true, wrap = false }: { data: Status | undefined; restarting: boolean; name: string; version?: string | null; since?: boolean; wrap?: boolean }) {
  if (!data) return <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 size={12} className="animate-spin" />Checking {name}</span>;
  const release = data.answering ?? data.release;
  const text = <span className={`flex min-w-0 gap-1.5 ${wrap ? 'items-start' : 'items-center'}`} role="status">
    <span className={`size-2 shrink-0 rounded-full ${dotClass(data)} ${wrap ? 'mt-1' : ''}`} aria-hidden />
    <span className={wrap ? 'break-words' : 'truncate'}>{restarting ? 'Restarting' : statusSummary(data, { version, since })}</span>
  </span>;
  return release && !restarting ? <Tip label={`Release ${release.slice(0, 12)}`}>{text}</Tip> : text;
}

/**
 * An installed app's state with Restart and Logs (docs/personal-apps.md "Status, Restart and
 * Logs"), from the kit's own commands. Ri never starts or reads the app's process itself.
 */
export function AppStatusLine({ sourceId, name, version, compact = false }: { sourceId: string; name: string; version?: string | null; compact?: boolean }) {
  const controls = useAppControls(sourceId);
  const { data, restarting, restart } = controls;
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <StatusText data={data} restarting={restarting} name={name} version={version} />
        {controls.canControl && (
          <span className="ml-auto flex gap-1.5">
            <Tip label={`Stop ${name} and start it again`}>
              <Button
                disabled={restarting || restart.isPending}
                onClick={() => restart.mutate()}
                variant="secondary"
                size="xs"
              >
                {restarting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} aria-hidden />}Restart
              </Button>
            </Tip>
            <Button
              onClick={() => controls.setLogsOpen(true)}
              variant="secondary"
              size="xs"
            ><ScrollText size={12} aria-hidden />Logs</Button>
          </span>
        )}
      </div>
      <StatusNotes controls={controls} compact={compact} />
      <AppLogsDialog sourceId={sourceId} name={name} open={controls.logsOpen} onOpenChange={controls.setLogsOpen} />
    </div>
  );
}

function StatusNotes({ controls, compact }: { controls: ReturnType<typeof useAppControls>; compact: boolean }) {
  const { data, failure, restarted } = controls;
  return <>
    {data?.lastError && <p className="flex items-start gap-1.5 text-destructive"><AlertCircle size={12} className="mt-0.5 shrink-0" /><span className="break-words font-mono text-[11px]">{data.lastError}</span></p>}
    {data?.message && !compact && <p className="text-muted-foreground">{data.message}</p>}
    {data?.message && compact && data.problem === 'kit_too_old' && <p className="text-muted-foreground">An older app kit. Update it to see its state.</p>}
    {failure && <p role="alert" className="flex items-start gap-1.5 text-destructive"><AlertCircle size={12} className="mt-0.5 shrink-0" />{failure}</p>}
    {restarted && <p className="text-muted-foreground">{restarted}</p>}
  </>;
}

/** The end of an app's log: what its server printed, or its last install or change. */
export function AppLogsDialog({ sourceId, name, open, onOpenChange }: { sourceId: string; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [which, setWhich] = useState<'server' | 'change'>('server');
  const [follow, setFollow] = useState(true);
  const logs = useQuery({
    ...trpc.appBuilds.logs.queryOptions({ id: sourceId, lines: 500, change: which === 'change' }),
    enabled: open,
    refetchInterval: open && follow && which === 'server' ? 3000 : false,
  });
  return (
    <SegmentedRoot mode="tabs" value={which} onChange={setWhich}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Server size={15} aria-hidden />
              {name} logs
            </DialogTitle>
            <DialogDescription>
              The last 500 lines, from the app kit. Times are on this computer&apos;s clock.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedList
              ariaLabel="App logs"
              options={[
                { value: 'server', label: 'While running' },
                { value: 'change', label: 'Last install or change' },
              ]}
            />
            {which === 'server' && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={follow} onCheckedChange={setFollow} aria-label="Keep showing new lines" />
                Keep showing new lines
              </label>
            )}
            {logs.isFetching && (
              <Loader2 size={12} className="animate-spin text-muted-foreground" aria-label="Loading" />
            )}
          </div>
          <SegmentedPanel value={which} asChild>
            <Card padding="sm" purpose="code" className="max-h-[60vh] overflow-auto">
              {logs.error ? (
                <p className="text-destructive">{logs.error.message}</p>
              ) : logs.data?.message ? (
                <p className="text-muted-foreground">{logs.data.message}</p>
              ) : !logs.data ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : !logs.data.lines.length ? (
                <p className="text-muted-foreground">Nothing yet.</p>
              ) : (
                logs.data.lines.map((line, index) => (
                  <div key={index} className="flex gap-2 whitespace-pre-wrap break-words">
                    <span className="shrink-0 text-muted-foreground">
                      {line.time
                        ? new Date(line.time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '        '}
                    </span>
                    <span className="min-w-0">{line.text}</span>
                  </div>
                ))
              )}
            </Card>
          </SegmentedPanel>
        </DialogContent>
      </Dialog>
    </SegmentedRoot>
  );
}

/**
 * The apps Ri installed (docs/personal-apps.md "Status, Restart and Logs"), each a card that opens
 * the app, with its state, where it runs and its version. Restart, Logs and its details are in the
 * card's menu. One Ri can't use yet goes to its page, where the person allows Ri in it.
 */
export function YourAppsList({ only, onOpen, onDetails }: { only?: string[]; onOpen: (serverId: string) => void; onDetails: (sourceId: string) => void }) {
  const sources = useQuery(trpc.appBuilds.list.queryOptions(undefined, { staleTime: 10_000 }));
  const apps = useQuery(trpc.personalApps.list.queryOptions(undefined, { staleTime: 10_000 }));
  const catalog = useQuery(trpc.appBuilds.catalog.queryOptions(undefined, { staleTime: 60_000 }));
  const installed = installedApps(sources.data ?? []).filter((source) => !only || only.includes(source.id));
  if (!installed.length) return null;
  return (
    <ul aria-label="Apps Ri installed" className="space-y-2">
      {installed.map((source) => {
        const ri = apps.data?.find((app) => app.id === source.personalAppId)?.ri ?? null;
        const entry = catalog.data?.apps.find((app) => app.sourceId === source.id);
        return <YourAppCard key={source.id} source={source} serverId={ri?.status === 'connected' ? ri.serverId : null}
          update={entry?.updateAvailable ? entry.version : null} onOpen={onOpen} onDetails={onDetails} />;
      })}
    </ul>
  );
}

/** The apps Ri installed and still runs, which "Your apps" lists. */
export function installedApps<T extends Pick<Source, 'createdByRi' | 'url' | 'folder'>>(sources: T[]): T[] {
  return sources.filter((source) => source.createdByRi && source.url && source.folder);
}

function YourAppCard({ source, serverId, update, onOpen, onDetails }: { source: Source; serverId: string | null; update: string | null; onOpen: (serverId: string) => void; onDetails: (sourceId: string) => void }) {
  const controls = useAppControls(source.id);
  const { data, restarting, restart } = controls;
  const open = () => serverId ? onOpen(serverId) : onDetails(source.id);
  const action = serverId ? 'Open' : 'Finish connecting';
  return (
    <li className="ri-app-status-frame rounded-lg border border-border bg-card text-xs transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3 px-3 pt-3">
        <InlineAction  type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${action} ${source.name}`}>
          <AppMark name={source.name} size="lg" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.name}</span>
        </InlineAction>
        <Button
          onClick={open}
          variant="secondary"
          size="xs"
        >{action}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              label={`More for ${source.name}`}
              tooltip="Restart, logs and details"
              variant="ghost"
              size="xs"
            ><MoreHorizontal size={14} /></IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {controls.canControl && <MenuAction kind="menu" disabled={restarting || restart.isPending} onSelect={() => restart.mutate()}><RotateCcw size={14} />Restart</MenuAction>}
            {controls.canControl && <MenuAction kind="menu" onSelect={() => controls.setLogsOpen(true)}><ScrollText size={14} />Logs</MenuAction>}
            <MenuAction kind="menu" onSelect={() => onDetails(source.id)}><Info size={14} />Details</MenuAction>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Its own line under the name, wrapping, so a narrow column still says where it runs. */}
      <div className="pb-3 pl-15 pr-3 pt-0.5 text-muted-foreground">
        <StatusText data={data} restarting={restarting} name={source.name} version={source.catalogVersion} since={false} wrap />
      </div>
      {update && (
        <div className="pb-3 pl-15 pr-3">
          <Button
            onClick={() => onDetails(source.id)}
            variant="secondary"
            size="xs"
          ><ArrowUpCircle size={12} aria-hidden />Update to {versionLabel(update)}</Button>
        </div>
      )}
      {(data?.lastError || controls.failure || controls.restarted || data?.problem === 'kit_too_old') && <div className="space-y-1 pb-3 pl-15 pr-3"><StatusNotes controls={controls} compact /></div>}
      <AppLogsDialog sourceId={source.id} name={source.name} open={controls.logsOpen} onOpenChange={controls.setLogsOpen} />
    </li>
  );
}

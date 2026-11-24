'use client';
import { InlineAction } from '@/components/system/inline-action';

import { Card } from '@/components/system/card';
import { Callout } from '@/components/system/callout';
import { StatusBadge } from '@/components/system/status-badge';

import { SelectField } from '@/components/system/select-field';

import { IconButton } from '@/components/system/icon-button';
import { invalidateWorkspaceViews } from '@/lib/query/work-view-invalidation';
import { Button } from '@/components/system/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/system/select';
import type {
	ExternalAgentDiscovery,
	ExternalAgentImportResult,
	ExternalAgentProjectCandidate,
	ExternalAgentSessionCandidate,
	ExternalAgentSource,
} from '@/lib/import/types';
import { trpcClient } from '@/lib/trpc/client';
import { rpcOptions } from '@/lib/trpc/request-options';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Download,
	Folder,
	MessageSquare,
	RefreshCw,
} from 'lucide-react';
import { useMemo, useState } from 'react';

/** Shared with the main chat's first run, which looks for history ahead of asking. */
export const DISCOVERY_KEY = ['imports', 'external-agents'] as const;

const SOURCES: readonly ExternalAgentSource[] = ['claude', 'codex', 'opencode'];

const SOURCE_META: Record<ExternalAgentSource, {
  label: string;
  mark: string;
  cardClassName: string;
}> = {
  claude: {
    label: 'Claude Code',
    mark: 'C',
    cardClassName: 'bg-orange-500/10 text-orange-500',
  },
  codex: {
    label: 'Codex',
    mark: 'O',
    cardClassName: 'bg-emerald-500/10 text-emerald-500',
  },
  opencode: {
    label: 'OpenCode',
    mark: 'OC',
    cardClassName: 'bg-sky-500/10 text-sky-500',
  },
};

function sourceLabel(source: ExternalAgentSource): string {
  return SOURCE_META[source].label;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function selectableSessions(project: ExternalAgentProjectCandidate): ExternalAgentSessionCandidate[] {
  return project.sessions.filter((session) => session.importable !== false);
}

const THIS_DEVICE = 'this-device';

export function formatImportResultSummary(result: ExternalAgentImportResult): string {
  const outcomes: string[] = [];
  if (result.importedSessions > 0) {
    outcomes.push(
      `Imported ${result.importedSessions} ${result.importedSessions === 1 ? 'chat' : 'chats'} and ${result.importedEvents.toLocaleString()} events${result.createdWorkspaces > 0
        ? ` into ${result.createdWorkspaces} new ${result.createdWorkspaces === 1 ? 'project' : 'projects'}`
        : ''}`,
    );
  }
  if (result.syncedSessions > 0) {
    outcomes.push(
      `Synced ${result.syncedSessions} ${result.syncedSessions === 1 ? 'chat' : 'chats'} with ${result.syncedEvents.toLocaleString()} new events`,
    );
  }
  if (outcomes.length === 0) outcomes.push('No chats needed updating');
  if (result.skippedSessions > 0) {
    outcomes.push(`${result.skippedSessions} ${result.skippedSessions === 1 ? 'chat was' : 'chats were'} skipped`);
  }
  if (result.failures.length > 0) {
    outcomes.push(`${result.failures.length} could not be updated`);
  }
  return `${outcomes.join('. ')}.`;
}

export function hasExternalAgentDiscoveryRows(
  discovery: ExternalAgentDiscovery | undefined,
): boolean {
  return discovery?.projects.some((project) => project.sessions.length > 0) ?? false;
}

function importStatusLabel(session: ExternalAgentSessionCandidate): string {
  switch (session.importStatus) {
    case 'importing': return 'Updating';
    case 'changed': return 'Updates found';
    case 'missing': return 'Source missing';
    case 'error': return 'Sync failed';
    case 'current': return 'Imported';
    default: return formatDate(session.updatedAt);
  }
}

export function ExternalAgentImportPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<ExternalAgentImportResult | null>(null);
  // Whose history: this device's, or a connected device's (P2.9).
  const [source, setSource] = useState<string>(THIS_DEVICE);
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => trpcClient.devices.list.query({}),
    staleTime: 30_000,
  });
  const elsewhere = (devices.data ?? []).filter((c) => !c.isHome && c.worker?.enrolled);
  const deviceId = source === THIS_DEVICE ? null : source;
  const deviceName = elsewhere.find((c) => c.id === deviceId)?.name ?? null;
  const discovery = useQuery({
    queryKey: [...DISCOVERY_KEY, deviceId ?? 'here'],
    queryFn: () => trpcClient.imports.agentsGet.query({ query: { deviceId: deviceId ?? undefined } }, rpcOptions({ timeoutMs: 90_000 })),
    staleTime: 30_000,
    retry: false,
  });
  const importMutation = useMutation({
    mutationFn: (sessionKeys: string[]) => trpcClient.imports.agentsPost.mutate({body: { sessionKeys, deviceId }}, rpcOptions({ timeoutMs: 10 * 60_000 })),
    onMutate: () => setLastResult(null),
    onSuccess: async (result) => {
      setLastResult(result);
      setSelected(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: DISCOVERY_KEY }),
        invalidateWorkspaceViews(queryClient),
        queryClient.invalidateQueries({ queryKey: ['sessions', 'rail'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', 'history'] }),
      ]);
    },
  });

  const selectedProjects = useMemo(() => {
    if (!discovery.data) return 0;
    return discovery.data.projects.filter((project) => project.sessions.some((session) => selected.has(session.key))).length;
  }, [discovery.data, selected]);

  const selectedBreakdown = useMemo(() => {
    let imports = 0;
    let syncs = 0;
    for (const project of discovery.data?.projects ?? []) {
      for (const session of project.sessions) {
        if (!selected.has(session.key)) continue;
        if (session.imported) syncs += 1;
        else imports += 1;
      }
    }
    return { imports, syncs };
  }, [discovery.data, selected]);

  const chooseSource = (next: string) => {
    setSource(next);
    setSelected(new Set());
    setLastResult(null);
  };

  const toggleSession = (key: string) => {
    setLastResult(null);
    setSelected((prior) => {
      const next = new Set(prior);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleProject = (project: ExternalAgentProjectCandidate) => {
    setLastResult(null);
    const sessions = selectableSessions(project);
    const allSelected = sessions.length > 0 && sessions.every((session) => selected.has(session.key));
    setSelected((prior) => {
      const next = new Set(prior);
      for (const session of sessions) {
        if (allSelected) next.delete(session.key);
        else next.add(session.key);
      }
      return next;
    });
  };

  const toggleExpanded = (projectId: string) => {
    setExpanded((prior) => {
      const next = new Set(prior);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const refresh = () => {
    setLastResult(null);
    void discovery.refetch();
  };

  const hasRows = hasExternalAgentDiscoveryRows(discovery.data);

  const submitLabel = importMutation.isPending
    ? 'Updating...'
    : selectedBreakdown.imports > 0 && selectedBreakdown.syncs > 0
      ? `Import and sync ${selected.size} chats`
      : selectedBreakdown.syncs > 0
        ? `Sync ${selected.size} chats`
        : `Import ${selected.size || ''} chats`.replace('  ', ' ');

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {SOURCES.map((source) => {
          const summary = discovery.data?.sources[source];
          const meta = SOURCE_META[source];
          return (
            <Card padding="md" key={source} className="flex items-center gap-3">
              <div className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                meta.cardClassName,
              )}>
                {meta.mark}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{sourceLabel(source)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {!summary
                    ? 'Checking local history'
                    : !summary.available
                      ? 'Local history unavailable'
                      : `${summary.found} chats found${summary.imported ? `, ${summary.imported} imported` : ''}`}
                </p>
              </div>
              {summary?.available && <CheckCircle2 size={15} className="text-emerald-500" />}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] font-medium text-foreground">
            {deviceName ? `Projects and chats on ${deviceName}` : 'Local projects and chats'}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/85">
            {deviceName
              ? `Ri reads a chat from ${deviceName} only when you choose it, and never changes it. It arrives read-only in the agent set up in its folder there, and keeps syncing while ${deviceName} is connected.`
              : 'Local agent history is read, never changed. An imported chat arrives as a read-only mirror that keeps syncing as the original session grows, and it runs in the project folder rather than a worktree if you continue it here.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {elsewhere.length > 0 && (
            <Select value={source} onValueChange={chooseSource}>
              <SelectField className="w-44" aria-label="Whose history">
                <SelectValue />
              </SelectField>
              <SelectContent>
                <SelectItem value={THIS_DEVICE}>This device</SelectItem>
                {elsewhere.map((c) => (
                  <SelectItem key={c.id} value={c.id} disabled={!c.worker?.connected}>
                    {c.worker?.connected ? c.name : `${c.name} (not connected)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            onClick={refresh}
            disabled={discovery.isFetching}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className={cn(discovery.isFetching && 'animate-spin')} />
            Refresh list
          </Button>
        </div>
      </div>

      {discovery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-muted/50" />)}
        </div>
      ) : discovery.isError ? (
        <Callout padding="lg" tone={"error"} >
          {deviceName ? `Could not read the history on ${deviceName}.` : 'Could not scan local agent history.'}{' '}
          {discovery.error instanceof Error ? discovery.error.message : ''}
        </Callout>
      ) : !hasRows ? (
        <div className="ri-imports-section-frame rounded-lg border border-dashed border-border p-6 text-center">
          <MessageSquare className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">{deviceName ? `No chats found on ${deviceName}` : 'No local chats found'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ri checks Claude Code, Codex, and OpenCode history on {deviceName ?? 'this machine'}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {discovery.data?.projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              selected={selected}
              expanded={expanded.has(project.id)}
              onToggleProject={() => toggleProject(project)}
              onToggleSession={toggleSession}
              onSyncSession={(key) => importMutation.mutate([key])}
              onToggleExpanded={() => toggleExpanded(project.id)}
              syncDisabled={importMutation.isPending}
              syncingSessionKey={importMutation.isPending && importMutation.variables?.length === 1
                ? importMutation.variables[0]
                : null}
            />
          ))}
        </div>
      )}

      {lastResult && (
        <Callout padding="md" tone={(lastResult.failures.length > 0 ? "warning" : "success")} >
          {formatImportResultSummary(lastResult)}
        </Callout>
      )}

      {importMutation.isError && (
        <Callout padding="md" tone={"error"} >
          Update failed. {importMutation.error instanceof Error ? importMutation.error.message : ''}
        </Callout>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 pt-4 backdrop-blur">
        <p className="text-[11px] text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} ${selected.size === 1 ? 'chat' : 'chats'} selected from ${selectedProjects} ${selectedProjects === 1 ? 'project' : 'projects'}. ${selectedBreakdown.imports} new, ${selectedBreakdown.syncs} to sync.`
            : 'Select a project or individual chats to import or sync.'}
        </p>
        <Button
          type="button"
          onClick={() => importMutation.mutate([...selected])}
          disabled={selected.size === 0 || importMutation.isPending}
          variant="primary"
          size="md"
        >
          <Download />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  expanded,
  onToggleProject,
  onToggleSession,
  onSyncSession,
  onToggleExpanded,
  syncDisabled,
  syncingSessionKey,
}: {
  project: ExternalAgentProjectCandidate;
  selected: Set<string>;
  expanded: boolean;
  onToggleProject: () => void;
  onToggleSession: (key: string) => void;
  onSyncSession: (key: string) => void;
  onToggleExpanded: () => void;
  syncDisabled: boolean;
  syncingSessionKey: string | null;
}) {
  const selectable = selectableSessions(project);
  const selectedCount = selectable.filter((session) => selected.has(session.key)).length;
  const checked = selectable.length > 0 && selectedCount === selectable.length;
  const checkState = checked ? true : selectedCount > 0 ? 'indeterminate' as const : false;
  const visibleSessions = expanded ? project.sessions : project.sessions.slice(0, 3);

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={checkState}
          onCheckedChange={onToggleProject}
          disabled={selectable.length === 0}
          aria-label={`Select ${project.name}`}
          className="mt-0.5"
        />
        <Folder size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <InlineAction  type="button" onClick={onToggleExpanded} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
            <StatusBadge className="shrink-0">
              {project.sessions.length} {project.sessions.length === 1 ? 'chat' : 'chats'}
            </StatusBadge>
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/70">{project.cwd}</span>
          {project.agent && (
            <span className="mt-1 block text-[10px] text-muted-foreground">Imports into the {project.agent.name} agent</span>
          )}
          {!project.pathExists && (
            <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle size={10} /> Folder missing. The chat can still be imported or synced.
            </span>
          )}
        </InlineAction>
        <IconButton
          type="button"
          onClick={onToggleExpanded}
          label={expanded ? 'Collapse chats' : 'Expand chats'}
          variant="ghost"
          size="sm"
        >
          <ChevronDown size={15} className={cn('text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        </IconButton>
      </div>

      <div className="border-t border-border/70 bg-muted/10">
        {visibleSessions.map((session) => {
          const isSyncing = syncingSessionKey === session.key;
          return (
            <div
              key={session.key}
              className="flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-b-0 hover:bg-muted/30"
            >
              <Checkbox
                checked={selected.has(session.key)}
                onCheckedChange={() => onToggleSession(session.key)}
                disabled={syncDisabled || session.importable === false}
                aria-label={`Select ${session.label} to ${session.imported ? 'sync' : 'import'}`}
              />
              <MessageSquare size={13} className="shrink-0 text-muted-foreground" />
              <InlineAction
                type="button"
                onClick={() => onToggleSession(session.key)}
                disabled={syncDisabled || session.importable === false}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[12px] text-foreground">{session.label}</span>
                {session.note && <span className="mt-0.5 block text-[10px] text-muted-foreground">{session.note}</span>}
                <span className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <StatusBadge>{sourceLabel(session.source)}</StatusBadge>
                  {session.branchName && <span className="max-w-36 truncate">{session.branchName}</span>}
                </span>
              </InlineAction>
              <span className={cn(
                'shrink-0 text-[10px] text-muted-foreground',
                session.importStatus === 'changed' && 'text-amber-600 dark:text-amber-400',
                session.importStatus === 'error' && 'text-destructive',
              )}>
                {importStatusLabel(session)}
              </span>
              {session.imported && session.importable !== false && (
                <Button
                  type="button"
                  onClick={() => onSyncSession(session.key)}
                  disabled={syncDisabled}
                  aria-label={`Sync ${session.label}`}
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                >
                  <RefreshCw className={cn('size-3', isSyncing && 'animate-spin')} />
                  {isSyncing ? 'Syncing' : session.importStatus === 'error' || session.importStatus === 'missing' ? 'Retry' : 'Sync'}
                </Button>
              )}
            </div>
          );
        })}
        {!expanded && project.sessions.length > 3 && (
          <Button
            type="button"
            onClick={onToggleExpanded}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Show {project.sessions.length - 3} more chats
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ImportsSection() {
  return <ExternalAgentImportPanel />;
}

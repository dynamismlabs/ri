'use client';
import { Callout } from '@/components/system/callout';
import { MenuAction } from '@/components/system/menu-action';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';

import { SegmentedControl } from '@/components/system/segmented-control';

import { Button } from '@/components/system/button';
import { SetupAgentDialog } from '@/components/agents/setup-agent-dialog';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceBranches } from '@/hooks/use-workspaces';
import { apiErrorBody, apiErrorStatus, apiErrorText } from '@/lib/api/client';
import { workspacesApi } from '@/lib/api/workspaces';
import type { LaunchBase, LaunchMode } from '@/lib/executions/launch-draft';
import { START_RI } from '@/lib/executions/location';
import type { RunOn } from '@/lib/setups/run-on';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, GitBranch, Laptop, Loader2, RefreshCw, Search, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LauncherPopoverContent } from './launcher-popover';
import { Tip } from '@/components/ui/tip';

const TRIGGER_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none';

/**
 * Isolation mode as a two-up segmented control rather than a popover.
 *
 * Live used to be its own ⚡ button on the workspace row, then briefly a
 * choice buried one click deep in a popover — which made it *less* discoverable
 * than before, not more. As a visible segment both options are readable at a
 * glance and switching is one click, which is right for something you toggle
 * per-execution rather than configure once.
 *
 * The consequences copy doesn't disappear with the popover: it moves to
 * {@link LiveModeNotice}, rendered inline whenever Live is armed, so the warning
 * is on screen while it applies instead of being dismissed on the way past.
 */
export function ModeControl({
  mode,
  onChange,
  disabled,
}: {
  mode: LaunchMode;
  onChange: (mode: LaunchMode) => void;
  disabled?: boolean;
}) {
  return (
    <SegmentedControl
      mode="choice"
      selection="radio"
      ariaLabel="Isolation mode"
      value={mode}
      onChange={onChange}
      disabled={disabled}
      options={[
        {
          value: 'worktree',
          label: 'Worktree',
          icon: <GitBranch />,
          hint: 'Isolated copy on its own branch',
        },
        {
          value: 'live',
          label: 'Live',
          icon: <Zap />,
          hint: "Runs in the agent's own folder, no isolation",
          selectedTone: 'warning',
        },
      ]}
    />
  );
}

/** The Live consequences, shown inline while Live is the armed mode. */
export function LiveModeNotice() {
  return (
    <Callout padding="sm" density="row" tone={"warning"} className="flex items-start gap-2">
      <Zap size={12} className="mt-px flex-shrink-0" />
      <span>
        This edits the agent&apos;s own folder on whatever branch is checked out. No
        isolation, commits land on that branch, and two Live sessions will race on files.
      </span>
    </Callout>
  );
}

/**
 * The fork point, rendered as a control **and** kept identical to the base
 * chip above it. Picking a branch here is the same event as picking one in
 * browse (it attaches a base chip), so there is exactly one source of truth
 * with two handles on it.
 *
 * When the base came from a PR it's read-only here — a PR head is resolved
 * server-side from `refs/pull/N/head`, so there's no branch name to show
 * that would actually be correct. Clearing is still available.
 */
/**
 * Where the execution runs (docs/homes-spec.md §3.3, P3.1). Quiet by design:
 * with one device it's just that device's name, and with a choice it's a
 * chip that opens the choices. Picking one affects this execution only.
 * "Make this the default" is its own explicit item, never a side effect of
 * picking. A device that can't take the work says why and can't be
 * picked, and nothing is ever swapped in for it. One the agent isn't on yet
 * offers to set it up there, then is picked (docs/homes-model.md).
 */
export function RunOnControl({
  agent,
  runOn,
  value,
  onChange,
  onMakeDefault,
  savingDefault,
  disabled,
}: {
  agent: { id: string; name: string };
  runOn: RunOn;
  value: string | null;
  onChange: (deviceId: string) => void;
  onMakeDefault: (deviceId: string) => void;
  savingDefault?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [settingUp, setSettingUp] = useState<{ id: string; name: string } | null>(null);
  const selected = runOn.choices.find((c) => c.deviceId === value) ?? null;
  if (runOn.choices.length === 0 || !selected) return null;

  if (runOn.choices.length === 1) {
    return (
      <Tip label="Where this chat runs">
        <span className={cn(TRIGGER_CLASS, 'pointer-events-none')}>
          <Laptop size={11} />
          <span className="max-w-[9rem] truncate">{selected.name}</span>
        </span>
      </Tip>
    );
  }

  const oneOff = value !== runOn.defaultId;
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Tip label="Where this chat runs">
            <Button
              type="button"
              disabled={disabled}
              variant={oneOff ? "secondary" : "ghost"}
              size="sm"
              tone={!selected.ready ? "warning" : "neutral"}
            >
              <Laptop size={11} />
              <span className="max-w-[9rem] truncate">{selected.name}</span>
            </Button>
          </Tip>
        </PopoverTrigger>
        <LauncherPopoverContent align="start" className="w-[280px] p-1">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Run on</div>
          {runOn.choices.map((choice) => {
            const isSelected = choice.deviceId === value;
            const canSetUp = choice.needsSetup && choice.connected;
            const hint = choice.needsSetup
              ? canSetUp
                ? `${agent.name} isn't on ${choice.name} yet. Set it up there, once.`
                : `${choice.name} isn't running Ri right now. Start it there with ${START_RI}.`
              : !choice.ready
                ? choice.problem
                : !choice.connected
                  ? 'Not connected right now. The work starts when it is.'
                  : null;
            return (
              <MenuAction density="compact"
                key={choice.deviceId}
                type="button"
                disabled={!choice.ready && !canSetUp}
                onClick={() => {
                  setOpen(false);
                  if (canSetUp) setSettingUp({ id: choice.deviceId, name: choice.name });
                  else onChange(choice.deviceId);
                }}
                className="flex w-full items-start gap-2 text-left disabled:cursor-not-allowed"
              >
                <Laptop size={11} className={cn('mt-0.5 flex-shrink-0', choice.ready ? 'text-primary/70' : 'text-muted-foreground/50')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('flex items-center gap-1.5 text-[12px]', choice.ready ? 'text-foreground' : 'text-muted-foreground')}>
                    <span className="truncate">{choice.name}</span>
                    {choice.deviceId === runOn.defaultId && (
                      <span className="text-[10px] text-muted-foreground/70">default</span>
                    )}
                  </span>
                  {hint && (
                    <span className={cn('block text-[10.5px] leading-snug', choice.ready ? 'text-muted-foreground/80' : 'text-amber-600 dark:text-amber-400')}>
                      {hint}
                    </span>
                  )}
                </span>
                {isSelected && <Check size={11} className="mt-0.5 flex-shrink-0 text-primary" />}
              </MenuAction>
            );
          })}
          {oneOff && selected.ready && (
            <MenuAction density="compact" separator
              type="button"
              disabled={savingDefault}
              onClick={() => onMakeDefault(selected.deviceId)}
              className="mt-1 flex w-full items-center gap-2 text-left"
            >
              {savingDefault ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} className="opacity-0" />}
              Make {selected.name} the default for this agent
            </MenuAction>
          )}
        </LauncherPopoverContent>
      </Popover>
      {settingUp && (
        <SetupAgentDialog
          workspaceId={agent.id}
          agentName={agent.name}
          device={settingUp}
          open={!!settingUp}
          onOpenChange={(next) => !next && setSettingUp(null)}
          onReady={() => {
            onChange(settingUp.id);
            setSettingUp(null);
          }}
        />
      )}
    </>
  );
}

export function BaseControl({
  workspaceId,
  base,
  workspaceDefault,
  onPickBranch,
  onClear,
  disabled,
}: {
  workspaceId: string | null;
  base: LaunchBase;
  workspaceDefault: string | null;
  onPickBranch: (branch: string) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const { data: branches, isLoading } = useWorkspaceBranches(open ? workspaceId : null);

  const filtered = useMemo(() => {
    const all = branches ?? [];
    if (!filter.trim()) return all.slice(0, 60);
    const q = filter.toLowerCase();
    return all.filter((b) => b.toLowerCase().includes(q)).slice(0, 60);
  }, [branches, filter]);

  const fromPr = base.prNumber != null;
  const label = fromPr
    ? `pr/${base.prNumber}`
    : base.baseBranch ?? workspaceDefault ?? 'default';
  const explicit = fromPr || !!base.baseBranch;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFilter(''); }}>
      <PopoverTrigger asChild>
        <Tip label={fromPr ? `Forking from pull request #${base.prNumber}` : 'Fork point'}>
          <Button
            type="button"
            disabled={disabled}
            variant={explicit ? "secondary" : "ghost"}
            size="sm"
          >
            <GitBranch size={11} />
            <span className="max-w-[11rem] truncate font-mono">from {label}</span>
          </Button>
        </Tip>
      </PopoverTrigger>
      <LauncherPopoverContent align="start" className="w-[300px] p-0">
        {fromPr ? (
          <div className="space-y-2 p-3">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Forking from the head of pull request{' '}
              <span className="font-mono text-foreground">#{base.prNumber}</span>. Resolved on the
              server, so it works for forks and PRs you have never checked out.
            </p>
            <Button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-1.5"
            >
              <X size={11} />
              Use the agent&apos;s default instead
            </Button>
          </div>
        ) : (
          <>
            <div className="relative border-b border-border/70"><Field
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter branches…"
              className={'w-full'}
              purpose="embedded"
              leading={<Search />}
              aria-label={'Filter branches'}
              size={compactFieldSize}
            /></div>
            <div className="max-h-[240px] overflow-y-auto p-1">
              {base.baseBranch && (
                <MenuAction density="compact"
                  type="button"
                  onClick={() => { onClear(); setOpen(false); }}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <X size={11} />
                  Agent default
                  {workspaceDefault && <span className="font-mono opacity-70">({workspaceDefault})</span>}
                </MenuAction>
              )}
              {isLoading && (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground/70">Loading…</div>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="px-2 py-3 text-center text-[11px] italic text-muted-foreground/60">
                  No branches matched.
                </div>
              )}
              {filtered.map((b) => (
                <MenuAction density="compact"
                  key={b}
                  type="button"
                  onClick={() => { onPickBranch(b); setOpen(false); }}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <GitBranch size={11} className="flex-shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{b}</span>
                  {b === base.baseBranch && <Check size={11} className="ml-auto flex-shrink-0 text-primary" />}
                </MenuAction>
              ))}
            </div>
          </>
        )}
      </LauncherPopoverContent>
    </Popover>
  );
}

export { ModelControl, type LaunchHarnessSelection } from './model-controls';

/**
 * "Is my checkout current" for Live mode, and one click to fix it.
 *
 * Live runs the agent in the workspace directory on whatever branch is checked
 * out, so unlike a worktree there's no fetch-and-fork step to guarantee
 * freshness — you get exactly the code you have. That's the correct contract
 * (it IS your working tree), but it shouldn't be silent: this occupies the slot
 * where the fork-point control sits in worktree mode and answers the same
 * question that control answers there.
 *
 * Refuses on a dirty tree, surfaced as a disabled state with the reason,
 * because merging over uncommitted work to solve a problem the user didn't
 * raise is how you lose someone's afternoon.
 */
export function LiveFreshnessControl({
  workspaceId,
  disabled,
}: {
  workspaceId: string | null;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = ['workspace', workspaceId, 'base-status'] as const;

  const status = useQuery({
    queryKey: key,
    queryFn: () => workspacesApi.baseStatus(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const pull = useMutation({
    mutationFn: () => workspacesApi.pullBase(workspaceId!),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      const body = apiErrorStatus(err) !== undefined ? (apiErrorBody(err) as { message?: string } | null) : null;
      setError(body?.message ?? (err instanceof Error ? apiErrorText(err) : String(err)));
    },
  });

  if (!workspaceId) return null;

  const s = status.data;
  const behind = s?.behind ?? 0;
  const current = !!s && behind === 0;
  const blocked = !!s?.dirty && behind > 0;

  const label = status.isLoading
    ? 'Checking…'
    : !s
      ? 'Base unknown'
      : behind === 0
        ? `Up to date with ${s.base}`
        : `Pull ${s.base} (${behind} behind)`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          disabled={disabled || status.isLoading || pull.isPending || current || blocked}
          onClick={() => pull.mutate()}
          variant="secondary"
          size="xs"
          tone={behind > 0 && !blocked ? "warning" : "neutral"}
        >
          {pull.isPending || status.isLoading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : current ? (
            <Check size={11} className="text-emerald-500" />
          ) : (
            <RefreshCw size={11} />
          )}
          <span className="max-w-[13rem] truncate">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4} className="max-w-[280px]">
        {error
          ? error
          : blocked
            ? `You have uncommitted changes in this folder. Commit or stash them before pulling ${s?.base}.`
            : current
              ? `This checkout matches ${s?.base}. Live sessions will use the latest code.`
              : s?.warning
                ? s.warning
                : `Live runs in this folder as-is. Merge ${s?.base ?? 'the base branch'} in so the agent starts from current code.`}
      </TooltipContent>
    </Tooltip>
  );
}

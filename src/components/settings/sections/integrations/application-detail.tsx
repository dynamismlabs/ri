'use client';
import { Callout } from '@/components/system/callout';
import { Card } from '@/components/system/card';
import { MenuAction } from '@/components/system/menu-action';

import { Field } from '@/components/system/field';
import { SelectField } from '@/components/system/select-field';

import { IconButton } from '@/components/system/icon-button';
/**
 * One application's page in Connectors (docs/connector-service-spec.md §2), for applications a
 * managed source can connect: Gmail and Google Calendar.
 *
 *   Connect → browser consent → verify account → choose agent access
 *
 * Every account the application has is here, whichever way it was connected, labeled with its
 * source. One primary Connect uses the method Ri chose (the explicit choice for this application,
 * else the preferred source, else a working direct sign-in), and Change method keeps the rest in
 * reach. Disconnecting from Ri, revoking in Composio and removing one agent's access are three
 * different actions, and each says what it does.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, CalendarDays, Check, ChevronDown, ExternalLink, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { IntegrationLogo } from '@/components/integrations/integration-logo';
import { Button } from '@/components/system/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/system/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/system/menu';

import { Switch } from '@/components/ui/switch';

import { openIntegrationAuthorization } from '@/lib/client/desktop';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { APPLICATIONS } from '@/lib/integrations/sources/applications';
import type { MethodOption } from '@/lib/integrations/sources/method-selection';
import type { ApplicationId } from '@/lib/integrations/sources/types';
import type { ManagedAccountView } from '@/lib/integrations/sources/views';
import { pinKey, scopePins } from '@/lib/integrations/scope-pins';
import type { WorkspaceIntegrationScope } from '@/db/types';
import {
  sourceErrorMessage, useConnectAttempt, useConnectionMethod, useDiscoveredAccounts, useManagedAccounts, useSourceMutations, useSourcesOverview,
} from '@/hooks/use-integration-sources';
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/system/select';
import { BackLink, Chip, ConnectFormSection, DetailHeader, GroupHeading } from './parts';
import { ToolList } from './provider-detail';
import { connectionIdentity, type ApprovalMode, type Connection, type ToolkitInfo, type WritePolicyAction } from './types';

export interface ApplicationDetailProps {
  applicationId: ApplicationId;
  /** Direct accounts (through Google) that cover this application. */
  directConnections: Connection[];
  /** The application's managed toolkits, from every source. */
  toolkits: ToolkitInfo[];
  writePolicy: Record<string, WritePolicyAction>;
  onSetApproval: (actionId: string, mode: ApprovalMode) => void;
  onBack: () => void;
  onOpenSources: () => void;
  /** Open the direct connector's page (Google), where direct accounts and own OAuth apps live. */
  onOpenDirect: () => void;
  /** Start a direct sign-in for just this application's service. */
  onConnectDirect: () => Promise<void>;
  /** Where a sign-in started here returns the browser. */
  returnTo: string;
  /** A sign-in the browser just came back from: show how it ended, and the agent access step. */
  initialAttemptId?: string | null;
  onChanged: () => void;
}

const LOGO: Record<ApplicationId, string> = { gmail: 'gmail', google_calendar: 'google' };

export function ApplicationDetail(props: ApplicationDetailProps) {
  const app = APPLICATIONS[props.applicationId];
  const accounts = useManagedAccounts();
  const overview = useSourcesOverview();
  // Every source that can be read now, whether or not this home has an account through it yet:
  // an account disconnected from Ri can be added back from here.
  const usableSources = useMemo(() => (overview.data?.sources ?? []).filter(source => source.enabled && source.hasKey).map(source => ({ id: source.id, label: source.label })), [overview.data]);
  const managed = useMemo(() => (accounts.data ?? []).filter(account => account.applicationId === props.applicationId), [accounts.data, props.applicationId]);
  const [attemptId, setAttemptId] = useState<string | null>(props.initialAttemptId ?? null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const total = managed.length + props.directConnections.length;
  const showConnect = total === 0 || adding;
  const toolCount = props.toolkits.reduce((n, t) => n + t.actions.length, 0);
  const anyNeedsReconnect = managed.some(account => account.status === 'needs_reauth') || props.directConnections.some(c => c.status !== 'active');

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <BackLink onBack={props.onBack} busy={accounts.isFetching && !accounts.data} />
        <DetailHeader
          logo={<IntegrationLogo providerId={LOGO[props.applicationId]} name={app.displayName} size={48} />}
          title={app.displayName}
          subtitle={props.applicationId === 'gmail' ? 'Let agents find, read, draft and send mail.' : 'Let agents see and create events, and show your calendar in Ri.'}
          meta={total > 0
            ? <Chip tone={anyNeedsReconnect ? 'warn' : 'ok'}>{total === 1 ? (anyNeedsReconnect ? 'Needs attention' : 'Connected') : `${total} accounts connected`}</Chip>
            : <Chip>Not connected</Chip>}
        />
      </div>

      {banner && <Callout as="p" padding="md" tone={"success"} role="status" >{banner}</Callout>}
      {error && (
        <Callout padding="md" tone={"error"} role="alert" className="flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </Callout>
      )}

      {attemptId && (
        <PendingSignIn
          attemptId={attemptId}
          appName={app.displayName}
          onDone={(result) => {
            setAttemptId(null);
            setAdding(false);
            if (result.status === 'completed') {
              setBanner(`Connected ${app.displayName}${result.account ? ` · ${result.account}` : ''}. Choose which agents can use it below.`);
              setJustConnected(result.connectionId);
            } else if (result.status !== 'cancelled') {
              setError(result.error);
            }
            props.onChanged();
          }}
        />
      )}

      {total > 0 && (
        <section className="space-y-2">
          <GroupHeading
            count={total}
            action={!adding && !attemptId && (
              <Button
                onClick={() => setAdding(true)}
                variant="secondary"
                size="xs"
              >
                <Plus size={12} /> Add account
              </Button>
            )}
          >
            Accounts
          </GroupHeading>
          {adding && !attemptId && (
            <ConnectFormSection opened>
              <ConnectMethodPanel {...props} onStarted={setAttemptId} onError={setError} onCancel={() => setAdding(false)} />
            </ConnectFormSection>
          )}
          <Card padding="none" className="divide-y divide-border/60">
            {managed.map(account => (
              <ManagedAccountRow
                key={account.connectionId}
                account={account}
                returnTo={props.returnTo}
                startOpen={justConnected === account.connectionId}
                onReconnect={setAttemptId}
                onMessage={setBanner}
                onError={setError}
                onChanged={props.onChanged}
              />
            ))}
            {props.directConnections.map(connection => (
              <div key={connection.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{connectionIdentity(connection)}</span>
                    <Chip>Direct, through Google</Chip>
                    {connection.status !== 'active' && <Chip tone="warn">{connection.status}</Chip>}
                  </div>
                </div>
                <Button
                  onClick={props.onOpenDirect}
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                >Manage in Google</Button>
              </div>
            ))}
          </Card>
        </section>
      )}

      {showConnect && !attemptId && total === 0 && (
        <ConnectFormSection opened={false}>
          <GroupHeading>Connect</GroupHeading>
          <ConnectMethodPanel {...props} onStarted={setAttemptId} onError={setError} />
        </ConnectFormSection>
      )}

      {usableSources.length > 0 && <ExistingAccounts applicationId={props.applicationId} sources={usableSources} onChanged={props.onChanged} onError={setError} />}

      {toolCount > 0 && <ToolList toolkits={props.toolkits} writePolicy={props.writePolicy} onSetApproval={props.onSetApproval} />}
    </div>
  );
}

// ── Connecting ──────────────────────────────────────────────

function optionKey(option: MethodOption): string {
  if (option.kind === 'setup') return `setup:${option.sourceKind}`;
  return option.kind === 'managed' ? `source:${option.source.id}` : 'direct';
}

function optionTitle(option: MethodOption, appName: string): string {
  if (option.kind === 'managed') return option.source.label;
  if (option.kind === 'direct') return `Direct ${appName} sign-in, through Google`;
  return 'Composio';
}

function ConnectMethodPanel(props: ApplicationDetailProps & { onStarted: (attemptId: string) => void; onError: (message: string | null) => void; onCancel?: () => void }) {
  const app = APPLICATIONS[props.applicationId];
  const method = useConnectionMethod(props.applicationId, 'agent_tools');
  const m = useSourceMutations();
  const [changing, setChanging] = useState(false);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [calendarUse, setCalendarUse] = useState(true);
  const [starting, setStarting] = useState(false);
  const selection = method.data;
  const options = useMemo(() => selection ? [selection.primary, ...selection.alternatives].filter((o): o is MethodOption => Boolean(o)) : [], [selection]);
  const chosen = (chosenKey ? options.find(option => optionKey(option) === chosenKey) : undefined) ?? selection?.primary ?? null;
  const explicit = Boolean(chosenKey && selection?.primary && chosenKey !== optionKey(selection.primary));

  if (method.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Checking how to connect…</p>;
  if (method.error) return <p role="alert" className="text-xs text-destructive">{sourceErrorMessage(method.error)}</p>;
  if (!selection) return null;

  const connect = async () => {
    if (!chosen || !chosen.available) return;
    props.onError(null);
    setStarting(true);
    try {
      if (chosen.kind === 'managed') {
        const result = await m.connect.mutateAsync({
          applicationId: props.applicationId, sourceId: chosen.source.id, explicitChoice: explicit,
          ...(label.trim() ? { label: label.trim() } : {}), returnTo: props.returnTo,
          ...(props.applicationId === 'google_calendar' ? { calendarUse } : {}),
        });
        props.onStarted(result.attemptId);
        await openIntegrationAuthorization(result.authorizationUrl);
      } else if (chosen.kind === 'direct') {
        if (explicit && chosen.method && !('sourceId' in chosen.method)) {
          await m.setApplicationMethod.mutateAsync({ applicationId: props.applicationId, method: chosen.method });
        }
        await props.onConnectDirect();
      }
    } catch (e) {
      props.onError(sourceErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const explanation = (() => {
    if (!chosen) return null;
    if (chosen.kind === 'managed') {
      const why = explicit ? `the method you picked for ${app.displayName}` : selection.basis === 'override' ? `the method you chose for ${app.displayName}` : selection.basis === 'preferred' ? 'your preferred source' : null;
      return `Using ${chosen.source.label}${why ? `, ${why}` : ''}. ${chosen.source.label} stores this connection and processes its tool requests.`;
    }
    if (chosen.kind === 'direct') return `Using a direct sign-in with your Google OAuth app. The account's tokens stay in this Ri.`;
    return null;
  })();

  return (
    <Card padding="lg" className="space-y-4">
      {selection.notice && !chosenKey && (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {selection.notice}</p>
      )}
      {chosen ? (
        <div className="space-y-3">
          {explanation && <p className="text-xs leading-normal text-foreground/90">{explanation}</p>}
          {chosen.kind === 'managed' && (
            <div className="flex flex-wrap items-center gap-2">
              <Field value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="Name it, like Work (optional)" aria-label={`Name for this ${app.displayName} account`} className="min-w-0 flex-1 basis-48" />
            </div>
          )}
          {chosen.kind === 'managed' && props.applicationId === 'google_calendar' && (
            <label className="flex items-center gap-2 text-xs text-foreground/90">
              <Checkbox checked={calendarUse} onCheckedChange={value => setCalendarUse(value === true)} />
              Show it in Ri&apos;s Calendar and use it for the deck
            </label>
          )}
          {chosen.available ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void connect()}
                disabled={starting}
                variant="primary"
                size="md"
              >
                {starting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Connect {app.displayName}
              </Button>
              {options.length > 1 && (
                <Button
                  aria-expanded={changing}
                  onClick={() => setChanging(open => !open)}
                  variant="ghost"
                  size="xs"
                >
                  Change method <ChevronDown size={12} className={changing ? 'rotate-180' : undefined} />
                </Button>
              )}
              {props.onCancel && <Button
                onClick={props.onCancel}
                variant="ghost"
                size="xs"
              >Cancel</Button>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{chosen.reason}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-xs text-foreground/90">
          <p>{app.displayName} needs a way to connect first.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={props.onOpenSources}
              variant="primary"
              size="md"
            >Set up Composio</Button>
            <Button
              onClick={props.onOpenDirect}
              variant="secondary"
              size="sm"
            >Use your own Google OAuth app</Button>
          </div>
        </div>
      )}

      {changing && (
        <div role="radiogroup" aria-label="Connection method" className="space-y-1 border-t border-border/60 pt-3">
          {options.map(option => {
            const key = optionKey(option);
            const selected = chosen ? key === optionKey(chosen) : false;
            const onPick = () => {
              if (option.kind === 'setup') { props.onOpenSources(); return; }
              if (option.kind === 'direct' && !option.available) { props.onOpenDirect(); return; }
              setChosenKey(key);
              setChanging(false);
            };
            return (
              <MenuAction density="compact"
                key={key} type="button" role="radio" aria-checked={selected} onClick={onPick}
                className="flex w-full items-start gap-2 text-left"
              >
                <span className="mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center">{selected && <Check size={13} className="text-primary" />}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">{optionTitle(option, app.displayName)}</span>
                  {option.reason && <span className="block text-[11px] text-muted-foreground">{option.reason}{option.kind === 'direct' && !option.available ? ' Set it up on the Google page.' : ''}</span>}
                </span>
              </MenuAction>
            );
          })}
          {selection.basis === 'override' && (
            <Button
              type="button"
              onClick={() => void m.setApplicationMethod.mutateAsync({ applicationId: props.applicationId, method: null }).then(() => setChosenKey(null)).catch(e => props.onError(sourceErrorMessage(e)))}
              variant="link"
              size="sm"
            >
              Use the overall preference for {app.displayName} again
            </Button>
          )}
          {explicit && <p className="px-2 pt-1 text-[11px] text-muted-foreground">Ri remembers this choice for {app.displayName}.</p>}
        </div>
      )}
    </Card>
  );
}

type AttemptResult =
  | { status: 'completed'; connectionId: string; account?: string }
  | { status: 'failed' | 'expired' | 'cancelled'; error: string };

/** A sign-in in progress: finishes from the callback, or by polling when it can't reach this home. */
function PendingSignIn({ attemptId, appName, onDone }: { attemptId: string; appName: string; onDone: (result: AttemptResult) => void }) {
  const attempt = useConnectAttempt(attemptId);
  const m = useSourceMutations();
  const reported = useRef(false);
  const status = attempt.data;
  const failure = attempt.error;
  useEffect(() => {
    if (reported.current) return;
    if (status && status.status !== 'pending') {
      reported.current = true;
      onDone(status.status === 'completed'
        ? { status: 'completed', connectionId: status.connectionId, account: status.account }
        : { status: status.status, error: status.error });
    } else if (failure) {
      reported.current = true;
      onDone({ status: 'failed', error: sourceErrorMessage(failure) });
    }
  }, [status, failure, onDone]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <span className="flex items-center gap-2 text-xs"><Loader2 size={13} className="animate-spin text-muted-foreground" /> Finish signing in to {appName} in your browser.</span>
      <Button
        onClick={() => void m.cancelAttempt.mutateAsync({ attemptId }).finally(() => onDone({ status: 'cancelled', error: 'Cancelled.' }))}
        variant="secondary"
        size="sm"
      >
        Cancel
      </Button>
    </div>
  );
}

// ── Accounts ────────────────────────────────────────────────

function ManagedAccountRow({ account, returnTo, startOpen, onReconnect, onMessage, onError, onChanged }: {
  account: ManagedAccountView;
  returnTo: string;
  startOpen: boolean;
  onReconnect: (attemptId: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string | null) => void;
  onChanged: () => void;
}) {
  const m = useSourceMutations();
  const confirm = useConfirm();
  // The account just connected opens its agent access step (connecting grants nothing), until
  // the person toggles it themselves.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const agentsOpen = toggled ?? startOpen;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.label ?? '');
  const identity = account.verifiedEmail ?? account.label ?? 'Account';
  const reconnect = account.status === 'needs_reauth';

  const act = async (work: () => Promise<unknown>) => {
    onError(null);
    try { await work(); onChanged(); } catch (e) { onError(sourceErrorMessage(e)); }
  };

  const disconnect = async () => {
    if (!(await confirm({
      title: `Disconnect ${identity} from Ri?`,
      description: `Agents stop using it right away. The account stays connected in your ${account.sourceLabel} project, so you can add it back later or remove it there.`,
      confirmLabel: 'Disconnect',
    }))) return;
    await act(async () => {
      await m.disconnect.mutateAsync({ connectionId: account.connectionId });
      onMessage(`Disconnected ${identity} from Ri. It is still in ${account.sourceLabel}.`);
    });
  };

  const revoke = async () => {
    if (!(await confirm({
      title: `Revoke ${identity} in ${account.sourceLabel}?`,
      description: `This disconnects it from Ri and removes it from your ${account.sourceLabel} project, revoking its sign-in where ${account.sourceLabel} can. Anything else using that account through ${account.sourceLabel} stops working too.`,
      confirmLabel: 'Revoke',
      tone: 'destructive',
    }))) return;
    await act(async () => {
      const result = await m.revoke.mutateAsync({ connectionId: account.connectionId });
      const outcome = result.outcome;
      onMessage(outcome.kind === 'revoked'
        ? `Revoked ${identity} and removed it from ${result.sourceLabel}.`
        : outcome.kind === 'revoke_unsupported'
          ? `${result.sourceLabel} can't revoke this sign-in with the provider. The account was ${outcome.disabled ? 'turned off and ' : ''}removed from ${result.sourceLabel}. Revoke it in your Google account settings to be sure.`
          : `Disconnected from Ri, but ${result.sourceLabel} cleanup failed: ${outcome.reason}`);
    });
  };

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-48">
          {renaming ? (
            <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); void act(async () => { await m.renameAccount.mutateAsync({ connectionId: account.connectionId, label: name }); setRenaming(false); }); }}>
              <Field value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Work" aria-label="Account name"  autoFocus />
              <Button
                type="submit"
                variant="primary"
                size="md"
              >Save</Button>
              <Button
                type="button"
                onClick={() => setRenaming(false)}
                variant="ghost"
                size="xs"
              >Cancel</Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{identity}</span>
              {account.label && account.verifiedEmail && <Chip>{account.label}</Chip>}
              <Chip>via {account.sourceLabel}</Chip>
              {!account.sourceEnabled ? <Chip tone="off">{account.sourceLabel} is off</Chip>
                : reconnect ? <Chip tone="warn">Sign-in needed</Chip> : <Chip tone="ok">Connected</Chip>}
            </div>
          )}
          {account.calendarUse !== null && (
            <label className="mt-1.5 flex w-fit items-center gap-2 text-[11px] text-muted-foreground">
              <Switch size="sm" checked={account.calendarUse} aria-label="Show in Ri's Calendar"
                onCheckedChange={on => void act(() => m.setCalendarUse.mutateAsync({ connectionId: account.connectionId, enabled: on }))} />
              <CalendarDays size={12} /> Show in Ri&apos;s Calendar and deck
            </label>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {reconnect && account.sourceEnabled && (
            <Button
              onClick={() => void act(async () => {
              const result = await m.reconnect.mutateAsync({ connectionId: account.connectionId, returnTo });
              onReconnect(result.attemptId);
              await openIntegrationAuthorization(result.authorizationUrl);
            })}
              variant="ghost"
              size="xs"
            >
              <RefreshCw size={12} /> Reconnect
            </Button>
          )}
          <Button
            aria-expanded={agentsOpen}
            onClick={() => setToggled(!agentsOpen)}
            variant="ghost"
            size="xs"
          >
            <Bot size={12} /> Agents
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>

                <IconButton
                  label={`More for ${identity}`}
                  tooltip="More for this account"
                  variant="ghost"
                  size="xs"
                ><MoreHorizontal size={12} /></IconButton>

            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <MenuAction kind="menu"  onSelect={() => { setName(account.label ?? ''); setRenaming(true); }}><Pencil size={12} /> Rename</MenuAction>
              <DropdownMenuSeparator />
              <MenuAction kind="menu"  onSelect={() => void disconnect()}><Unplug size={12} /> Disconnect from Ri</MenuAction>
              <MenuAction tone="error" kind="menu"  onSelect={() => void revoke()}><Trash2 size={12} /> Revoke in {account.sourceLabel}</MenuAction>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {agentsOpen && <AgentAccess account={account} onError={onError} />}
    </div>
  );
}

/**
 * Which agents can use this exact account. A managed account is always granted by name: there is
 * no "all accounts" for a managed source, so connecting another account never widens an agent.
 */
function AgentAccess({ account, onError }: { account: ManagedAccountView; onError: (message: string | null) => void }) {
  const qc = useQueryClient();
  const agents = useQuery({ ...trpc.workspaces.list.queryOptions({}), staleTime: 10_000 });
  const [saving, setSaving] = useState<string | null>(null);
  const pin = { accountId: account.accountId };
  const list = (Array.isArray(agents.data) ? agents.data : []) as Array<{ id: string; name: string; integrationScopes?: WorkspaceIntegrationScope[] | null }>;

  const has = (scopes: WorkspaceIntegrationScope[]) => scopes.some(scope => scope.toolkitId === account.toolkitId && scopePins(scope).some(p => pinKey(p) === pinKey(pin)));
  const toggle = async (agent: (typeof list)[number], on: boolean) => {
    onError(null);
    setSaving(agent.id);
    const scopes = agent.integrationScopes ?? [];
    const next: WorkspaceIntegrationScope[] = on
      ? scopes.some(scope => scope.toolkitId === account.toolkitId)
        ? scopes.map(scope => scope.toolkitId === account.toolkitId ? { toolkitId: scope.toolkitId, accounts: [...scopePins(scope), pin] } : scope)
        : [...scopes, { toolkitId: account.toolkitId, accounts: [pin] }]
      : scopes.flatMap(scope => {
        if (scope.toolkitId !== account.toolkitId) return [scope];
        const rest = scopePins(scope).filter(p => pinKey(p) !== pinKey(pin));
        // The last account leaves the service: never an empty list, which would mean every account.
        return rest.length ? [{ toolkitId: scope.toolkitId, accounts: rest }] : [];
      });
    try {
      await trpcClient.workspaces.integrationScopesPut.mutate({ params: { id: agent.id }, body: { scopes: next } });
      await qc.invalidateQueries({ queryKey: trpc.workspaces.list.queryKey() });
    } catch (e) {
      onError(sourceErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card padding="sm" className="mt-2 space-y-1">
      <p className="text-[11px] text-muted-foreground">Agents that can use {account.verifiedEmail ?? 'this account'}. The main chat can always use it.</p>
      {agents.isLoading && <p className="text-[11px] text-muted-foreground"><Loader2 size={11} className="mr-1 inline animate-spin" />Loading agents…</p>}
      {list.length === 0 && !agents.isLoading && <p className="text-[11px] text-muted-foreground">No agents yet.</p>}
      {list.map(agent => {
        const on = has(agent.integrationScopes ?? []);
        return (
          <label key={agent.id} className="flex items-center gap-2 text-xs text-foreground">
            <Checkbox checked={on} disabled={saving === agent.id} onCheckedChange={value => void toggle(agent, value === true)} />
            <span className="truncate">{agent.name}</span>
            {saving === agent.id && <Loader2 size={11} className="animate-spin text-muted-foreground" />}
          </label>
        );
      })}
    </Card>
  );
}

/** Accounts the source's own user already has in Composio but Ri doesn't use yet. */
function ExistingAccounts({ applicationId, sources, onChanged, onError }: {
  applicationId: ApplicationId;
  sources: { id: string; label: string }[];
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const sourceId = sources.find(source => source.id === picked)?.id ?? sources[0]?.id ?? null;
  const discovered = useDiscoveredAccounts(sourceId, applicationId, open);
  const m = useSourceMutations();
  const pending = (discovered.data ?? []).filter(account => !account.imported && account.status === 'ACTIVE');
  if (!sourceId) return null;
  return (
    <section className="rounded-xl border border-border/70">
      <MenuAction density="comfortable"  type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-3 text-left">
        <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-foreground">Accounts already in Composio</span>
          <span className="block text-[11px] text-muted-foreground">Add one this Ri connected before, without signing in again.</span>
        </span>
        <ChevronDown size={14} className={open ? 'shrink-0 rotate-180 text-muted-foreground' : 'shrink-0 text-muted-foreground'} />
      </MenuAction>
      {open && (
        <div className="space-y-1 border-t border-border/60 p-3">
          {sources.length > 1 && (
            <Select value={sourceId} onValueChange={setPicked}>
              <SelectField aria-label="Source" className="mb-1 w-fit"><SelectValue /></SelectField>
              <SelectContent>
                {sources.map(source => <SelectItem key={source.id} value={source.id} className="text-xs">{source.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {discovered.isLoading && <p className="text-[11px] text-muted-foreground"><Loader2 size={11} className="mr-1 inline animate-spin" />Looking…</p>}
          {discovered.error && <p className="text-[11px] text-destructive">{sourceErrorMessage(discovered.error)}</p>}
          {!discovered.isLoading && pending.length === 0 && <p className="text-[11px] text-muted-foreground">Nothing to add. Every account here is already in Ri.</p>}
          {pending.map(account => (
            <div key={account.remoteAccountId} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{account.alias ?? 'Unnamed account'}{account.createdAt ? `, added ${new Date(account.createdAt).toLocaleDateString()}` : ''}</span>
              <Button
                disabled={m.importAccount.isPending}
                onClick={() => void m.importAccount.mutateAsync({ sourceId, applicationId, remoteAccountId: account.remoteAccountId })
                  .then(onChanged).catch(e => onError(sourceErrorMessage(e)))}
                variant="secondary"
                size="xs"
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

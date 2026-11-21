'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowUpCircle, CheckCircle2, Circle, GitBranch, Loader2, MessageCircle, XCircle } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { HarnessChatSession } from '@/components/chat/harness-chat';
import { Button } from '@/components/system/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { APP_NAME } from '@/constants/app';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { removeAppDescription, removedNotice } from '@/lib/apps/remove-copy';
import { TurnOffAccessChoice } from './turn-off-access-choice';
import { versionLabel } from '@/lib/apps/version-label';
import { toast } from 'sonner';
import { useCatalogApp, useCatalogUpdate } from './app-catalog';
import { AppStatusLine } from './app-status';
import { AppProgress } from './app-progress';
import { stepLabel } from './app-steps';
import { useAllowApp } from './allow-app';
import { useOpenApp } from './use-open-app';
import { ensureAppBuilderChat } from './new-app-dialog';

type Navigate = (route: string, options?: { replace?: boolean }) => void;
type BuildSource = Awaited<ReturnType<typeof trpcClient.appBuilds.get.query>>;

/**
 * An app being built, installed or changed (docs/personal-apps.md "Building and changing apps").
 *
 * An app made in Ri shows its builder chat, in the app's folder or a change's own working copy, with
 * the kit's install and safe-change steps above it. A catalog app being installed or updated shows
 * those steps down the page instead, with how it ended and what's next: the builder chat is for
 * changing an app, so it opens when the person changes it or asks the builder to fix a failure. The
 * running app only ever changes through those steps.
 */
export function AppBuildPage({ sourceId, navigate }: { sourceId: string; navigate: Navigate }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const allowApp = useAllowApp();
  const openApp = useOpenApp(navigate);
  const source = useQuery(trpc.appBuilds.get.queryOptions({ id: sourceId }, { refetchInterval: (query) => query.state.data?.job?.state === 'running' ? 1000 : 15_000 }));
  const [chatAsked, setChatAsked] = useState(false);
  const catalogApp = useCatalogApp(sourceId);
  const fromCatalog = !!source.data?.catalogId;
  const changing = !!source.data?.changeFolder;
  // A catalog app's page is its progress until the person changes it or asks the builder.
  const showChat = !fromCatalog || changing || chatAsked;
  const chat = useQuery({ queryKey: ['app-builder-chat', sourceId], queryFn: () => ensureAppBuilderChat(sourceId), staleTime: 30_000, enabled: !!source.data && showChat });
  const app = useQuery({ ...trpc.personalApps.get.queryOptions({ appId: source.data?.personalAppId ?? '' }), enabled: !!source.data?.connected });
  // Where its data is, for what removing it keeps, and the computer it runs on.
  const status = useQuery({ ...trpc.appBuilds.status.queryOptions({ id: sourceId }), enabled: !!source.data?.url });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() });
  // A job that just ended (an install, an update) changed what the catalog says, such as Update to.
  const jobState = source.data?.job ? `${source.data.job.id}:${source.data.job.state}` : null;
  const lastJobState = useRef(jobState);
  const finishedHere = useRef<string | null>(null);
  useEffect(() => {
    const was = lastJobState.current;
    lastJobState.current = jobState;
    if (was?.endsWith(':running') && jobState !== was) {
      void queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() });
      if (jobState?.endsWith(':done')) finishedHere.current = jobState;
    }
  }, [jobState, queryClient]);
  const ri = app.data?.ri ?? null;
  const allowedIn = ri?.status === 'connected';
  const allow = useMutation({
    mutationFn: (options: { onlyInRi?: boolean } = {}) => allowApp.allow(ri!.serverId, options),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  // An install the person watched finish asks at once what Ri may do in the app, when Ri can ask in
  // its own dialog. The app's own page waits for the person to press Allow.
  useEffect(() => {
    const job = source.data?.job;
    if (!job || job.kind !== 'install' || finishedHere.current !== `${job.id}:done` || !ri || allowedIn || allow.isPending) return;
    finishedHere.current = null;
    allow.mutate({ onlyInRi: true });
  }, [source.data?.job, ri, allowedIn, allow]);
  const reconnect = useMutation({
    mutationFn: async () => {
      const start = await trpcClient.appBuilds.reconnect.mutate({ id: sourceId, returnTo: `${window.location.pathname}${window.location.search}` });
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() })]);
      if (start.requiresAuth && start.serverId) await allowApp.allow(start.serverId);
    },
    onSuccess: () => setError(null),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const data = source.data!;
      const folderGone = !!data.url && status.data?.problem === 'no_folder';
      const description = removeAppDescription({ name: data.name, installed: !!data.url, folder: data.folder, dataDir: status.data?.dataDir ?? null, fromCatalog: !!data.catalogId, folderGone });
      // Ri can't confirm it stopped, so the person may also turn off what it reaches through the hub.
      const choice = { turnOffAccess: true };
      const content = folderGone ? <TurnOffAccessChoice name={data.name} onChange={(on) => { choice.turnOffAccess = on; }} /> : undefined;
      if (!await confirm({ title: `Remove ${data.name} from ${APP_NAME}?`, description, content, confirmLabel: 'Remove', tone: 'destructive' })) return;
      const removed = await trpcClient.appBuilds.remove.mutate({ id: sourceId, ...(folderGone ? { turnOffAccess: choice.turnOffAccess } : {}) });
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.connectedApps.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.hubApps.pathKey() })]);
      // One Ri couldn't uninstall may still be running: that stays up until it's read.
      if (removed.stillInstalled) toast.warning(removedNotice(removed), { duration: Infinity });
      else toast.success(removedNotice(removed));
      navigate('');
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const action = useMutation({
    mutationFn: async (kind: 'install' | 'change' | 'apply' | 'discard') => {
      if (kind === 'install') return trpcClient.appBuilds.install.mutate({ id: sourceId, returnTo: `${window.location.pathname}${window.location.search}` });
      if (kind === 'change') {
        await trpcClient.appBuilds.startChange.mutate({ id: sourceId });
        // The builder's folder changed, so its next turn starts in the working copy.
        return null;
      }
      if (kind === 'apply') return trpcClient.appBuilds.applyChange.mutate({ id: sourceId });
      if (!await confirm({ title: 'Discard this change?', description: 'Its working copy goes. Its branch stays in the app’s repository. The running app doesn’t change.', confirmLabel: 'Discard', tone: 'destructive' })) return null;
      return trpcClient.appBuilds.discardChange.mutate({ id: sourceId });
    },
    onSuccess: () => { setError(null); void refresh(); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const [notice, setNotice] = useState<string | null>(null);
  const update = useCatalogUpdate(sourceId, (mode) => {
    setError(null);
    setNotice(mode === 'merge' ? 'You changed this app, so the builder is merging the update into a change first. Apply it when it’s ready.' : mode === 'current' ? 'It already has this version.' : null);
    void queryClient.invalidateQueries({ queryKey: ['app-builder-chat', sourceId] });
  });
  const askToFix = useMutation({
    mutationFn: async () => {
      const job = source.data?.job;
      const failed = job?.steps.find((step) => step.status === 'failed');
      const what = job?.kind === 'install' ? 'Installing it failed' : 'The checks failed';
      const text = `${what}${failed ? ` at ${stepLabel(failed.step)}` : ''}: ${job?.result?.message ?? job?.error ?? ''}${job?.result?.log ? ` The full log is at ${job.result.log}.` : ''} Fix it and commit, then tell me.`;
      const builder = chat.data ?? await queryClient.fetchQuery({ queryKey: ['app-builder-chat', sourceId], queryFn: () => ensureAppBuilderChat(sourceId) });
      if (!builder) throw new Error('The builder chat didn’t open. Try again.');
      await trpcClient.sessions.messagesPost.mutate({ params: { id: builder.id }, body: { id: uuidv7(), content: text } });
    },
    onSuccess: () => setChatAsked(true),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  if (!source.data) return <div className="p-6 text-sm"><Button
    onClick={() => navigate('')}
    variant="ghost"
    size="sm"
  ><ArrowLeft size={14} />Apps</Button><p className="mt-2 text-muted-foreground">{source.error?.message ?? 'Loading…'}</p></div>;
  const data = source.data;
  const job = data.job;
  const running = job?.state === 'running';
  const installed = !!data.url;
  const busy = running || action.isPending || reconnect.isPending || remove.isPending;
  // Its page shows the install or update that runs or ran last, and nothing for a restart or a remove.
  const progressJob = job && (job.kind === 'install' || job.kind === 'change') ? job : null;
  const allowLabel = `Allow ${APP_NAME} in ${data.name}`;
  const canAllow = installed && !!ri && !allowedIn && !running;
  const allowButton = (variant: 'primary' | 'secondary' = 'primary') => (
    <Button
      disabled={allow.isPending || allowApp.checking}
      onClick={() => allow.mutate({})}
      variant={variant}
      size="sm"
    >
      {(allow.isPending || allowApp.checking) && <Loader2 size={14} className="animate-spin" />}{allowLabel}
    </Button>
  );
  const askButton = job?.state === 'failed' && (job.kind === 'change' || job.kind === 'install') && (
    <Button
      disabled={askToFix.isPending}
      onClick={() => askToFix.mutate()}
      variant="secondary"
      size="sm"
    >
      {askToFix.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} aria-hidden />}Ask the builder to fix it
    </Button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
        <Button
          onClick={() => navigate('')}
          variant="ghost"
          size="sm"
        ><ArrowLeft size={14} />Apps</Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{data.name}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{changing ? <><GitBranch size={11} className="mr-1 inline" aria-hidden />Changing in {data.changeFolder} on {data.changeBranch}</> : data.folder}</p>
        </div>
        {/* Open app only once Ri may use the app: before that its page has nothing to show. */}
        {allowedIn && <Button
          onClick={() => openApp(ri!.serverId)}
          variant="primary"
          size="md"
        >Open app</Button>}
        {canAllow && showChat && allowButton()}
        {data.createdByRi && !installed && showChat && <Button
          disabled={busy}
          onClick={() => action.mutate('install')}
          variant="primary"
          size="md"
        >{job?.kind === 'install' && job.state === 'failed' ? 'Try again' : 'Install and connect'}</Button>}
        {data.createdByRi && installed && !data.connected && !running && <Button
          disabled={busy}
          onClick={() => reconnect.mutate()}
          variant="primary"
          size="md"
        >Reconnect</Button>}
        {data.createdByRi && installed && !changing && <Button
          disabled={running || action.isPending}
          onClick={() => action.mutate('change')}
          variant="secondary"
          size="sm"
        >Change app</Button>}
        {changing && <Button
          disabled={running || action.isPending}
          onClick={() => action.mutate('discard')}
          variant="ghost"
          size="sm"
        >Discard change</Button>}
        {changing && <Button
          disabled={running || action.isPending}
          onClick={() => action.mutate('apply')}
          variant="primary"
          size="md"
        >Apply change</Button>}
        {installed && !changing && catalogApp?.updateAvailable && (
          <Button
            disabled={running || update.isPending}
            onClick={() => update.mutate(undefined, { onError: (e) => setError(e instanceof Error ? e.message : String(e)) })}
            variant="secondary"
            size="sm"
          >
            {update.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpCircle size={14} aria-hidden />}Update to {versionLabel(catalogApp.version)}
          </Button>
        )}
        {data.createdByRi && <Button
          disabled={busy}
          onClick={() => remove.mutate()}
          variant="ghost"
          size="sm"
          tone="danger"
        >Remove</Button>}
      </header>

      {installed && <div className="border-b border-border px-5 py-2"><AppStatusLine sourceId={sourceId} name={data.name} version={data.catalogVersion} /></div>}

      {(error || notice) && (
        <section aria-label="Messages" className="space-y-1 border-b border-border px-5 py-3 text-xs">
          {error && <p role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>}
          {notice && <p role="status" className="text-muted-foreground">{notice}</p>}
        </section>
      )}

      {showChat ? <>
        {job && <BuildSteps job={job} />}
        {job?.state === 'failed' && askButton && !chatAsked && <div className="border-b border-border px-5 py-2">{askButton}</div>}
        <div className="flex min-h-0 flex-1 flex-col">
          {chat.data ? <HarnessChatSession sessionId={chat.data.id} autoFocusComposer={false} />
            : <p role="status" className="p-6 text-xs text-muted-foreground">{chat.error?.message ?? 'Opening the builder chat…'}</p>}
        </div>
      </> : (
        <AppProgress
          name={data.name}
          version={versionLabel(catalogApp?.version ?? data.catalogVersion) || null}
          description={catalogApp?.description}
          job={progressJob}
          installed={installed}
          connected={allowedIn}
          computer={status.data?.computer ?? null}
          actions={<>
            {allowedIn && progressJob?.state !== 'running' && progressJob?.state !== 'failed' && <Button
              onClick={() => openApp(ri!.serverId)}
              variant="primary"
              size="md"
            >Open {data.name}</Button>}
            {canAllow && allowButton()}
            {askButton}
            {data.createdByRi && !installed && !running && <Button
              disabled={busy}
              onClick={() => action.mutate('install')}
              variant={askButton ? "secondary" : "primary"}
              size="sm"
            >{askButton ? 'Try again' : 'Install and connect'}</Button>}
          </>}
        />
      )}
      {allowApp.dialog}
    </div>
  );
}

/** The kit's steps in a row above the builder chat, for an app made in Ri. */
function BuildSteps({ job }: { job: NonNullable<BuildSource['job']> }) {
  const running = job.state === 'running';
  return (
    <section aria-label="Progress" className="space-y-2 border-b border-border px-5 py-3 text-xs">
      <ol className="flex flex-wrap gap-x-4 gap-y-1">
        {job.steps.map((step) => (
          <li key={step.step} className="flex items-center gap-1">
            {step.status === 'passed' ? <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" aria-label="Passed" />
              : step.status === 'failed' ? <XCircle size={12} className="text-destructive" aria-label="Failed" />
              : step.status === 'started' ? <Loader2 size={12} className="animate-spin text-muted-foreground" aria-label="Running" />
              : <Circle size={12} className="text-muted-foreground" aria-label="Skipped" />}
            {stepLabel(step.step)}
          </li>
        ))}
        {running && !job.steps.length && <li className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" />Starting</li>}
      </ol>
      {job.state !== 'running' && (job.result?.message || job.error) && (
        <p className={job.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{job.result?.message || job.error}</p>
      )}
      {job.result?.log && job.state === 'failed' && <p className="text-muted-foreground">The full log is at <span className="font-mono">{job.result.log}</span>.</p>}
    </section>
  );
}

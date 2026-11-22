'use client';
import { Card } from '@/components/system/card';

import { NativeSelect } from '@/components/system/native-select';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Bot, MessageCircle } from 'lucide-react';
import { Button } from '@/components/system/button';
import { useConfirm } from '@/components/system/confirm-dialog';
import { useWorkspaces } from '@/hooks/use-workspaces';
import { allowConsequence } from '@/lib/integrations/app-access-copy';
import { removeAppDescription, removedNotice } from '@/lib/apps/remove-copy';
import { toast } from 'sonner';
import { trpc, trpcClient } from '@/lib/trpc/client';
import { APP_NAME } from '@/constants/app';
import { useAllowApp } from './allow-app';
import { HubAppPanel } from './hub-access';
import { TurnOffAccessChoice } from './turn-off-access-choice';

type PlaceStatus = 'connected' | 'sign_in' | 'unavailable';
const statusText = (status: PlaceStatus, app: string, error?: string) =>
  status === 'connected' ? 'Connected' : status === 'sign_in' ? `Waiting for you to allow it in ${app}` : error ?? `${app} isn't answering`;

/**
 * Who uses a personal app (docs/personal-apps.md): Ri's own chats, and each agent allowed to. Each
 * is its own connection with its own OAuth client, so the app's choice set what each sees, asked in
 * Ri's own dialog or on the app's consent screen (useAllowApp). Allowing an agent says what that
 * means first (spec Decision 3).
 */
export function PersonalAppAccess({ appId, onRemoved }: { appId: string; onRemoved: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const allowApp = useAllowApp();
  const app = useQuery(trpc.personalApps.get.queryOptions({ appId }));
  // An app Ri installed: removing it uninstalls it, keeping its folder and data (src/lib/apps/remove.ts).
  const source = useQuery(trpc.appBuilds.forApp.queryOptions({ personalAppId: appId }));
  const installedByRi = !!source.data?.createdByRi && !!source.data.url;
  const status = useQuery({ ...trpc.appBuilds.status.queryOptions({ id: source.data?.id ?? '' }), enabled: installedByRi });
  // What the app can reach through Ri's hub, when it connected back to Ri.
  const hub = useQuery(trpc.hubApps.list.queryOptions(undefined, { staleTime: 15_000 }));
  const hubApp = hub.data?.find((item) => item.personalAppId === appId);
  const { data: workspaces } = useWorkspaces({ status: 'active' });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.connectedApps.pathKey() }),
  ]);
  const returnTo = () => `${window.location.pathname}${window.location.search}`;
  const failed = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const allow = useMutation({
    mutationFn: async (agent: { id: string; name: string; serverId?: string }) => {
      // Already allowed and waiting on the app: only the app's own question is left.
      if (agent.serverId) return void await allowApp.allow(agent.serverId);
      const name = app.data!.name;
      if (!await confirm({ title: `Let ${agent.name} use ${name}?`, description: allowConsequence(name, agent.name), confirmLabel: 'Continue' })) return;
      const start = await trpcClient.personalApps.allow.mutate({ appId, workspaceId: agent.id, returnTo: returnTo() });
      await refresh();
      if (start.requiresAuth) await allowApp.allow(start.serverId);
    },
    onError: failed,
  });
  const disallow = useMutation({
    mutationFn: async (agent: { id: string; name: string }) => {
      const name = app.data!.name;
      if (!await confirm({ title: `Stop ${agent.name} using ${name}?`, description: `${agent.name} loses ${name}'s tools and Ri forgets this agent's sign-in to it. To end its access in ${name} too, disconnect it in ${name}'s settings.`, confirmLabel: 'Stop using it', tone: 'destructive' })) return;
      await trpcClient.personalApps.disallow.mutate({ appId, workspaceId: agent.id });
      await refresh();
    },
    onError: failed,
  });
  const reconnectRi = useMutation({
    mutationFn: async () => {
      const ri = app.data?.ri;
      if (ri) await allowApp.allow(ri.serverId);
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const name = app.data!.name;
      const folderGone = installedByRi && status.data?.problem === 'no_folder';
      const description = source.data?.createdByRi
        ? removeAppDescription({ name, installed: installedByRi, folder: source.data.folder, dataDir: status.data?.dataDir ?? null, fromCatalog: !!source.data.catalogId, folderGone })
        : `${APP_NAME} and every agent lose ${name}'s tools and screens, and ${APP_NAME} forgets every sign-in to it. ${name} keeps running with its own data.`;
      // Ri can't confirm it stopped, so the person may also turn off what it reaches through the hub.
      const choice = { turnOffAccess: true };
      const content = folderGone ? <TurnOffAccessChoice name={name} onChange={(on) => { choice.turnOffAccess = on; }} /> : undefined;
      if (!await confirm({ title: `Remove ${name} from ${APP_NAME}?`, description, content, confirmLabel: 'Remove', tone: 'destructive' })) return;
      const removed = await trpcClient.personalApps.remove.mutate({ appId, ...(folderGone ? { turnOffAccess: choice.turnOffAccess } : {}) });
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.hubApps.pathKey() })]);
      // One Ri couldn't uninstall may still be running: that stays up until it's read.
      if (removed?.stillInstalled) toast.warning(removedNotice(removed), { duration: Infinity });
      else if (removed) toast.success(removedNotice(removed));
      onRemoved();
    },
    onError: failed,
  });

  if (!app.data) return null;
  const { name, ri, agents } = app.data;
  const allowed = new Map(agents.flatMap((place) => place.place.kind === 'agent' ? [[place.place.workspaceId, place] as const] : []));
  const others = (workspaces ?? []).filter((workspace) => !allowed.has(workspace.id));
  const busy = allow.isPending || disallow.isPending || remove.isPending || reconnectRi.isPending || allowApp.checking;

  return (
    <section aria-labelledby="app-access" className="space-y-2">
      <h2 id="app-access" className="text-sm font-medium">Who uses {name}</h2>
      <p className="max-w-prose text-xs text-muted-foreground">
        Each place connects on its own, and {name} asked each one what it may see. An agent you allow sees whatever {name} shows it, including what {name} read from your accounts.
      </p>
      {error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>}
      <Card as="ul" padding="none" surface="plain" className="divide-y divide-border">
        <li className="flex items-center gap-3 px-3 py-2 text-sm">
          <MessageCircle size={14} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1"><span className="block truncate">{APP_NAME}&apos;s own chats</span>
            <span className="block text-xs text-muted-foreground">{ri ? statusText(ri.status, name, ri.error) : 'Not connected'}</span></span>
          {ri && ri.status !== 'connected' && <Button
            disabled={busy}
            onClick={() => reconnectRi.mutate()}
            variant="secondary"
            size="xs"
          >{ri.status === 'sign_in' ? 'Continue' : 'Reconnect'}</Button>}
        </li>
        {[...allowed.entries()].map(([workspaceId, place]) => (
          <li key={workspaceId} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Bot size={14} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block truncate">{place.label}</span>
              <span className="block text-xs text-muted-foreground">{statusText(place.status, name, place.error)}</span></span>
            {place.status !== 'connected' && <Button
              disabled={busy}
              onClick={() => allow.mutate({ id: workspaceId, name: place.label, serverId: place.serverId })}
              variant="secondary"
              size="xs"
            >{place.status === 'sign_in' ? 'Continue' : 'Reconnect'}</Button>}
            <Button
              disabled={busy}
              onClick={() => disallow.mutate({ id: workspaceId, name: place.label })}
              variant="ghost"
              size="xs"
            >Remove</Button>
          </li>
        ))}
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        {others.length > 0 && (
          <NativeSelect aria-label={`Allow an agent to use ${name}`} value="" disabled={busy} className="w-auto"
            onChange={(event) => { const agent = others.find((workspace) => workspace.id === event.target.value); if (agent) allow.mutate({ id: agent.id, name: agent.name }); }}>
            <option value="">Allow an agent…</option>
            {others.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </NativeSelect>
        )}
        <Button
          disabled={busy}
          onClick={() => remove.mutate()}
          variant="ghost"
          size="xs"
          tone="danger"
        >Remove {name}</Button>
      </div>
      {hubApp && <div className="pt-4"><HubAppPanel id={hubApp.id} embedded /></div>}
      {allowApp.dialog}
    </section>
  );
}

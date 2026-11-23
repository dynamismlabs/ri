'use client';
import { OverlaySurface } from '@/components/system/overlay';
import { api } from '@/lib/api/client';
import { reportNetworkFailure } from '@/lib/api/connectivity';
import { getApiCompatibilityIssue, reportApiCompatibility, subscribeApiCompatibility } from '@/lib/client/api-compatibility';
import { documentSaves } from '@/lib/client/document-saves';
import { reloadVersion } from '@/lib/client/version-reload';
import { countUnsavedMutations } from '@/lib/query/mutation-meta';
import { API_PROTOCOL, apiCompatibilityIssue } from '@/lib/releases/api-contract';
import { trpcClient } from '@/lib/trpc/client';
import { rpcOptions } from '@/lib/trpc/request-options';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { SERVICE_STATUS_KEY } from '@/hooks/use-service-status';
import { CircleArrowUp, CircleCheck } from 'lucide-react';
import { Button } from '@/components/system/button';
import { openSettings, useSettingsStore } from '@/components/settings/settings-store';
import { readyUpdateNotice } from '@/lib/service/update-presentation';

/** At most this often, a window says a person is using it (docs/always-on-spec.md 7.2). */
const USE_EVERY_MS = 30_000;

/** Browser, phone and remote Electron all serve the Home's UI. Installation
 * identity comes from that Home, independently of the local shell/worker. */
export function ServiceConnection() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  /** A new version is serving. A tab being looked at offers a refresh instead of
   * reloading under whoever is reading it (section 4.3). */
  const [refresh, setRefresh] = useState<'' | 'updated' | 'required'>('');
  const [reloading, setReloading] = useState(false);
  const [readyUpdate, setReadyUpdate] = useState<ReturnType<typeof readyUpdateNotice>>(null);
  const [answering, setAnswering] = useState(false);
  const settings = useSettingsStore();
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let knownBuild: string | undefined;
    let updated = false;
    const showIssue = () => {
      const issue = getApiCompatibilityIssue();
      if (!issue || disposed) return false;
      setMessage(issue.message);
      setRefresh(issue.update === 'client' ? 'required' : '');
      setReadyUpdate(null);
      return true;
    };
    /** A tab in the background saves its drafts and reloads by itself. If it
     * can't yet, the next check tries again. */
    const reloadIfHidden = async () => {
      if (!updated || disposed || document.visibilityState !== 'hidden') return;
      try { await reloadVersion(() => countUnsavedMutations(queryClient), false, () => { if (!disposed) window.location.reload(); }); }
      catch { /* Active input or a save in flight. Tried again at the next check. */ }
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const version = await api.get<{ release: { build: string }; apiProtocols: number[] }>('/version', { timeoutMs: 3000 });
        const mismatch = apiCompatibilityIssue(String(API_PROTOCOL), version.apiProtocols);
        reportApiCompatibility(mismatch);
        if (showIssue()) return;
        // Unlike /service, this works for source and unmanaged Homes too.
        const build = version.release.build;
        if (knownBuild === undefined) knownBuild = build;
        if (knownBuild !== build) {
          updated = true;
          setMessage('Ri was updated.');
          setRefresh('updated');
          setReadyUpdate(null);
          // The new server answers for the rail and Settings, not the old one's last word.
          void queryClient.invalidateQueries({ queryKey: SERVICE_STATUS_KEY });
          await reloadIfHidden();
          return;
        }
        const status = await trpcClient.service.list.query({}, rpcOptions({ timeoutMs: 3000 }));
        // One poll per window: the rail's update row and Settings read this answer.
        queryClient.setQueryData(SERVICE_STATUS_KEY, status);
        const update = 'update' in status ? status.update : undefined;
        setReadyUpdate(readyUpdateNotice({ canUseUpdates: status.canUseUpdates, update }));
        if (update?.phase === 'draining') {
          setMessage('Preparing an update. Saving your changes.');
          await documentSaves.flushAll();
        } else { setMessage(status.phase === 'updating' ? 'Updating Ri. Your drafts are retained on this device.' : ''); setRefresh(''); }
      } catch {
        // Connection loss has one shared, delayed notice. A slow version or
        // service request alone must not interrupt an otherwise usable app.
        if (!showIssue() && !disposed) void reportNetworkFailure();
      } finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 5000);
    const unsubscribe = subscribeApiCompatibility(() => { showIssue(); });
    void check();
    const onVisibility = () => void reloadIfHidden();
    // Typing and clicking are what keep an update away. Polling never does.
    let lastUse = 0;
    const onUse = () => {
      const now = Date.now();
      if (now - lastUse < USE_EVERY_MS) return;
      lastUse = now;
      void trpcClient.service.touchPost.mutate({}, rpcOptions({ timeoutMs: 3000 })).catch(() => {});
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onUse, { capture: true, passive: true });
    window.addEventListener('keydown', onUse, { capture: true, passive: true });
    return () => {
      disposed = true; clearInterval(timer); unsubscribe();
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onUse, { capture: true });
      window.removeEventListener('keydown', onUse, { capture: true });
    };
  }, [queryClient]);
  const reload = async () => {
    setReloading(true);
    try { await reloadVersion(() => countUnsavedMutations(queryClient), true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Keep this view open until your drafts can be saved.'); setReloading(false); }
  };
  const answer = async (action: 'apply' | 'later') => {
    setAnswering(true);
    try {
      if (action === 'apply') await documentSaves.flushAll();
      await trpcClient.service.updatePost.mutate({ body: { action } });
      setReadyUpdate(null);
    } catch { /* The next check shows where things stand. */ }
    finally { setAnswering(false); }
  };
  const viewUpdate = () => { setReadyUpdate(null); openSettings('updates'); };
  if (refresh === 'updated' && settings.open && settings.section === 'updates') return null;
  if (message) {
    return <UpdateNotice title={refresh === 'updated' ? 'Ri was updated' : refresh === 'required' ? 'Refresh Ri' : 'Ri update'} complete={refresh === 'updated'} actions={<>
      {refresh === 'updated' && <Button size="sm" variant="secondary" onClick={viewUpdate}>View update</Button>}
      {refresh && <Button size="sm" variant="primary" disabled={reloading} onClick={() => void reload()}>{reloading ? 'Saving drafts…' : 'Refresh'}</Button>}
    </>}>
      <p>{message === 'Ri was updated.' ? 'Refresh to use the latest version. Your drafts will be saved before reloading.' : message}</p>
    </UpdateNotice>;
  }
  if (!readyUpdate || (settings.open && settings.section === 'updates')) return null;
  return <UpdateNotice title={`Ri ${readyUpdate.label} is ready to update`} actions={<>
    <Button size="sm" variant="secondary" onClick={viewUpdate}>View update</Button>
    <Button size="sm" variant="ghost" disabled={answering} onClick={() => void answer('later')}>Not now</Button>
    <Button size="sm" variant="primary" disabled={answering} onClick={() => void answer('apply')}>Update now</Button>
  </>}>
    <p>{readyUpdate.automatic ? 'Ri will install it after a minute of inactivity. Running chats will finish first.' : 'The update is downloaded and verified. Ri is waiting for running work to finish.'}</p>
    {readyUpdate.notes.trim() && <p className="mt-3 line-clamp-3 whitespace-pre-line border-t border-border/60 pt-3 text-foreground/80">{readyUpdate.notes}</p>}
  </UpdateNotice>;
}

function UpdateNotice({ title, children, actions, complete = false }: { title: string; children: ReactNode; actions: ReactNode; complete?: boolean }) {
  const Icon = complete ? CircleCheck : CircleArrowUp;
  return <OverlaySurface as="section" kind="toast" padding="xl" role="status" aria-label={title} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[100] w-[calc(100vw-2rem)] max-w-sm">
    <div className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><Icon size={19} aria-hidden /></div>
      <div className="min-w-0 flex-1"><p className="font-semibold leading-snug">{title}</p><div className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</div></div>
    </div>
    <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>
  </OverlaySurface>;
}

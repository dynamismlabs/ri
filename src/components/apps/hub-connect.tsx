'use client';
import { Card } from '@/components/system/card';
import { ChoiceRow } from '@/components/system/choice-row';
import { DialogBody } from '@/components/system/dialog';
import { useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/system/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/system/dialog';
import { APP_NAME } from '@/constants/app';
import { trpc, trpcClient } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/router';

export { isHubAuthorization } from '@/lib/apps/hub-link';

type HubAuthorization = RouterOutputs['personalApps']['hubAuthorization'];

type Stage =
  | { kind: 'closed' }
  | { kind: 'choose'; authorizationUrl: string; serverId?: string; auth: HubAuthorization; tools: Set<string>; services: Set<string>; busy: boolean; error: string | null };

const pick = (connectionId: string, tool: string) => `${connectionId}\u0000${tool}`;

/**
 * Lend an app Ri installed the person's accounts through Ri's hub, chosen in Ri's own dialog
 * (src/lib/apps/hub-connect.ts) instead of the consent page in a browser, which only opens on the
 * computer Ri runs on. The same choices as that page: which accounts, which tools on each, and
 * which of Ri's own services, with what the app asked for ticked.
 *
 * Render `dialog` once. `connect(appId)` starts from Ri, on the app's page. `review(url, serverId)`
 * takes an approval the app's own view asked Ri to open, and calls `fallback` when it isn't one Ri
 * can answer here (an app Ri didn't install), so the address opens as any link would.
 */
export function useHubConnect() {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: 'closed' });
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.hubApps.pathKey() }),
  ]), [queryClient]);

  const review = useCallback(async (authorizationUrl: string, serverId?: string, fallback?: () => void) => {
    let auth: HubAuthorization;
    try { auth = await trpcClient.personalApps.hubAuthorization.query({ authorizationUrl, ...(serverId ? { serverId } : {}) }); }
    catch (error) {
      if (fallback) fallback();
      else toast.error(error instanceof Error ? error.message : String(error));
      return;
    }
    const tools = new Set(auth.options.accounts.flatMap((account) => account.tools.filter((tool) => tool.requested).map((tool) => pick(account.connectionId, tool.name))));
    const services = new Set(auth.options.services.filter((service) => service.requested).map((service) => service.name));
    setStage({ kind: 'choose', authorizationUrl, serverId, auth, tools, services, busy: false, error: null });
  }, []);

  const connect = useCallback(async (appId: string) => {
    setStarting(true);
    try {
      const begun = await trpcClient.personalApps.hubBegin.mutate({ appId });
      if ('authorizationUrl' in begun) await review(begun.authorizationUrl);
      else { await refresh(); toast.success('Connected.'); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally { setStarting(false); }
  }, [review, refresh]);

  const toggle = (set: 'tools' | 'services', key: string) => {
    if (stage.kind !== 'choose') return;
    const next = new Set(stage[set]);
    if (next.has(key)) next.delete(key); else next.add(key);
    setStage({ ...stage, [set]: next, error: null });
  };

  const approve = async () => {
    if (stage.kind !== 'choose' || stage.busy) return;
    setStage({ ...stage, busy: true, error: null });
    const tools: Record<string, string[]> = {};
    for (const key of stage.tools) {
      const [connectionId, tool] = key.split('\u0000') as [string, string];
      (tools[connectionId] ??= []).push(tool);
    }
    try {
      const result = await trpcClient.personalApps.hubApprove.mutate({
        authorizationUrl: stage.authorizationUrl, ...(stage.serverId ? { serverId: stage.serverId } : {}), tools, services: [...stage.services],
      });
      setStage({ kind: 'closed' });
      await refresh();
      toast.success(`${result.appName} can use what you chose now.`);
    } catch (error) {
      setStage({ ...stage, busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const close = () => { if (stage.kind !== 'choose' || !stage.busy) setStage({ kind: 'closed' }); };
  const chosen = stage.kind === 'choose' ? stage.tools.size + stage.services.size : 0;

  const dialog: ReactNode = (
    <Dialog open={stage.kind !== 'closed'} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-lg">
        {stage.kind === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>Let {stage.auth.appName} use your accounts through {APP_NAME}?</DialogTitle>
              <DialogDescription>Only what you tick. Anything that reaches other people, like sending an email, posting or inviting, asks you every time.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {stage.auth.purpose && (
                <Card padding="md" className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Info size={13} aria-hidden />What {stage.auth.appName} says it&apos;s for</p>
                  <p className="text-sm text-foreground">“{stage.auth.purpose}”</p>
                  <p className="text-[11px] text-muted-foreground">The app&apos;s own words. {APP_NAME} enforces only what you choose below.</p>
                </Card>
              )}
              <fieldset className="space-y-2" disabled={stage.busy}>
                <legend className="text-sm font-medium text-foreground">Your accounts</legend>
                {stage.auth.options.accounts.length === 0 && <p className="text-xs text-muted-foreground">You haven&apos;t connected any accounts to {APP_NAME} yet. Connect Google or another service in {APP_NAME}&apos;s settings first.</p>}
                {stage.auth.options.accounts.map((account) => {
                  const asked = account.tools.filter((tool) => tool.requested).length;
                  const ticked = account.tools.filter((tool) => stage.tools.has(pick(account.connectionId, tool.name))).length;
                  return (
                    <details key={`${account.connectionId}:${account.toolkitId}`} open={asked > 0} className="rounded-md border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-sm">
                        <span className="font-medium">{account.service}</span> <span className="text-muted-foreground">· {account.account}</span>
                        {ticked > 0 && <span className="ml-1 text-[11px] text-muted-foreground">({ticked} chosen)</span>}
                      </summary>
                      <ul className="max-h-56 space-y-0.5 overflow-y-auto border-t border-border px-2 py-1.5">
                        {account.tools.map((tool) => (
                          <li key={tool.name}>
                            <ChoiceRow indicator="checkbox" surface="plain" density="compact" type="button" role="checkbox" className="w-full text-left"
                              aria-checked={stage.tools.has(pick(account.connectionId, tool.name))} disabled={stage.busy}
                              onClick={() => toggle('tools', pick(account.connectionId, tool.name))}
                              title={<span className="font-mono text-[11px]">{tool.name}{tool.asks && <span className="font-sans text-muted-foreground"> · changes things, so it asks you each time</span>}</span>}
                              description={tool.description} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </fieldset>
              <fieldset className="space-y-1.5" disabled={stage.busy}>
                <legend className="text-sm font-medium text-foreground">{APP_NAME}&apos;s own services</legend>
                <div className="space-y-0.5">{stage.auth.options.services.map((service) => (
                  <ChoiceRow key={service.name} indicator="checkbox" surface="plain" density="compact" type="button" role="checkbox" className="w-full text-left"
                    aria-checked={stage.services.has(service.name)} disabled={stage.busy}
                    onClick={() => toggle('services', service.name)} title={service.description} />
                ))}</div>
              </fieldset>
              <p className="text-xs text-muted-foreground">{stage.auth.appName} never gets your passwords or your accounts&apos; own keys, only a token for {APP_NAME} that expires. Change or turn it off any time on its page in {APP_NAME}.</p>
              {stage.error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{stage.error}</p>}
            </DialogBody>
            <DialogFooter>
              <Button disabled={stage.busy} onClick={close} variant="ghost" size="md">Not now</Button>
              <Button disabled={stage.busy || chosen === 0} onClick={() => void approve()} variant="primary" size="md">
                {stage.busy && <Loader2 size={14} className="animate-spin" />}Allow
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return { connect, review, starting, dialog };
}

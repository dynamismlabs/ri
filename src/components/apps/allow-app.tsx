'use client';
import { DialogBody } from '@/components/system/dialog';
import { ChoiceRow, ChoiceGroup } from '@/components/system/choice-row';
import { StatusBadge } from '@/components/system/status-badge';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/system/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/system/dialog';
import { APP_NAME } from '@/constants/app';
import { openIntegrationAuthorization } from '@/lib/client/desktop';
import { isLocalViewer } from '@/lib/preview/resolve-iframe-src';
import { trpc, trpcClient } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/router';

type PlaceAccess = RouterOutputs['personalApps']['accessChoices'];
type HostAccess = Extract<PlaceAccess, { kind: 'host' }>;
type BrowserAccess = Extract<PlaceAccess, { kind: 'browser' }>;
type AccessKind = HostAccess['recommended'];

/** How allowing ended: connected here, the app's page opened, it can only be allowed on the Home's computer, or the person stopped. */
export type AllowOutcome = 'connected' | 'opened' | 'elsewhere' | 'cancelled';

type Stage =
  | { kind: 'closed' }
  | { kind: 'choose'; serverId: string; access: HostAccess; selected: AccessKind; busy: boolean; error: string | null }
  | { kind: 'elsewhere'; serverId: string; access: Omit<BrowserAccess, 'kind'> };

/**
 * Why the app's own page has to ask, and where it opens, in words for the person. A loopback page
 * only opens in a browser on the computer the app runs on, so from a phone or another computer Ri
 * says so instead of opening a page that can't load.
 */
export function elsewhereMessage(access: Pick<BrowserAccess, 'appName' | 'placeName' | 'homeComputer' | 'reason'>): string {
  const computer = access.homeComputer ?? `the computer ${APP_NAME} runs on`;
  const { appName } = access;
  if (access.reason === 'sign_in_required') return `${appName} asks you to sign in before it allows ${access.placeName}, and its page only opens on ${computer}. Allow it there.`;
  if (access.reason === 'no_endpoint') return `${appName}’s permission page only opens on ${computer}. Update ${appName}, or allow it there.`;
  return `${appName}’s permission page only opens on ${computer}. Allow it there.`;
}

/**
 * Allow a place (Ri's own chats, or an agent) in a personal app, the one way every surface does it
 * (docs/personal-apps.md "Allowing Ri in an app"). For an app Ri installed, Ri asks in its own dialog
 * with the app's own choices and connects with no browser. Otherwise the app's own consent page
 * opens, unless it can't load from this device, which the dialog then says.
 *
 * Render `dialog` once where the hook is used. `allow(serverId)` takes the place's connection (its
 * server entry), and resolves once the person is done with it.
 */
export function useAllowApp() {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: 'closed' });
  const [checking, setChecking] = useState(false);
  const settle = useRef<((outcome: AllowOutcome) => void) | null>(null);

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.connectedApps.pathKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.appBuilds.pathKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.integrations.pathKey() }),
  ]), [queryClient]);

  const end = useCallback((outcome: AllowOutcome) => {
    setStage({ kind: 'closed' });
    settle.current?.(outcome);
    settle.current = null;
  }, []);

  /** The app's own page, when this device can open it. A new sign-in starts for it, from here. */
  const viaBrowser = useCallback(async (serverId: string, access: Omit<BrowserAccess, 'kind'>, anyway = false): Promise<AllowOutcome> => {
    // The dialog says where to allow it. One already waiting (the person chose, then the app asked
    // for its page after all) settles when they close it.
    if (access.loopbackOnly && !anyway && !isLocalViewer()) {
      setStage({ kind: 'elsewhere', serverId, access });
      return 'elsewhere';
    }
    const start = await trpcClient.integrations.mcpServerPost.mutate({ params: { id: serverId }, body: { returnTo: `${window.location.pathname}${window.location.search}` } });
    if ('authUrl' in start && start.authUrl) {
      await openIntegrationAuthorization(start.authUrl);
      return 'opened';
    }
    await refresh();
    return 'connected';
  }, [refresh]);

  /** `onlyInRi`: ask only when Ri can ask in its own dialog, and otherwise leave it for the person to start. */
  const allow = useCallback(async (serverId: string, options: { onlyInRi?: boolean } = {}): Promise<AllowOutcome> => {
    setChecking(true);
    let access: PlaceAccess;
    try { access = await trpcClient.personalApps.accessChoices.query({ serverId }); }
    finally { setChecking(false); }
    if (access.kind === 'browser') return options.onlyInRi ? 'cancelled' : viaBrowser(serverId, access);
    setStage({ kind: 'choose', serverId, access, selected: access.recommended, busy: false, error: null });
    return new Promise((resolve) => { settle.current = resolve; });
  }, [viaBrowser]);

  const confirm = async () => {
    if (stage.kind !== 'choose' || stage.busy) return;
    setStage({ ...stage, busy: true, error: null });
    try {
      const result = await trpcClient.personalApps.allowHere.mutate({ serverId: stage.serverId, access: stage.selected });
      if (result.connected) {
        end('connected');
        await refresh();
        toast.success(`${result.placeName} can use ${result.appName} now.`);
        return;
      }
      // The app couldn't grant it here after all (it asks the person to sign in): its page asks.
      const outcome = await viaBrowser(stage.serverId, result);
      if (outcome !== 'elsewhere') end(outcome);
    } catch (error) {
      setStage({ ...stage, busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const openAnyway = async () => {
    if (stage.kind !== 'elsewhere') return;
    try { end(await viaBrowser(stage.serverId, stage.access, true)); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
  };

  const dialog: ReactNode = (
    <Dialog open={stage.kind !== 'closed'} onOpenChange={(open) => { if (!open && !(stage.kind === 'choose' && stage.busy)) end('cancelled'); }}>
      <DialogContent className="sm:max-w-md">
        {stage.kind === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>What may {stage.access.placeName} do in {stage.access.appName}?</DialogTitle>
              <DialogDescription>{stage.access.appName} holds {stage.access.placeName} to what you choose, on every call.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
<ChoiceGroup asChild name="app-access" value={stage.selected} disabled={stage.busy} onValueChange={value => setStage({ ...stage, selected: value as typeof stage.selected, error: null })} aria-label={`What ${stage.access.placeName} may do in ${stage.access.appName}`}><fieldset className="space-y-2" disabled={stage.busy}>
              <legend className="sr-only">What {stage.access.placeName} may do in {stage.access.appName}</legend>
              {stage.access.choices.map((choice) => (
                <ChoiceRow key={choice.access} selection="radio" value={choice.access} density="spacious" className="flex items-start gap-3">

                  <span className="min-w-0 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium">{choice.label}
                      {choice.access === stage.access.recommended && <StatusBadge >Recommended</StatusBadge>}
                    </span>
                    {choice.description && <span className="block text-xs text-muted-foreground">{choice.description}</span>}
                  </span>
                </ChoiceRow>
              ))}
            </fieldset></ChoiceGroup>
            {stage.error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{stage.error}</p>}
</DialogBody>
            <DialogFooter>
              <Button
                disabled={stage.busy}
                onClick={() => end('cancelled')}
                variant="ghost"
                size="md"
              >Not now</Button>
              <Button
                disabled={stage.busy}
                onClick={() => void confirm()}
                variant="primary"
                size="md"
              >{stage.busy && <Loader2 size={14} className="animate-spin" />}Allow</Button>
            </DialogFooter>
          </>
        )}
        {stage.kind === 'elsewhere' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><MonitorSmartphone size={16} aria-hidden />Allow {stage.access.placeName} in {stage.access.appName} on {stage.access.homeComputer ?? 'its computer'}</DialogTitle>
              <DialogDescription>{elsewhereMessage(stage.access)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => void openAnyway()}
                variant="ghost"
                size="md"
              >Open it anyway</Button>
              <Button
                onClick={() => end('elsewhere')}
                variant="primary"
                size="md"
              >OK</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return { allow, checking, dialog };
}

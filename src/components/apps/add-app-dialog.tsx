'use client';
import { Callout } from '@/components/system/callout';

import { Field } from '@/components/system/field';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/system/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/system/dialog';

import { trpc, trpcClient } from '@/lib/trpc/client';
import { useAllowApp } from './allow-app';

/**
 * Add a personal app that is already running, by the MCP address it prints (docs/personal-apps.md).
 * Ri connects its own chats first. The app's consent screen opens next, and asks what Ri may see
 * and whether it may make changes (useAllowApp says when it can't open from this device). Agents
 * get their own connection from their settings.
 */
export function AddAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const allowApp = useAllowApp();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const result = await trpcClient.personalApps.add.mutate({ name, url, returnTo });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.personalApps.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.integrations.pathKey() }),
      ]);
      setName('');
      setUrl('');
      onOpenChange(false);
      if (result.requiresAuth && result.app.ri) await allowApp.allow(result.app.ri.serverId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add an app</DialogTitle>
            <DialogDescription>
              An app that runs on its own, on this computer or online. Paste the MCP address it shows, like http://127.0.0.1:4310/mcp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reading Log"
              autoFocus
              required
              maxLength={60}
              label="Name"
            />
            <Field
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:4310/mcp"
              required
              inputMode="url"
              label="MCP address"
            />
            <p className="text-[11px] text-muted-foreground">The app asks next what Ri may see and whether it may make changes. Each agent you allow later gets its own connection and its own choice.</p>
          </div>
          {error && (
            <Callout padding="sm" tone={"error"} role="alert" className="flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
            </Callout>
          )}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              variant="ghost"
              size="md"
            >Cancel</Button>
            <Button
              type="submit"
              disabled={busy || !name.trim() || !url.trim()}
              variant="primary"
              size="md"
            >{busy && <Loader2 size={14} className="animate-spin" />}Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {allowApp.dialog}
  </>);
}

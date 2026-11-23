'use client';
import { Card } from '@/components/system/card';

import { SegmentedControl } from '@/components/system/segmented-control';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AppWindow, Blocks } from 'lucide-react';
import { useState } from 'react';
import { AddMenuRow } from '@/components/chat-ui/add-menu/composer-add-menu';
import { usePersonalServices } from '@/components/home/use-personal-services';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/system/dialog';
import { trpc, trpcClient } from '@/lib/trpc/client';

type Mode = 'on' | 'auto' | 'off';
const MODES: { value: Mode; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'auto', label: 'Automatic' },
  { value: 'off', label: 'Off' },
];

function useChatAppTools(chatId: string, enabled = true) {
  const personalServices = usePersonalServices();
  return useQuery({ ...trpc.personalApps.chatTools.queryOptions({ chatId }, { staleTime: 15_000 }), enabled: personalServices && enabled });
}

/** The + menu row for this chat's app tools. Shown only when the chat can use at least one app. */
export function ChatAppToolsRow({ chatId, onOpen }: { chatId: string; onOpen: () => void }) {
  const apps = useChatAppTools(chatId);
  if (!apps.data?.length) return null;
  return <AddMenuRow icon={Blocks} onSelect={onOpen}>App tools</AddMenuRow>;
}

/**
 * Which of the person's apps this chat's model sees (docs/personal-apps.md "Loading app tools").
 * Automatic is one line per app until a request needs it. On lists its tools from the start.
 * Off doesn't list it. This changes what the model sees, not what the app may reach.
 */
export function ChatAppToolsDialog({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const apps = useChatAppTools(chatId, open);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const set = useMutation({
    mutationFn: (input: { toolkitId: string; mode: Mode }) => trpcClient.personalApps.setChatTool.mutate({ chatId, ...input }),
    onSuccess: (next) => { setError(null); queryClient.setQueryData(trpc.personalApps.chatTools.queryKey({ chatId }), next); },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>App tools in this chat</DialogTitle>
          <DialogDescription>
            Automatic gives the agent one line per app and loads its tools when a request needs them. On loads them from the start. Off leaves the app out of this chat.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>}
        <Card as="ul" padding="none" surface="plain" className="divide-y divide-border">
          {(apps.data ?? []).map((app) => (
            <li key={app.toolkitId} className="flex items-center gap-3 px-3 py-2">
              <AppWindow size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{app.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {app.mode === 'off' ? 'Not in this chat' : app.loaded ? 'Tools loaded' : 'One line until needed'}
                </span>
              </span>
              <SegmentedControl mode="choice" selection="radio" ariaLabel={app.name+' in this chat'} value={app.mode} onChange={mode => {if(mode !== app.mode)set.mutate({toolkitId:app.toolkitId,mode});}} disabled={set.isPending} options={MODES} />
            </li>
          ))}
        </Card>
        <p className="text-[11px] text-muted-foreground">A change takes effect from the agent&apos;s next turn.</p>
      </DialogContent>
    </Dialog>
  );
}

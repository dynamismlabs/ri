'use client';
import { MenuAction } from '@/components/system/menu-action';

import { useViewportTier } from '@/hooks/use-viewport-tier';

import { Field } from '@/components/system/field';
import { NativeSelect } from '@/components/system/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TextArea } from '@/components/system/text-area';
import { cn } from '@/lib/utils';

import { IconButton } from '@/components/system/icon-button';
import { Button, type ButtonSize } from '@/components/system/button';
import { useChatCapabilities } from '@/components/chat-ui/chat-capabilities';
import { useDeferredValue, useState } from 'react';
import { Forward, Search } from 'lucide-react';
import { uuidv7 } from 'uuidv7';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

import { useWorkspaces } from '@/hooks/use-workspaces';
import { useDefaultSelection } from '@/hooks/use-default-selection';
import { useHarnessModels } from '@/hooks/use-harness-models';
import { ModelControl, type LaunchHarnessSelection } from '@/components/workspaces/launcher/model-controls';
import { trpcClient } from '@/lib/trpc/client';
import { DEFAULT_HARNESS } from '@/lib/harness/registry';
import { toast } from 'sonner';

type SendToChatButtonProps = { eventId: string; sessionId: string; size?: ButtonSize };
export function SendToChatButton({ eventId, sessionId, size = 'xs' }: SendToChatButtonProps) {
  const enabled = useChatCapabilities().coordination !== false;
  return enabled ? <AvailableSendToChatButton {...{ eventId, sessionId, size }} /> : null;
}
function AvailableSendToChatButton({ eventId, sessionId, size }: SendToChatButtonProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  return <Dialog open={open} onOpenChange={next => { if (!sending) setOpen(next); }}>
    <DialogTrigger asChild><IconButton
      type="button"
      label="Send to chat"
      tooltip="Share this message with another chat"
      variant="ghost"
      size={size}
      className="inline-flex items-center justify-center"
    ><Forward size={12} /></IconButton></DialogTrigger>
    {open && <SendToChatDialog eventId={eventId} sessionId={sessionId} size={size} onClose={() => setOpen(false)} onSendingChange={setSending} />}
  </Dialog>;
}
function SendToChatDialog({ eventId, sessionId, size, onClose, onSendingChange }: SendToChatButtonProps & { onClose: () => void; onSendingChange: (sending: boolean) => void }) {
  const compactFieldSize = useViewportTier() === 'phone' ? 'touch' : 'sm';

  const defaults = useDefaultSelection();
  const [sendId] = useState(uuidv7);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [workspaceId, setWorkspaceId] = useState('');
  const [target, setTarget] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [directions, setDirections] = useState('');
  const [selection, setSelection] = useState<LaunchHarnessSelection | null>(null);
  const harness = selection?.harness ?? defaults?.harness ?? DEFAULT_HARNESS;
  const model = selection ? selection.model ?? '' : defaults?.model ?? '';
  const effort = selection ? selection.effort : defaults?.effort ?? null;
  const variant = selection ? selection.variant : defaults?.variant ?? null;
  const serviceTier = selection ? selection.serviceTier : defaults?.serviceTier;
  const { models } = useHarnessModels(harness);
  const selectedModel = models.find(option => option.id === model) ?? null;
  const { data: agents = [] } = useWorkspaces({ status: 'active' });
  const { data: chats = [], isLoading } = useQuery({ queryKey: ['coordination-targets', deferredSearch, workspaceId, sessionId], queryFn: () => trpcClient.coordination.targets.query({ search: deferredSearch, ...(workspaceId ? { workspaceId } : {}), excludeSessionId: sessionId }) });
  const send = useMutation({ mutationFn: () => trpcClient.coordination.forward.mutate({ sendId, sourceEventId: eventId, directions,
    ...(newChat ? { launch: { workspaceId, ...(selection ? { provider: harness, ...(model ? { model } : {}), modelVariant: variant, effort, serviceTier } : {}) } } : { target }) }),
    meta: { carriesInput: true }, onMutate: () => onSendingChange(true), onSettled: () => onSendingChange(false), onSuccess: () => { toast.success('Message saved for delivery.'); onClose(); }, onError: error => toast.error(error.message) });
  // Center with auto margins, keeping transforms off the containing block
  // so in-tree model popovers can escape the dialog scroll container.
  return <DialogContent className="min-w-0 max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto sm:max-w-lg" style={{ inset: '0', margin: 'auto', height: 'fit-content', translate: 'none', transform: 'none', animation: 'none' }}><DialogHeader><DialogTitle>Send to chat</DialogTitle><DialogDescription>Share the full message and its attachments. Add directions if useful. No automatic answer is sent back.</DialogDescription></DialogHeader>
    <div className="min-w-0 space-y-3">
      <Field
        autoFocus
        aria-label="Search chats"
        placeholder="Search chats"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={'min-w-0 flex-1'}
        leading={<Search />}
        size={compactFieldSize}
      />
      <NativeSelect
        aria-label="Filter by agent"
        controlClassName={cn('min-w-0 max-w-[min(16rem,75%)]', 'w-auto')}
        value={workspaceId}
        onChange={(event) => {
          setWorkspaceId(event.target.value);
          setTarget('');
        }}
        label="Agent"
        orientation="horizontal"
        className="w-auto"
        size={compactFieldSize}
      >
        <option value="">All agents</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </NativeSelect>
      <RadioGroup orientation="horizontal" aria-label="Chat target" value={newChat ? 'new' : 'existing'} onValueChange={value => setNewChat(value === 'new')} className="flex gap-3">
        <label className="flex items-center gap-2 text-xs"><RadioGroupItem value="existing" />Existing chat</label>
        <label className="flex items-center gap-2 text-xs"><RadioGroupItem value="new" />New chat</label>
      </RadioGroup>
      {newChat ? <div className="space-y-2 rounded-lg border p-3"><p className="text-xs text-muted-foreground">{workspaceId ? 'Start a new chat in the selected agent.' : 'Choose an agent above for the new chat.'}</p><div className="flex flex-wrap gap-2"><ModelControl size={size === 'touch' ? 'touch' : 'compact'} selection={{ harness, model }} label={selectedModel?.label ?? (model || 'Default model')} variant={variant} effort={effort} serviceTier={serviceTier} onChange={setSelection} onEffortChange={next => setSelection({ harness, model, variant, effort: next, serviceTier })} /></div></div>
        : <div className="min-w-0 max-h-56 overflow-x-hidden overflow-y-auto rounded-lg border" aria-label="Chats by recent activity">{isLoading ? <p className="p-3 text-xs text-muted-foreground">Loading chats…</p> : chats.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No matching chats.</p> : chats.map(chat => <MenuAction key={chat.id} type="button" aria-pressed={target === chat.id} onClick={() => setTarget(chat.id)} className="block w-full text-left"><span className="block truncate text-sm font-medium">{chat.label ?? (chat.type === 'orchestration' ? chat.workspaceId ? 'Agent main chat' : 'Orchestrator' : 'Untitled chat')}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{chat.agentName ?? 'Orchestrator'} · {new Date(chat.lastActivityAt ?? chat.updatedAt).toLocaleString()}</span></MenuAction>)}</div>}
      <TextArea
        value={directions}
        onChange={(event) => setDirections(event.target.value)}
        rows={3}
        controlClassName="w-full"
        placeholder="For example, review this feedback against your current changes."
        label="Your directions, optional"
      />
      <div className="flex justify-end gap-2"><Button
        type="button"
        disabled={send.isPending}
        onClick={onClose}
        variant="ghost"
        size={size === 'touch' ? 'touch' : 'md'}
      >Cancel</Button><Button
        type="button"
        disabled={send.isPending || (newChat ? !workspaceId : !target)}
        onClick={() => send.mutate()}
        variant="primary"
        size={size === 'touch' ? 'touch' : 'md'}
      >{send.isPending ? 'Sending…' : 'Send to chat'}</Button></div>
    </div>
  </DialogContent>;
}

'use client';
import { Card } from '@/components/system/card';

import { Button } from '@/components/system/button';
import { Tip } from '@/components/ui/tip';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpcClient } from '@/lib/trpc/client';
import { useCoordinationDecision } from '@/hooks/use-coordination';
import type { AgentDeliveryRecord } from '@/db/types';
import { ChatMessageLink } from '@/components/chat-ui/messages/chat-message-link';

export function CoordinationApprovalCard({ delivery, onDecide, busy = false, destinationName, launchOptions, compact = false }: { compact?: boolean; destinationName?: string | null; launchOptions?: AgentDeliveryRecord['payload']['launch']; delivery: AgentDeliveryRecord; onDecide?: (decision: 'allow' | 'always' | 'deny') => void; busy?: boolean }) {
  const pending = delivery.status === 'awaiting_approval';
  return <Card as="section" padding="md" shadow className={compact ? "space-y-2" : "max-w-xl space-y-3"} aria-label={delivery.senderKind === 'human' ? 'Shared message delivery' : 'Coordination approval'}>
    <div><p className="font-medium">{pending ? delivery.payload.launch || delivery.kind === 'request' && delivery.targetAddress.startsWith('agent:') ? 'Approve work in another chat' : 'Approve message to another chat' : delivery.status === 'denied' ? 'Send declined' : delivery.status === 'failed' ? 'Send failed' : delivery.status === 'cancelled' ? 'Send cancelled' : 'Coordination send authorized'}</p><p className="mt-1 text-muted-foreground">{delivery.kind === 'request' ? 'A returned outcome is expected.' : 'No automatic reply requested.'}</p></div>
    {delivery.targetSessionId ? <ChatMessageLink sessionId={delivery.targetSessionId} eventId={delivery.eventId} label="Destination" direction="outgoing" /> : <p className="break-words text-muted-foreground">{launchOptions ? 'New chat in' : 'Destination:'} {destinationName ?? delivery.targetAddress}</p>}
    {launchOptions?.executionId && <p className="text-muted-foreground">Shares the existing folder, branch and device.</p>}
    {launchOptions && <p className="text-[11px] text-muted-foreground">{[launchOptions.provider,launchOptions.model,launchOptions.effort && `${launchOptions.effort} effort`,launchOptions.permissionMode].filter(Boolean).join(' · ') || 'Normal launcher defaults'}</p>}
    <CoordinationText text={delivery.payload.content} compact={compact} />
    {!compact && <p className="text-[11px] text-muted-foreground">{delivery.status === 'awaiting_approval' ? 'Waiting for your approval. This message has not been sent.' : delivery.status === 'queued' ? 'Authorized and queued' : delivery.status === 'delivered' ? 'Saved in the receiving chat, waiting for acceptance' : delivery.status === 'accepted' ? 'Supplied to an agent turn' : delivery.status === 'denied' ? 'The receiving work was not started' : delivery.status === 'cancelled' ? 'This send was cancelled' : 'Delivery failed'}</p>}
    {delivery.error && <p className="text-destructive">{delivery.error}</p>}
    {pending && <div className="flex flex-wrap gap-2"><Button
      type="button"
      disabled={busy}
      onClick={() => onDecide?.('allow')}
      variant="primary"
      size="xs"
    >Approve</Button><Tip label="Let this chat message any chat and create new chats automatically."><Button
      type="button"
      disabled={busy}
      onClick={() => onDecide?.('always')}
      variant="secondary"
      size="xs"
    >Always</Button></Tip><Button
      type="button"
      disabled={busy}
      onClick={() => onDecide?.('deny')}
      variant="ghost"
      size="xs"
    >Decline</Button></div>}
    {!compact && delivery.senderKind !== 'human' && <p className="text-[11px] text-muted-foreground">Approval allows this message and replies to this chat{delivery.kind === 'request' ? ', including the returned outcome' : ''}. Always allow lets this chat message any chat and create new chats. Pause incoming queues agent messages in this chat until you resume.</p>}
  </Card>;
}
export function CoordinationText({ text, children, compact = false }: { text: string; children?: ReactNode; compact?: boolean }) {
  const long = text.length > (compact ? 160 : 800) || text.split('\n').length > 8;
  const body = children ?? <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>;
  if (!long) return body;
  return <details className="group/full"><summary className="cursor-pointer list-none"><p className={`${compact ? "line-clamp-2" : "line-clamp-6"} whitespace-pre-wrap break-words leading-relaxed group-open/full:hidden`}>{text.slice(0, 800)}…</p><span className="mt-2 inline-block text-xs font-medium underline underline-offset-2"><span className="group-open/full:hidden">Show full message</span><span className="hidden group-open/full:inline">Collapse message</span></span></summary><div className="mt-2">{body}</div></details>;
}
export function CoordinationApproval({ deliveryId, sessionId }: { deliveryId: string; sessionId: string }) {
  const { data } = useQuery({ queryKey: ['coordination-delivery', deliveryId], queryFn: () => trpcClient.coordination.delivery.query({ id: deliveryId }), refetchInterval: query => ['awaiting_approval','queued','delivered'].includes(query.state.data?.status ?? '') ? 2000 : false });
  const decide = useCoordinationDecision(sessionId);
  if (!data) return <p className="text-xs text-muted-foreground">Loading coordination proposal…</p>;
  return <CoordinationApprovalCard delivery={data} destinationName={data.destinationName} launchOptions={data.launchOptions ?? undefined} busy={decide.isPending} onDecide={decision => decide.mutate({ deliveryId, decision })} />;
}

'use client';
/**
 * A chat's message queue on the client (docs/message-queue.md). The home
 * owns the queue and sends from it, so these hooks only show it and ask for
 * changes. The session stream's `queue` frames keep it current on every
 * screen. Adding, removing and sending now are optimistic: the strip changes
 * on the click, and goes back with a toast if the home refuses.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { uuidv7 } from 'uuidv7';
import type { Attachment } from '@/db/types';
import { apiErrorText } from '@/lib/api/client';
import { flushConnectedContext } from '@/lib/client/mcp-app-context';
import { withRunningStatus, type SessionRuntimeStatus } from '@/lib/executor/runtime-status';
import { trpc, trpcClient } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/router';

export type QueuedMessage = RouterOutputs['messageQueue']['list'][number];

export function messageQueueKey(sessionId: string) {
  return trpc.messageQueue.list.queryKey({ sessionId });
}

/** The chat's queue, oldest first. */
export function useMessageQueue(sessionId: string | null, enabled = true) {
  return useQuery({
    queryKey: messageQueueKey(sessionId ?? ''),
    queryFn: ({ signal }) => trpcClient.messageQueue.list.query({ sessionId: sessionId! }, { signal }),
    enabled: !!sessionId && enabled,
    // The stream's `queue` frames keep it current.
    staleTime: 60_000,
  });
}

function patchQueue(qc: QueryClient, sessionId: string, patch: (queue: QueuedMessage[]) => QueuedMessage[]) {
  qc.setQueryData<QueuedMessage[]>(messageQueueKey(sessionId), (prev) => patch(prev ?? []));
}

/** Put the message back where it was, unless the stream has moved past it. */
function restore(qc: QueryClient, sessionId: string, message: QueuedMessage) {
  patchQueue(qc, sessionId, (queue) => queue.some((item) => item.id === message.id)
    ? queue
    : [...queue, message].sort((a, b) => a.id.localeCompare(b.id)));
}

export interface QueueInput {
  content: string;
  attachments?: Attachment[];
  /** The composer's document, so Edit can put the message back with its chips. */
  draft: Record<string, unknown> | null;
  /** Send it at once: ⌘Enter on a harness that can't take a message mid-turn. */
  sendNow?: boolean;
}

/** Add a message to the end of the queue. */
export function useQueueMessage(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    // The composer clears on queue and restores only on failure, so until the
    // home acknowledges it this request holds the only copy of the message.
    meta: { carriesInput: true },
    mutationFn: async ({ id, ...input }: QueueInput & { id: string }) => trpcClient.messageQueue.add.mutate({
      sessionId,
      id,
      content: input.content,
      attachments: input.attachments ?? [],
      draft: input.draft,
      connectedAppContext: await flushConnectedContext(sessionId),
      sendNow: input.sendNow,
    }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: messageQueueKey(sessionId) });
      const optimistic: QueuedMessage = {
        id: input.id, content: input.content, attachments: input.attachments ?? [], draft: input.draft, createdAt: new Date().toISOString(),
      };
      if (!input.sendNow) patchQueue(qc, sessionId, (queue) => queue.some((item) => item.id === input.id) ? queue : [...queue, optimistic]);
      else qc.setQueryData<SessionRuntimeStatus>(trpc.sessions.runtimeStatusGet.queryKey({ params: { id: sessionId } }), (prev) => withRunningStatus(prev, true));
    },
    onError: (error, input) => {
      patchQueue(qc, sessionId, (queue) => queue.filter((item) => item.id !== input.id));
      toast.error(input.sendNow ? "Couldn't send that message" : "Couldn't queue that message", { description: apiErrorText(error) });
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: messageQueueKey(sessionId) }); },
  });
}

/** Mint the message's id once, so a retried add finds the first. */
export function queueInput(input: QueueInput): QueueInput & { id: string } {
  return { ...input, id: uuidv7() };
}

/** Take a message out of the queue: deleted, or back in the composer to edit. */
export function useRemoveQueuedMessage(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: QueuedMessage) => trpcClient.messageQueue.remove.mutate({ sessionId, id: message.id }),
    onMutate: async (message) => {
      await qc.cancelQueries({ queryKey: messageQueueKey(sessionId) });
      patchQueue(qc, sessionId, (queue) => queue.filter((item) => item.id !== message.id));
    },
    onError: (error, message) => {
      restore(qc, sessionId, message);
      toast.error("Couldn't change the queue", { description: apiErrorText(error) });
    },
  });
}

/** Send a queued message now, ahead of the rest. */
export function useSendQueuedNow(sessionId: string) {
  const qc = useQueryClient();
  const runtimeKey = trpc.sessions.runtimeStatusGet.queryKey({ params: { id: sessionId } });
  return useMutation({
    mutationFn: (message: QueuedMessage) => trpcClient.messageQueue.sendNow.mutate({ sessionId, id: message.id }),
    onMutate: async (message) => {
      await qc.cancelQueries({ queryKey: messageQueueKey(sessionId) });
      patchQueue(qc, sessionId, (queue) => queue.filter((item) => item.id !== message.id));
      qc.setQueryData<SessionRuntimeStatus>(runtimeKey, (prev) => withRunningStatus(prev, true));
    },
    onError: (error, message) => {
      restore(qc, sessionId, message);
      void qc.invalidateQueries({ queryKey: runtimeKey });
      toast.error("Couldn't send that message", { description: apiErrorText(error) });
    },
  });
}

'use client';
/**
 * A starter's Started chats on the client (docs/started-chats.md): the chats
 * an execution, or an agent's main chat, started, what they're doing, and
 * archiving the finished ones.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkActivity } from '@/contexts/work-context';
import { apiErrorText } from '@/lib/api/client';
import { trpc, trpcClient } from '@/lib/trpc/client';
import type { RouterOutputs } from '@/lib/trpc/router';
import { startedChatState } from '@/lib/sessions/started-chat-state';
import { startedArchiveToast } from '@/lib/sessions/started-archive-copy';
import { HISTORY_KEY, RAIL_KEY } from '@/hooks/use-workspaces';

export type StartedChat = RouterOutputs['startedChats']['list'][number];
export type StartedChatsScope = { executionId: string } | { workspaceId: string };

export function startedChatsKey(scope: StartedChatsScope) {
  return trpc.startedChats.list.queryKey({ scope });
}

/** Every started-chats list, after an archive anywhere may have changed one. */
export function invalidateStartedChats(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: trpc.startedChats.list.pathKey() });
}

/**
 * The starter's started chats, newest first. Refreshed every 15 seconds while
 * shown, as the rail is, since their answers come back on their own time.
 */
export function useStartedChats(scope: StartedChatsScope | null) {
  return useQuery({
    queryKey: startedChatsKey(scope ?? { executionId: '' }),
    queryFn: ({ signal }) => trpcClient.startedChats.list.query({ scope: scope! }, { signal }),
    enabled: !!scope,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** The Tools row's summary: how many, and how many need you or are working. */
export function useStartedSummary(scope: StartedChatsScope | null) {
  const { data } = useStartedChats(scope);
  const { pendingInputSessionIds, streamingSessionIds } = useWorkActivity();
  return useMemo(() => {
    const rows = data ?? [];
    let needs = 0;
    let working = 0;
    let open = 0;
    for (const row of rows) {
      if (row.status !== 'active') continue;
      open++;
      const state = startedChatState(row, { pending: pendingInputSessionIds, streaming: streamingSessionIds });
      if (state === 'needs_you') needs++;
      else if (state === 'working') working++;
    }
    return { count: rows.length, open, needs, working };
  }, [data, pendingInputSessionIds, streamingSessionIds]);
}

/** Archive the finished ones, then say what went and what stayed. */
export function useArchiveFinishedStartedChats(scope: StartedChatsScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => trpcClient.startedChats.archiveFinished.mutate({ scope }),
    onSuccess: (outcome) => {
      const message = startedArchiveToast(outcome, { kind: 'finished' });
      if (message) toast.success(message.title, message.description ? { description: message.description } : undefined);
    },
    onError: (error) => {
      toast.error('Couldn’t archive the finished chats', { description: apiErrorText(error) });
    },
    onSettled: () => {
      void invalidateStartedChats(qc);
      void qc.invalidateQueries({ queryKey: RAIL_KEY });
      void qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}

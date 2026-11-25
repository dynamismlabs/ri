'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';
import type { ArtifactCursor } from '@/lib/sessions/artifact-messages';

/** Which chats the Artifacts list covers: the one on screen, or every chat on its execution. */
export type ArtifactScope = 'chat' | 'all';

export function useExecutionArtifacts(sessionId: string, executionId: string | null, active: boolean, scope: ArtifactScope = 'all') {
  return useInfiniteQuery(trpc.artifacts.list.infiniteQueryOptions({
    scope: executionId && scope === 'all' ? { executionId } : { sessionId },
  }, {
    initialCursor: null as ArtifactCursor | null,
    getNextPageParam: page => page.nextCursor,
    staleTime: 10_000,
    enabled: active,
    refetchInterval: active ? 15_000 : false,
  }));
}

'use client';

import { useRuntimeStatus } from '@/hooks/use-execution';
import { SKILLS_KEY } from '@/hooks/use-skills';
import { apiErrorText } from '@/lib/api/client';
import type { ChatSessionRecord } from '@/lib/api/dto/records';
import { hasRuntimeActivity } from '@/lib/executor/runtime-status';
import type { EffortLevel } from '@/db/types';
import type { ProviderId } from '@/lib/harness/options';
import { trpcClient } from '@/lib/trpc/client';
import { rpcQuery } from '@/lib/trpc/request-options';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/** The composer's model menu choice a fresh chat starts on. */
type NewChatOverride = { providerId?: ProviderId; model?: string; variant?: string; effort?: EffortLevel; serviceTier?: string };

/** 'build' is the skill's builder chat, 'try' the chat that tries it. */
export type SkillChatKind = 'build' | 'try';

const ENTITY_TYPE: Record<SkillChatKind, 'skill' | 'skill-try'> = { build: 'skill', try: 'skill-try' };

export function skillChatQueryKey(ref: string, kind: SkillChatKind) {
  return ['document-chat', ENTITY_TYPE[kind], ref] as const;
}

/** Ensure the skill's builder or try chat (by the skill's ref) and return its session. */
export async function ensureSkillChat(ref: string, kind: SkillChatKind): Promise<ChatSessionRecord> {
  const { session } = await trpcClient.documentChat.list.query({query: rpcQuery({ entityType: ENTITY_TYPE[kind], entityId: ref })});
  return session;
}

/**
 * A skill's builder or try chat: the same focused content session the
 * note and task chats use (src/app/api/document-chat), tagged with the skill.
 * When a builder turn ends, the skill is refetched so the AI's last edits are
 * in the editor.
 */
export function useSkillChat(ref: string, kind: SkillChatKind, opts: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const queryKey = skillChatQueryKey(ref, kind);
  const query = useQuery({
    queryKey,
    queryFn: () => ensureSkillChat(ref, kind),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });
  const sessionId = query.data?.id ?? null;
  const runtime = useRuntimeStatus(sessionId);
  const isActive = hasRuntimeActivity(runtime.data);

  const wasActive = useRef(isActive);
  useEffect(() => {
    if (wasActive.current && !isActive) void qc.invalidateQueries({ queryKey: SKILLS_KEY });
    wasActive.current = isActive;
  }, [isActive, qc]);

  // No args starts a fresh chat on the default model. A choice from the
  // composer's model menu starts it on that provider and model instead.
  const newChat = useMutation({
    mutationFn: (opts: NewChatOverride | void) =>
      trpcClient.documentChat.create.mutate({body: { entityType: ENTITY_TYPE[kind], entityId: ref, ...(opts ?? {}) }}),
    onError: (error) => toast.error('Could not start a new chat', { description: apiErrorText(error) }),
    onSuccess: (data) => qc.setQueryData(queryKey, data.session),
  });

  return { session: query.data ?? null, sessionId, isActive, isLoading: query.isLoading, error: query.error, refetch: query.refetch, newChat };
}

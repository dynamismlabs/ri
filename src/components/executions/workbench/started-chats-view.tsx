'use client';

import { StartedChatsList } from '@/components/chat-ui/coordination/started-chats-list';
import { useWorkActivity, useWorkNavigation } from '@/contexts/work-context';
import { useArchiveExecution } from '@/hooks/use-archive-execution';
import { useArchiveFinishedStartedChats, useStartedChats, type StartedChatsScope } from '@/hooks/use-started-chats';

/**
 * The Started chats tool (docs/started-chats.md), beside a chat or an
 * agent's main chat: the list, wired to the starter's data, opening a chat,
 * one archive with its usual uncommitted-files check, and Archive finished.
 */
export function StartedChatsView({ scope, starter }: { scope: StartedChatsScope; starter: string }) {
  const { data, isLoading } = useStartedChats(scope);
  const { pendingInputSessionIds, streamingSessionIds } = useWorkActivity();
  const { openExecution } = useWorkNavigation();
  const { archive } = useArchiveExecution();
  const finished = useArchiveFinishedStartedChats(scope);
  return (
    <StartedChatsList
      rows={data ?? []}
      live={{ pending: pendingInputSessionIds, streaming: streamingSessionIds }}
      starter={starter}
      loading={isLoading}
      onOpen={(row) => openExecution(row.sessionId)}
      onArchive={(row) => void archive({ id: row.sessionId, executionId: row.executionId, workspaceId: row.workspaceId, label: row.label ?? row.executionLabel })}
      onArchiveFinished={() => finished.mutate()}
      archivingFinished={finished.isPending}
    />
  );
}

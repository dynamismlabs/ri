import type { ChatSessionRecord } from '@/db/types';

/** Personal manager chats, excluding automation runs and restricted surfaces. */
export function isManagerChat(chat: ChatSessionRecord): boolean {
  return chat.type === 'coordinator' && !chat.executionId && !chat.createdByRunId && (!chat.surfaceKind || chat.surfaceKind === 'main');
}

export function addressOf(chat: ChatSessionRecord): string {
  return isManagerChat(chat)
    ? chat.workspaceId ? `agent:${chat.workspaceId}` : 'coordinator'
    : `session:${chat.id}`;
}

import type { StartedChatRow } from '@/lib/db/coordination-queries';
import { isFinishedRequest } from './started-by';

/**
 * A started chat as its starter's Started chats list reads it
 * (docs/started-chats.md). Pure, so the list, its Tools summary and the
 * gallery agree.
 */
export type StartedChatState = 'needs_you' | 'working' | 'returned' | 'failed' | 'cancelled';

/** What a started chat is doing, live: waiting on you and running come from the runtime, the rest from its delegation. */
export function startedChatState(
  row: Pick<StartedChatRow, 'sessionId' | 'status' | 'requestStatus'>,
  live: { pending: ReadonlySet<string>; streaming: ReadonlySet<string> },
): StartedChatState {
  if (row.status === 'active' && live.pending.has(row.sessionId)) return 'needs_you';
  if (row.status === 'active' && (live.streaming.has(row.sessionId) || !isFinishedRequest(row.requestStatus))) return 'working';
  // Archived before it answered: it won't.
  if (!isFinishedRequest(row.requestStatus)) return 'cancelled';
  if (row.requestStatus === 'failed') return 'failed';
  if (row.requestStatus === 'cancelled') return 'cancelled';
  return 'returned';
}

/** Finished, open, and only its starter's: what Archive finished takes (`isFinishedUntouched` on the server). */
export function isArchivableStartedChat(row: Pick<StartedChatRow, 'status' | 'personWrote' | 'pinnedAt' | 'otherChats'>, state: StartedChatState): boolean {
  return row.status === 'active' && (state === 'returned' || state === 'failed' || state === 'cancelled') && !row.personWrote && !row.pinnedAt && !row.otherChats;
}

import * as q from '@/lib/db/queries';
import { isTeamAuthority } from '@/lib/home/authority';
import type { StartedBy } from './started-by';

/**
 * Every list row with where it came from (docs/started-chats.md): the chat
 * that started it, and whether its answer already went back there. Read once
 * per list, by id, from the delegation record.
 */
export function withStartedChats<T extends { id: string; executionId: string | null }>(
  rows: readonly T[],
): (T & { startedBy: StartedBy | null; answerReturnedAt: string | null })[] {
  // Chats start chats only on a personal Home (coordination refuses on a
  // team's), so a team's lists never name a starter.
  if (isTeamAuthority()) return rows.map((row) => ({ ...row, startedBy: null, answerReturnedAt: null }));
  const startedBy = q.startedByForChats(rows);
  const started = rows.filter((row) => startedBy.has(row.id));
  const activity = q.startedChatActivity(started);
  return rows.map((row) => ({
    ...row,
    startedBy: startedBy.get(row.id) ?? null,
    answerReturnedAt: activity.get(row.id)?.answerReturnedAt ?? null,
  }));
}

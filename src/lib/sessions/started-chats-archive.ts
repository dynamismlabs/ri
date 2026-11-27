import * as q from '@/lib/db/queries';
import type { StartedChatRow } from '@/lib/db/queries';
import type { WorkerCommandActor } from '@/db/types';
import { listRunningSessions, listSessionsWithPending } from '@/lib/executor/status-snapshot';
import { isFinishedRequest } from './started-by';

/** Why a started chat stays open when its finished siblings are archived. */
export type StartedKeptReason = 'working' | 'needs_you' | 'uncommitted';

/** What archiving finished started chats did, for the toast that says so. */
export interface StartedArchiveOutcome {
  archived: { id: string; label: string }[];
  /** Open because they still run or wait, or their files aren't committed. Chats you wrote in or pinned stay without a word: they're yours. */
  kept: { id: string; label: string; reason: StartedKeptReason }[];
}

export const NO_STARTED_OUTCOME: StartedArchiveOutcome = { archived: [], kept: [] };

export type StartedScope = { executionId: string } | { address: string };

function titleOf(row: StartedChatRow): string {
  return row.label ?? row.executionLabel ?? 'Untitled chat';
}

/**
 * Whether a started chat is finished and still only its starter's: its
 * answer went back (or it stopped), nothing runs or waits in it, you never
 * wrote in it or pinned it, and you opened no other chat in its execution. Those are what Archive finished, and
 * archiving their starter, take with them (docs/started-chats.md).
 */
export function isFinishedUntouched(row: StartedChatRow, live: { running: ReadonlySet<string>; pending: ReadonlySet<string> }): boolean {
  return row.status === 'active'
    && isFinishedRequest(row.requestStatus)
    && !live.running.has(row.sessionId)
    && !live.pending.has(row.sessionId)
    && !row.personWrote
    && !row.pinnedAt
    // Archiving it archives its whole execution: a chat you opened there keeps it.
    && !row.otherChats;
}

export interface StartedArchiveDeps {
  /** One archive. The execution archive by default. */
  archive?: (args: { sessionId: string; actor?: WorkerCommandActor; force: false }) => Promise<{ status: string } | null>;
  /** Who runs and who waits right now. The runtime's snapshot by default. */
  live?: { running: ReadonlySet<string>; pending: ReadonlySet<string> };
  /** Chats archived in the same pass (a bulk archive), left to their own requests. */
  skip?: ReadonlySet<string>;
}

/**
 * Archive a starter's finished started chats, the way one archive does each:
 * a worktree with files that aren't committed refuses and stays, named in
 * the outcome. One still running or waiting on you stays too. Never forced.
 */
export async function archiveFinishedStartedChats(scope: StartedScope, actor?: WorkerCommandActor, deps: StartedArchiveDeps = {}, depth = 0): Promise<StartedArchiveOutcome> {
  const rows = q.listStartedChats(scope, { openOnly: true, limit: null }).filter((row) => !deps.skip?.has(row.sessionId));
  if (!rows.length) return NO_STARTED_OUTCOME;
  const live = deps.live ?? { running: new Set(listRunningSessions()), pending: new Set(listSessionsWithPending()) };
  const kept: StartedArchiveOutcome['kept'] = [];
  const finished: StartedChatRow[] = [];
  for (const row of rows) {
    if (live.pending.has(row.sessionId)) kept.push({ id: row.sessionId, label: titleOf(row), reason: 'needs_you' });
    else if (!isFinishedRequest(row.requestStatus) || live.running.has(row.sessionId)) kept.push({ id: row.sessionId, label: titleOf(row), reason: 'working' });
    else if (isFinishedUntouched(row, live)) finished.push(row);
  }
  const archive = deps.archive ?? (await import('./dispatch')).archiveExecutionSession;
  const settled = await Promise.allSettled(finished.map((row) => archive({ sessionId: row.sessionId, actor, force: false })));
  const archived: StartedArchiveOutcome['archived'] = [];
  const deeper: StartedScope[] = [];
  settled.forEach((result, i) => {
    const row = finished[i]!;
    if (result.status === 'fulfilled') {
      if (result.value?.status === 'archived') {
        archived.push({ id: row.sessionId, label: titleOf(row) });
        if (row.executionId) deeper.push({ executionId: row.executionId });
      }
      return;
    }
    const error = result.reason;
    if (error instanceof Error && error.name === 'DirtyWorktreeError') kept.push({ id: row.sessionId, label: titleOf(row), reason: 'uncommitted' });
    // Anything else (it's already being archived, its device is away) leaves
    // it open as it was. Archive finished on the list stays there to retry.
    else console.warn(`[started chats] could not archive ${row.sessionId}:`, error);
  });
  // The chats those started go too, on the same terms. Delegation refuses
  // chains past 8, so this stops there as well.
  if (depth < 8) {
    for (const next of deeper) {
      const below = await archiveFinishedStartedChats(next, actor, deps, depth + 1);
      archived.push(...below.archived);
      kept.push(...below.kept);
    }
  }
  return { archived, kept };
}

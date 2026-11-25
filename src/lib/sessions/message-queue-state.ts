/**
 * How each chat's last turn ended, for its message queue
 * (docs/message-queue.md). Light on purpose: `executor/apply.ts` records it
 * as each turn's result lands, without loading the send path.
 *
 * The queue moves on only after a turn that finished normally. A turn the
 * person stopped, or one that failed, holds it until they act, and so does a
 * restart, which forgets this (the turn under way didn't finish either).
 */
import { processState } from '@/lib/process-state';

const lastTurnFinished = processState('message-queue.last-turn', () => new Map<string, boolean>());

/** A turn's result landed: `finished` when it ended normally, not stopped or failed. */
export function noteTurnEnded(chatSessionId: string, finished: boolean): void {
  lastTurnFinished.set(chatSessionId, finished);
}

/** Whether the chat's last turn finished normally, so its queue may send the next message. */
export function lastTurnFinishedNormally(chatSessionId: string): boolean {
  return lastTurnFinished.get(chatSessionId) === true;
}

/**
 * The queue is sending a message: it waits for that message's turn to finish
 * normally before it sends another. A message refused before it ever ran
 * (and the quiet moment its refusal makes) leaves the rest waiting rather
 * than pulling them after it.
 */
export function holdQueue(chatSessionId: string): void {
  lastTurnFinished.set(chatSessionId, false);
}

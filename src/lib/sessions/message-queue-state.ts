/**
 * How each chat's last turn ended, for its message queue
 * (docs/message-queue.md). Light on purpose: `executor/apply.ts` records it
 * as each turn's result lands, and asks for the next queued message, without
 * loading the send path.
 *
 * The queue moves on only after a turn that finished normally. A turn the
 * person stopped, or one that failed, holds it until they act, and so does a
 * restart, which forgets this (the turn under way didn't finish either).
 */
import { processState } from '@/lib/process-state';

const lastTurnFinished = processState('message-queue.last-turn', () => new Map<string, boolean>());

/**
 * The queue's sender. `message-queue.ts` gives it here when it loads, which
 * the home's startup makes sure of, so `apply.ts` never imports the send
 * path. It mustn't: the send path leads back to `apply.ts`, and that loop,
 * loaded as its own chunk, makes Turbopack's Windows build panic ("Dependency
 * tracking is disabled so invalidation is not allowed").
 */
const sender = processState('message-queue.sender', () => ({ drain: null as ((chatSessionId: string) => Promise<void>) | null }));

export function provideQueueSender(drain: (chatSessionId: string) => Promise<void>): void {
  sender.drain = drain;
}

/** Send the chat's next queued message if it's due. Before the queue has loaded, there is nothing to send. */
export async function drainQueue(chatSessionId: string): Promise<void> {
  await sender.drain?.(chatSessionId);
}

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

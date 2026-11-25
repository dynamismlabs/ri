/**
 * How the composer sends while its chat works (docs/message-queue.md): the
 * send key queues, ⌘↩ sends now, and Edit on a queued message brings it
 * back into the box. Kept apart from the composer so it's plain to test.
 */
import { HOTKEYS } from '@/constants/commands';

/**
 * While the chat works, the send key queues and ⌘↩ sends now, so the box
 * names the key it doesn't show (docs/message-queue.md). A phone has no ⌘↩:
 * Send now is on the queued message.
 */
export function queuePlaceholder(touchFirst: boolean): string {
  return touchFirst ? 'Queue a follow-up' : `Queue a follow-up, ${HOTKEYS.sendMessageNow.label} to send now`;
}

/**
 * How a message from the composer goes. While the chat works it waits in the
 * queue, unless the person sends it now. Send now goes straight into the turn
 * on a harness that takes messages mid-turn, and through the queue (which
 * stops the turn first) on one that doesn't. Otherwise it's an ordinary send.
 */
export function composerSendRoute(
  { working, queueAvailable, takesMessagesMidTurn }: { working: boolean; queueAvailable: boolean; takesMessagesMidTurn: boolean },
  mode: 'auto' | 'queue' | 'now',
): 'send' | 'queue' | 'queue-and-send-now' {
  if (!working || !queueAvailable) return 'send';
  if (mode !== 'now') return 'queue';
  return takesMessagesMidTurn ? 'send' : 'queue-and-send-now';
}

type DocJSON = { type?: string; content?: unknown[] };

/** The message box's document with another's paragraphs after it, for Edit on a queued message. */
export function appendDraft(current: unknown, next: unknown): DocJSON {
  const a = (current ?? {}) as DocJSON;
  const b = (next ?? {}) as DocJSON;
  return { type: 'doc', content: [...(a.content ?? []), ...(b.content ?? [])] };
}

/**
 * A chat's message queue (docs/message-queue.md).
 *
 * While a chat is working, a message the person sends waits here instead of
 * going to the agent. The home sends the next one as the chat's next message
 * once the chat goes quiet after a turn that finished normally. A turn the
 * person stopped, or one that failed, holds the queue until they act: Send
 * now on a message, or a message of their own. Send now gives a message to
 * the agent at once. A harness that takes messages mid-turn (Claude, Codex)
 * gets it in the turn under way. One that can't has its turn stopped first.
 *
 * The queue lives on the home, so it keeps moving with no screen open, and
 * every screen showing the chat sees the same queue. Only personal chats
 * queue: a team's shared chat already runs one member's turn at a time.
 */
import { ActionError } from '@/lib/actions/types';
import type { Attachment, ChatEventRecord, QueuedMessageRecord, WorkerCommandActor } from '@/db/types';
import * as q from '@/lib/db/queries';
import * as executor from '@/lib/executor/adapter';
import { harnessCapabilitiesOn } from '@/lib/executor/devices';
import { isImportMirror } from '@/lib/import/mirror';
import { processState } from '@/lib/process-state';
import { publishMessageQueue } from '@/lib/realtime/bus';
import { admitNewMessage, sendHumanMessage } from './send-message';
import { holdQueue, lastTurnFinishedNormally } from './message-queue-state';

/** What a screen shows of a queued message. */
export interface QueuedMessageView {
  id: string;
  content: string;
  attachments: Attachment[];
  /** The composer's document, for Edit. */
  draft: Record<string, unknown> | null;
  createdAt: string;
}

export function queuedMessageView(message: QueuedMessageRecord): QueuedMessageView {
  return { id: message.id, content: message.content, attachments: message.attachments, draft: message.draft ?? null, createdAt: message.createdAt };
}

export function listQueue(chatSessionId: string): QueuedMessageView[] {
  queueChat(chatSessionId);
  return q.listQueuedMessages(chatSessionId).map(queuedMessageView);
}

/** Tell every screen showing the chat what its queue holds now. */
function publishQueue(chatSessionId: string): void {
  publishMessageQueue(chatSessionId, q.listQueuedMessages(chatSessionId).map(queuedMessageView));
}

/** Chats being sent from their queue now, so two quiet edges can't send twice. */
const sending = processState('message-queue.sending', () => new Set<string>());

/** A personal chat that takes the person's messages, or a refusal saying why not. */
function queueChat(chatSessionId: string) {
  const chat = q.getChatSessionWithExecution(chatSessionId);
  if (!chat) throw new ActionError('not_found', 'This chat no longer exists.');
  if (chat.surfaceKind === 'team_chat') throw new ActionError('unsupported', 'A shared chat already takes one message at a time.');
  if (chat.surfaceKind === 'result_review') throw new ActionError('unsupported', 'A background reviewer cannot receive messages.');
  if (isImportMirror(chat)) throw new ActionError('unsupported', 'Continue this chat here before sending to it.');
  return chat;
}

/** Working, by the same reading coordination uses before it delivers a message. */
function busy(chatSessionId: string): boolean {
  return executor.isRunning(chatSessionId) || executor.hasBackgroundTasks(chatSessionId) || q.hasPendingCoordinationSend(chatSessionId);
}

export interface QueueMessageInput {
  chatSessionId: string;
  /** The client's id for it, so a retried add finds the first. Becomes the sent message's id. */
  id: string;
  content: string;
  attachments: Attachment[];
  draft: Record<string, unknown> | null;
  /** App context frozen when it was queued (`freezeConnectedContext`). */
  appContext: unknown[] | null;
  apiKeyId: string | null;
  /** It's about to be sent now (`sendQueuedNow`), so the queue mustn't take it first. */
  sendingNow?: boolean;
}

/**
 * Put a message at the end of the chat's queue. If the chat went quiet after
 * a finished turn while it was on its way, it goes at once.
 */
export function queueMessage(input: QueueMessageInput): QueuedMessageView {
  const chat = queueChat(input.chatSessionId);
  if (chat.status === 'archived') throw new ActionError('conflict', 'This chat is archived. Open it again to send to it.');
  const content = input.content.trim();
  if (!content) throw new ActionError('invalid_params', 'There is nothing to queue.');
  if (q.getChatEventById(input.id)) throw new ActionError('conflict', 'This message was sent already.');
  const { message, created } = q.addQueuedMessage({
    id: input.id,
    chatSessionId: chat.id,
    content,
    attachments: input.attachments,
    draft: input.draft,
    appContext: input.appContext?.length ? input.appContext : null,
    apiKeyId: input.apiKeyId,
  });
  if (created) publishQueue(chat.id);
  if (!input.sendingNow) void drainMessageQueue(chat.id);
  return queuedMessageView(message);
}

/** Take a message out of the queue: deleted, or back in the composer to edit. */
export function removeFromQueue(chatSessionId: string, id: string): QueuedMessageView | null {
  queueChat(chatSessionId);
  const removed = q.removeQueuedMessage(chatSessionId, id);
  if (removed) publishQueue(chatSessionId);
  return removed ? queuedMessageView(removed) : null;
}

/**
 * Send the chat's next queued message, if it's due: the chat is quiet, its
 * last turn finished normally and nothing else is sending from its queue.
 * Called when a turn ends, when the chat goes quiet and when a message is
 * queued. A message the chat refuses (its budget is spent, a source it names
 * is gone) stays queued, and the chat says why.
 */
export async function drainMessageQueue(chatSessionId: string): Promise<void> {
  if (sending.has(chatSessionId) || !lastTurnFinishedNormally(chatSessionId) || busy(chatSessionId)) return;
  const next = q.nextQueuedMessage(chatSessionId);
  if (!next) return;
  const chat = q.getChatSessionWithExecution(chatSessionId);
  if (!chat || chat.status !== 'active') return;
  sending.add(chatSessionId);
  try {
    await sendQueued(chat, next);
  } catch (error) {
    // It stays queued. Saying so once is enough: the queue waits for the person.
    const reason = error instanceof Error ? error.message : String(error);
    q.insertChatEvent({ sessionId: chatSessionId, role: 'system', source: 'error', content: `Your queued message wasn't sent: ${reason} It's still in the queue.` });
  } finally {
    sending.delete(chatSessionId);
  }
}

/** Wait for a stopped turn to let go of the chat, for a harness that takes one message at a time. */
async function quiet(chatSessionId: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (executor.isRunning(chatSessionId)) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

/** Whether the chat's harness takes a message during a turn, where the chat runs. */
async function takesMessagesMidTurn(chat: NonNullable<ReturnType<typeof q.getChatSessionWithExecution>>): Promise<boolean> {
  const placement = q.chatPlacement(chat.id);
  const cwd = chat.execution?.worktreePath ?? (chat.workspaceId ? q.getWorkspace(chat.workspaceId)?.cwd : undefined);
  return (await harnessCapabilitiesOn(placement ?? { deviceId: '', isHome: true }, chat.harness, placement?.isHome === false ? undefined : cwd)).concurrentSend;
}

/**
 * Send a queued message now, whatever the queue's order. A chat working on a
 * harness that can't take a message mid-turn has its turn stopped first.
 */
export async function sendQueuedNow(chatSessionId: string, id: string, actor: WorkerCommandActor): Promise<ChatEventRecord> {
  const chat = queueChat(chatSessionId);
  if (chat.status === 'archived') throw new ActionError('conflict', 'This chat is archived. Open it again to send to it.');
  const message = q.getQueuedMessage(chatSessionId, id);
  if (!message) throw new ActionError('not_found', 'That message has left the queue.');
  if (sending.has(chatSessionId)) throw new ActionError('conflict', 'A queued message is being sent now. Try again in a moment.');
  sending.add(chatSessionId);
  try {
    if (executor.isRunning(chatSessionId) && !await takesMessagesMidTurn(chat)) {
      await executor.abort(chatSessionId, actor);
      if (!await quiet(chatSessionId)) throw new ActionError('conflict', "The current turn hasn't stopped yet. Try Send now again in a moment.");
    }
    return await sendQueued(chat, message);
  } finally {
    sending.delete(chatSessionId);
  }
}

/**
 * Send one queued message as the person's next message, under its own id.
 * It leaves the queue in the same tick it becomes a message, so no screen
 * sees it in both places. Throws the refusal when the chat won't take it.
 */
async function sendQueued(chat: NonNullable<ReturnType<typeof q.getChatSessionWithExecution>>, message: QueuedMessageRecord): Promise<ChatEventRecord> {
  const sent = q.getChatEventById(message.id);
  if (sent) {
    // Saved already (a restart between the save and leaving the queue): it isn't queued any more.
    if (q.removeQueuedMessage(chat.id, message.id)) publishQueue(chat.id);
    if (sent.sessionId !== chat.id) throw new ActionError('conflict', 'This message id belongs to another chat.');
    return sent;
  }
  // The queue waits for this message's turn before it sends another, sent or refused.
  holdQueue(chat.id);
  // Working from here on, so nothing else sends into the chat while the send is prepared.
  const preparation = executor.beginDispatchPreparation(chat.id);
  try {
    const refused = await admitNewMessage(chat.id, message.content);
    if (refused) throw new ActionError('conflict', refusalText(refused.body));
    const result = await sendHumanMessage(chat, {
      id: message.id,
      content: message.content,
      attachments: message.attachments,
      senderSessionId: null,
      actor: { source: 'human', sessionId: null, apiKeyId: message.apiKeyId ?? null },
      connectedContext: message.appContext ?? null,
      isExistingRetry: false,
      onSaved: () => {
        q.removeQueuedMessage(chat.id, message.id);
        publishQueue(chat.id);
      },
    });
    if (!result.ok) throw new ActionError('conflict', refusalText(result.body));
    return result.row;
  } finally {
    executor.endDispatchPreparation(chat.id, preparation);
  }
}

function refusalText(body: unknown): string {
  const value = body as { message?: unknown; error?: unknown } | null;
  const text = typeof value?.message === 'string' ? value.message : typeof value?.error === 'string' ? value.error : 'The chat refused it.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

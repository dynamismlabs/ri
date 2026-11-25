/**
 * A chat's queue of messages the person wrote while it was working
 * (docs/message-queue.md). Rows leave the queue when they're sent (they
 * become the chat's message under the same id), taken back to edit, or
 * deleted. Every read is bounded by `idx_queued_messages_chat`.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from './index';
import { queuedMessages } from './schema';
import { dehydrateAttachments, hydrateRow } from './hydrate';
import type { Attachment, CreateQueuedMessageInput, QueuedMessageRecord } from '@/db/types';

function hydrate(row: typeof queuedMessages.$inferSelect): QueuedMessageRecord {
  const hydrated = hydrateRow(row);
  return { ...hydrated, attachments: hydrated.attachments ?? [] };
}

/** The chat's queue, oldest first. */
export function listQueuedMessages(chatSessionId: string): QueuedMessageRecord[] {
  return getDb().select().from(queuedMessages)
    .where(eq(queuedMessages.chatSessionId, chatSessionId))
    .orderBy(asc(queuedMessages.id))
    .all()
    .map(hydrate);
}

/** The message the queue sends next. */
export function nextQueuedMessage(chatSessionId: string): QueuedMessageRecord | null {
  const row = getDb().select().from(queuedMessages)
    .where(eq(queuedMessages.chatSessionId, chatSessionId))
    .orderBy(asc(queuedMessages.id))
    .limit(1)
    .get();
  return row ? hydrate(row) : null;
}

export function getQueuedMessage(chatSessionId: string, id: string): QueuedMessageRecord | null {
  const row = getDb().select().from(queuedMessages)
    .where(and(eq(queuedMessages.chatSessionId, chatSessionId), eq(queuedMessages.id, id)))
    .get();
  return row ? hydrate(row) : null;
}

/**
 * Add a message to the end of its chat's queue. Safe to retry: a second add
 * with the same id finds the first, and `created` says whether this one
 * wrote it.
 */
export function addQueuedMessage(input: CreateQueuedMessageInput): { message: QueuedMessageRecord; created: boolean } {
  const { attachments, ...rest } = input;
  const rows = getDb().insert(queuedMessages)
    .values({ ...rest, attachments: dehydrateAttachments(attachments ?? []) ?? [] })
    .onConflictDoNothing()
    .returning()
    .all();
  if (rows[0]) return { message: hydrate(rows[0]), created: true };
  const existing = getDb().select().from(queuedMessages).where(eq(queuedMessages.id, input.id)).get();
  if (!existing || existing.chatSessionId !== input.chatSessionId) {
    throw new Error('This message id already belongs to another chat.');
  }
  return { message: hydrate(existing), created: false };
}

/** Take a message out of the queue. Returns it, or null when it had already left. */
export function removeQueuedMessage(chatSessionId: string, id: string): QueuedMessageRecord | null {
  const rows = getDb().delete(queuedMessages)
    .where(and(eq(queuedMessages.chatSessionId, chatSessionId), eq(queuedMessages.id, id)))
    .returning()
    .all();
  return rows[0] ? hydrate(rows[0]) : null;
}

/** Every file a queued message names, for the attachment sweep. */
export function listQueuedMessageAttachmentFileNames(): string[] {
  return getDb().select({ attachments: queuedMessages.attachments }).from(queuedMessages)
    .where(sql`${queuedMessages.attachments} <> '[]'`)
    .all()
    .flatMap((row) => (hydrateRow(row).attachments ?? []).map((attachment: Attachment) => attachment.fileName));
}

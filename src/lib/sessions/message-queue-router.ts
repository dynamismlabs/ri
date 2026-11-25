/**
 * The message queue's procedures (docs/message-queue.md): what a chat's queue
 * holds, adding to it, taking a message back out, and sending one now. Only
 * the person queues: a chat's own agent can't add to it or send from it.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod/v4';
import { ActionError } from '@/lib/actions/types';
import { toChatEventDTO } from '@/lib/api/dto/chat-event';
import { actorFromRequest } from '@/lib/auth/actor';
import { viewerProcedure as p, router } from '@/lib/trpc/init';
import { listQueue, queueMessage, removeFromQueue, sendQueuedNow } from './message-queue';

const id = z.string().min(8).max(100);
const attachment = z.object({
  fileName: z.string().min(1).max(300),
  originalName: z.string().max(1_000),
  mimeType: z.string().max(300),
  size: z.number().finite().nonnegative(),
  uploadedAt: z.string().max(64),
}).strict();
const MAX_DRAFT_BYTES = 2_000_000;
const draft = z.record(z.string(), z.unknown()).nullable()
  .refine((value) => value === null || JSON.stringify(value).length <= MAX_DRAFT_BYTES, 'This message is too long to queue.');

const person = p.use(({ ctx, next }) => {
  if (actorFromRequest(ctx.request.headers).source === 'ai') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a person can queue messages or send them.' });
  }
  return next();
});

async function operation<T>(run: () => T | Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof ActionError) {
      throw new TRPCError({
        code: error.code === 'not_found' ? 'NOT_FOUND' : error.code === 'invalid_params' ? 'BAD_REQUEST' : error.code === 'unsupported' ? 'FORBIDDEN' : 'CONFLICT',
        message: error.message,
      });
    }
    throw error;
  }
}

export const messageQueueRouter = router({
  list: p.input(z.object({ sessionId: id }).strict()).query(({ input }) => operation(() => listQueue(input.sessionId))),
  /**
   * Queue a message. `connectedAppContext` names the app views attached to it,
   * frozen now, as a sent message's would be. `sendNow` sends it at once
   * (⌘Enter on a harness that can't take a message mid-turn).
   */
  add: person.input(z.object({
    sessionId: id,
    id,
    content: z.string().min(1).max(1_000_000),
    attachments: z.array(attachment).max(100).default([]),
    draft: draft.default(null),
    connectedAppContext: z.array(z.object({ viewId: z.uuid(), revision: z.number().int().nonnegative() }).strict()).max(8).optional(),
    sendNow: z.boolean().optional(),
  }).strict()).mutation(({ input, ctx }) => operation(async () => {
    let appContext: unknown[] | null = null;
    if (input.connectedAppContext?.length) {
      try {
        const frozen = await (await import('@/lib/mcp-apps/service')).freezeConnectedContext(input.sessionId, ctx.key!.apiKeyId, input.connectedAppContext);
        if (frozen.context.length) appContext = frozen.context;
      } catch (error) {
        throw new ActionError('conflict', error instanceof Error ? error.message : 'App context is unavailable.');
      }
    }
    const queued = queueMessage({
      chatSessionId: input.sessionId,
      id: input.id,
      content: input.content,
      attachments: input.attachments,
      draft: input.draft,
      appContext,
      apiKeyId: ctx.key?.apiKeyId ?? null,
      sendingNow: input.sendNow,
    });
    if (!input.sendNow) return { queued, sent: null };
    const sent = await sendQueuedNow(input.sessionId, queued.id, actorFromRequest(ctx.request.headers));
    return { queued, sent: toChatEventDTO(sent) };
  })),
  /** Delete a queued message, or take it back to edit. Returns it, or null once it has left the queue. */
  remove: person.input(z.object({ sessionId: id, id }).strict()).mutation(({ input }) => operation(() => removeFromQueue(input.sessionId, input.id))),
  /** Send a queued message now. On a harness that can't take one mid-turn, the turn stops first. */
  sendNow: person.input(z.object({ sessionId: id, id }).strict()).mutation(({ input, ctx }) => operation(async () =>
    toChatEventDTO(await sendQueuedNow(input.sessionId, input.id, actorFromRequest(ctx.request.headers))))),
});

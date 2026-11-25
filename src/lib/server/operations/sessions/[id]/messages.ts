import { chatEventProjector } from '@/lib/team/chat-event-view';
import { getRequestKey } from '@/lib/auth/request-key';
import type { Attachment } from '@/db/types';
import { toChatEventDTO } from '@/lib/api/dto/chat-event';
import { actorFromRequest } from '@/lib/auth/actor';
import { getChatEventById, getChatSessionWithExecution } from '@/lib/db/queries';
import { IMPORT_MIRROR_REFUSAL, isImportMirror } from '@/lib/import/mirror';
import { SESSION_CREDENTIAL_HEADER, verifySessionCredential } from '@/lib/actions/session-credential';
import { reply, type OperationContext } from '@/lib/server/operation';
import { admitNewMessage, sendHumanMessage } from '@/lib/sessions/send-message';
import { z as rpcZ } from 'zod/v4';
import { memberMessage } from '@/lib/sessions/member-message';
import { executionOperationFailure } from '@/lib/workspaces/access';

interface PostBody {
  connectedAppContext?: {viewId: string; revision: number}[];
  content?: string;
  /**
   * Files attached to this message — same `Attachment` shape as
   * tasks/notes/areas use. Marker tokens in `content`
   * (`[[file:<fileName>]]`) point at entries here. The shape (no
   * `content` field) reflects that the bytes already live on disk —
   * the upload happened via `POST /api/attachments` before submit.
   */
  attachments?: Attachment[];
  /**
   * Optional client-minted UUIDv7 for the resulting `chat_events` row.
   * When provided, the persisted row and any optimistic UI placeholder
   * the client already inserted share the same id, so the React
   * reconciler keeps the same DOM node when the POST resolves (no
   * unmount/remount flash). When omitted, the server mints a UUIDv7.
   */
  id?: string;
}

/**
 * Send a user message into an execution session.
 *
 * Fire-and-forget: persist the user row, kick off `executor.dispatch`,
 * return 201 immediately. Assistant text, tool calls, and the
 * run-completion event flow into `chat_events` from the adapter's
 * `onEvent` callback over the next seconds-to-minutes.
 *
 * This is Send now. A message posted while the chat is working goes
 * straight to the harness, which takes it into the turn under way (Claude
 * drains it at its next step, Codex steers the active turn). A message the
 * person queues instead waits in the chat's queue and is sent through the
 * same `sendHumanMessage` when its turn comes (docs/message-queue.md).
 *
 * The one provider-level gate lives inside `executor.dispatch`: it
 * throws `already_running` if the harness's `capabilities.concurrentSend`
 * is false (Cursor, OpenCode, Antigravity). The composer queues there
 * instead, and Send now stops the turn first (`sendQueuedNow`).
 */
export async function POST(rpcInput: rpcZ.infer<typeof POSTInput>, request: OperationContext) {
  try {
    const { id } = rpcInput.params;
    const body: PostBody = rpcInput.body;
    const content = body.content?.trim();
    const attachments = body.attachments ?? [];
    if (!content) {
      return reply({ error: 'content is required' }, { status: 400 });
    }

    const session = getChatSessionWithExecution(id);
    if (!session) return reply({ error: 'Session not found' }, { status: 404 });
    if (session.surfaceKind === 'result_review') {
      return reply({ error: 'An assigned background reviewer cannot receive ordinary continuation messages. Use the result actions for another review, or answer its pending question through the existing input controls.' }, { status: 409 });
    }
    const shared = await memberMessage(getRequestKey(request.headers), id, { ...body, content });
    if (shared) return reply(chatEventProjector(getChatSessionWithExecution(id))(shared.message!)!, { status: 201 });
    if (session.status === 'archived') {
      // Stale state — `ExecutionView` auto-resumes archived sessions on
      // mount via `useContinueSession`, so the canonical UI flow never
      // reaches this branch. Hitting it means the client raced ahead of
      // the resume mutation (or this is a direct API call from a stale
      // tab). Reject cleanly; the frontend's session invalidation will
      // catch it on the next refetch.
      return reply({ error: 'Cannot send to an archived session' }, { status: 400 });
    }
    // Before the message is saved, so a refused send leaves nothing behind.
    if (isImportMirror(session)) {
      return reply({ error: 'session_is_import', message: IMPORT_MIRROR_REFUSAL }, { status: 409 });
    }

    // Skip pre-flight for retries (client re-POSTs the same body.id
    // after a transient failure). The original send already cleared
    // the gates; rejecting the retry here would surface a 409 to the
    // user while their original message is still in flight inside the
    // executor — confusing and wrong. The orphan-healing path below
    // (via `healthCheckSession`) handles the actual re-dispatch
    // decision. `getChatEventById` is a cheap PK lookup.
    // A message another chat sent (message_agent, delegate_work)
    // carries that chat's signed credential. Verified, never trusted as a
    // bare id, so a client can't make a message look like it came from a
    // chat that didn't send it. See src/lib/actions/session-credential.ts.
    const senderSessionId = verifySessionCredential(request.headers.get(SESSION_CREDENTIAL_HEADER));
    // Who is sending, for the command a connected device gets (P2.6).
    const actor = actorFromRequest(request.headers);
    if (senderSessionId === id) {
      return reply({ error: 'A chat cannot send a message to itself.' }, { status: 400 });
    }

    if (senderSessionId) return reply({ error: 'Use message_agent or delegate_work for inter-chat sends so approval, Hold and durable delivery are enforced.' }, { status: 409 });

    const existing = body.id ? getChatEventById(body.id) : null;
    if (existing && (existing.sessionId !== id || existing.role !== 'user' || existing.source !== 'user' || existing.content !== content || (existing.senderSessionId ?? null) !== senderSessionId))
      return reply({ error: 'This message ID already belongs to different content or a different chat.' }, { status: 409 });
    const isExistingRetry = !!existing;
    if (!isExistingRetry) {
      const refused = await admitNewMessage(id, content);
      if (refused) return refused;
    }

    let connectedContext: unknown = null;
    // A global screen's context this chat may not use is left off, and the response names it.
    let connectedContextSkipped: { viewId: string; app: string; reason: string }[] = [];
    if (body.connectedAppContext?.length && !isExistingRetry) {
      try {
        const key = getRequestKey(request.headers);
        if (key?.scope !== 'viewer') return reply({error: 'App context requires the viewing owner'}, {status: 403});
        const frozen = await (await import('@/lib/mcp-apps/service')).freezeConnectedContext(id, key.apiKeyId, body.connectedAppContext);
        if (frozen.context.length) connectedContext = frozen.context;
        connectedContextSkipped = frozen.skipped;
      } catch (error) { return reply({error: error instanceof Error ? error.message : 'App context is unavailable'}, {status: 409}); }
    }
    const sent = await sendHumanMessage(session, { id: body.id, content, attachments, senderSessionId, actor, connectedContext, isExistingRetry });
    if (!sent.ok) return sent;
    const row = sent.row;

    // Same projection as GET /events and the SSE stream. This row lands in
    // the same client cache as those, so it has to carry the same fields.
    // `connectedContextSkipped` names any app context left off, so the
    // composer can say so rather than the person believing it went.
    return reply({ ...toChatEventDTO(row), ...(connectedContextSkipped.length ? { connectedContextSkipped } : {}) }, { status: 201 });
  } catch (err) {
    const denied = executionOperationFailure(err);
    if (denied) return denied;
    console.error('[POST /api/sessions/:id/messages]', err);
    return reply({ error: String(err) }, { status: 500 });
  }
}

export const POSTInput = rpcZ.object({ params: rpcZ.object({ "id": rpcZ.string().min(1) }).strict(), body: rpcZ.object({ "content": rpcZ.string().optional(), "attachments": rpcZ.array(rpcZ.object({ "fileName": rpcZ.string(), "originalName": rpcZ.string(), "mimeType": rpcZ.string(), "size": rpcZ.number().finite(), "uploadedAt": rpcZ.string() }).strict()).optional(), "id": rpcZ.string().optional(), "connectedAppContext": rpcZ.array(rpcZ.object({viewId: rpcZ.uuid(), revision: rpcZ.number().int().nonnegative()}).strict()).max(8).optional(), "appContext": rpcZ.object({viewId: rpcZ.uuid(), revision: rpcZ.number().int().nonnegative()}).strict().optional() }).strict().default({}) }).strict();

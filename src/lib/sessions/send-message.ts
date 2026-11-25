/**
 * Saving and sending a person's message to their chat: the path a typed
 * message takes (`POST /api/sessions/[id]/messages`) and the one a queued
 * message takes when its turn comes (docs/message-queue.md). Both run the
 * same checks, write the same row and dispatch the same way, so a queued
 * message is in every way the message it would have been if typed then.
 */
import type { Attachment, ChatEventRecord, WorkerCommandActor } from '@/db/types';
import { parseSlashInvocation } from '@/lib/agent-skills/parse-invocation';
import { expandMarkers } from '@/lib/attachments/expand-markers';
import { SourceError } from '@/lib/chat-sources/service';
import {
  agentRequestMessageRefusal,
  failAgentRequestForMessage,
  failConversationMessage,
  getChatEventById,
  getChatSessionWithExecution,
  getExecution,
  insertChatEvent,
  materializeEventRefs,
  queueConversationHumanMessage,
  recordSkillUse,
  skipOnboardingStepOnScreen,
} from '@/lib/db/queries';
import { expandEntityMarkers } from '@/lib/entity-refs/expand-markers';
import * as executor from '@/lib/executor/adapter';
import { healthCheckSession, recordSendRefused } from '@/lib/executor/health';
import { budgetGate } from '@/lib/runs/budget';
import { ensureWorktreeReady } from '@/lib/runs/dispatch';
import { chatSources } from '@/lib/server/chat-sources';
import { reply, type OperationFailure } from '@/lib/server/operation';
import { deriveAndSetSessionLabel } from '@/lib/sessions/derive-label';
import { withSenderLabel } from '@/lib/sessions/sender';

type ChatSession = NonNullable<ReturnType<typeof getChatSessionWithExecution>>;

/**
 * The checks a new message passes before it's saved: the sources it names
 * are reachable, and the month's budget isn't spent. A retry of a message
 * already saved skips them. Returns the refusal, or null to go ahead.
 */
export async function admitNewMessage(chatSessionId: string, content: string): Promise<OperationFailure | null> {
  try { await chatSources.preflight(chatSessionId, content); }
  catch (error) {
    if (error instanceof SourceError) return reply({ error: error.message, code: error.code, sources: error.sources }, { status: 409 });
    throw error;
  }

  // We deliberately do NOT gate manual sends on a run already in
  // flight against this execution. Concurrent sends are a first-class
  // feature — the composer accepts them mid-turn and the provider's
  // native queue absorbs them (Claude drains them as `<system-reminder>`
  // attachments on the next tool result; Codex merges them into the
  // active turn). The earlier execution-level mutex pre-flight rejected
  // a user's own in-flight turn with a misleading "a scheduled run is in
  // flight" 409 — it couldn't tell the user's own `trigger='manual'` run
  // apart from a real peer/scheduled one. Trigger-vs-trigger worktree
  // contention is still governed separately by each trigger's
  // `concurrencyPolicy` in `runs/dispatch.ts`; that path is untouched.
  //
  // Budget is the one pre-flight that remains. The executor's `dispatch`
  // is fire-and-forget below, so a throw there only lands as a server-
  // side log while the client gets a (false) 201 and shows a "sent"
  // message the agent never saw. Surfacing the budget block at request
  // time keeps the UI honest.
  if (budgetGate() === 'block') {
    return reply(
      {
        error: 'budget_exceeded',
        message:
          'Monthly budget exceeded. Raise the budget in Settings, or re-send with the explicit over-budget confirmation.',
      },
      { status: 402 },
    );
  }
  return null;
}

export interface HumanMessageInput {
  /** The client's id for the message, or a queued message's. Minted when absent. */
  id?: string;
  content: string;
  attachments: Attachment[];
  senderSessionId: string | null;
  /** Who is sending, for the command a connected device gets (P2.6). */
  actor: WorkerCommandActor;
  /** App context frozen for this message, saved as its `raw`. */
  connectedContext: unknown;
  /** The row exists already: health's orphan logic decides whether it goes. */
  isExistingRetry: boolean;
  /** Called once a new row is saved, in the same tick. */
  onSaved?: (row: ChatEventRecord) => void;
}

/**
 * Save the message and start sending it. Resolves with the saved row as soon
 * as it's written: the dispatch carries on without the caller, and a refusal
 * after that is written into the chat (`recordSendRefused`).
 */
export async function sendHumanMessage(session: ChatSession, input: HumanMessageInput): Promise<{ ok: true; row: ChatEventRecord } | OperationFailure> {
  const id = session.id;
  const { content, attachments, senderSessionId, actor, connectedContext, isExistingRetry } = input;
  // Held from the moment a fresh message is saved until its dispatch has it.
  let releaseMessage: (() => void) | null = null;
  try {
    const requestRefusal = agentRequestMessageRefusal(input.id);
    if (requestRefusal) return reply({ error: requestRefusal }, { status: 409 });

    // Self-heal in-memory state before dispatch. Catches the dead
    // cached `agentSession` case so the next send doesn't silently
    // throw "Session is closed."
    //
    // Before the message is saved, so the check sees the chat as it was
    // rather than this message, which isn't an orphan: it's on its way.
    //
    // On a fresh send: `redispatchOrphans:false` because this route
    // is about to dispatch the same content — letting health also
    // dispatch would double-fire.
    //
    // On a retry (the row already exists): `redispatchOrphans:true`. We
    // DON'T fire route-level dispatch below; instead we delegate to
    // health's orphan logic, which leaves alone a message its original
    // send is still preparing (`isMessageBeingPrepared`), lets a second
    // dispatch wait on one already sending, and redispatches one that
    // never went.
    try {
      await healthCheckSession(id, { redispatchOrphans: isExistingRetry });
    } catch (err) {
      console.error(`[send message] pre-send health check failed for ${id}:`, err);
    }

    // Persist the user event with the *marker* version of content. The
    // expanded version (with paste content inlined) goes only to the
    // agent — keeping the row compact prevents giant pastes from
    // bloating the events cache. The transcript renderer parses markers
    // out and substitutes file chips on render.
    //
    // PK conflict path: the client-minted `id` is the optimistic-UI
    // primary key, so retries (useRetrySend) carry the same id as the
    // original send. `insertChatEvent` uses `onConflictDoNothing`, so
    // a re-POST of an already-persisted row returns null. That's not
    // a failure — fetch the existing row and return 201 to match the
    // DB's idempotent semantics on the HTTP boundary. The dispatch
    // decision happens below: on retry we delegate to the health
    // check's orphan logic instead of unconditionally firing.
    const inserted = insertChatEvent({
      ...(connectedContext ? { raw: { connectedAppContext: connectedContext } } : {}),
      id: input.id,
      sessionId: id,
      role: 'user',
      source: 'user',
      senderSessionId,
      content,
      attachments,
      createdAt: new Date().toISOString(),
    });
    const isRetry = inserted === null;
    const row = inserted ?? (input.id ? getChatEventById(input.id) : null);
    if (!row) {
      // Insert reported a conflict but the row isn't queryable —
      // means a write torn between sessions or schema drift.
      return reply({ error: 'failed to persist user message' }, { status: 500 });
    }
    if (!isRetry) queueConversationHumanMessage(id, row.id);

    if (row.sessionId !== id || row.content !== content || row.role !== 'user' || row.source !== 'user' || (row.senderSessionId ?? null) !== senderSessionId)
      return reply({ error: 'This message ID already belongs to different content or a different chat.' }, { status: 409 });

    // Same tick as the save, so nothing else reads the message in two places.
    if (!isRetry) input.onSaved?.(row);

    // In the same tick as the save: from here the message is this send's,
    // until `dispatch` reserves it. Opening a new chat runs recovery while
    // its worktree is still being made, and recovery used to take the
    // message for an orphan, send it ahead of the worktree, and say it
    // wasn't sent ("Session has no resolvable cwd") as this send went on to
    // deliver it.
    if (!isRetry) releaseMessage = executor.beginMessagePreparation(row.id);

    // A person who writes in the chat instead of answering the first-run
    // question on screen there has passed it over: it's skipped, and the rest
    // come back on their next new chat (docs/main-chat-onboarding.md). Only
    // their own message counts, never one another chat sent.
    if (!isRetry && !senderSessionId) {
      try {
        skipOnboardingStepOnScreen(id);
      } catch (err) {
        console.warn(`[send message] skipOnboardingStepOnScreen failed:`, err);
      }
    }

    // Materialize entity references (task/note/scratchpad) into chat_refs
    // so reverse-lookup UIs ("which sessions reference this note?") and
    // the references slide-over both work. Idempotent on retries.
    if (!isRetry) {
      try {
        materializeEventRefs(row.id, id, content, { createdBy: 'user' });
      } catch (err) {
        console.warn(`[send message] materializeEventRefs failed:`, err);
      }
    }

    // Teach the `/` menu which skills this user actually reaches for. Recorded
    // here rather than on menu selection because this is the only point every
    // surface funnels through, and because the signal we want is "invoked",
    // not "highlighted" — typing `/impl` from muscle memory without ever
    // opening the popup should still count, and picking a skill then deleting
    // it should not. Skipped on retry so a re-POST can't double count.
    if (!isRetry) {
      const invoked = parseSlashInvocation(content);
      if (invoked) {
        try {
          recordSkillUse(invoked);
        } catch (err) {
          console.warn(`[send message] recordSkillUse failed:`, err);
        }
      }
    }

    // Expand markers once, off the response path. Both label derivation
    // and the agent dispatch use the same expanded prompt. Two passes:
    // entity markers (task / note / scratchpad) first — they expand to
    // inline `<task>` / `<note>` / `<scratchpad>` tags. File markers
    // second — the ones the agent can't read itself expand to `<attachment>`
    // text. The rest stay markers, which dispatch turns into paths on the
    // device the chat runs on.
    const entityExpanded = expandEntityMarkers(content, id);
    const expanded = await expandMarkers(entityExpanded, attachments);
    // First-message titling is for task-shaped threads (executions, content):
    // their first message IS the intent. Coordinator chats are
    // relationship-shaped — intent drifts, so they stay unlabeled while live
    // and get a retrospective summary at archive time instead
    // (`deriveRetrospectiveLabel`). Naming starts in onTaken below.

    // Dispatch the *expanded* content to the agent. Fire-and-forget;
    // failures surface via logs and the runtime-status indicator.
    // Skip on retry — the health check already decided whether to
    // redispatch via the orphan path.
    if (!isRetry) {
      // Held until `dispatch` reserves it, or, refused before that, until
      // the refusal is written.
      const releaseOwnMessage = releaseMessage ?? (() => {});
      releaseMessage = null;
      // Cover the accepted-message -> worktree/provider preparation gap. The
      // nested dispatch takes its own reference, so the runtime flag remains
      // true until both preparation and the actual root turn have settled.
      const preparationRef = executor.beginDispatchPreparation(id);
      // Released once: when a message to a device elsewhere is saved in its
      // queue (from then on its delivery state and the worker say what the
      // chat is doing), or when the dispatch settles.
      let held = true;
      const release = () => {
        if (!held) return;
        held = false;
        executor.endDispatchPreparation(id, preparationRef);
      };
      // Self-heal a missing worktree before dispatching. A git execution
      // can outlive its worktree directory (out-of-band `git worktree
      // remove`/`prune`, a multi-device home where `.work` wasn't synced,
      // dev resets). `resolveCwd` now refuses to run the agent in the
      // workspace's source checkout in that state — so without this the
      // turn would dead-end with `invalid_state`. Reprovisioning here (the
      // same guard the scheduled path runs) recreates the worktree so the
      // message lands in an isolated tree, never the main repo. The
      // existsSync fast-path inside makes this a no-op on the hot path.
      // Refused before anything took it: the chat says why, rather than
      // the message sitting there with no answer and no reason.
      let taken = false;
      // Final: orphan recovery never sends a refused message again (`SEND_REFUSED_SUBTYPE`).
      const refused = (reason: string) => {
        if (taken) return;
        recordSendRefused(id, row.id, reason);
        failConversationMessage(row.id, reason);
        if (failAgentRequestForMessage(row.id, reason)) {
          void import('@/lib/coordination/service').then(({ drainAgentCoordination }) => drainAgentCoordination());
        }
      };
      void (async () => {
        try {
          const execution = session.executionId ? getExecution(session.executionId) : undefined;
          const ready = await ensureWorktreeReady(id, execution ?? null);
          if (!ready.ok) {
            console.error(
              `[send message] worktree not ready for ${id}: ${ready.error}`,
            );
            refused(`This message wasn't sent: ${ready.error}`);
            return;
          }
          // Labeled with the sending chat when another chat sent it. The
          // stored event keeps the message as sent, and its title is
          // derived from that content without the sender label.
          await executor.dispatch(id, withSenderLabel(expanded, row.senderSessionId), {
            sourceEventId: row.id,
            attachments,
            actor,
            onQueued: release,
            onTaken: () => {
              taken = true;
              // The live runner now exists, or its send is queued ahead of naming.
              if (!session.label && session.type !== 'coordinator') {
                void deriveAndSetSessionLabel(id, expanded, session.harness);
              }
            },
          });
        } finally {
          release();
        }
      })().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[send message] dispatch failed for ${id}:`, msg);
        refused(msg);
      }).finally(releaseOwnMessage);
    }

    return { ok: true, row };
  } finally {
    // Failed before its dispatch took it: a retry of it is recovery's to send.
    releaseMessage?.();
  }
}

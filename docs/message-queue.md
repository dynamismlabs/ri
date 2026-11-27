# Message queue

Status: built (2026-11-24). Replaces the fire-and-forget model of
`docs/conductor-migration-spec.md` for personal chats. The earlier chip
queue (`docs/message-queue-spec.md`) and the per-message cancel idea
(`docs/queue-cancel-future-spec.md`) are history.

## What the person sees

While a chat is working, a message they send waits in a queue above the
message box instead of going to the agent. When the turn finishes, the home
sends the first queued message as the chat's next message, then the next,
one per turn. Each queued message has **Send now**, **Edit** and **Delete**.

| Key | Chat idle | Chat working |
| --- | --- | --- |
| Enter (or the send button) | Send | Queue |
| ⌘Enter | Send | Send now |

Hovering the send button while the chat works shows both, with their keys.
The placeholder names ⌘↩ while the chat works, since Enter's new meaning is
the one the person would otherwise have to discover. On a touch device Enter
adds a line and the button queues. Send now is on the queued row.

**Send now** means "the agent gets this now":

- Claude Code and Codex take a message mid-turn (`concurrentSend`). Claude
  drains it at its next tool boundary, and Codex's `turn/start` steers the
  active turn. Nothing stops.
- Cursor, OpenCode and Antigravity take one message at a time. Send now stops
  the turn (as Stop does, `executor.abort` with the person as actor), waits
  for the chat to go quiet, then sends.

Before this, every mid-turn send was Send now on Claude and Codex, and was
refused on the other harnesses. The chip queue removed in the Conductor
migration lost steering, which is why it went. Having both fixes that.

## When the queue moves

One rule: **the queue sends its next message when the chat is quiet after a
turn that finished normally.**

- *Quiet* is coordination's reading: no turn in flight, no background tasks,
  no send still on its way to a device elsewhere.
- *Finished normally* is the turn's result: `ok` and not `stopped`. A turn
  the person stopped, or one that failed, holds the queue. Stop usually
  means something went wrong, so the next message shouldn't go out on its
  own. The rows stay with Send now, and the strip says "Paused".
- Sending a queued message holds the queue again until that message's turn
  finishes normally. So it's one per turn, and a message refused before it
  ever ran (and the quiet moment its refusal makes) never pulls the rest
  after it.
- A message queued after the chat already went quiet from a finished turn
  goes at once. That's the race where the client still showed "working".
- After a restart nothing is known about the last turn (the turn under way
  was interrupted anyway), so the queue waits for the person.

The state is one in-memory map, `message-queue-state.ts` (`processState`),
written by `executor/apply.ts` as each `turn_result` lands and read there
before asking the queue. Apply asks twice, when the result lands and when
the chat goes quiet (`scheduleQuietWorkResultDispatch`), because either can
come second.

Apply asks through `message-queue-state.ts` too (`drainQueue`), never by
importing `message-queue.ts`: the send path leads back to apply, and that
loop, loaded as its own chunk, makes Turbopack's Windows production build
panic. The queue gives its sender there when it loads
(`provideQueueSender`), and the home's startup (`instrumentation.ts`) loads
it, so the queue moves with no screen open.

## Where it lives

The queue is on the home, in `queued_messages`, never in the browser. A
client is a viewer (the person queues "then write the tests" and closes the
laptop), and every screen showing the chat, phone included, sees the same
queue through the session stream's `queue` frame.

| Piece | File |
| --- | --- |
| Table | `queued_messages` in `src/lib/db/schema.ts`, migration `0043_message-queue` |
| Queries | `src/lib/db/queued-message-queries.ts` (re-exported from `queries.ts`) |
| Rules: add, remove, drain, send now | `src/lib/sessions/message-queue.ts` |
| Last turn's ending | `src/lib/sessions/message-queue-state.ts` |
| Procedures (`messageQueue.list/add/remove/sendNow`) | `src/lib/sessions/message-queue-router.ts` |
| The send itself | `src/lib/sessions/send-message.ts`, shared with `POST /messages` |
| Client hooks | `src/hooks/use-message-queue.ts` |
| Strip | `src/components/chat-ui/queue/message-queue-strip.tsx` |
| Composer routing | `src/components/executions/composer-send-route.ts` |

A row keeps the message as a sent one would: marker `content`,
`attachments` (counted by the attachment sweep, so a queued file is never
archived), app context frozen when it was queued (sent as the message's
`raw`), and the key it was queued with (the actor's `apiKeyId` for a
connected device). It also keeps the composer's document (`draft`), so Edit
puts the message back with its chips exactly as typed. Its id is minted by
the client, makes a retried add a no-op, and becomes the sent message's
`chat_events` id. It leaves the queue in the same tick it's saved as a
message (`onSaved`), so no screen sees it in both places.

## Sending

A queued message goes through `sendHumanMessage`, the second half of
`POST /api/sessions/[id]/messages`, with `admitNewMessage` (sources reachable,
budget not spent) in front of it. So it's in every way the message it would
have been if typed then: same checks, same row, same side effects (read
refs, skill use, onboarding), same dispatch and refusal handling. If the
chat refuses it at admission (budget spent, a named source gone), it stays
queued, the chat gets one error line saying why, and the queue holds.

The drain marks the chat working (`beginDispatchPreparation`) before its
first await, so nothing else sends into the chat while the send is prepared,
and a per-chat `sending` set keeps two quiet edges from sending twice.

## Scope

- Personal chats only. A team's shared chat already queues: each member's
  message is a turn in `team_chat_turns`, run one at a time, shown in the
  transcript with its own cancel. The composer keeps the ordinary send there
  (`ChatCapabilities.messageQueue: false`, and the procedures are
  viewer-only). Moving those into the strip would mean Send now steering
  another member's turn, which is a separate decision.
- Only the person queues. Messages from other chats and schedules keep their
  own delivery (coordination, `coalesce_if_active`).
- No reordering. Edit and queue again to move one to the end.
- Claude's "Send in a forked session" isn't offered: Ri has no fork.

/**
 * Progress notes: what an agent writes mid-turn about what it found and what
 * it will do next. Codex sends them as commentary messages, and Claude as
 * progress updates (agentex reports both as `phase: "commentary"`).
 *
 * A note is a message for the person, so the transcript shows it like any
 * other, a main chat reading the chat sees it, and it counts as activity. It
 * is never the turn's answer: not an outcome for Unread, a review target, a
 * delegated request's or a conversation thread's reply, a turn notification
 * or a run summary. A turn that ends without an answer says so rather than
 * passing off its last note as one.
 *
 * Rows stored before `chat_events.phase` existed have none, so an older note
 * still counts as an answer, as it always did.
 */
export const PROGRESS_NOTE_PHASE = 'commentary';

export function isProgressNote(event: { source: string; phase?: string | null }): boolean {
  return event.source === 'agent' && event.phase === PROGRESS_NOTE_PHASE;
}

# Thinking and progress updates from Claude and Codex

**Status:** current as of 2026-11-24 (agentex 0.0.54, Claude Code 2.1.331, codex-cli 0.171.0).
This replaces the June 2026 spec that asked agentex to capture Claude's thinking prose. That
prose is gone for good, and the text that does arrive in Claude's thinking blocks turned out to
be messages for the person.

## What each harness returns

**Claude (Opus 5.5 and other models with progress updates).** Claude Code requests
`thinking: {type: "adaptive", display: "updates"}` by default. In that mode:

- The reasoning block always comes back empty: `{"type":"thinking","thinking":"","signature":"…"}`.
  The API never returns the raw chain of thought on current models.
- The notes the model writes between tool calls ("b.txt shows the refund came first, so that's
  the first inconsistency. Checking c.txt next.") come back as their own `thinking` block with
  text, right before the `tool_use` they introduce. They are written for the person.
- Shorter notes still come back as ordinary `text` blocks. Both are user-facing narration.
- Claude Code names the mode on each line that holds a thinking block: `thinking_display: "updates"`
  on the live stream-json stream (including `stream_event` wrappers) and `thinkingDisplay:
  "updates"` in the transcript it writes under `~/.claude/projects`.

Measured on 60 recent transcripts: 5,593 empty thinking blocks, 728 with text, every one of those
followed by a tool call, median 202 characters. Ordinary text notes in the same turns: 1,664,
median 133 characters.

**Codex.** Every reasoning item in Oct and Nov 2026 rollouts has an empty summary. What Codex
writes for the person while working is an assistant `message` with `phase: "commentary"`, and the
answer is `phase: "final_answer"`.

## How agentex reports them

- A Claude thinking block with text, on a line whose display mode is `"updates"`, becomes an
  `assistant` event with `phase: "commentary"`, the same shape as Codex commentary. This holds
  for live sessions, one-shot runs and saved transcripts read through local history, since they
  share one parser. With `includePartialMessages`, its deltas are `assistant_delta` with
  `phase: "commentary"` and the consolidated event's `messageId`.
- Empty thinking blocks stay `thinking` with empty text. A thinking block in any other display
  mode, or with none (older transcripts that held full reasoning, `"summarized"`), stays
  `thinking`.
- Claude one-shot summaries come from the result text and never include the notes.

## How Ri shows them

- Commentary from either harness is an `agent` row with `phase: 'commentary'`
  (`chat_events.phase`, migration 0042), so it renders as an ordinary message: full length,
  visible after the turn folds its tool calls away, read by a main chat checking on the chat
  (`condenseEvents`), and counted as activity for the rail.
- It is never the turn's answer (`isProgressNote`, `src/lib/executions/progress-note.ts`): not an
  outcome for Unread, not the review target and refused as one, not a delegated request's or a
  Slack thread's reply, not the turn notification, run summary or hover preview, and it gets no
  "prepare result" actions. A turn that ends after a note without an answer says it finished
  without a text answer. Ordinary Claude text between tool calls has no phase and still counts,
  as it always did.
- Empty `thinking` rows are stored but never rendered (`filterRenderable`). A `thinking` row with
  text, from an older transcript or another harness, renders as the dim, collapsible thinking row.
- Rows stored before agentex 0.0.54 keep their `thinking` source, and older Codex commentary rows
  have no phase, so they still count as answers. Re-reading an old transcript doesn't duplicate
  them: chat events dedupe on session, event id and part index, not source.

`src/lib/executor/adapter.claude-progress-updates.test.ts` runs a real transcript through
agentex's reader and Ri's mapping. `src/lib/executions/progress-note.test.ts` and the progress
note cases in the coordination and Slack conversation tests check that a note is never an answer.

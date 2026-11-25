import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getProvider, type LocalHistoryYield } from '@agentex/agent';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChatEventRecord } from '@/db/types';
import type { ChatEventRecord as ChatEventDTO } from '@/lib/api/dto/records';
import { condenseEvents } from '@/lib/actions/session-oversight';
import { buildTranscriptNodes } from '@/components/chat-ui/activity/transcript-grouping';
import { historyEventInput } from '@/lib/import/history-source';
import { CLAUDE_PROGRESS_UPDATE_TRANSCRIPT } from './claude-progress-updates.fixture';

/**
 * Claude Code asks for `thinking.display: "updates"`, so the notes Claude
 * writes between tool calls ("b.txt shows the refund came first, checking
 * c.txt next") arrive as thinking blocks with text. They are written for the
 * person, so agentex 0.0.54+ reports them as assistant text with
 * `phase: "commentary"` (Codex's shape for the same thing), and Ri stores them
 * as agent messages. This runs a real transcript through agentex's own reader
 * and the mapping Ri uses to import and re-sync transcripts (the live stream
 * goes through the same agentex parser and the same `parseStreamEvent`), so it
 * fails if either side files a note as thinking.
 */

/** The text of every thinking block that carries any, in order. */
const notes = CLAUDE_PROGRESS_UPDATE_TRANSCRIPT.flatMap((record) => {
  const content = (record.message as { content?: unknown } | undefined)?.content;
  if (record.type !== 'assistant' || !Array.isArray(content)) return [];
  return (content as Array<{ type?: string; thinking?: string }>)
    .filter((block) => block.type === 'thinking' && block.thinking?.trim())
    .map((block) => block.thinking!);
});

let root: string | undefined;
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
});

/** Write the transcript where Claude Code keeps it and read it back through agentex. */
async function readThroughAgentex(): Promise<LocalHistoryYield[]> {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ri-claude-progress-'));
  const sessionId = CLAUDE_PROGRESS_UPDATE_TRANSCRIPT[0]!.sessionId as string;
  const dir = path.join(root, 'projects', '-private-tmp-pu-probe3');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${sessionId}.jsonl`),
    CLAUDE_PROGRESS_UPDATE_TRANSCRIPT.map((record) => JSON.stringify(record)).join('\n') + '\n',
  );
  const history = getProvider('claude').localHistory!;
  const values: LocalHistoryYield[] = [];
  for await (const session of history.discover({ env: { CLAUDE_CONFIG_DIR: root } })) {
    for await (const value of history.read(session)) values.push(value);
  }
  return values;
}

/** Ri's rows for those events, shaped like stored records. */
async function storedRows(): Promise<ChatEventRecord[]> {
  const values = await readThroughAgentex();
  return values.flatMap((value, index) => {
    const row = historyEventInput(value.event, value.event.eventId, value.partIndex);
    if (!row) return [];
    return [{
      id: `row-${index}`,
      content: null,
      toolName: null,
      toolInput: null,
      externalToolCallId: null,
      ...row,
    } as unknown as ChatEventRecord];
  });
}

describe('Claude progress updates', () => {
  it('the transcript holds real notes, empty reasoning and ordinary text', () => {
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(CLAUDE_PROGRESS_UPDATE_TRANSCRIPT)).toContain('"thinkingDisplay":"updates"');
  });

  it('stores each note as an agent message, word for word, and no thinking row with text', async () => {
    const rows = await storedRows();
    const agentText = rows.filter((row) => row.source === 'agent').map((row) => row.content);
    for (const note of notes) expect(agentText).toContain(note);
    for (const row of rows.filter((r) => r.content && notes.includes(r.content))) {
      // Marked as a progress note: shown in the chat, never the turn's answer.
      expect(row).toMatchObject({ role: 'assistant', source: 'agent', phase: 'commentary' });
    }
    // Ordinary text between tool calls carries no phase and stays an answer candidate.
    const plain = rows.filter((r) => r.source === 'agent' && !notes.includes(r.content ?? ''));
    expect(plain.length).toBeGreaterThan(0);
    for (const row of plain) expect(row.phase ?? null).toBeNull();
    expect(rows.some((row) => row.source === 'thinking' && row.content?.trim())).toBe(false);
  });

  it('keeps every note visible once the turn is done, beside the steps it introduced', async () => {
    const rows = await storedRows();
    const nodes = buildTranscriptNodes(rows as unknown as ChatEventDTO[], { isRunning: false, density: 'condensed' });
    const visible = nodes.flatMap((node) => (node.kind === 'event' ? [node.event.content] : []));
    for (const note of notes) expect(visible).toContain(note);
    // The tool calls between notes still fold away.
    expect(nodes.some((node) => node.kind === 'group' && node.counts.toolCalls > 0)).toBe(true);
    const folded = nodes.flatMap((node) => (node.kind === 'group' ? node.events : []));
    expect(folded.some((event) => event.content && notes.includes(event.content))).toBe(false);
  });

  it('shows the notes to a main chat reading this chat', async () => {
    const condensed = condenseEvents(await storedRows());
    const read = condensed.filter((row) => row.kind === 'agent').map((row) => row.text);
    for (const note of notes) expect(read).toContain(note.trim());
  });
});

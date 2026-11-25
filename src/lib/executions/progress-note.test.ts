import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@agentex/agent';

import type { ChatSessionRecord } from '@/db/types';
import type { ChatEventRecord as ChatEventDTO } from '@/lib/api/dto/records';
import * as q from '@/lib/db/queries';
import { applyChatEvent } from '@/lib/executor/apply';
import { parseStreamEvent } from '@/lib/runner/parse';
import { turnReply } from '@/lib/notifications/turn-reply';
import { extractSummaryFromChat } from '@/lib/runs/event-hooks';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import { pickConversationMessages } from './conversation';
import { isProgressNote } from './progress-note';

/**
 * A progress note shows in the chat but is never the turn's answer. Each event
 * here goes through the live path, agentex's StreamEvent mapped by
 * `parseStreamEvent` and stored by `applyChatEvent`, as a running chat's are.
 */

// A note from a real Claude Code 2.1.331 run (claude-progress-updates.fixture.ts).
const NOTE = "b.txt shows order 1001 refunded on March 2, a day before a.txt's March 3 shipment date, so that's the first inconsistency. Checking c.txt next.\n\n";

let home: TestHome;
let wsId: string;
let session: ChatSessionRecord;
let executionId: string;
let clock = Date.parse('2999-01-01T00:00:00.000Z');

beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-progress-note-' });
  wsId = q.createWorkspace({ name: 'Orders', cwd: home.root, isGit: false, filesToCopy: [] }).id;
  executionId = q.createExecution({ workspaceId: wsId }).id;
  session = q.createChatSession({ type: 'execution', harness: 'claude', workspaceId: wsId, executionId, label: null, status: 'active' });
});
afterEach(async () => { await home.cleanup(); });

function streamed(event: Partial<StreamEvent> & { type: StreamEvent['type'] } & Record<string, unknown>): string {
  clock += 1000;
  const id = `evt-${clock}`;
  const row = parseStreamEvent(session.id, {
    providerType: 'claude', sessionId: 'native', messageId: `msg-${clock}`, eventId: id, turnId: null, parentToolCallId: null,
    timestamp: new Date(clock).toISOString(), raw: {}, ...event,
  } as StreamEvent)!;
  applyChatEvent(row, { cumulative: false, runId: null });
  return q.listChatEvents(session.id).find((e) => e.externalEventId === id)!.id;
}
/** The person's message, stored by the app as a send is (the stream never carries it). */
function user(text: string): string {
  clock += 1000;
  return q.insertChatEvent({ sessionId: session.id, role: 'user', source: 'user', content: text, createdAt: new Date(clock).toISOString() })!.id;
}
const note = (text = NOTE) => streamed({ type: 'assistant', text, phase: 'commentary' });
const answer = (text: string) => streamed({ type: 'assistant', text });
const outcomeAt = () => q.getChatSession(session.id)!.lastOutcomeEventAt;

describe('progress notes', () => {
  it('store as agent messages marked commentary', () => {
    const id = note();
    const row = q.getChatEventById(id)!;
    expect(row).toMatchObject({ role: 'assistant', source: 'agent', phase: 'commentary', content: NOTE });
    expect(isProgressNote(row)).toBe(true);
    expect(isProgressNote(q.getChatEventById(answer('Done.'))!)).toBe(false);
  });

  it('never mark the chat as having new output, while an answer does', () => {
    const before = outcomeAt();
    note();
    expect(outcomeAt()).toBe(before);
    answer('Order 1001 has three inconsistencies.');
    expect(outcomeAt()).not.toBe(before);
  });

  it('are never the review target, and a review of one is refused', () => {
    const first = answer('The earlier answer.');
    const pending = note();
    expect(q.getExecutionReviewContext(executionId).latestOutputEventId).toBe(first);
    expect(() => q.reviewExecutionOutput({ executionId, outputEventId: pending, disposition: 'accepted', actorSource: 'human' }))
      .toThrow(/not a reviewable output/);
    const final = answer('Order 1001 has three inconsistencies.');
    expect(q.getExecutionReviewContext(executionId).latestOutputEventId).toBe(final);
  });

  it('are not the turn reply, the run summary or the preview when a turn ends without an answer', () => {
    user('Check order 1001');
    note();
    expect(turnReply(session.id)).toBeNull();
    expect(extractSummaryFromChat(session.id)).toBeNull();
    const events = q.listChatEvents(session.id) as unknown as ChatEventDTO[];
    expect(pickConversationMessages(events, 10).map((e) => e.source)).toEqual(['user']);
  });

  it('leave the answer as the turn reply when one follows', () => {
    user('Check order 1001');
    note();
    answer('Order 1001 has three inconsistencies.');
    note('One more check on d.txt.');
    expect(turnReply(session.id)).toBe('Order 1001 has three inconsistencies.');
    expect(extractSummaryFromChat(session.id)).toBe('Order 1001 has three inconsistencies.');
    const events = q.listChatEvents(session.id) as unknown as ChatEventDTO[];
    expect(pickConversationMessages(events, 10).map((e) => e.content)).toEqual(['Check order 1001', 'Order 1001 has three inconsistencies.']);
  });
});

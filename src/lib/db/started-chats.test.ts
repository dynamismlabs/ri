import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';
import * as q from './queries';
import { archiveFinishedStartedChats } from '@/lib/sessions/started-chats-archive';
import { withStartedChats } from '@/lib/sessions/started-chats';
import { classifySession } from '@/lib/sessions/classification';
import { isSessionUnread } from '@/lib/utils/session-sort';
import { startedChatState } from '@/lib/sessions/started-chat-state';

let home: TestHome;
beforeEach(async () => { home = await createTestHome(); });
afterEach(async () => { await home.cleanup(); });

const NONE = new Set<string>();

function agent(name: string) {
  return q.createWorkspace({ name, cwd: home.root, isGit: false });
}

function chat(workspaceId: string, label: string) {
  const execution = q.createExecution({ workspaceId, label });
  return q.createChatSession({ harness: 'claude', type: 'execution', executionId: execution.id, workspaceId, label });
}

function mainChat(workspaceId: string) {
  return q.createChatSession({ harness: 'claude', type: 'coordinator', workspaceId });
}

/** What `delegate_work` leaves behind: the request and its initial send, pointed at the chat it started. */
function delegate(source: ReturnType<typeof q.createChatSession>, target: ReturnType<typeof q.createChatSession>, id: string, options: { executionId?: string } = {}) {
  q.createInitiatingAgentDelivery({
    id, source, sourceRunId: null, address: `agent:${target.workspaceId}`, targetSessionId: null, requestKey: id, parentRequestId: null,
    kind: 'delegation', content: 'Do the work.', options: { workspaceId: target.workspaceId!, ...options }, eventId: `${id}-event`, prompt: 'Do the work.', status: 'queued',
  });
  q.updateAgentRequest(id, { targetSessionId: target.id, status: 'working' });
  q.updateAgentDelivery(id, { targetSessionId: target.id, status: 'accepted' });
}

/** The child finished and its answer went back, after its own turn. */
function returnAnswer(id: string, target: ReturnType<typeof q.createChatSession>) {
  const run = q.createRun({ harness: 'claude', triggerKind: 'manual', chatSessionId: target.id, executionId: target.executionId, status: 'completed', queuedAt: '2026-11-20 10:00:00' });
  q.updateAgentRequest(id, { runId: run.id });
  q.finishAgentRequest(id, 'completed', 'Done.');
}

/** A person's own message in a chat, and the turn it started. */
function personWrites(target: ReturnType<typeof q.createChatSession>, id: string) {
  q.insertChatEvent({ id, sessionId: target.id, role: 'user', source: 'user', content: 'One more thing.', createdAt: new Date().toISOString() });
  q.createRun({ harness: 'claude', triggerKind: 'manual', chatSessionId: target.id, executionId: target.executionId, status: 'completed', sourceEventId: id });
}

describe('startedByForChats', () => {
  it('names the chat that started each one, by its address, kind and agent', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan the launch');
    const child = chat(shop.id, 'Draft the email');
    const main = mainChat(shop.id);
    const fromMain = chat(shop.id, 'Restock forecast');
    delegate(parent, child, 'req-chat');
    delegate(main, fromMain, 'req-main');
    q.createInitiatingAgentDelivery({
      id: 'req-main-address', source: main, sourceRunId: null, address: 'x', targetSessionId: null, requestKey: 'k', parentRequestId: null,
      kind: 'question', content: 'Not a delegation.', options: null, eventId: 'q-event', prompt: 'q', status: 'queued',
    });
    const rows = [parent, child, fromMain].map((s) => ({ id: s.id, executionId: s.executionId }));
    const found = q.startedByForChats(rows);
    expect(found.has(parent.id)).toBe(false);
    expect(found.get(child.id)).toMatchObject({ requestId: 'req-chat', sessionId: parent.id, kind: 'chat', label: 'Plan the launch', address: `session:${parent.id}`, workspaceName: 'Shop', requestStatus: 'working', archived: false });
    expect(found.get(fromMain.id)).toMatchObject({ sessionId: main.id, kind: 'agent', address: `agent:${shop.id}` });
  });

  it('marks a chat opened later in a started execution, but not an execution a delegation only joined', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const child = chat(shop.id, 'Child');
    delegate(parent, child, 'req-1');
    const later = q.createChatSession({ harness: 'claude', type: 'execution', executionId: child.executionId, workspaceId: shop.id });
    const mine = chat(shop.id, 'Mine');
    const joined = q.createChatSession({ harness: 'claude', type: 'execution', executionId: mine.executionId, workspaceId: shop.id });
    delegate(parent, joined, 'req-2', { executionId: mine.executionId! });
    const found = q.startedByForChats([later, mine, joined].map((s) => ({ id: s.id, executionId: s.executionId })));
    expect(found.get(later.id)?.requestId).toBe('req-1');
    expect(found.has(mine.id)).toBe(false);
    expect(found.get(joined.id)?.requestId).toBe('req-2');
  });
});

describe('an answer that went back', () => {
  it('is not unread or waiting until something new happens in the chat', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const child = chat(shop.id, 'Child');
    delegate(parent, child, 'req');
    q.bumpSessionOutcome(child.id, '2026-11-20T10:05:00.000Z');
    const [open] = withStartedChats([q.getChatSessionWithExecution(child.id)!]);
    expect(open!.answerReturnedAt).toBeNull();
    expect(isSessionUnread(open!)).toBe(true);

    returnAnswer('req', child);
    const [returned] = withStartedChats([q.getChatSessionWithExecution(child.id)!]);
    expect(returned!.answerReturnedAt).toBeTruthy();
    expect(isSessionUnread(returned!)).toBe(false);
    expect(classifySession(returned!, NONE, NONE)).toBeNull();
    // Waiting on you or working still shows.
    expect(classifySession(returned!, new Set([child.id]), NONE)).toBe('needsApproval');
    expect(classifySession(returned!, NONE, new Set([child.id]))).toBe('working');

    // Mark as unread brings it back.
    const marked = { ...returned!, unreadMarkerAt: new Date(Date.now() + 1000).toISOString() };
    expect(isSessionUnread(marked)).toBe(true);
    expect(classifySession(marked, NONE, NONE)).toBe('unread');

    // A person writing in it starts a new turn: from then on it reads like any chat.
    personWrites(child, 'evt-person');
    const [continued] = withStartedChats([q.getChatSessionWithExecution(child.id)!]);
    expect(continued!.answerReturnedAt).toBeNull();
  });

  it('still counts as unread when its answer never reached the chat that asked', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const child = chat(shop.id, 'Child');
    delegate(parent, child, 'req');
    returnAnswer('req', child);
    q.failAgentDelivery(q.terminalAgentDelivery('req')!.id, 'The receiving chat is archived.');
    q.bumpSessionOutcome(child.id, '2026-11-20T10:05:00.000Z');
    const [row] = withStartedChats([q.getChatSessionWithExecution(child.id)!]);
    expect(row!.answerReturnedAt).toBeNull();
    expect(isSessionUnread(row!)).toBe(true);
  });
});

describe('listStartedChats', () => {
  it('lists an execution’s started chats and a main chat’s, with what happened in each', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const working = chat(shop.id, 'Working');
    const done = chat(shop.id, 'Done');
    const yours = chat(shop.id, 'Yours');
    const failed = chat(shop.id, 'Failed');
    delegate(parent, working, 'r-working');
    delegate(parent, done, 'r-done');
    delegate(parent, yours, 'r-yours');
    delegate(parent, failed, 'r-failed');
    returnAnswer('r-done', done);
    returnAnswer('r-yours', yours);
    personWrites(yours, 'evt-yours');
    q.finishAgentRequest('r-failed', 'failed', 'The worktree couldn’t be created.');
    const main = mainChat(shop.id);
    const fromMain = chat(shop.id, 'From main');
    delegate(main, fromMain, 'r-main');

    const rows = q.listStartedChats({ executionId: parent.executionId! });
    expect(rows.map((r) => r.label).sort()).toEqual(['Done', 'Failed', 'Working', 'Yours']);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by.Working).toMatchObject({ requestStatus: 'working', answerReturnedAt: null, personWrote: false });
    expect(by.Done).toMatchObject({ requestStatus: 'completed', personWrote: false });
    expect(by.Done!.answerReturnedAt).toBeTruthy();
    expect(by.Yours).toMatchObject({ requestStatus: 'completed', personWrote: true, answerReturnedAt: null });
    expect(by.Failed).toMatchObject({ requestStatus: 'failed', outcome: 'The worktree couldn’t be created.' });

    expect(q.listStartedChats({ address: `agent:${shop.id}` }).map((r) => r.label)).toEqual(['From main']);
  });
});

describe('archiveFinishedStartedChats', () => {
  it('archives the finished ones you never wrote in, and names the ones that stay', async () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const working = chat(shop.id, 'Working');
    const done = chat(shop.id, 'Done');
    const yours = chat(shop.id, 'Yours');
    const dirty = chat(shop.id, 'Dirty');
    const waiting = chat(shop.id, 'Waiting');
    delegate(parent, working, 'r-working');
    delegate(parent, done, 'r-done');
    delegate(parent, yours, 'r-yours');
    delegate(parent, dirty, 'r-dirty');
    delegate(parent, waiting, 'r-waiting');
    returnAnswer('r-done', done);
    returnAnswer('r-yours', yours);
    returnAnswer('r-dirty', dirty);
    returnAnswer('r-waiting', waiting);
    personWrites(yours, 'evt-yours');

    const archived: string[] = [];
    const outcome = await archiveFinishedStartedChats({ executionId: parent.executionId! }, undefined, {
      live: { running: NONE, pending: new Set([waiting.id]) },
      archive: async ({ sessionId }) => {
        if (sessionId === dirty.id) throw Object.assign(new Error('dirty'), { name: 'DirtyWorktreeError' });
        archived.push(sessionId);
        return { status: 'archived' };
      },
    });
    expect(archived).toEqual([done.id]);
    expect(outcome.archived).toEqual([{ id: done.id, label: 'Done' }]);
    expect(outcome.kept).toEqual(expect.arrayContaining([
      { id: working.id, label: 'Working', reason: 'working' },
      { id: waiting.id, label: 'Waiting', reason: 'needs_you' },
      { id: dirty.id, label: 'Dirty', reason: 'uncommitted' },
    ]));
    expect(outcome.kept).toHaveLength(3);
  });
});

describe('what keeps a started chat yours', () => {
  it('counts a message you sent into its assigned turn, which starts no turn of its own', () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const child = chat(shop.id, 'Child');
    delegate(parent, child, 'req');
    const run = q.createRun({ harness: 'claude', triggerKind: 'manual', chatSessionId: child.id, executionId: child.executionId, status: 'running', queuedAt: '2026-11-20 10:00:00' });
    q.updateAgentRequest('req', { runId: run.id, status: 'working' });
    q.noteCoordinationHumanDirection(run.id, child.id);
    q.finishAgentRequest('req', 'completed', 'Done.');
    const [row] = q.listStartedChats({ executionId: parent.executionId! });
    expect(row).toMatchObject({ personWrote: true });
  });

  it('leaves alone one whose execution has another chat you opened, and the ones archived in the same pass', async () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const shared = chat(shop.id, 'Shared');
    const picked = chat(shop.id, 'Picked');
    const plain = chat(shop.id, 'Plain');
    for (const [c, id] of [[shared, 'r-shared'], [picked, 'r-picked'], [plain, 'r-plain']] as const) {
      delegate(parent, c, id);
      returnAnswer(id, c);
    }
    q.createChatSession({ harness: 'claude', type: 'execution', executionId: shared.executionId, workspaceId: shop.id });
    expect(q.listStartedChats({ executionId: parent.executionId! }).find((r) => r.label === 'Shared')?.otherChats).toBe(1);
    const archived: string[] = [];
    const outcome = await archiveFinishedStartedChats({ executionId: parent.executionId! }, undefined, {
      live: { running: NONE, pending: NONE },
      skip: new Set([picked.id]),
      archive: async ({ sessionId }) => { archived.push(sessionId); return { status: 'archived' }; },
    });
    expect(archived).toEqual([plain.id]);
    expect(outcome.kept).toEqual([]);
  });

  it('archives the finished chats its finished chats started, too', async () => {
    const shop = agent('Shop');
    const parent = chat(shop.id, 'Plan');
    const child = chat(shop.id, 'Child');
    const grandchild = chat(shop.id, 'Grandchild');
    delegate(parent, child, 'r-child');
    delegate(child, grandchild, 'r-grandchild');
    returnAnswer('r-child', child);
    returnAnswer('r-grandchild', grandchild);
    const archived: string[] = [];
    const outcome = await archiveFinishedStartedChats({ executionId: parent.executionId! }, undefined, {
      live: { running: NONE, pending: NONE },
      archive: async ({ sessionId }) => {
        archived.push(sessionId);
        q.archiveChatSession(sessionId);
        return { status: 'archived' };
      },
    });
    expect(archived).toEqual([child.id, grandchild.id]);
    expect(outcome.archived.map((a) => a.label)).toEqual(['Child', 'Grandchild']);
  });

  it('reads one archived before it answered as cancelled, never as returned', () => {
    expect(startedChatState({ sessionId: 'c', status: 'archived', requestStatus: 'working' }, { pending: NONE, streaming: NONE })).toBe('cancelled');
    expect(startedChatState({ sessionId: 'c', status: 'archived', requestStatus: 'completed' }, { pending: NONE, streaming: NONE })).toBe('returned');
  });
});

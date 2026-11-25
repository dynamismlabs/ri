/**
 * When a chat's queue sends (docs/message-queue.md): only once the chat is
 * quiet after a turn that finished normally, one message per turn, never
 * after a stopped or failed turn, and at once when the person picks Send now.
 * The database is real. The runner, the harness's capabilities and the send
 * itself are stand-ins, so each case sets the chat's state directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uuidv7 } from 'uuidv7';
import { APP_SHORT_ID } from '@/constants/app';

const live = vi.hoisted(() => ({ running: new Set<string>(), background: new Set<string>(), midTurn: true }));
const admitNewMessage = vi.hoisted(() => vi.fn(async (): Promise<unknown> => null));
const abort = vi.hoisted(() => vi.fn(async (chatSessionId: string) => { live.running.delete(chatSessionId); }));
const publishMessageQueue = vi.hoisted(() => vi.fn());
const sendHumanMessage = vi.hoisted(() => vi.fn(async (session: { id: string }, input: {
  id?: string; content: string; attachments: unknown[]; onSaved?: (row: unknown) => void;
}) => {
  const q = await import('@/lib/db/queries');
  const row = q.insertChatEvent({ id: input.id, sessionId: session.id, role: 'user', source: 'user', content: input.content, attachments: input.attachments as never });
  input.onSaved?.(row);
  return { ok: true as const, row: row! };
}));

vi.mock('@/lib/executor/adapter', () => ({
  isRunning: (id: string) => live.running.has(id),
  hasBackgroundTasks: (id: string) => live.background.has(id),
  abort,
  beginDispatchPreparation: () => ({ kind: 'preparation' }),
  endDispatchPreparation: () => {},
}));
vi.mock('@/lib/executor/devices', () => ({
  harnessCapabilitiesOn: async () => ({ concurrentSend: live.midTurn }),
}));
vi.mock('@/lib/sessions/send-message', () => ({ admitNewMessage, sendHumanMessage }));
vi.mock('@/lib/realtime/bus', async (original) => ({ ...(await original<typeof import('@/lib/realtime/bus')>()), publishMessageQueue }));

describe('message queue', () => {
  let tmpDir: string;
  const envKeys = [`${APP_SHORT_ID.toUpperCase()}_ROOT`, `${APP_SHORT_ID.toUpperCase()}_DB_PATH`, `${APP_SHORT_ID.toUpperCase()}_MIRROR_DISABLED`];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-message-queue-'));
    for (const key of envKeys) saved[key] = process.env[key];
    process.env[envKeys[0]!] = tmpDir;
    process.env[envKeys[1]!] = path.join(tmpDir, 'data.db');
    process.env[envKeys[2]!] = '1';
    vi.resetModules();
    live.running.clear();
    live.background.clear();
    live.midTurn = true;
    admitNewMessage.mockReset().mockResolvedValue(null);
    sendHumanMessage.mockClear();
    abort.mockClear();
    publishMessageQueue.mockClear();
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function load() {
    const q = await import('@/lib/db/queries');
    const queue = await import('./message-queue');
    const state = await import('./message-queue-state');
    const chat = (fields: Record<string, unknown> = {}) => q.createChatSession({ harness: 'claude', type: 'execution', userId: 'local', ...fields }).id;
    const add = (chatSessionId: string, content: string) => queue.queueMessage({
      chatSessionId, id: uuidv7(), content, attachments: [], draft: { type: 'doc', content: [] }, appContext: null, apiKeyId: 'key-1',
    });
    const sentContents = () => sendHumanMessage.mock.calls.map(([, input]) => input.content);
    return { q, queue, state, chat, add, sentContents };
  }

  it('waits while the chat works, then sends when its turn finishes normally', async () => {
    const { q, queue, state, chat, add, sentContents } = await load();
    const id = chat();
    live.running.add(id);
    const queued = add(id, 'then write the tests');
    expect(q.listQueuedMessages(id).map((m) => m.content)).toEqual(['then write the tests']);
    expect(publishMessageQueue).toHaveBeenLastCalledWith(id, [expect.objectContaining({ id: queued.id, content: 'then write the tests' })]);

    await queue.drainMessageQueue(id);
    expect(sendHumanMessage).not.toHaveBeenCalled();

    state.noteTurnEnded(id, true);
    live.running.delete(id);
    await queue.drainMessageQueue(id);
    expect(sentContents()).toEqual(['then write the tests']);
    const [, input] = sendHumanMessage.mock.calls[0]!;
    expect(input).toMatchObject({ id: queued.id, actor: { source: 'human', sessionId: null, apiKeyId: 'key-1' }, isExistingRetry: false });
    // It left the queue as it became the chat's message, under the same id.
    expect(q.listQueuedMessages(id)).toEqual([]);
    expect(q.getChatEventById(queued.id)?.content).toBe('then write the tests');
    expect(publishMessageQueue).toHaveBeenLastCalledWith(id, []);
  });

  it('sends one message per turn, in order', async () => {
    const { queue, state, chat, add, sentContents } = await load();
    const id = chat();
    live.running.add(id);
    add(id, 'first');
    add(id, 'second');
    state.noteTurnEnded(id, true);
    live.running.delete(id);

    await queue.drainMessageQueue(id);
    // The chat is quiet again here (the stand-in send starts no turn), and
    // the queue still waits for the first message's turn.
    await queue.drainMessageQueue(id);
    expect(sentContents()).toEqual(['first']);

    state.noteTurnEnded(id, true);
    await queue.drainMessageQueue(id);
    expect(sentContents()).toEqual(['first', 'second']);
  });

  it('holds after a stopped or failed turn, until the person sends one now', async () => {
    const { q, queue, state, chat, add, sentContents } = await load();
    const id = chat();
    live.running.add(id);
    const held = add(id, 'held');
    add(id, 'after it');
    state.noteTurnEnded(id, false);
    live.running.delete(id);
    await queue.drainMessageQueue(id);
    expect(sendHumanMessage).not.toHaveBeenCalled();

    await queue.sendQueuedNow(id, held.id, { source: 'human', sessionId: null, apiKeyId: null });
    expect(sentContents()).toEqual(['held']);
    expect(q.listQueuedMessages(id).map((m) => m.content)).toEqual(['after it']);
    // Its turn finishing moves the rest.
    state.noteTurnEnded(id, true);
    await queue.drainMessageQueue(id);
    expect(sentContents()).toEqual(['held', 'after it']);
  });

  it('sends at once a message queued after the chat went quiet from a finished turn', async () => {
    const { queue, state, chat, add, sentContents } = await load();
    const id = chat();
    state.noteTurnEnded(id, true);
    add(id, 'arrived late');
    await vi.waitFor(() => expect(sentContents()).toEqual(['arrived late']));
    expect(queue.listQueue(id)).toEqual([]);
  });

  it('waits for background work to finish too', async () => {
    const { queue, state, chat, add } = await load();
    const id = chat();
    live.background.add(id);
    add(id, 'after the build');
    state.noteTurnEnded(id, true);
    await queue.drainMessageQueue(id);
    expect(sendHumanMessage).not.toHaveBeenCalled();
    live.background.delete(id);
    await queue.drainMessageQueue(id);
    expect(sendHumanMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps a refused message queued, says why once and holds the queue', async () => {
    const { q, queue, state, chat, add } = await load();
    const id = chat();
    live.running.add(id);
    add(id, 'over budget');
    admitNewMessage.mockResolvedValue({ ok: false, status: 402, body: { error: 'budget_exceeded', message: 'Monthly budget exceeded.' } });
    state.noteTurnEnded(id, true);
    live.running.delete(id);
    await queue.drainMessageQueue(id);
    await queue.drainMessageQueue(id);

    expect(sendHumanMessage).not.toHaveBeenCalled();
    expect(q.listQueuedMessages(id).map((m) => m.content)).toEqual(['over budget']);
    const errors = q.listChatEvents(id).filter((event) => event.source === 'error');
    expect(errors.map((event) => event.content)).toEqual(["Your queued message wasn't sent: Monthly budget exceeded. It's still in the queue."]);
    expect(state.lastTurnFinishedNormally(id)).toBe(false);
  });

  it('sends now into the turn under way on a harness that takes messages mid-turn', async () => {
    const { queue, chat, add, sentContents } = await load();
    const id = chat();
    live.running.add(id);
    const message = add(id, 'actually use the other file');
    await queue.sendQueuedNow(id, message.id, { source: 'human', sessionId: null, apiKeyId: null });
    expect(abort).not.toHaveBeenCalled();
    expect(sentContents()).toEqual(['actually use the other file']);
  });

  it('stops the turn first on a harness that takes one message at a time', async () => {
    const { queue, chat, add, sentContents } = await load();
    const id = chat({ harness: 'opencode' });
    live.midTurn = false;
    live.running.add(id);
    const message = add(id, 'stop and do this');
    const actor = { source: 'human' as const, sessionId: null, apiKeyId: 'key-1' };
    await queue.sendQueuedNow(id, message.id, actor);
    expect(abort).toHaveBeenCalledWith(id, actor);
    expect(sentContents()).toEqual(['stop and do this']);
  });

  it('leaves a message being sent now to Send now, even when the queue could take it', async () => {
    const { queue, state, chat, sentContents } = await load();
    const id = chat({ harness: 'opencode' });
    state.noteTurnEnded(id, true);
    const queued = queue.queueMessage({ chatSessionId: id, id: uuidv7(), content: 'now please', attachments: [], draft: null, appContext: null, apiKeyId: null, sendingNow: true });
    await queue.sendQueuedNow(id, queued.id, { source: 'human', sessionId: null, apiKeyId: null });
    expect(sentContents()).toEqual(['now please']);
  });

  it('only takes a message that was saved already out of the queue', async () => {
    const { q, queue, state, chat, add } = await load();
    const id = chat();
    live.running.add(id);
    const message = add(id, 'saved before a restart');
    q.insertChatEvent({ id: message.id, sessionId: id, role: 'user', source: 'user', content: 'saved before a restart' });
    state.noteTurnEnded(id, true);
    live.running.delete(id);
    await queue.drainMessageQueue(id);
    expect(sendHumanMessage).not.toHaveBeenCalled();
    expect(q.listQueuedMessages(id)).toEqual([]);
  });

  it('takes a message back out once, and says when it has gone', async () => {
    const { queue, chat, add } = await load();
    const id = chat();
    live.running.add(id);
    const message = add(id, 'never mind');
    expect(queue.removeFromQueue(id, message.id)?.content).toBe('never mind');
    expect(queue.removeFromQueue(id, message.id)).toBeNull();
    await expect(queue.sendQueuedNow(id, message.id, { source: 'human', sessionId: null, apiKeyId: null })).rejects.toThrow(/left the queue/);
  });

  it('queues only in a personal chat that takes messages', async () => {
    const { queue, chat, add } = await load();
    expect(() => add(chat({ surfaceKind: 'team_chat' }), 'hi')).toThrow(/shared chat/);
    expect(() => add(chat({ surfaceKind: 'result_review' }), 'hi')).toThrow(/reviewer/);
    expect(() => add(chat({ status: 'archived' }), 'hi')).toThrow(/archived/);
    expect(() => add('missing', 'hi')).toThrow(/no longer exists/);
    expect(() => queue.queueMessage({ chatSessionId: chat(), id: uuidv7(), content: '   ', attachments: [], draft: null, appContext: null, apiKeyId: null })).toThrow(/nothing to queue/);
  });
});

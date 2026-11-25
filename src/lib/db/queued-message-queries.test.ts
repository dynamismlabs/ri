/**
 * A chat's message queue in the database (docs/message-queue.md): kept in
 * the order it was queued, safe to add twice, emptied with its chat, and
 * counted by the attachment sweep so a queued file is never archived.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uuidv7 } from 'uuidv7';
import { APP_SHORT_ID } from '@/constants/app';

describe('queued messages', () => {
  let tmpDir: string;
  const envKeys = [`${APP_SHORT_ID.toUpperCase()}_ROOT`, `${APP_SHORT_ID.toUpperCase()}_DB_PATH`, `${APP_SHORT_ID.toUpperCase()}_MIRROR_DISABLED`];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-queued-messages-'));
    for (const key of envKeys) saved[key] = process.env[key];
    process.env[envKeys[0]!] = tmpDir;
    process.env[envKeys[1]!] = path.join(tmpDir, 'data.db');
    process.env[envKeys[2]!] = '1';
    vi.resetModules();
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
    const chat = () => q.createChatSession({ harness: 'claude', type: 'execution', userId: 'local' }).id;
    return { q, chat };
  }

  const file = { fileName: '01a2-shot.png', originalName: 'shot.png', mimeType: 'image/png', size: 12, uploadedAt: '2026-11-24T00:00:00.000Z' };

  it('lists a chat\'s queue oldest first, with its files', async () => {
    const { q, chat } = await load();
    const id = chat();
    const other = chat();
    const first = uuidv7();
    const second = uuidv7();
    q.addQueuedMessage({ id: second, chatSessionId: id, content: 'then this' });
    q.addQueuedMessage({ id: first, chatSessionId: id, content: 'look at [[file:01a2-shot.png]]', attachments: [file], draft: { type: 'doc', content: [] } });
    q.addQueuedMessage({ id: uuidv7(), chatSessionId: other, content: 'another chat' });

    const queue = q.listQueuedMessages(id);
    expect(queue.map((message) => message.content)).toEqual(['look at [[file:01a2-shot.png]]', 'then this']);
    expect(queue[0]!.attachments).toEqual([file]);
    expect(queue[0]!.draft).toEqual({ type: 'doc', content: [] });
    expect(queue[1]!.attachments).toEqual([]);
    expect(q.nextQueuedMessage(id)?.id).toBe(first);
    expect(q.getQueuedMessage(id, second)?.content).toBe('then this');
    expect(q.getQueuedMessage(other, second)).toBeNull();
  });

  it('adds once under a retried id, and refuses an id another chat holds', async () => {
    const { q, chat } = await load();
    const id = chat();
    const messageId = uuidv7();
    expect(q.addQueuedMessage({ id: messageId, chatSessionId: id, content: 'once' }).created).toBe(true);
    const again = q.addQueuedMessage({ id: messageId, chatSessionId: id, content: 'once' });
    expect(again.created).toBe(false);
    expect(again.message.content).toBe('once');
    expect(q.listQueuedMessages(id)).toHaveLength(1);
    expect(() => q.addQueuedMessage({ id: messageId, chatSessionId: chat(), content: 'elsewhere' })).toThrow(/another chat/);
  });

  it('removes a message once, and goes with its chat', async () => {
    const { q, chat } = await load();
    const id = chat();
    const messageId = uuidv7();
    q.addQueuedMessage({ id: messageId, chatSessionId: id, content: 'gone soon' });
    expect(q.removeQueuedMessage(id, messageId)?.content).toBe('gone soon');
    expect(q.removeQueuedMessage(id, messageId)).toBeNull();

    q.addQueuedMessage({ id: uuidv7(), chatSessionId: id, content: 'deleted with the chat' });
    const { getRawDb } = await import('@/lib/db');
    getRawDb().prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
    expect(q.listQueuedMessages(id)).toEqual([]);
  });

  it('counts a queued message\'s files as in use, so the sweep never archives them', async () => {
    const { q, chat } = await load();
    q.addQueuedMessage({ id: uuidv7(), chatSessionId: chat(), content: '[[file:01a2-shot.png]]', attachments: [file] });
    expect(q.listQueuedMessageAttachmentFileNames()).toEqual(['01a2-shot.png']);
    const { collectReferencedFileNames } = await import('@/lib/export/mirror/attachments-gc');
    expect(collectReferencedFileNames().has('01a2-shot.png')).toBe(true);
  });

  it('reads the queue through its index', async () => {
    const { chat } = await load();
    const { getRawDb } = await import('@/lib/db');
    chat();
    const plan = getRawDb().prepare(
      'EXPLAIN QUERY PLAN SELECT * FROM queued_messages WHERE chat_session_id = ? ORDER BY id LIMIT 1',
    ).all('x') as { detail: string }[];
    expect(plan.map((row) => row.detail).join(' ')).toContain('idx_queued_messages_chat');
  });
});

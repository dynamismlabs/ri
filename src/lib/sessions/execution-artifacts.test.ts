import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestHome, type TestHome } from '@/test/fixtures/home';

let home: TestHome;
let q: typeof import('@/lib/db/queries');
let list: typeof import('./execution-artifacts')['listExecutionArtifacts'];
beforeEach(async () => {
  home = await createTestHome({ prefix: 'ri-execution-artifacts-' });
  q = await import('@/lib/db/queries');
  list = (await import('./execution-artifacts')).listExecutionArtifacts;
});
afterEach(async () => { await home.cleanup(); });

function execution() {
  const workspace = q.createWorkspace({ name: 'Research', cwd: '/tmp/research', isGit: false, filesToCopy: [], collapsed: false, skipLiveConfirm: false, browserEnabled: false });
  return q.createExecutionWithChat({ workspaceId: workspace.id, harness: 'claude', label: 'Research' });
}
function share(sessionId: string, content: string, at = '2026-11-01T12:00:00Z') {
  return q.insertChatEvent({ sessionId, role: 'assistant', source: 'agent', content, createdAt: at })!;
}

it('includes old and current chats, keeps the source chat, and resolves duplicate identities', () => {
  const first = execution();
  const next = q.createExecutionChat({ executionId: first.execution.id, harness: 'codex', label: 'Follow-up' })!;
  share(first.session.id, '[Report](./out/report.pdf)');
  q.updateChatSession(first.session.id, { status: 'archived' });
  share(next.id, '[Report](/tmp/research/out/report.pdf)', '2026-11-02T12:00:00Z');
  share(execution().session.id, '[Private](/tmp/private.pdf)');
  const result = list(next.id);
  expect(result.items).toHaveLength(2);
  expect(new Set(result.items.map(item => item.key)).size).toBe(1);
  expect(result.items.map(item => item.sessionId)).toEqual([next.id, first.session.id]);
  expect(result.items[1].source).toEqual({ kind: 'session', sessionId: first.session.id, path: './out/report.pdf' });
  expect(list(first.session.id)).toEqual(result);
  // One chat's own files, for This chat.
  expect(list(next.id, undefined, undefined, { chatOnly: true }).items.map(item => item.sessionId)).toEqual([next.id]);
  expect(list(first.session.id, undefined, undefined, { chatOnly: true }).items.map(item => item.sessionId)).toEqual([first.session.id]);
});

it('includes message attachments while excluding user paths, thinking and tool activity', () => {
  const { session } = execution();
  q.insertChatEvent({ sessionId: session.id, role: 'user', source: 'user', content: 'Read /tmp/private.md', attachments: [{ fileName: 'upload.pdf', originalName: 'Brief.pdf', size: 100, mimeType: 'application/pdf', uploadedAt: '2026-11-01T00:00:00Z' }] });
  q.insertChatEvent({ sessionId: session.id, role: 'assistant', source: 'thinking', content: '/tmp/thinking.md' });
  q.insertChatEvent({ sessionId: session.id, role: 'assistant', source: 'tool_call', toolName: 'Read', toolInput: { file_path: '/tmp/tool.md' } });
  expect(list(session.id).items).toMatchObject([{ name: 'Brief.pdf', source: { kind: 'attachment', fileName: 'upload.pdf' }, sessionId: session.id }]);
});

it('pages across chats without gaps at identical timestamps and excludes hidden chats before paging', () => {
  const first = execution();
  const second = q.createExecutionChat({ executionId: first.execution.id, harness: 'codex' })!;
  for (let i = 0; i < 70; i++) share(i % 2 ? first.session.id : second.id, `[Report](out/report-${i}.pdf)`);
  // Batches of 20 messages until the page holds 50 files: three batches, 60 files.
  const limits = { pageItems: 50, batch: 20 };
  const page = list(first.session.id, undefined, undefined, limits);
  expect(page.items).toHaveLength(60);
  expect(page.nextCursor).not.toBeNull();
  const older = list(first.session.id, page.nextCursor!, undefined, limits);
  expect(older.items).toHaveLength(10);
  expect(older.nextCursor).toBeNull();
  expect(new Set([...page.items, ...older.items].map(item => item.eventId)).size).toBe(70);
  const visible = list(first.session.id, undefined, chat => chat.id !== second.id);
  expect(visible.items).toHaveLength(35);
  expect(visible.items.every(item => item.sessionId === first.session.id)).toBe(true);
});

it('fills a page with files across long runs of replies that share none, reading a bounded number per request', () => {
  const { session } = execution();
  const at = (i: number) => new Date(Date.UTC(2026, 10, 1) + i * 60_000).toISOString();
  share(session.id, '[Oldest](out/oldest.pdf)', at(0));
  for (let i = 1; i < 300; i++) share(session.id, i === 150 ? '[Middle](out/middle.pdf)' : `Reply ${i} with no file`, at(i));
  // The defaults read all 300 in one request and find both.
  const all = list(session.id);
  expect(all.items.map(item => item.name)).toEqual(['middle.pdf', 'oldest.pdf']);
  expect(all.nextCursor).toBeNull();
  // A small read cap stops early with a cursor, and following it loses nothing.
  const names: string[] = [];
  let cursor: Parameters<typeof list>[1];
  let requests = 0;
  do {
    const page = list(session.id, cursor, undefined, { batch: 40, scanLimit: 80 });
    names.push(...page.items.map(item => item.name));
    cursor = page.nextCursor ?? undefined;
    requests++;
  } while (cursor);
  expect(names).toEqual(['middle.pdf', 'oldest.pdf']);
  expect(requests).toBe(4);
});

it('uses a direct partial-index seek with no temporary sort', async () => {
  const { session } = execution();
  const { getRawDb } = await import('@/lib/db');
  const query = getRawDb().prepare(`EXPLAIN QUERY PLAN SELECT id, content, attachments FROM chat_events INDEXED BY idx_chat_events_artifact_message
    WHERE session_id = ? AND (source = 'agent' OR attachments <> '[]') AND (created_at, id) < (?, ?)
    ORDER BY created_at DESC, id DESC LIMIT 51`).all(session.id, '2026-11-01T00:00:00Z', 'cursor') as { detail: string }[];
  expect(query.map(row => row.detail).join('\n')).toContain('USING INDEX idx_chat_events_artifact_message (session_id=? AND (created_at,id)<(?,?))');
  expect(query.some(row => row.detail.includes('TEMP B-TREE'))).toBe(false);
});

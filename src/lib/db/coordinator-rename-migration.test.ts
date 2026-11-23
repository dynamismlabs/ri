import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from './migrate';

it('renames the orchestrator to the coordinator in place, keeping every row, rowid and other value', () => {
  const source = path.resolve(__dirname, '../../../drizzle');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-coordinator-rename-migration-'));
  const db = new Database(':memory:');
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(source, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>;
    };
    const rename = journal.entries.findIndex(entry => entry.tag === '0041_coordinator-rename');
    expect(rename).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, rename + 1);
    fs.mkdirSync(path.join(dir, 'meta'));
    for (const entry of entries) {
      fs.copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
    }
    const journalFile = path.join(dir, 'meta/_journal.json');
    fs.writeFileSync(journalFile, JSON.stringify({ ...journal, entries: entries.slice(0, -1) }));
    db.pragma('foreign_keys = ON');
    runMigrations(db, dir);

    // A home as it was: the main chat's look, its schedules, its chats and messages between chats.
    db.exec(`
      INSERT OR REPLACE INTO user_state(id, orchestrator_name, orchestrator_emoji, orchestrator_image, orchestrator_color, orchestrator_introduced_at, orchestrator_mode)
        VALUES (1, 'Rye', '🌾', '{"file_name":"a.svg"}', 'amber', '2026-09-01T00:00:00Z', 'harness_skills');
      INSERT INTO chat_sessions(rowid, id, harness, type, status, permission_mode, label)
        VALUES (11, 'main', 'claude', 'orchestration', 'active', 'ask', 'Main'),
               (12, 'work', 'codex', 'execution', 'active', 'ask', 'Work'),
               (13, 'note-chat', 'claude', 'content', 'archived', 'ask', NULL);
      INSERT INTO triggers(rowid, id, name, enabled, harness, target_kind, prompt, kind, concurrency_policy, catch_up_policy, max_catch_up_runs)
        VALUES (21, 'heartbeat', 'Heartbeat', 1, 'claude', 'orchestrator', 'Check in', 'manual', 'skip', 'skip', 1),
               (22, 'check-in', 'Check in', 0, 'codex', 'session', 'Look again', 'manual', 'skip', 'skip', 1);
      INSERT INTO agent_coordination_requests(rowid, id, source_address, target_address, request_key, kind, status)
        VALUES (31, 'asked-main', 'session:work', 'orchestrator', 'k1', 'question', 'completed'),
               (32, 'from-main', 'orchestrator', 'session:work', 'k2', 'delegation', 'completed');
      INSERT INTO agent_coordination_deliveries(rowid, id, kind, sender_kind, target_address, event_id, payload, status)
        VALUES (41, 'to-main', 'message', 'agent', 'orchestrator', 'e1', '{"version":1,"content":"hi"}', 'delivered'),
               (42, 'to-work', 'message', 'agent', 'session:work', 'e2', '{"version":1,"content":"go"}', 'delivered');
    `);
    const rows = (table: string) => db.prepare(`SELECT rowid, * FROM "${table}" ORDER BY rowid`).all() as Array<Record<string, unknown>>;
    const before = Object.fromEntries(['chat_sessions', 'triggers', 'agent_coordination_requests', 'agent_coordination_deliveries'].map(t => [t, rows(t)]));
    const history = rows('__drizzle_migrations');
    fs.writeFileSync(journalFile, JSON.stringify({ ...journal, entries }));

    expect(runMigrations(db, dir)).toEqual({ applied: 1 });
    const swap = (value: unknown) => (value === 'orchestrator' || value === 'orchestration' ? 'coordinator' : value);
    const expected = Object.fromEntries(Object.entries(before).map(([table, list]) => [table, list.map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, ['type', 'target_kind', 'source_address', 'target_address'].includes(key) ? swap(value) : value]),
    ))]));
    for (const table of Object.keys(before)) expect(rows(table)).toEqual(expected[table]);
    expect(db.prepare('SELECT coordinator_name, coordinator_emoji, coordinator_image, coordinator_color, coordinator_introduced_at FROM user_state WHERE id = 1').get()).toEqual({
      coordinator_name: 'Rye', coordinator_emoji: '🌾', coordinator_image: '{"file_name":"a.svg"}', coordinator_color: 'amber', coordinator_introduced_at: '2026-09-01T00:00:00Z',
    });
    const columns = (db.prepare("SELECT name FROM pragma_table_info('user_state')").all() as Array<{ name: string }>).map(c => c.name);
    expect(columns.filter(name => name.includes('orchestrat'))).toEqual([]);
    expect(rows('__drizzle_migrations').slice(0, history.length)).toEqual(history);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');

    // A second server start changes nothing.
    expect(runMigrations(db, dir)).toEqual({ applied: 0 });
    for (const table of Object.keys(before)) expect(rows(table)).toEqual(expected[table]);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

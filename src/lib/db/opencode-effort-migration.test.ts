/**
 * Migration 0040 moves OpenCode's effort levels out of the variant columns.
 * agentex 0.0.51 reports them as the model's efforts and sends effort as the
 * variant, so a chat, a default and a reviewer default keep their level as
 * effort. A variant that isn't an effort level, and every other provider,
 * stays as it was. A second start applies nothing.
 */

import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase } from './index';
import { runMigrations } from './migrate';

const SOURCE = path.resolve(__dirname, '../../../drizzle');

/** Every migration before 0040, then 0040 when allowed. */
function stagedMigrations() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-opencode-effort-migration-'));
  const journal = JSON.parse(fs.readFileSync(path.join(SOURCE, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  const index = journal.entries.findIndex((entry) => entry.tag === '0040_opencode_effort');
  expect(index).toBeGreaterThan(0);
  const entries = journal.entries.slice(0, index + 1);
  fs.mkdirSync(path.join(dir, 'meta'));
  for (const entry of entries) fs.copyFileSync(path.join(SOURCE, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  const journalFile = path.join(dir, 'meta/_journal.json');
  fs.writeFileSync(journalFile, JSON.stringify({ ...journal, entries: entries.slice(0, -1) }));
  return { dir, allow: () => fs.writeFileSync(journalFile, JSON.stringify({ ...journal, entries })) };
}

it('moves OpenCode effort levels from variants to effort, and leaves everything else', () => {
  const staged = stagedMigrations();
  const db = new Database(path.join(staged.dir, 'data.db'));
  sqliteVec.load(db);
  db.pragma('foreign_keys = ON');
  try {
    initDatabase(db, staged.dir);
    const chat = db.prepare(`INSERT INTO chat_sessions(id, harness, type, status, permission_mode, model, model_variant, effort)
      VALUES (?, ?, 'execution', 'active', 'auto_all', ?, ?, ?)`);
    chat.run('oc-level', 'opencode', 'anthropic/claude-opus-5-5', 'xhigh', null);
    chat.run('oc-none', 'opencode', 'opencode/hy4-flash-free', 'none', null);
    chat.run('oc-custom', 'opencode', 'anthropic/claude-opus-5-5', 'thinking', null);
    chat.run('oc-default', 'opencode', 'anthropic/claude-opus-5-5', null, null);
    chat.run('claude', 'claude', 'opus', 'high', 'max');
    db.exec(`
      INSERT INTO harness_settings(id, harness, default_model, default_variant, default_effort) VALUES
        ('hs-oc', 'opencode', 'anthropic/claude-opus-5-5', 'high', NULL),
        ('hs-codex', 'codex', 'gpt-6.1-sol', 'low', 'medium');
      UPDATE user_state SET default_harness = 'opencode', default_model = 'anthropic/claude-sonnet-5-5', default_variant = 'max', default_effort = NULL;
    `);
    const workspace = db.prepare(`INSERT INTO workspaces(id, name, slug, cwd, is_git, files_to_copy, collapsed, skip_live_confirm, browser_enabled, status, review_defaults)
      VALUES (?, ?, ?, '/tmp', 0, '[]', 0, 0, 0, 'active', ?)`);
    workspace.run('ws-oc', 'OpenCode reviews', 'opencode-reviews', JSON.stringify({ harness: 'opencode', model: 'anthropic/claude-opus-5-5', variant: 'high', effort: null }));
    workspace.run('ws-claude', 'Claude reviews', 'claude-reviews', JSON.stringify({ harness: 'claude', model: 'opus', variant: 'low', effort: 'max' }));

    staged.allow();
    expect(runMigrations(db, staged.dir)).toEqual({ applied: 1 });
    initDatabase(db, staged.dir);
    expect(runMigrations(db, staged.dir)).toEqual({ applied: 0 });

    expect(db.prepare('SELECT id, model_variant, effort FROM chat_sessions ORDER BY id').all()).toEqual([
      { id: 'claude', model_variant: 'high', effort: 'max' },
      { id: 'oc-custom', model_variant: 'thinking', effort: null },
      { id: 'oc-default', model_variant: null, effort: null },
      { id: 'oc-level', model_variant: null, effort: 'xhigh' },
      { id: 'oc-none', model_variant: null, effort: 'none' },
    ]);
    expect(db.prepare('SELECT harness, default_variant, default_effort FROM harness_settings ORDER BY harness').all()).toEqual([
      { harness: 'codex', default_variant: 'low', default_effort: 'medium' },
      { harness: 'opencode', default_variant: null, default_effort: 'high' },
    ]);
    expect(db.prepare('SELECT default_variant, default_effort FROM user_state').get()).toEqual({ default_variant: null, default_effort: 'max' });
    const reviews = db.prepare('SELECT id, review_defaults FROM workspaces ORDER BY id').all() as Array<{ id: string; review_defaults: string }>;
    expect(reviews.map((row) => [row.id, JSON.parse(row.review_defaults)])).toEqual([
      ['ws-claude', { harness: 'claude', model: 'opus', variant: 'low', effort: 'max' }],
      ['ws-oc', { harness: 'opencode', model: 'anthropic/claude-opus-5-5', variant: null, effort: 'high' }],
    ]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally {
    db.close();
    fs.rmSync(staged.dir, { recursive: true, force: true });
  }
});

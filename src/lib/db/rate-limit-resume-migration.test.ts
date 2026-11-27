import { expect, it } from 'vitest';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'node:path';
import { migrationsFolderUpTo } from '@/test/fixtures/migrations';
import { initDatabase } from './index';
import { runMigrations } from './migrate';

it('upgrades populated main with its migration 43 intact, preserving rowids, FTS and existing schedules', () => {
  const previous = migrationsFolderUpTo('0043_message-queue');
  const db = new Database(':memory:');
  try {
    sqliteVec.load(db);
    initDatabase(db, previous.folder);
    db.exec(`
      INSERT INTO chat_sessions(rowid,id,harness,type,status,permission_mode) VALUES (19,'chat','claude','content','active','ask');
      INSERT INTO chat_events(rowid,id,session_id,role,source,content) VALUES (41,'limit','chat','system','rate_limit','quartz context');
      INSERT INTO chat_events(rowid,id,session_id,role,source,content) VALUES (42,'reply','chat','assistant','agent','quartz reply');
      INSERT INTO triggers(rowid,id,name,enabled,harness,target_kind,prompt,kind,concurrency_policy,catch_up_policy,max_catch_up_runs)
      VALUES (73,'existing','Existing',1,'claude','coordinator','Keep this prompt','at','skip_if_running','skip_missed',3);
    `);
    const history = db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all();
    expect(runMigrations(db, path.resolve('drizzle')).applied).toBe(1);
    expect(db.prepare('SELECT * FROM __drizzle_migrations ORDER BY id').all().slice(0, history.length)).toEqual(history);
    expect(db.prepare("SELECT rowid,prompt,resume_event_id FROM triggers WHERE id='existing'").get()).toEqual({ rowid: 73, prompt: 'Keep this prompt', resume_event_id: null });
    expect(db.prepare("SELECT rowid FROM chat_events WHERE id='limit'").pluck().get()).toBe(41);
    expect(db.prepare("SELECT rowid FROM chat_events_fts WHERE chat_events_fts MATCH 'quartz'").pluck().all()).toEqual([42]);
    db.exec("UPDATE triggers SET resume_event_id='limit' WHERE id='existing'");
    db.exec("DELETE FROM chat_events WHERE id='limit'");
    expect(db.prepare("SELECT id FROM triggers WHERE id='existing'").get()).toBeUndefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { db.close(); previous.cleanup(); }
});

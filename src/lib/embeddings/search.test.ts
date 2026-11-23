import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openAsServer } from '@/test/fixtures/home';

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
}));

// Records made through the query layer keep their real embedding text, and
// never reach a model: their upserts do nothing here.
vi.mock('./embed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./embed')>()),
  generateEmbedding: mocks.generateEmbedding,
  upsertEmbedding: vi.fn(async () => undefined),
}));

const ENV_KEYS = ['RI_ROOT', 'RI_DB_PATH', 'RI_MIRROR_DISABLED'] as const;

function unitVector(dimension: number): Float32Array {
  const vector = new Float32Array(1536);
  vector[dimension] = 1;
  return vector;
}

describe('vector search', () => {
  let root: string;
  let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-vector-search-'));
    savedEnv = {
      RI_ROOT: process.env.RI_ROOT,
      RI_DB_PATH: process.env.RI_DB_PATH,
      RI_MIRROR_DISABLED: process.env.RI_MIRROR_DISABLED,
    };
    process.env.RI_ROOT = path.join(root, 'ri-root');
    process.env.RI_DB_PATH = path.join(root, 'ri.db');
    process.env.RI_MIRROR_DISABLED = '1';
    mocks.generateEmbedding.mockReset();
    vi.resetModules();
  });

  afterEach(async () => {
    const { resetDb } = await import('@/lib/db');
    resetDb();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
    vi.resetModules();
  });

  async function insertEmbedding(
    entityType: 'task' | 'note' | 'stream',
    entityId: string,
    vector: Float32Array,
  ): Promise<number> {
    const { getRawDb } = await import('@/lib/db');
    const db = getRawDb();
    const result = db
      .prepare(
        `INSERT INTO embeddings(entity_type, entity_id, content_hash, text_content)
         VALUES (?, ?, ?, ?)`,
      )
      .run(entityType, entityId, `hash-${entityId}`, `content-${entityId}`);
    const rowid = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO embeddings_vec(rowid, embedding) VALUES (?, ?)').run(
      BigInt(rowid),
      vector,
    );
    return rowid;
  }

  it('runs joined KNN search with k and returns cosine similarity scores', async () => {
    const queryVector = unitVector(0);
    await insertEmbedding('task', 'exact-match', queryVector);
    await insertEmbedding('note', 'orthogonal-match', unitVector(1));
    mocks.generateEmbedding.mockResolvedValue(Array.from(queryVector));

    const { vectorSearch } = await import('./search');
    const limitedHits = await vectorSearch('find the exact match', 1);
    const hits = await vectorSearch('find the exact match', 2);

    expect(limitedHits).toEqual([{ entityType: 'task', entityId: 'exact-match', score: 1 }]);
    expect(mocks.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(mocks.generateEmbedding).toHaveBeenLastCalledWith('find the exact match');
    expect(hits).toEqual([
      { entityType: 'task', entityId: 'exact-match', score: 1 },
      { entityType: 'note', entityId: 'orthogonal-match', score: 0 },
    ]);
  });

  it('narrows nearest neighbours to one type and still fills the limit with it', async () => {
    const queryVector = unitVector(0);
    // Two tasks nearer the query than any note, so a mixed top 2 holds no note.
    await insertEmbedding('task', 'near-task', queryVector);
    const close = new Float32Array(1536);
    close[0] = 0.9;
    close[1] = 0.1;
    await insertEmbedding('task', 'close-task', close);
    await insertEmbedding('note', 'far-note', unitVector(1));
    await insertEmbedding('stream', 'far-capture', unitVector(2));
    mocks.generateEmbedding.mockResolvedValue(Array.from(queryVector));

    const { vectorSearch } = await import('./search');
    expect((await vectorSearch('plan', 2)).map((hit) => hit.entityId)).toEqual(['near-task', 'close-task']);
    expect(await vectorSearch('plan', 2, { entityType: 'note' })).toEqual([
      { entityType: 'note', entityId: 'far-note', score: 0 },
    ]);
    expect((await vectorSearch('plan', 2, { entityType: 'stream' })).map((hit) => hit.entityId)).toEqual(['far-capture']);
    // Outside clients never reach the stream, even by asking for it.
    expect(await vectorSearch('plan', 2, { entityType: 'stream', includeStream: false })).toEqual([]);
  });

  it('narrows keyword search to one type, and the search operation takes it as type', async () => {
    await openAsServer();
    const q = await import('@/lib/db/queries');
    const task = q.createTask({ title: 'Zebra crossing repaint' });
    const note = q.createNote({ title: 'Zebra field notes', body: 'Stripes' });
    const decision = q.createNote({ title: 'Zebra decision', body: 'Paint it', kind: 'decision' });
    const capture = q.createStream({ rawText: 'saw a zebra today' });

    const { ftsSearch, hybridSearch } = await import('./search');
    const ids = (hits: Array<{ entityId: string }>) => hits.map((hit) => hit.entityId).sort();
    expect(ids(ftsSearch('zebra'))).toEqual([task.id, note.id, decision.id, capture.id].sort());
    expect(ids(ftsSearch('zebra', 20, { entityType: 'task' }))).toEqual([task.id]);
    expect(ids(ftsSearch('zebra', 20, { entityType: 'note' }))).toEqual([note.id, decision.id].sort());
    expect(ids(ftsSearch('zebra', 20, { entityType: 'stream' }))).toEqual([capture.id]);
    expect(ftsSearch('zebra', 20, { entityType: 'stream', includeStream: false })).toEqual([]);
    // A note kind keeps notes of that kind, whatever type is asked for.
    expect(ids(ftsSearch('zebra', 20, { entityType: 'task', noteKind: 'decision' }))).toEqual([decision.id]);
    // No embedding key: hybrid falls back to keyword hits, narrowed the same way.
    mocks.generateEmbedding.mockRejectedValue(new Error('no key'));
    expect(ids(await hybridSearch('zebra', { entityType: 'task' }))).toEqual([task.id]);

    const { GET } = await import('@/lib/server/operations/search');
    const context = { headers: new Headers(), url: 'http://ri.test/api/search', nextUrl: new URL('http://ri.test/api/search'), signal: new AbortController().signal };
    const tasks = await GET({ query: { q: 'zebra', mode: 'keyword', type: 'task' } }, context);
    expect(tasks.ok && tasks.data.map((hit) => [hit.entityType, hit.id])).toEqual([['task', task.id]]);
    const decisions = await GET({ query: { q: 'zebra', mode: 'keyword', kind: 'decision' } }, context);
    expect(decisions.ok && decisions.data.map((hit) => hit.id)).toEqual([decision.id]);
    const wrong = await GET({ query: { q: 'zebra', type: 'area' } }, context);
    expect(wrong).toMatchObject({ ok: false, status: 400 });
  });

  it('upgrades an existing L2 vec0 table to cosine without losing vectors', async () => {
    const firstRowid = await insertEmbedding('task', 'first', unitVector(0));
    const secondRowid = await insertEmbedding('note', 'second', unitVector(1));
    const dbModule = await import('@/lib/db');
    const db = dbModule.getRawDb();

    // Recreate the pre-fix table shape to exercise the real startup upgrade.
    db.transaction(() => {
      db.exec(`
        CREATE TEMP TABLE legacy_embeddings_vec AS
        SELECT rowid, embedding FROM embeddings_vec;

        DROP TABLE embeddings_vec;
        CREATE VIRTUAL TABLE embeddings_vec USING vec0(embedding float[1536]);

        INSERT INTO embeddings_vec(rowid, embedding)
        SELECT rowid, embedding FROM legacy_embeddings_vec;

        DROP TABLE legacy_embeddings_vec;
      `);
    })();

    const legacySql = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'embeddings_vec'")
      .pluck()
      .get() as string;
    expect(legacySql).not.toContain('distance_metric=cosine');

    // The upgrade runs when the server starts.
    await openAsServer();
    const migrated = dbModule.getRawDb();
    const migratedSql = migrated
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'embeddings_vec'")
      .pluck()
      .get() as string;
    expect(migratedSql).toContain('distance_metric=cosine');

    const matches = migrated
      .prepare(
        `SELECT rowid, distance
         FROM embeddings_vec
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(unitVector(0), 2) as Array<{ rowid: number; distance: number }>;
    expect(matches.map((match) => match.rowid).sort((a, b) => a - b)).toEqual([
      firstRowid,
      secondRowid,
    ]);
    expect(matches[0]?.distance).toBeCloseTo(0);
    expect(matches[1]?.distance).toBeCloseTo(1);

    // A second startup is a no-op and leaves the migrated index intact.
    dbModule.resetDb();
    const reopened = dbModule.getRawDb();
    const vectorCount = reopened.prepare('SELECT COUNT(*) FROM embeddings_vec').pluck().get();
    expect(vectorCount).toBe(2);
  });
});

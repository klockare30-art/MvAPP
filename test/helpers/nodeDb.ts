// Test-only SqlDatabase backed by Node's built-in SQLite (node:sqlite, Node >= 22.5).
// It exercises the same SQL, migrations and serialized transaction logic as the app.
import { DatabaseSync } from 'node:sqlite';

import { bootstrapDatabase } from '@/db/bootstrap';
import { createSerializedDatabase } from '@/db/serialized';
import type { SqlDatabase, SqlParams } from '@/db/types';

export function openTestDatabase(path = ':memory:'): SqlDatabase & { close: () => void } {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON;');
  const db = createSerializedDatabase({
    exec: async (sql) => {
      raw.exec(sql);
    },
    run: async (sql, params: SqlParams = []) => {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    all: async <T>(sql: string, params: SqlParams = []) => raw.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: SqlParams = []) => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
  });
  return Object.assign(db, { close: () => raw.close() });
}

export async function openBootstrappedDatabase(path?: string) {
  const db = openTestDatabase(path);
  const { trainer } = await bootstrapDatabase(db);
  return { db, trainer };
}

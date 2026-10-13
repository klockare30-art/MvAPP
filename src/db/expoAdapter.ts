import * as SQLite from 'expo-sqlite';

import { createSerializedDatabase } from './serialized';
import type { SqlDatabase, SqlParams } from './types';

export async function openExpoDatabase(name = 'goalievision.db'): Promise<SqlDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  // WAL improves crash resilience; foreign keys must be enabled per connection.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return createSerializedDatabase({
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParams = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlParams = []) => db.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlParams = []) => db.getFirstAsync<T>(sql, params),
  });
}

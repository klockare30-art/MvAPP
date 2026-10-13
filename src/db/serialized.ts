import type { SqlDatabase, SqlExecutor } from './types';

/**
 * Wraps a single raw connection so that every statement and transaction runs
 * strictly one after another.
 *
 * Why not expo-sqlite's `withExclusiveTransactionAsync`? It opens a *new*
 * connection, on which `PRAGMA foreign_keys` is off (and cannot be enabled
 * inside BEGIN), so referential integrity would silently not be enforced.
 * `withTransactionAsync` on the other hand lets unrelated concurrent queries
 * slip into the transaction. A simple async mutex avoids both problems; the
 * app is single-user and statements are short, so serialization is cheap.
 */
export function createSerializedDatabase(raw: SqlExecutor): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job, job);
    // Keep the chain alive even if this job fails.
    tail = result.catch(() => undefined);
    return result;
  }

  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    run: (sql, params) => enqueue(() => raw.run(sql, params)),
    all: <T>(sql: string, params?: (string | number | null)[]) => enqueue(() => raw.all<T>(sql, params)),
    first: <T>(sql: string, params?: (string | number | null)[]) =>
      enqueue(() => raw.first<T>(sql, params)),
    transaction: <T>(task: (tx: SqlExecutor) => Promise<T>) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const value = await task(raw);
          await raw.exec('COMMIT');
          return value;
        } catch (e) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // Rollback can fail if SQLite already rolled back; the original error matters.
          }
          throw e;
        }
      }),
  };
}

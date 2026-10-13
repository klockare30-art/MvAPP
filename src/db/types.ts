/**
 * Minimal SQL interface used by repositories. It is implemented by the
 * expo-sqlite adapter on device and by a node:sqlite adapter in tests, which
 * keeps business logic independent of the storage driver (and makes it
 * possible to add a sync layer later without rewriting repositories).
 */
export type SqlValue = string | number | null;
export type SqlParams = SqlValue[];

export interface SqlRunResult {
  changes: number;
}

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `task` inside an exclusive transaction. Only queries issued through
   * the provided executor are part of the transaction.
   */
  transaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

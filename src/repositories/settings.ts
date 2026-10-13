import type { SqlExecutor } from '@/db/types';
import type { Id, Trainer } from '@/domain/types';
import { newId } from '@/utils/id';
import { nowIso } from '@/utils/time';

export async function getSetting<T>(db: SqlExecutor, key: string): Promise<T | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function setSetting(db: SqlExecutor, key: string, value: unknown): Promise<void> {
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}

export async function deleteSetting(db: SqlExecutor, key: string): Promise<void> {
  await db.run('DELETE FROM app_settings WHERE key = ?', [key]);
}

/**
 * The first prototype has exactly one local trainer. Multi-trainer accounts
 * arrive with the backend (Phase 4/5); the id is already stored on sessions.
 */
export async function ensureLocalTrainer(db: SqlExecutor): Promise<Trainer> {
  const existingId = await getSetting<Id>(db, 'localTrainerId');
  if (existingId) {
    const row = await db.first<{ id: string; name: string; email: string | null }>(
      'SELECT id, name, email FROM trainers WHERE id = ?',
      [existingId],
    );
    if (row) return row;
  }
  const id = newId();
  const now = nowIso();
  await db.run('INSERT INTO trainers (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    'Målvaktstränare',
    null,
    now,
    now,
  ]);
  await setSetting(db, 'localTrainerId', id);
  return { id, name: 'Målvaktstränare', email: null };
}

export async function updateTrainer(db: SqlExecutor, id: Id, name: string, email: string | null): Promise<void> {
  await db.run('UPDATE trainers SET name = ?, email = ?, updated_at = ? WHERE id = ?', [
    name.trim() || 'Målvaktstränare',
    email?.trim() || null,
    nowIso(),
    id,
  ]);
}

import type { SqlExecutor } from '@/db/types';
import type { Exercise, FocusArea, Id } from '@/domain/types';
import { newId } from '@/utils/id';
import { nowIso } from '@/utils/time';

interface FocusAreaRow {
  id: string;
  name: string;
  usage_count: number;
  last_used_at: string | null;
}

interface ExerciseRow {
  id: string;
  focus_area_id: string;
  name: string;
  usage_count: number;
  last_used_at: string | null;
}

export const mapFocusArea = (r: FocusAreaRow): FocusArea => ({
  id: r.id,
  name: r.name,
  usageCount: r.usage_count,
  lastUsedAt: r.last_used_at,
});

export const mapExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  focusAreaId: r.focus_area_id,
  name: r.name,
  usageCount: r.usage_count,
  lastUsedAt: r.last_used_at,
});

/** Frequently used areas first so the coach finds them quickly. */
export async function listFocusAreas(db: SqlExecutor): Promise<FocusArea[]> {
  const rows = await db.all<FocusAreaRow>(
    'SELECT id, name, usage_count, last_used_at FROM focus_areas ORDER BY usage_count DESC, name',
  );
  return rows.map(mapFocusArea);
}

export async function listExercises(db: SqlExecutor, focusAreaId?: Id): Promise<Exercise[]> {
  const rows = focusAreaId
    ? await db.all<ExerciseRow>(
        'SELECT id, focus_area_id, name, usage_count, last_used_at FROM exercises WHERE focus_area_id = ? ORDER BY usage_count DESC, name',
        [focusAreaId],
      )
    : await db.all<ExerciseRow>(
        'SELECT id, focus_area_id, name, usage_count, last_used_at FROM exercises ORDER BY usage_count DESC, name',
      );
  return rows.map(mapExercise);
}

/** Creates the focus area or returns the existing one with the same name (case-insensitive). */
export async function findOrCreateFocusArea(db: SqlExecutor, name: string, trainerId?: Id): Promise<FocusArea> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Fokusområdet behöver ett namn.');
  const existing = await db.first<FocusAreaRow>(
    'SELECT id, name, usage_count, last_used_at FROM focus_areas WHERE name = ?',
    [trimmed],
  );
  if (existing) return mapFocusArea(existing);
  const id = newId();
  const now = nowIso();
  await db.run(
    'INSERT INTO focus_areas (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, trimmed, trainerId ?? null, now, now],
  );
  return { id, name: trimmed, usageCount: 0, lastUsedAt: null };
}

export async function findOrCreateExercise(db: SqlExecutor, focusAreaId: Id, name: string): Promise<Exercise> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Övningen behöver ett namn.');
  const existing = await db.first<ExerciseRow>(
    'SELECT id, focus_area_id, name, usage_count, last_used_at FROM exercises WHERE focus_area_id = ? AND name = ?',
    [focusAreaId, trimmed],
  );
  if (existing) return mapExercise(existing);
  const id = newId();
  const now = nowIso();
  await db.run(
    'INSERT INTO exercises (id, focus_area_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, focusAreaId, trimmed, now, now],
  );
  return { id, focusAreaId, name: trimmed, usageCount: 0, lastUsedAt: null };
}

export async function renameFocusArea(db: SqlExecutor, id: Id, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Fokusområdet behöver ett namn.');
  await db.run('UPDATE focus_areas SET name = ?, updated_at = ? WHERE id = ?', [trimmed, nowIso(), id]);
}

/** Bumps usage statistics so frequently used items are suggested first. */
export async function markUsed(db: SqlExecutor, focusAreaId: Id | null, exerciseId: Id | null): Promise<void> {
  const now = nowIso();
  if (focusAreaId) {
    await db.run('UPDATE focus_areas SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?', [now, focusAreaId]);
  }
  if (exerciseId) {
    await db.run('UPDATE exercises SET usage_count = usage_count + 1, last_used_at = ? WHERE id = ?', [now, exerciseId]);
  }
}

/** Default Swedish goaltending focus areas, seeded on first launch. */
export const DEFAULT_FOCUS_AREAS: { name: string; exercises: string[] }[] = [
  { name: 'Förflyttningar', exercises: ['T-push', 'C-cut', 'Shuffle'] },
  { name: 'Butterfly', exercises: ['Butterfly-slide', 'Recovery'] },
  { name: 'Stolpspel', exercises: ['RVH', 'VH'] },
  { name: 'Returkontroll', exercises: [] },
  { name: 'Positionering', exercises: [] },
  { name: 'Skridskoåkning', exercises: [] },
];

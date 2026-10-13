import type { Trainer } from '@/domain/types';
import { DEFAULT_FOCUS_AREAS, findOrCreateExercise, findOrCreateFocusArea } from '@/repositories/focusAreas';
import { ensureLocalTrainer, getSetting, setSetting } from '@/repositories/settings';

import { runMigrations } from './migrations';
import type { SqlDatabase } from './types';

/**
 * Prepares a freshly opened database: schema migrations, the local trainer
 * and the default focus-area catalogue (seeded once, then fully editable).
 */
export async function bootstrapDatabase(db: SqlDatabase): Promise<{ trainer: Trainer }> {
  await runMigrations(db);
  const trainer = await ensureLocalTrainer(db);
  const seeded = await getSetting<boolean>(db, 'seededFocusAreas');
  if (!seeded) {
    await db.transaction(async (tx) => {
      for (const fa of DEFAULT_FOCUS_AREAS) {
        const area = await findOrCreateFocusArea(tx, fa.name, trainer.id);
        for (const ex of fa.exercises) await findOrCreateExercise(tx, area.id, ex);
      }
      await setSetting(tx, 'seededFocusAreas', true);
    });
  }
  return { trainer };
}

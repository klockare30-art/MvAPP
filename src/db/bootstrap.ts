import type { Trainer } from '@/domain/types';
import {
  DEFAULT_FOCUS_AREAS,
  findOrCreateExercise,
  findOrCreateFocusArea,
  FOCUS_AREA_SEED_VERSION,
} from '@/repositories/focusAreas';
import { ensureLocalTrainer, getSetting, setSetting } from '@/repositories/settings';

import { runMigrations } from './migrations';
import type { SqlDatabase } from './types';

/**
 * Prepares a freshly opened database: schema migrations, the local trainer
 * and the default focus-area catalogue (versioned seed, then fully editable).
 */
export async function bootstrapDatabase(db: SqlDatabase): Promise<{ trainer: Trainer }> {
  await runMigrations(db);
  const trainer = await ensureLocalTrainer(db);
  // Version 1 was stored as the boolean flag 'seededFocusAreas'.
  const legacy = await getSetting<boolean>(db, 'seededFocusAreas');
  const seeded = (await getSetting<number>(db, 'focusAreaSeedVersion')) ?? (legacy ? 1 : 0);
  if (seeded < FOCUS_AREA_SEED_VERSION) {
    await db.transaction(async (tx) => {
      for (const fa of DEFAULT_FOCUS_AREAS) {
        if (fa.since <= seeded) continue;
        const area = await findOrCreateFocusArea(tx, fa.name, trainer.id);
        for (const ex of fa.exercises) await findOrCreateExercise(tx, area.id, ex);
      }
      await setSetting(tx, 'focusAreaSeedVersion', FOCUS_AREA_SEED_VERSION);
    });
  }
  return { trainer };
}

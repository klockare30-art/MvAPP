import type { Id } from '@/domain/types';
import { findOrCreateFocusArea } from '@/repositories/focusAreas';
import { createGoaltender, listGoaltenders } from '@/repositories/goaltenders';
import { createSession } from '@/repositories/sessions';
import { addMembership, createTeam, listTeams } from '@/repositories/teams';

import type { SqlDatabase } from './types';

/**
 * EXEMPELDATA — only created when the coach explicitly presses the button in
 * Settings. Mirrors the first acceptance test (Borlänge Hockey U16). It never
 * creates media; all videos come from the real camera.
 */
export async function createDemoData(db: SqlDatabase, trainerId: Id): Promise<Id> {
  const teams = await listTeams(db);
  const team =
    teams.find((t) => t.clubName === 'Borlänge Hockey' && t.name === 'U16') ??
    (await createTeam(db, { clubName: 'Borlänge Hockey', name: 'U16', ageCategory: 'U16', season: '2026/2027' }));

  const existing = await listGoaltenders(db);
  const wanted = [
    { firstName: 'Erik', jerseyNumber: 30 },
    { firstName: 'William', jerseyNumber: 35 },
    { firstName: 'Oliver', jerseyNumber: 1 },
  ];
  const goalieIds: Id[] = [];
  for (const w of wanted) {
    const found = existing.find((g) => g.firstName === w.firstName && g.jerseyNumber === w.jerseyNumber);
    const g = found ?? (await createGoaltender(db, { ...w, lastName: '', teamIds: [team.id] }));
    await addMembership(db, team.id, g.id);
    goalieIds.push(g.id);
  }
  const focusIds: Id[] = [];
  for (const name of ['Förflyttningar', 'Butterfly', 'Stolpspel', 'Returkontroll']) {
    focusIds.push((await findOrCreateFocusArea(db, name, trainerId)).id);
  }
  return createSession(db, {
    teamId: team.id,
    trainerId,
    title: 'Målvaktsträning U16',
    scheduledAt: new Date().toISOString(),
    goaltenderIds: goalieIds,
    focusAreaIds: focusIds,
  });
}

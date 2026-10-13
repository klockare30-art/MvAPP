import type { SqlDatabase, SqlExecutor } from '@/db/types';
import type { Goaltender, Id, Team } from '@/domain/types';
import { newId } from '@/utils/id';
import { nowIso } from '@/utils/time';

import { mapGoaltender, mapTeam, TEAM_SELECT, type GoaltenderRow, type TeamRow } from './rows';

export interface GoaltenderInput {
  firstName: string;
  lastName?: string;
  jerseyNumber?: number | null;
  email?: string | null;
  photoUri?: string | null;
  teamIds?: Id[];
  /** Coach has confirmed consent to publish to the portal. Keeps the original date when already set. */
  publishConsent?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGoaltenderInput(input: GoaltenderInput): string | null {
  if (!input.firstName.trim()) return 'Förnamn saknas.';
  if (input.jerseyNumber != null && (!Number.isInteger(input.jerseyNumber) || input.jerseyNumber < 0 || input.jerseyNumber > 99)) {
    return 'Tröjnummer måste vara ett heltal mellan 0 och 99.';
  }
  const email = input.email?.trim();
  if (email && !EMAIL_RE.test(email)) return 'E-postadressen är ogiltig.';
  if (input.publishConsent && !email) return 'E-postadress krävs för att målvakten ska kunna logga in i portalen.';
  return null;
}

export async function listGoaltenders(db: SqlExecutor): Promise<Goaltender[]> {
  const rows = await db.all<GoaltenderRow>(
    'SELECT * FROM goaltenders WHERE archived = 0 ORDER BY first_name, last_name',
  );
  return rows.map(mapGoaltender);
}

export async function getGoaltender(db: SqlExecutor, id: Id): Promise<Goaltender | null> {
  const row = await db.first<GoaltenderRow>('SELECT * FROM goaltenders WHERE id = ?', [id]);
  return row ? mapGoaltender(row) : null;
}

export async function createGoaltender(db: SqlDatabase, input: GoaltenderInput): Promise<Goaltender> {
  const error = validateGoaltenderInput(input);
  if (error) throw new Error(error);
  const id = newId();
  const now = nowIso();
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO goaltenders (id, first_name, last_name, jersey_number, email, photo_uri, publish_consent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.firstName.trim(),
        (input.lastName ?? '').trim(),
        input.jerseyNumber ?? null,
        input.email?.trim() || null,
        input.photoUri ?? null,
        input.publishConsent ? now : null,
        now,
        now,
      ],
    );
    for (const teamId of input.teamIds ?? []) {
      await tx.run(
        'INSERT OR IGNORE INTO team_memberships (id, team_id, goaltender_id, created_at) VALUES (?, ?, ?, ?)',
        [newId(), teamId, id, now],
      );
    }
  });
  const g = await getGoaltender(db, id);
  if (!g) throw new Error('Målvakten kunde inte sparas.');
  return g;
}

export async function updateGoaltender(db: SqlDatabase, id: Id, input: GoaltenderInput): Promise<void> {
  const error = validateGoaltenderInput(input);
  if (error) throw new Error(error);
  await db.transaction(async (tx) => {
    const now = nowIso();
    await tx.run(
      `UPDATE goaltenders SET first_name = ?, last_name = ?, jersey_number = ?, email = ?, photo_uri = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.firstName.trim(),
        (input.lastName ?? '').trim(),
        input.jerseyNumber ?? null,
        input.email?.trim() || null,
        input.photoUri ?? null,
        now,
        id,
      ],
    );
    if (input.publishConsent !== undefined) {
      await tx.run(
        `UPDATE goaltenders SET publish_consent_at = CASE WHEN ? = 1 THEN COALESCE(publish_consent_at, ?) ELSE NULL END
         WHERE id = ?`,
        [input.publishConsent ? 1 : 0, now, id],
      );
    }
    if (input.teamIds) {
      // Replace memberships with the given set. Profiles are never duplicated per team.
      const placeholders = input.teamIds.map(() => '?').join(',');
      if (input.teamIds.length) {
        await tx.run(
          `DELETE FROM team_memberships WHERE goaltender_id = ? AND team_id NOT IN (${placeholders})`,
          [id, ...input.teamIds],
        );
      } else {
        await tx.run('DELETE FROM team_memberships WHERE goaltender_id = ?', [id]);
      }
      for (const teamId of input.teamIds) {
        await tx.run(
          'INSERT OR IGNORE INTO team_memberships (id, team_id, goaltender_id, created_at) VALUES (?, ?, ?, ?)',
          [newId(), teamId, id, now],
        );
      }
    }
  });
}

/** Goaltenders with videos are archived (hidden) rather than deleted; videos must keep their owner. */
export async function archiveGoaltender(db: SqlExecutor, id: Id): Promise<void> {
  await db.run('UPDATE goaltenders SET archived = 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function listGoaltenderTeams(db: SqlExecutor, goaltenderId: Id): Promise<Team[]> {
  const rows = await db.all<TeamRow>(
    `${TEAM_SELECT}
     JOIN team_memberships m ON m.team_id = t.id
     WHERE m.goaltender_id = ? AND t.archived = 0
     ORDER BY c.name, t.name`,
    [goaltenderId],
  );
  return rows.map(mapTeam);
}

/** Map of goaltender id -> team ids, used by list screens. */
export async function listAllMemberships(db: SqlExecutor): Promise<Map<Id, Id[]>> {
  const rows = await db.all<{ goaltender_id: string; team_id: string }>(
    'SELECT goaltender_id, team_id FROM team_memberships',
  );
  const map = new Map<Id, Id[]>();
  for (const r of rows) {
    const list = map.get(r.goaltender_id) ?? [];
    list.push(r.team_id);
    map.set(r.goaltender_id, list);
  }
  return map;
}

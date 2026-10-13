import type { SqlDatabase, SqlExecutor } from '@/db/types';
import type { Goaltender, Id, Team } from '@/domain/types';
import { newId } from '@/utils/id';
import { nowIso } from '@/utils/time';

import { mapGoaltender, mapTeam, TEAM_SELECT, type GoaltenderRow, type TeamRow } from './rows';

export interface TeamInput {
  clubName: string;
  name: string;
  ageCategory?: string | null;
  season?: string | null;
  logoUri?: string | null;
}

function clean(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t.length ? t : null;
}

async function findOrCreateClub(db: SqlExecutor, name: string): Promise<Id> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Klubbnamn saknas.');
  const existing = await db.first<{ id: string }>('SELECT id FROM clubs WHERE name = ?', [trimmed]);
  if (existing) return existing.id;
  const id = newId();
  const now = nowIso();
  await db.run('INSERT INTO clubs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, trimmed, now, now]);
  return id;
}

export async function listTeams(db: SqlExecutor): Promise<Team[]> {
  const rows = await db.all<TeamRow>(`${TEAM_SELECT} WHERE t.archived = 0 ORDER BY c.name, t.name`);
  return rows.map(mapTeam);
}

export async function getTeam(db: SqlExecutor, id: Id): Promise<Team | null> {
  const row = await db.first<TeamRow>(`${TEAM_SELECT} WHERE t.id = ?`, [id]);
  return row ? mapTeam(row) : null;
}

export async function createTeam(db: SqlDatabase, input: TeamInput): Promise<Team> {
  const name = input.name.trim();
  if (!name) throw new Error('Lagnamn saknas.');
  const id = newId();
  await db.transaction(async (tx) => {
    const clubId = await findOrCreateClub(tx, input.clubName);
    const now = nowIso();
    await tx.run(
      `INSERT INTO teams (id, club_id, name, age_category, season, logo_uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, clubId, name, clean(input.ageCategory), clean(input.season), input.logoUri ?? null, now, now],
    );
  });
  const team = await getTeam(db, id);
  if (!team) throw new Error('Laget kunde inte sparas.');
  return team;
}

export async function updateTeam(db: SqlDatabase, id: Id, input: TeamInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('Lagnamn saknas.');
  await db.transaction(async (tx) => {
    const clubId = await findOrCreateClub(tx, input.clubName);
    await tx.run(
      `UPDATE teams SET club_id = ?, name = ?, age_category = ?, season = ?, logo_uri = ?, updated_at = ? WHERE id = ?`,
      [clubId, name, clean(input.ageCategory), clean(input.season), input.logoUri ?? null, nowIso(), id],
    );
  });
}

/** Teams with history are archived instead of deleted so recordings keep their context. */
export async function archiveTeam(db: SqlExecutor, id: Id): Promise<void> {
  await db.run('UPDATE teams SET archived = 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function listTeamGoaltenders(db: SqlExecutor, teamId: Id): Promise<Goaltender[]> {
  const rows = await db.all<GoaltenderRow>(
    `SELECT g.* FROM goaltenders g
     JOIN team_memberships m ON m.goaltender_id = g.id
     WHERE m.team_id = ? AND g.archived = 0
     ORDER BY g.jersey_number IS NULL, g.jersey_number, g.first_name`,
    [teamId],
  );
  return rows.map(mapGoaltender);
}

export async function addMembership(db: SqlExecutor, teamId: Id, goaltenderId: Id): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO team_memberships (id, team_id, goaltender_id, created_at) VALUES (?, ?, ?, ?)`,
    [newId(), teamId, goaltenderId, nowIso()],
  );
}

export async function removeMembership(db: SqlExecutor, teamId: Id, goaltenderId: Id): Promise<void> {
  await db.run('DELETE FROM team_memberships WHERE team_id = ? AND goaltender_id = ?', [teamId, goaltenderId]);
}

export async function listClubNames(db: SqlExecutor): Promise<string[]> {
  const rows = await db.all<{ name: string }>('SELECT name FROM clubs ORDER BY name');
  return rows.map((r) => r.name);
}

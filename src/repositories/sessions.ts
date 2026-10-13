import type { SqlDatabase, SqlExecutor } from '@/db/types';
import type { Id, SessionStatus, TrainingSession, TrainingSessionDetails } from '@/domain/types';
import { newId } from '@/utils/id';
import { nowIso } from '@/utils/time';

import { mapExercise, mapFocusArea } from './focusAreas';
import { mapGoaltender, mapTeam, TEAM_SELECT, type GoaltenderRow, type TeamRow } from './rows';

interface SessionRow {
  id: string;
  team_id: string;
  trainer_id: string;
  title: string;
  scheduled_at: string;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  active_goaltender_id: string | null;
  active_focus_area_id: string | null;
  active_exercise_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapSession(r: SessionRow): TrainingSession {
  return {
    id: r.id,
    teamId: r.team_id,
    trainerId: r.trainer_id,
    title: r.title,
    scheduledAt: r.scheduled_at,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    notes: r.notes,
    activeGoaltenderId: r.active_goaltender_id,
    activeFocusAreaId: r.active_focus_area_id,
    activeExerciseId: r.active_exercise_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface SessionInput {
  teamId: Id;
  trainerId: Id;
  title: string;
  scheduledAt: string;
  notes?: string | null;
  goaltenderIds: Id[];
  focusAreaIds: Id[];
  exerciseIds?: Id[];
}

export function validateSessionInput(input: SessionInput): string | null {
  if (!input.teamId) return 'Välj ett lag.';
  if (!input.title.trim()) return 'Ge träningen ett namn.';
  if (input.goaltenderIds.length === 0) return 'Välj minst en målvakt.';
  if (input.focusAreaIds.length === 0) return 'Välj minst ett fokusområde.';
  return null;
}

async function writeSessionChildren(tx: SqlExecutor, sessionId: Id, input: SessionInput): Promise<void> {
  await tx.run('DELETE FROM training_participants WHERE session_id = ?', [sessionId]);
  await tx.run('DELETE FROM session_focus_areas WHERE session_id = ?', [sessionId]);
  await tx.run('DELETE FROM session_exercises WHERE session_id = ?', [sessionId]);
  let i = 0;
  for (const gid of input.goaltenderIds) {
    await tx.run(
      'INSERT INTO training_participants (id, session_id, goaltender_id, sort_order) VALUES (?, ?, ?, ?)',
      [newId(), sessionId, gid, i++],
    );
  }
  i = 0;
  for (const fid of input.focusAreaIds) {
    await tx.run(
      'INSERT INTO session_focus_areas (id, session_id, focus_area_id, sort_order) VALUES (?, ?, ?, ?)',
      [newId(), sessionId, fid, i++],
    );
  }
  i = 0;
  for (const eid of input.exerciseIds ?? []) {
    await tx.run(
      'INSERT INTO session_exercises (id, session_id, exercise_id, sort_order) VALUES (?, ?, ?, ?)',
      [newId(), sessionId, eid, i++],
    );
  }
}

export async function createSession(db: SqlDatabase, input: SessionInput): Promise<Id> {
  const error = validateSessionInput(input);
  if (error) throw new Error(error);
  const id = newId();
  const now = nowIso();
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO training_sessions (id, team_id, trainer_id, title, scheduled_at, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
      [id, input.teamId, input.trainerId, input.title.trim(), input.scheduledAt, input.notes?.trim() || null, now, now],
    );
    await writeSessionChildren(tx, id, input);
  });
  return id;
}

/**
 * Updates a session's plan. Participants that already have recordings in the
 * session cannot be removed — this protects video ownership context.
 */
export async function updateSession(db: SqlDatabase, id: Id, input: SessionInput): Promise<void> {
  const error = validateSessionInput(input);
  if (error) throw new Error(error);
  await db.transaction(async (tx) => {
    const withVideos = await tx.all<{ goaltender_id: string }>(
      'SELECT DISTINCT goaltender_id FROM video_recordings WHERE session_id = ?',
      [id],
    );
    const missing = withVideos.filter((r) => !input.goaltenderIds.includes(r.goaltender_id));
    if (missing.length) {
      throw new Error('En målvakt som redan har inspelningar i träningen kan inte tas bort.');
    }
    await tx.run(
      `UPDATE training_sessions SET team_id = ?, title = ?, scheduled_at = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [input.teamId, input.title.trim(), input.scheduledAt, input.notes?.trim() || null, nowIso(), id],
    );
    await writeSessionChildren(tx, id, input);
    // Clear a stale active selection that no longer belongs to the plan.
    await tx.run(
      `UPDATE training_sessions SET
         active_goaltender_id = CASE WHEN active_goaltender_id IN (SELECT goaltender_id FROM training_participants WHERE session_id = ?) THEN active_goaltender_id ELSE NULL END,
         active_focus_area_id = CASE WHEN active_focus_area_id IN (SELECT focus_area_id FROM session_focus_areas WHERE session_id = ?) THEN active_focus_area_id ELSE NULL END,
         active_exercise_id = CASE WHEN active_exercise_id IN (SELECT exercise_id FROM session_exercises WHERE session_id = ?) THEN active_exercise_id ELSE NULL END
       WHERE id = ?`,
      [id, id, id, id],
    );
  });
}

export interface SessionListItem extends TrainingSession {
  teamName: string;
  clubName: string;
  participantCount: number;
  videoCount: number;
}

export async function listSessions(
  db: SqlExecutor,
  opts: { status?: SessionStatus[]; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<SessionListItem[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status?.length) {
    where.push(`s.status IN (${opts.status.map(() => '?').join(',')})`);
    params.push(...opts.status);
  }
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';
  const limit = opts.limit ? `LIMIT ${Math.floor(opts.limit)}` : '';
  const rows = await db.all<SessionRow & { team_name: string; club_name: string; participant_count: number; video_count: number }>(
    `SELECT s.*, t.name AS team_name, c.name AS club_name,
       (SELECT COUNT(*) FROM training_participants p WHERE p.session_id = s.id) AS participant_count,
       (SELECT COUNT(*) FROM video_recordings v WHERE v.session_id = s.id) AS video_count
     FROM training_sessions s
     JOIN teams t ON t.id = s.team_id
     JOIN clubs c ON c.id = t.club_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.scheduled_at ${order}
     ${limit}`,
    params,
  );
  return rows.map((r) => ({
    ...mapSession(r),
    teamName: r.team_name,
    clubName: r.club_name,
    participantCount: r.participant_count,
    videoCount: r.video_count,
  }));
}

export async function getSession(db: SqlExecutor, id: Id): Promise<TrainingSession | null> {
  const row = await db.first<SessionRow>('SELECT * FROM training_sessions WHERE id = ?', [id]);
  return row ? mapSession(row) : null;
}

export async function getSessionDetails(db: SqlExecutor, id: Id): Promise<TrainingSessionDetails | null> {
  const session = await getSession(db, id);
  if (!session) return null;
  const team = await db.first<TeamRow>(`${TEAM_SELECT} WHERE t.id = ?`, [session.teamId]);
  if (!team) return null;
  const participants = await db.all<GoaltenderRow>(
    `SELECT g.* FROM goaltenders g JOIN training_participants p ON p.goaltender_id = g.id
     WHERE p.session_id = ? ORDER BY p.sort_order`,
    [id],
  );
  const focusAreas = await db.all<{ id: string; name: string; usage_count: number; last_used_at: string | null }>(
    `SELECT f.id, f.name, f.usage_count, f.last_used_at FROM focus_areas f
     JOIN session_focus_areas sf ON sf.focus_area_id = f.id
     WHERE sf.session_id = ? ORDER BY sf.sort_order`,
    [id],
  );
  const exercises = await db.all<{
    id: string;
    focus_area_id: string;
    name: string;
    usage_count: number;
    last_used_at: string | null;
  }>(
    `SELECT e.id, e.focus_area_id, e.name, e.usage_count, e.last_used_at FROM exercises e
     JOIN session_exercises se ON se.exercise_id = e.id
     WHERE se.session_id = ? ORDER BY se.sort_order`,
    [id],
  );
  return {
    ...session,
    team: mapTeam(team),
    participants: participants.map(mapGoaltender),
    focusAreas: focusAreas.map(mapFocusArea),
    exercises: exercises.map(mapExercise),
  };
}

/** Copies team, participants, focus areas and exercises into a new planned session. */
export async function duplicateSession(db: SqlDatabase, sourceId: Id, scheduledAt: string): Promise<Id> {
  const src = await getSessionDetails(db, sourceId);
  if (!src) throw new Error('Träningen hittades inte.');
  return createSession(db, {
    teamId: src.teamId,
    trainerId: src.trainerId,
    title: src.title,
    scheduledAt,
    notes: src.notes,
    goaltenderIds: src.participants.map((g) => g.id),
    focusAreaIds: src.focusAreas.map((f) => f.id),
    exerciseIds: src.exercises.map((e) => e.id),
  });
}

export async function startSession(db: SqlExecutor, id: Id): Promise<void> {
  await db.run(
    `UPDATE training_sessions SET status = 'active', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`,
    [nowIso(), nowIso(), id],
  );
}

export async function completeSession(db: SqlExecutor, id: Id): Promise<void> {
  await db.run(
    `UPDATE training_sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?`,
    [nowIso(), nowIso(), id],
  );
}

export async function setActiveSelection(
  db: SqlExecutor,
  id: Id,
  sel: { goaltenderId: Id | null; focusAreaId: Id | null; exerciseId: Id | null },
): Promise<void> {
  await db.run(
    `UPDATE training_sessions SET active_goaltender_id = ?, active_focus_area_id = ?, active_exercise_id = ? WHERE id = ?`,
    [sel.goaltenderId, sel.focusAreaId, sel.exerciseId, id],
  );
}

/** Sessions with recordings cannot be deleted (recordings would lose their context). */
export async function deleteSession(db: SqlDatabase, id: Id): Promise<void> {
  await db.transaction(async (tx) => {
    const v = await tx.first<{ n: number }>('SELECT COUNT(*) AS n FROM video_recordings WHERE session_id = ?', [id]);
    if ((v?.n ?? 0) > 0) throw new Error('Träningen har inspelningar och kan inte tas bort.');
    await tx.run('DELETE FROM training_sessions WHERE id = ?', [id]);
  });
}

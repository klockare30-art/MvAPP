import type { SqlExecutor } from '@/db/types';
import type { Id, PublicationStatus, ReviewStatus, VideoKind, VideoListItem, VideoRecording } from '@/domain/types';
import { nowIso } from '@/utils/time';

interface VideoRow {
  id: string;
  session_id: string | null;
  goaltender_id: string;
  focus_area_id: string | null;
  exercise_id: string | null;
  kind: VideoKind;
  source_video_id: string | null;
  clip_start_ms: number | null;
  clip_end_ms: number | null;
  file_name: string;
  recorded_at: string;
  duration_ms: number;
  duration_source: 'clock' | 'media';
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  codec: string | null;
  review_status: ReviewStatus;
  publication_status: PublicationStatus;
  recovered: number;
  note: string | null;
  remote_id: string | null;
  published_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoListRow extends VideoRow {
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  focus_area_name: string | null;
  exercise_name: string | null;
  session_title: string | null;
  team_id: string | null;
  team_name: string | null;
}

function mapVideo(r: VideoRow): VideoRecording {
  return {
    id: r.id,
    sessionId: r.session_id,
    goaltenderId: r.goaltender_id,
    focusAreaId: r.focus_area_id,
    exerciseId: r.exercise_id,
    kind: r.kind,
    sourceVideoId: r.source_video_id,
    clipStartMs: r.clip_start_ms,
    clipEndMs: r.clip_end_ms,
    fileName: r.file_name,
    recordedAt: r.recorded_at,
    durationMs: r.duration_ms,
    durationSource: r.duration_source,
    fileSizeBytes: r.file_size_bytes,
    width: r.width,
    height: r.height,
    frameRate: r.frame_rate,
    codec: r.codec,
    reviewStatus: r.review_status,
    publicationStatus: r.publication_status,
    recovered: r.recovered === 1,
    note: r.note,
    remoteId: r.remote_id,
    publishedAt: r.published_at,
    publishError: r.publish_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapListItem(r: VideoListRow): VideoListItem {
  return {
    ...mapVideo(r),
    goaltenderName: `${r.first_name} ${r.last_name}`.trim(),
    jerseyNumber: r.jersey_number,
    focusAreaName: r.focus_area_name,
    exerciseName: r.exercise_name,
    sessionTitle: r.session_title,
    teamId: r.team_id,
    teamName: r.team_name,
  };
}

const LIST_SELECT = `
SELECT v.*, g.first_name, g.last_name, g.jersey_number,
  f.name AS focus_area_name, e.name AS exercise_name,
  s.title AS session_title, t.id AS team_id, t.name AS team_name
FROM video_recordings v
JOIN goaltenders g ON g.id = v.goaltender_id
LEFT JOIN focus_areas f ON f.id = v.focus_area_id
LEFT JOIN exercises e ON e.id = v.exercise_id
LEFT JOIN training_sessions s ON s.id = v.session_id
LEFT JOIN teams t ON t.id = s.team_id`;

export interface NewVideoInput {
  id: Id;
  sessionId: Id | null;
  goaltenderId: Id;
  focusAreaId: Id | null;
  exerciseId: Id | null;
  fileName: string;
  recordedAt: string;
  durationMs: number;
  fileSizeBytes: number;
  codec: string | null;
  recovered?: boolean;
  kind?: VideoKind;
  sourceVideoId?: Id | null;
  clipStartMs?: number | null;
  clipEndMs?: number | null;
}

export async function insertVideo(db: SqlExecutor, v: NewVideoInput): Promise<void> {
  if (!v.goaltenderId) throw new Error('En video måste tillhöra en målvakt.');
  const now = nowIso();
  await db.run(
    `INSERT INTO video_recordings (
       id, session_id, goaltender_id, focus_area_id, exercise_id, kind, source_video_id, clip_start_ms, clip_end_ms,
       file_name, recorded_at, duration_ms, duration_source, file_size_bytes, codec, recovered, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clock', ?, ?, ?, ?, ?)`,
    [
      v.id,
      v.sessionId,
      v.goaltenderId,
      v.focusAreaId,
      v.exerciseId,
      v.kind ?? 'recording',
      v.sourceVideoId ?? null,
      v.clipStartMs ?? null,
      v.clipEndMs ?? null,
      v.fileName,
      v.recordedAt,
      Math.round(v.durationMs),
      v.fileSizeBytes,
      v.codec,
      v.recovered ? 1 : 0,
      now,
      now,
    ],
  );
}

export async function getVideo(db: SqlExecutor, id: Id): Promise<VideoListItem | null> {
  const row = await db.first<VideoListRow>(`${LIST_SELECT} WHERE v.id = ?`, [id]);
  return row ? mapListItem(row) : null;
}

export interface VideoFilter {
  goaltenderId?: Id;
  sessionId?: Id;
  teamId?: Id;
  focusAreaId?: Id;
  exerciseId?: Id;
  reviewStatus?: ReviewStatus[];
  /** Inclusive ISO lower bound for recorded_at. */
  from?: string;
  /** Exclusive ISO upper bound for recorded_at. */
  to?: string;
  limit?: number;
}

export async function listVideos(db: SqlExecutor, f: VideoFilter = {}): Promise<VideoListItem[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (f.goaltenderId) {
    where.push('v.goaltender_id = ?');
    params.push(f.goaltenderId);
  }
  if (f.sessionId) {
    where.push('v.session_id = ?');
    params.push(f.sessionId);
  }
  if (f.teamId) {
    where.push('s.team_id = ?');
    params.push(f.teamId);
  }
  if (f.focusAreaId) {
    where.push('v.focus_area_id = ?');
    params.push(f.focusAreaId);
  }
  if (f.exerciseId) {
    where.push('v.exercise_id = ?');
    params.push(f.exerciseId);
  }
  if (f.reviewStatus?.length) {
    where.push(`v.review_status IN (${f.reviewStatus.map(() => '?').join(',')})`);
    params.push(...f.reviewStatus);
  }
  if (f.from) {
    where.push('v.recorded_at >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('v.recorded_at < ?');
    params.push(f.to);
  }
  const limit = f.limit ? `LIMIT ${Math.floor(f.limit)}` : '';
  const rows = await db.all<VideoListRow>(
    `${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY v.recorded_at DESC ${limit}`,
    params,
  );
  return rows.map(mapListItem);
}

export async function latestVideoInSession(db: SqlExecutor, sessionId: Id): Promise<VideoListItem | null> {
  const row = await db.first<VideoListRow>(
    `${LIST_SELECT} WHERE v.session_id = ? ORDER BY v.recorded_at DESC LIMIT 1`,
    [sessionId],
  );
  return row ? mapListItem(row) : null;
}

export async function countVideosByGoaltender(db: SqlExecutor, sessionId: Id): Promise<Map<Id, number>> {
  const rows = await db.all<{ goaltender_id: string; n: number }>(
    'SELECT goaltender_id, COUNT(*) AS n FROM video_recordings WHERE session_id = ? GROUP BY goaltender_id',
    [sessionId],
  );
  return new Map(rows.map((r) => [r.goaltender_id, r.n]));
}

export interface FocusAreaCount {
  focusAreaId: Id | null;
  focusAreaName: string | null;
  count: number;
}

/** Per-goaltender library grouping: "Förflyttningar — 18 inspelningar". */
export async function countVideosByFocusArea(db: SqlExecutor, goaltenderId: Id): Promise<FocusAreaCount[]> {
  const rows = await db.all<{ focus_area_id: string | null; name: string | null; n: number }>(
    `SELECT v.focus_area_id, f.name, COUNT(*) AS n FROM video_recordings v
     LEFT JOIN focus_areas f ON f.id = v.focus_area_id
     WHERE v.goaltender_id = ?
     GROUP BY v.focus_area_id ORDER BY n DESC, f.name`,
    [goaltenderId],
  );
  return rows.map((r) => ({ focusAreaId: r.focus_area_id, focusAreaName: r.name, count: r.n }));
}

/** Replaces the wall-clock estimate with real media values once the file is loaded by the player. */
export async function updateMediaInfo(
  db: SqlExecutor,
  id: Id,
  info: { durationMs: number; width?: number | null; height?: number | null; frameRate?: number | null },
): Promise<void> {
  await db.run(
    `UPDATE video_recordings SET duration_ms = ?, duration_source = 'media',
       width = COALESCE(?, width), height = COALESCE(?, height), frame_rate = COALESCE(?, frame_rate), updated_at = ?
     WHERE id = ?`,
    [Math.round(info.durationMs), info.width ?? null, info.height ?? null, info.frameRate ?? null, nowIso(), id],
  );
}

export async function setReviewStatus(db: SqlExecutor, ids: Id[], status: ReviewStatus): Promise<void> {
  if (!ids.length) return;
  await db.run(
    `UPDATE video_recordings SET review_status = ?, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [status, nowIso(), ...ids],
  );
}

export async function updateVideoTags(
  db: SqlExecutor,
  id: Id,
  tags: { focusAreaId: Id | null; exerciseId: Id | null; note?: string | null },
): Promise<void> {
  await db.run(
    'UPDATE video_recordings SET focus_area_id = ?, exercise_id = ?, note = ?, updated_at = ? WHERE id = ?',
    [tags.focusAreaId, tags.exerciseId, tags.note ?? null, nowIso(), id],
  );
}

/** Records the outcome of a publish/unpublish attempt. */
export async function setPublication(
  db: SqlExecutor,
  id: Id,
  p: { status: PublicationStatus; remoteId?: string | null; publishedAt?: string | null; error?: string | null },
): Promise<void> {
  await db.run(
    `UPDATE video_recordings SET publication_status = ?, remote_id = ?, published_at = ?, publish_error = ?,
       review_status = CASE
         WHEN ? = 'published' THEN 'published'
         WHEN review_status = 'published' THEN 'keep'
         ELSE review_status END,
       updated_at = ?
     WHERE id = ?`,
    [p.status, p.remoteId ?? null, p.publishedAt ?? null, p.error ?? null, p.status, nowIso(), id],
  );
}

export async function deleteVideoRow(db: SqlExecutor, id: Id): Promise<void> {
  await db.run('DELETE FROM video_recordings WHERE id = ?', [id]);
}

export async function listAllVideoFileNames(db: SqlExecutor): Promise<Set<string>> {
  const rows = await db.all<{ file_name: string }>('SELECT file_name FROM video_recordings');
  return new Set(rows.map((r) => r.file_name));
}

export async function videoStorageStats(db: SqlExecutor): Promise<{ count: number; bytes: number; durationMs: number }> {
  const row = await db.first<{ n: number; b: number | null; d: number | null }>(
    'SELECT COUNT(*) AS n, SUM(file_size_bytes) AS b, SUM(duration_ms) AS d FROM video_recordings',
  );
  return { count: row?.n ?? 0, bytes: row?.b ?? 0, durationMs: row?.d ?? 0 };
}

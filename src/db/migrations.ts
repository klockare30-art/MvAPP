import type { SqlDatabase } from './types';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Ordered schema migrations. Never edit a migration that has shipped to a
 * device; add a new one instead.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE trainers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clubs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  age_category TEXT,
  season TEXT,
  logo_uri TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_teams_club ON teams(club_id);

CREATE TABLE goaltenders (
  id TEXT PRIMARY KEY NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  jersey_number INTEGER,
  email TEXT,
  photo_uri TEXT,
  user_account_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A goaltender can belong to several teams without duplicating the profile.
CREATE TABLE team_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  goaltender_id TEXT NOT NULL REFERENCES goaltenders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (team_id, goaltender_id)
);
CREATE INDEX idx_memberships_goalie ON team_memberships(goaltender_id);

CREATE TABLE focus_areas (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by TEXT REFERENCES trainers(id) ON DELETE SET NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL,
  focus_area_id TEXT NOT NULL REFERENCES focus_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (focus_area_id, name)
);

CREATE TABLE training_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  trainer_id TEXT NOT NULL REFERENCES trainers(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  started_at TEXT,
  ended_at TEXT,
  notes TEXT,
  active_goaltender_id TEXT REFERENCES goaltenders(id) ON DELETE SET NULL,
  active_focus_area_id TEXT REFERENCES focus_areas(id) ON DELETE SET NULL,
  active_exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_team ON training_sessions(team_id);
CREATE INDEX idx_sessions_scheduled ON training_sessions(scheduled_at);

CREATE TABLE training_participants (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  goaltender_id TEXT NOT NULL REFERENCES goaltenders(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, goaltender_id)
);

CREATE TABLE session_focus_areas (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  focus_area_id TEXT NOT NULL REFERENCES focus_areas(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, focus_area_id)
);

CREATE TABLE session_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, exercise_id)
);

-- Every video belongs to exactly one goaltender (NOT NULL + RESTRICT).
-- Trimmed clips are stored as rows with kind='clip' and source_video_id so they
-- appear in libraries and support review/comments/publication like recordings.
CREATE TABLE video_recordings (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT REFERENCES training_sessions(id) ON DELETE SET NULL,
  goaltender_id TEXT NOT NULL REFERENCES goaltenders(id) ON DELETE RESTRICT,
  focus_area_id TEXT REFERENCES focus_areas(id) ON DELETE SET NULL,
  exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'recording' CHECK (kind IN ('recording','clip')),
  source_video_id TEXT REFERENCES video_recordings(id) ON DELETE SET NULL,
  clip_start_ms INTEGER,
  clip_end_ms INTEGER,
  file_name TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  duration_source TEXT NOT NULL DEFAULT 'clock' CHECK (duration_source IN ('clock','media')),
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  frame_rate REAL,
  codec TEXT,
  review_status TEXT NOT NULL DEFAULT 'not_reviewed'
    CHECK (review_status IN ('not_reviewed','keep','edit','delete','ready_to_publish','published')),
  publication_status TEXT NOT NULL DEFAULT 'local'
    CHECK (publication_status IN ('local','queued','uploading','published','failed')),
  recovered INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  remote_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_videos_goalie ON video_recordings(goaltender_id, recorded_at);
CREATE INDEX idx_videos_session ON video_recordings(session_id, recorded_at);
CREATE INDEX idx_videos_focus ON video_recordings(focus_area_id);

CREATE TABLE video_comments (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL REFERENCES video_recordings(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('trainer','goaltender')),
  author_id TEXT NOT NULL,
  timestamp_ms INTEGER,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice')),
  content TEXT NOT NULL DEFAULT '',
  audio_file_name TEXT,
  remote_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_comments_video ON video_comments(video_id, timestamp_ms);

CREATE TABLE goal_calibrations (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT REFERENCES training_sessions(id) ON DELETE CASCADE,
  video_id TEXT REFERENCES video_recordings(id) ON DELETE CASCADE,
  top_left_x REAL NOT NULL, top_left_y REAL NOT NULL,
  top_right_x REAL NOT NULL, top_right_y REAL NOT NULL,
  bottom_left_x REAL NOT NULL, bottom_left_y REAL NOT NULL,
  bottom_right_x REAL NOT NULL, bottom_right_y REAL NOT NULL,
  orientation TEXT NOT NULL DEFAULT 'landscape',
  color TEXT NOT NULL DEFAULT '#FFFFFF',
  thickness REAL NOT NULL DEFAULT 3,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (session_id IS NOT NULL OR video_id IS NOT NULL)
);

CREATE TABLE video_annotations (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL REFERENCES video_recordings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('line','arrow','circle','rectangle','freehand')),
  points_json TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  duration_ms INTEGER,
  style_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_annotations_video ON video_annotations(video_id, timestamp_ms);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'portal_publication',
    sql: `
-- When the coach confirmed consent (goaltender/guardian) for publishing to the portal.
ALTER TABLE goaltenders ADD COLUMN publish_consent_at TEXT;
ALTER TABLE video_recordings ADD COLUMN published_at TEXT;
ALTER TABLE video_recordings ADD COLUMN publish_error TEXT;
`,
  },
];

export async function runMigrations(db: SqlDatabase): Promise<number> {
  await db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`);
  const row = await db.first<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  const current = row?.v ?? 0;
  let applied = 0;
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
    });
    applied++;
  }
  return applied;
}

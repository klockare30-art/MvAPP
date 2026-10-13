/**
 * Core domain types. All relationships use stable UUIDs, never names.
 * Timestamps are ISO-8601 strings (UTC). Durations and video positions are
 * stored in milliseconds.
 */

export type Id = string;

export interface Trainer {
  id: Id;
  name: string;
  email: string | null;
}

export interface Club {
  id: Id;
  name: string;
}

export interface Team {
  id: Id;
  clubId: Id;
  clubName: string;
  name: string;
  ageCategory: string | null;
  season: string | null;
  logoUri: string | null;
  createdAt: string;
}

export interface Goaltender {
  id: Id;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  email: string | null;
  photoUri: string | null;
  /** Future: linked portal account (Phase 4). */
  userAccountId: string | null;
  createdAt: string;
}

export interface FocusArea {
  id: Id;
  name: string;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface Exercise {
  id: Id;
  focusAreaId: Id;
  name: string;
  usageCount: number;
  lastUsedAt: string | null;
}

export type SessionStatus = 'planned' | 'active' | 'completed';

export interface TrainingSession {
  id: Id;
  teamId: Id;
  trainerId: Id;
  title: string;
  scheduledAt: string;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
  /** Last selection on the recording screen, restored when re-entering. */
  activeGoaltenderId: Id | null;
  activeFocusAreaId: Id | null;
  activeExerciseId: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingSessionDetails extends TrainingSession {
  team: Team;
  participants: Goaltender[];
  focusAreas: FocusArea[];
  /** Exercises prepared for this session (each belongs to one focus area). */
  exercises: Exercise[];
}

export type ReviewStatus =
  | 'not_reviewed'
  | 'keep'
  | 'edit'
  | 'delete'
  | 'ready_to_publish'
  | 'published';

/** Publication is a separate axis from review: unpublished videos never leave the device. */
export type PublicationStatus = 'local' | 'queued' | 'uploading' | 'published' | 'failed';

export type VideoKind = 'recording' | 'clip';

export interface VideoRecording {
  id: Id;
  sessionId: Id | null;
  goaltenderId: Id;
  focusAreaId: Id | null;
  exerciseId: Id | null;
  kind: VideoKind;
  /** For clips: the recording they were trimmed from. */
  sourceVideoId: Id | null;
  clipStartMs: number | null;
  clipEndMs: number | null;
  /**
   * File name relative to the app's video directory. Absolute paths are NOT
   * stored because the iOS app container path can change between app updates.
   */
  fileName: string;
  recordedAt: string;
  durationMs: number;
  /** 'clock' = measured with wall clock at record time, 'media' = read from the file. */
  durationSource: 'clock' | 'media';
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  codec: string | null;
  reviewStatus: ReviewStatus;
  publicationStatus: PublicationStatus;
  /** True when the file was recovered after an unexpected app termination. */
  recovered: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Video row joined with display names, used by lists and libraries. */
export interface VideoListItem extends VideoRecording {
  goaltenderName: string;
  jerseyNumber: number | null;
  focusAreaName: string | null;
  exerciseName: string | null;
  sessionTitle: string | null;
  teamId: Id | null;
  teamName: string | null;
}

export type CommentAuthorType = 'trainer' | 'goaltender';

export interface VideoComment {
  id: Id;
  videoId: Id;
  authorType: CommentAuthorType;
  authorId: Id;
  /** Optional reference to a video position. */
  timestampMs: number | null;
  /** 'voice' reserved for future voice annotations. */
  kind: 'text' | 'voice';
  content: string;
  audioFileName: string | null;
  createdAt: string;
}

export interface NormalizedPoint {
  /** 0..1 relative to the displayed video frame width (after orientation). */
  x: number;
  /** 0..1 relative to the displayed video frame height (after orientation). */
  y: number;
}

export interface GoalCalibration {
  id: Id;
  sessionId: Id | null;
  videoId: Id | null;
  topLeft: NormalizedPoint;
  topRight: NormalizedPoint;
  bottomLeft: NormalizedPoint;
  bottomRight: NormalizedPoint;
  orientation: 'landscape' | 'portrait';
  color: string;
  thickness: number;
  visible: boolean;
}

export type AnnotationType = 'line' | 'arrow' | 'circle' | 'rectangle' | 'freehand';

export interface VideoAnnotation {
  id: Id;
  videoId: Id;
  type: AnnotationType;
  points: NormalizedPoint[];
  timestampMs: number;
  durationMs: number | null;
  style: { color: string; width: number };
}

export function goaltenderDisplayName(g: Pick<Goaltender, 'firstName' | 'lastName'>): string {
  return `${g.firstName} ${g.lastName}`.trim();
}

export function goaltenderShortLabel(
  g: Pick<Goaltender, 'firstName' | 'jerseyNumber'>,
): string {
  return g.jerseyNumber != null ? `${g.firstName} #${g.jerseyNumber}` : g.firstName;
}

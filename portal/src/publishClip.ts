/** Publishing a tagged match clip to a goaltender (testable with a fake API). */

export interface CoachAccount {
  status: 'pending' | 'active' | 'suspended';
  planName: string | null;
  paidUntil: string | null;
  isActive: boolean;
  maxStorageBytes: number | null;
  usedStorageBytes: number;
  maxGoaltenders: number | null;
  goaltenderCount: number;
}

export interface CoachGoaltender {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  email: string;
  team_id: string | null;
  /** Set once the goaltender has logged in to the portal with this e-mail. */
  user_id: string | null;
  access_revoked_at: string | null;
}

export interface Club {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  season: string;
}

export interface GoaltenderInput {
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  email: string;
  teamId: string | null;
}

export interface ClipVideoRow {
  id: string;
  coach_id: string;
  goaltender_id: string;
  storage_path: string;
  focus_area: string | null;
  exercise: string | null;
  session_title: string | null;
  team_name: string | null;
  recorded_at: string;
  duration_ms: number;
  frame_rate: number | null;
  width: number | null;
  height: number | null;
  coach_note: string | null;
  session_kind: 'match' | 'traning';
}

export interface ClipPortalApi {
  userId(): Promise<string>;
  uploadFile(path: string, blob: Blob): Promise<void>;
  insertVideo(row: ClipVideoRow): Promise<void>;
  removeObject(path: string): Promise<void>;
}

/** Swedish reason why the coach cannot publish yet (null = OK). The database enforces the same rules. */
export function accountBlocker(account: CoachAccount | null, sizeBytes = 0): string | null {
  if (!account || account.status === 'pending') {
    return 'Ditt tränarkonto väntar på godkännande av administratören.';
  }
  if (account.status === 'suspended') return 'Ditt tränarkonto är avstängt. Kontakta administratören.';
  if (!account.isActive) {
    return account.paidUntil
      ? `Ditt tränarkonto var betalt till ${account.paidUntil}. Kontakta administratören för att förlänga.`
      : 'Ditt tränarkonto saknar nivå. Kontakta administratören.';
  }
  if (account.maxStorageBytes != null && account.usedStorageBytes + sizeBytes > account.maxStorageBytes) {
    return 'Lagringen på din nivå räcker inte för klippet. Ta bort gamla publiceringar eller byt nivå.';
  }
  return null;
}

export function goalieLabel(g: CoachGoaltender): string {
  return `${g.first_name} ${g.last_name}`.trim() + (g.jersey_number != null ? ` #${g.jersey_number}` : '');
}

export interface ClipToPublish {
  videoId: string;
  goaltenderId: string;
  blob: Blob;
  tagLabel: string;
  matchTitle: string;
  sessionKind: 'match' | 'traning';
  teamName: string | null;
  /** Match date (YYYY-MM-DD) plus the moment in the match, so clips sort in match order. */
  matchDate: string;
  atSec: number;
  durationMs: number;
  width: number | null;
  height: number | null;
}

/** The match clock as an ISO time: midnight of the match day plus the tag's position (keeps clips in match order). */
export function recordedAtFor(matchDate: string, atSec: number): string {
  const base = new Date(`${matchDate}T00:00:00`);
  const valid = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(valid.getTime() + Math.round(atSec * 1000)).toISOString();
}

/**
 * Upload the clip into <coach>/<goaltender>/<video>.mp4, then register it. If the
 * row cannot be written, the uploaded file is removed so nothing is orphaned.
 */
export async function publishClip(api: ClipPortalApi, clip: ClipToPublish): Promise<void> {
  const coachId = await api.userId();
  const path = `${coachId}/${clip.goaltenderId}/${clip.videoId}.mp4`;
  await api.uploadFile(path, clip.blob);
  try {
    await api.insertVideo({
      id: clip.videoId,
      coach_id: coachId,
      goaltender_id: clip.goaltenderId,
      storage_path: path,
      focus_area: clip.tagLabel,
      exercise: null,
      session_title: clip.matchTitle.trim() || (clip.sessionKind === 'match' ? 'Match' : 'Träning'),
      session_kind: clip.sessionKind,
      team_name: clip.teamName,
      recorded_at: recordedAtFor(clip.matchDate, clip.atSec),
      duration_ms: clip.durationMs,
      frame_rate: null,
      width: clip.width,
      height: clip.height,
      coach_note: null,
    });
  } catch (e) {
    await api.removeObject(path).catch(() => undefined);
    throw e;
  }
}

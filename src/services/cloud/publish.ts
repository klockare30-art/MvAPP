import type { SqlDatabase } from '@/db/types';
import type { Goaltender, Id, VideoListItem } from '@/domain/types';
import { getGoaltender } from '@/repositories/goaltenders';
import { getVideo, listVideos, setPublication } from '@/repositories/videos';
import { notifyDataChanged } from '@/state/dataEvents';
import { formatBytes, formatDate, nowIso } from '@/utils/time';

/**
 * Narrow interface to the portal backend. The real implementation wraps
 * supabase-js and a native file upload (see portalApi.ts); tests use a fake.
 */
export interface PortalApi {
  currentUserId(): Promise<string | null>;
  ensureCoach(id: string, name: string): Promise<void>;
  /** The signed-in coach's status, level and usage (null if no coach row exists). */
  coachAccount(): Promise<CoachAccount | null>;
  /** Insert the goaltender, or update the coach-editable fields when it exists. */
  upsertGoaltender(row: RemoteGoaltender): Promise<void>;
  createSignedUpload(path: string): Promise<{ signedUrl: string }>;
  uploadFile(fileName: string, signedUrl: string, contentType: string, onProgress?: (fraction: number) => void): Promise<void>;
  insertPublishedVideo(row: RemotePublishedVideo): Promise<void>;
  deletePublishedVideo(id: string): Promise<void>;
  removeObject(path: string): Promise<void>;
  /** Deletes the goaltender profile; published videos and comments cascade in the database. */
  deleteGoaltender(id: string): Promise<void>;
}

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

/**
 * Swedish reason why the coach account cannot publish (null = OK). The database
 * enforces the same rules; this only turns them into a clear message up front.
 */
export function accountBlocker(account: CoachAccount | null, fileSizeBytes = 0): string | null {
  if (!account || account.status === 'pending') {
    return 'Ditt tränarkonto väntar på godkännande. Kontakta administratören för att aktivera det.';
  }
  if (account.status === 'suspended') return 'Ditt tränarkonto är avstängt. Kontakta administratören.';
  if (!account.isActive) {
    return account.paidUntil
      ? `Ditt tränarkonto var betalt till ${formatDate(account.paidUntil)}. Kontakta administratören för att förlänga.`
      : 'Ditt tränarkonto saknar nivå. Kontakta administratören.';
  }
  if (account.maxStorageBytes != null && account.usedStorageBytes + fileSizeBytes > account.maxStorageBytes) {
    const left = Math.max(0, account.maxStorageBytes - account.usedStorageBytes);
    return `Lagringen räcker inte: videon är ${formatBytes(fileSizeBytes)} och ${formatBytes(left)} återstår på nivån ${account.planName ?? ''}. Ta bort gamla publiceringar eller byt nivå.`;
  }
  return null;
}

export interface RemoteGoaltender {
  id: string;
  coach_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  email: string;
  consent_confirmed_at: string;
}

export interface RemotePublishedVideo {
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
}

/** Swedish, user-facing reason why a video cannot be published yet (null = OK). */
export function publishBlocker(goalie: Goaltender | null, video: VideoListItem | null): string | null {
  if (!video) return 'Videon hittades inte.';
  if (!goalie) return 'Målvakten hittades inte.';
  if (!goalie.email) return `${goalie.firstName} saknar e-postadress. Lägg till den under målvaktens profil.`;
  if (!goalie.publishConsentAt) {
    return `Samtycke för ${goalie.firstName} är inte registrerat. Bekräfta samtycke (målvakt/vårdnadshavare) under målvaktens profil.`;
  }
  return null;
}

export function contentTypeFor(fileName: string): string {
  return /\.mp4$/i.test(fileName) ? 'video/mp4' : 'video/quicktime';
}

/** Files live under <coach>/<goaltender>/<video>.<ext>; storage policies rely on this layout. */
export function storagePathFor(coachId: string, goaltenderId: string, videoId: string, fileName: string): string {
  const ext = /\.([a-z0-9]{2,4})$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'mov';
  return `${coachId}/${goaltenderId}/${videoId}.${ext}`;
}

export function remoteVideoRow(v: VideoListItem, coachId: string, storagePath: string): RemotePublishedVideo {
  return {
    id: v.id,
    coach_id: coachId,
    goaltender_id: v.goaltenderId,
    storage_path: storagePath,
    focus_area: v.focusAreaName,
    exercise: v.exerciseName,
    session_title: v.sessionTitle,
    team_name: v.teamName,
    recorded_at: v.recordedAt,
    duration_ms: Math.round(v.durationMs),
    frame_rate: v.frameRate,
    width: v.width,
    height: v.height,
    coach_note: v.note,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Publishes one local video to its goaltender's portal account:
 *   goaltender profile → signed upload → file upload → metadata row.
 * The local file is never modified or deleted. If the metadata row cannot be
 * written, the uploaded file is removed again so no orphan is left in storage.
 */
export async function publishVideo(
  db: SqlDatabase,
  api: PortalApi,
  videoId: Id,
  coachName: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const video = await getVideo(db, videoId);
  const goalie = video ? await getGoaltender(db, video.goaltenderId) : null;
  const blocker = publishBlocker(goalie, video);
  if (blocker || !video || !goalie) throw new Error(blocker ?? 'Videon kan inte publiceras.');
  if (video.publicationStatus === 'published') return;

  const coachId = await api.currentUserId();
  if (!coachId) throw new Error('Logga in på målvaktsportalen under Inställningar först.');

  await api.ensureCoach(coachId, coachName);
  const accountProblem = accountBlocker(await api.coachAccount(), video.fileSizeBytes);
  if (accountProblem) throw new Error(accountProblem);

  const path = storagePathFor(coachId, goalie.id, video.id, video.fileName);
  await setPublication(db, video.id, { status: 'uploading', remoteId: path });
  notifyDataChanged();

  let uploaded = false;
  try {
    await api.upsertGoaltender({
      id: goalie.id,
      coach_id: coachId,
      first_name: goalie.firstName,
      last_name: goalie.lastName,
      jersey_number: goalie.jerseyNumber,
      email: goalie.email as string,
      consent_confirmed_at: goalie.publishConsentAt as string,
    });
    const { signedUrl } = await api.createSignedUpload(path);
    await api.uploadFile(video.fileName, signedUrl, contentTypeFor(video.fileName), onProgress);
    uploaded = true;
    await api.insertPublishedVideo(remoteVideoRow(video, coachId, path));
    await setPublication(db, video.id, { status: 'published', remoteId: path, publishedAt: nowIso() });
  } catch (e) {
    if (uploaded) await api.removeObject(path).catch(() => undefined);
    await setPublication(db, video.id, { status: 'failed', remoteId: null, error: message(e) });
    throw e;
  } finally {
    notifyDataChanged();
  }
}

/** Removes the video from the portal (row, comments and file). The local copy is kept. */
export async function unpublishVideo(db: SqlDatabase, api: PortalApi, videoId: Id): Promise<void> {
  const video = await getVideo(db, videoId);
  if (!video) throw new Error('Videon hittades inte.');
  await api.deletePublishedVideo(video.id);
  if (video.remoteId) await api.removeObject(video.remoteId);
  await setPublication(db, video.id, { status: 'local', remoteId: null, publishedAt: null });
  notifyDataChanged();
}

/**
 * Erasure on request (GDPR): removes every file published to the goaltender,
 * then the portal profile (which cascades to video rows and comments). Local
 * videos stay on the iPad and are marked unpublished. Consent is withdrawn
 * locally so nothing is published again by mistake.
 */
export async function removeGoaltenderFromPortal(db: SqlDatabase, api: PortalApi, goaltenderId: Id): Promise<number> {
  const videos = (await listVideos(db, { goaltenderId })).filter((v) => v.remoteId);
  for (const v of videos) {
    if (v.remoteId) await api.removeObject(v.remoteId);
  }
  await api.deleteGoaltender(goaltenderId);
  for (const v of videos) {
    await setPublication(db, v.id, { status: 'local', remoteId: null, publishedAt: null });
  }
  await db.run('UPDATE goaltenders SET publish_consent_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), goaltenderId]);
  notifyDataChanged();
  return videos.length;
}

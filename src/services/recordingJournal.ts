import type { SqlDatabase } from '@/db/types';
import type { RecordingOwnership } from '@/features/recording/recordingMachine';
import { getSession } from '@/repositories/sessions';
import { deleteSetting, getSetting, setSetting } from '@/repositories/settings';
import { insertVideo } from '@/repositories/videos';
import { newId } from '@/utils/id';

import { listCameraCacheFiles, persistCameraFile } from './videoFiles';

/**
 * Write-ahead journal for the recording in progress.
 *
 * Written right before capture starts and cleared once the video is saved (or
 * definitively failed). If the app is terminated mid-recording the journal
 * survives, and on the next launch the temp file left by the camera is
 * imported for the *journaled* owner, never guessed from the UI state.
 *
 * AVFoundation writes movie fragments periodically, so a file from a killed
 * session is often — but not always — playable. Such videos are flagged
 * `recovered` and shown with a warning.
 */
const KEY = 'activeRecordingJournal';

export interface RecordingJournal {
  ownership: RecordingOwnership;
  startedAt: number;
  codec: string | null;
}

export async function writeJournal(db: SqlDatabase, j: RecordingJournal): Promise<void> {
  await setSetting(db, KEY, j);
}

export async function clearJournal(db: SqlDatabase): Promise<void> {
  await deleteSetting(db, KEY);
}

export interface RecoveryResult {
  recoveredVideoIds: string[];
  journalFound: boolean;
}

/** Tolerance for clock differences between journal write and file creation. */
const SLACK_MS = 10_000;

export async function recoverInterruptedRecording(db: SqlDatabase): Promise<RecoveryResult> {
  const journal = await getSetting<RecordingJournal>(db, KEY);
  if (!journal) return { recoveredVideoIds: [], journalFound: false };

  const recovered: string[] = [];
  try {
    const session = await getSession(db, journal.ownership.sessionId);
    const candidates = listCameraCacheFiles()
      .filter((f) => f.sizeBytes > 0 && (f.modifiedAt ?? 0) >= journal.startedAt - SLACK_MS)
      .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
    const newest = candidates[0];
    if (newest) {
      const id = newId();
      const persisted = await persistCameraFile(newest.uri, id);
      const endedAt = newest.modifiedAt ?? journal.startedAt;
      await insertVideo(db, {
        id,
        sessionId: session ? journal.ownership.sessionId : null,
        goaltenderId: journal.ownership.goaltenderId,
        focusAreaId: journal.ownership.focusAreaId,
        exerciseId: journal.ownership.exerciseId,
        fileName: persisted.fileName,
        recordedAt: new Date(journal.startedAt).toISOString(),
        durationMs: Math.max(0, endedAt - journal.startedAt),
        fileSizeBytes: persisted.sizeBytes,
        codec: journal.codec,
        recovered: true,
      });
      recovered.push(id);
    }
  } finally {
    await clearJournal(db);
  }
  return { recoveredVideoIds: recovered, journalFound: true };
}

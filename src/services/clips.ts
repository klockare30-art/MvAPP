import type { SqlDatabase } from '@/db/types';
import type { Id } from '@/domain/types';
import { deleteVideoRow, getVideo, insertVideo } from '@/repositories/videos';
import { notifyDataChanged } from '@/state/dataEvents';
import { newId } from '@/utils/id';

import { RESERVED_BYTES } from './storageEstimate';
import { deleteVideoFile, diskSpace, videoFile, videoFileExists, videoUri } from './videoFiles';
import { nativeTrim, type Trimmer } from './videoTrim';

export const MIN_CLIP_MS = 1000;

export function validateClipRange(startMs: number, endMs: number, durationMs: number): string | null {
  if (!(durationMs > 0)) return 'Videons längd är okänd. Spela upp videon en gång och försök igen.';
  if (startMs < 0 || endMs > durationMs + 50) return 'Markeringen ligger utanför videon.';
  if (endMs - startMs < MIN_CLIP_MS) return 'Klippet måste vara minst 1 sekund långt.';
  return null;
}

/** Rough size of a passthrough clip: proportional to its share of the source, plus a margin. */
export function estimateClipBytes(sourceBytes: number, sourceDurationMs: number, startMs: number, endMs: number): number {
  if (!(sourceDurationMs > 0)) return sourceBytes;
  return Math.ceil(sourceBytes * ((endMs - startMs) / sourceDurationMs) * 1.1);
}

export interface CreateClipInput {
  sourceVideoId: Id;
  startMs: number;
  endMs: number;
  /** Replace the original with the clip (the original is deleted only after the clip is saved). */
  replaceOriginal: boolean;
}

/**
 * Creates a clip as its own video row (kind 'clip') owned by the same
 * goaltender, with the same session, focus area and exercise.
 *
 * Order of operations protects the recording:
 *   export to a new file → verify file → write metadata (one transaction,
 *   which also removes the original row when replacing) → only then delete
 *   the original file. Any failure before the commit leaves the original
 *   untouched and removes the partial clip file.
 */
export async function createClip(db: SqlDatabase, input: CreateClipInput, trim: Trimmer = nativeTrim): Promise<Id> {
  const source = await getVideo(db, input.sourceVideoId);
  if (!source) throw new Error('Originalvideon hittades inte.');
  if (!videoFileExists(source.fileName)) throw new Error('Originalvideons fil saknas på iPaden.');
  if (input.replaceOriginal && source.publicationStatus === 'published') {
    throw new Error('Videon är publicerad. Ta bort den från målvaktsportalen innan originalet ersätts.');
  }
  const startMs = Math.max(0, Math.round(input.startMs));
  const endMs = Math.min(Math.round(input.endMs), Math.round(source.durationMs));
  const invalid = validateClipRange(startMs, endMs, source.durationMs);
  if (invalid) throw new Error(invalid);

  try {
    const free = diskSpace().availableBytes;
    const needed = estimateClipBytes(source.fileSizeBytes, source.durationMs, startMs, endMs);
    if (free - needed < RESERVED_BYTES) throw new Error('Det finns inte tillräckligt med lagringsutrymme för klippet.');
  } catch (e) {
    // diskSpace() throws when the value is unknown; only a real shortage stops the export.
    if (e instanceof Error && e.message.startsWith('Det finns inte')) throw e;
  }

  const clipId = newId();
  const ext = /\.([a-z0-9]{2,4})$/i.exec(source.fileName)?.[1]?.toLowerCase() ?? 'mov';
  const fileName = `${clipId}.${ext}`;

  let result: { sizeBytes: number; durationMs: number };
  try {
    result = await trim(videoUri(source.fileName), videoFile(fileName).uri, startMs, endMs);
    if (!videoFileExists(fileName)) throw new Error('Klippet kunde inte verifieras efter exporten.');
  } catch (e) {
    safeDelete(fileName);
    throw e;
  }

  try {
    await db.transaction(async (tx) => {
      await insertVideo(tx, {
        id: clipId,
        sessionId: source.sessionId,
        goaltenderId: source.goaltenderId,
        focusAreaId: source.focusAreaId,
        exerciseId: source.exerciseId,
        fileName,
        recordedAt: new Date(new Date(source.recordedAt).getTime() + startMs).toISOString(),
        durationMs: result.durationMs,
        fileSizeBytes: result.sizeBytes,
        codec: source.codec,
        kind: 'clip',
        sourceVideoId: input.replaceOriginal ? null : source.id,
        clipStartMs: startMs,
        clipEndMs: endMs,
      });
      if (source.note) {
        await tx.run('UPDATE video_recordings SET note = ? WHERE id = ?', [source.note, clipId]);
      }
      if (input.replaceOriginal) await deleteVideoRow(tx, source.id);
    });
  } catch (e) {
    safeDelete(fileName);
    throw new Error(`Klippet kunde inte sparas: ${e instanceof Error ? e.message : String(e)}`);
  }

  // The original's metadata is gone at this point; a leftover file would only show up under Storage.
  if (input.replaceOriginal) safeDelete(source.fileName);
  notifyDataChanged();
  return clipId;
}

function safeDelete(fileName: string): void {
  try {
    deleteVideoFile(fileName);
  } catch {
    // Reported as an untracked file in Settings → Storage.
  }
}

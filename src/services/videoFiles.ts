import { Directory, File, Paths } from 'expo-file-system';

/**
 * Durable video storage.
 *
 * expo-camera writes recordings into the app's *cache* directory, which iOS
 * may purge under storage pressure. Every finished recording is therefore
 * moved into `Documents/videos/` (persistent, excluded from purging). Only the
 * file name is stored in the database; the absolute path is resolved at
 * runtime because the iOS container path changes between app updates.
 */
const VIDEO_DIR_NAME = 'videos';

export function videosDirectory(): Directory {
  const dir = new Directory(Paths.document, VIDEO_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function videoFile(fileName: string): File {
  return new File(videosDirectory(), fileName);
}

export function videoUri(fileName: string): string {
  return videoFile(fileName).uri;
}

export function videoFileExists(fileName: string): boolean {
  try {
    const f = videoFile(fileName);
    return f.exists && f.size > 0;
  } catch {
    return false;
  }
}

function extensionOf(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  const ext = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{2,4}$/.test(ext) ? ext : 'mov';
}

export interface PersistedVideo {
  fileName: string;
  sizeBytes: number;
}

/**
 * Moves a finished camera file into durable storage and verifies it.
 * Throws if the source is missing/empty or the destination cannot be verified;
 * in that case the source file is left untouched so nothing is lost.
 */
export async function persistCameraFile(tempUri: string, videoId: string): Promise<PersistedVideo> {
  const source = new File(tempUri);
  if (!source.exists) throw new Error('Videofilen saknas efter inspelningen.');
  if (source.size <= 0) throw new Error('Videofilen är tom.');

  const fileName = `${videoId}.${extensionOf(tempUri)}`;
  const dest = new File(videosDirectory(), fileName);
  if (dest.exists) throw new Error('En videofil med samma namn finns redan.');

  try {
    // Same app container: a move is a cheap rename, no duplication on disk.
    await source.move(dest);
  } catch {
    // Fallback: copy, verify, then remove the temp file.
    await source.copy(dest);
    const copied = new File(videosDirectory(), fileName);
    if (!copied.exists || copied.size !== source.size) {
      throw new Error('Videon kunde inte kopieras till permanent lagring.');
    }
    try {
      source.delete();
    } catch {
      // Leftover temp files are removed by cleanupCameraCache().
    }
  }

  const verified = new File(videosDirectory(), fileName);
  if (!verified.exists || verified.size <= 0) {
    throw new Error('Videon kunde inte verifieras efter sparandet.');
  }
  return { fileName, sizeBytes: verified.size };
}

export function deleteVideoFile(fileName: string): void {
  const f = videoFile(fileName);
  if (f.exists) f.delete();
}

/** Directory where expo-camera writes in-progress recordings. */
export function cameraCacheDirectory(): Directory {
  return new Directory(Paths.cache, 'Camera');
}

export interface CachedCameraFile {
  uri: string;
  sizeBytes: number;
  modifiedAt: number | null;
}

export function listCameraCacheFiles(): CachedCameraFile[] {
  const dir = cameraCacheDirectory();
  if (!dir.exists) return [];
  const result: CachedCameraFile[] = [];
  for (const item of dir.list()) {
    if (item instanceof File && /\.(mov|mp4)$/i.test(item.name)) {
      result.push({ uri: item.uri, sizeBytes: item.size, modifiedAt: item.modificationTime });
    }
  }
  return result;
}

/** Removes leftover temp recordings that are not part of a pending recovery. */
export function cleanupCameraCache(keepUris: string[] = []): { removed: number; bytes: number } {
  let removed = 0;
  let bytes = 0;
  for (const f of listCameraCacheFiles()) {
    if (keepUris.includes(f.uri)) continue;
    try {
      new File(f.uri).delete();
      removed++;
      bytes += f.sizeBytes;
    } catch {
      // Ignore files that are still in use.
    }
  }
  return { removed, bytes };
}

/** Files in the video directory that have no database row (e.g. DB write failed). */
export function listUntrackedVideoFiles(known: Set<string>): { fileName: string; sizeBytes: number }[] {
  const dir = videosDirectory();
  const out: { fileName: string; sizeBytes: number }[] = [];
  for (const item of dir.list()) {
    if (item instanceof File && !known.has(item.name)) out.push({ fileName: item.name, sizeBytes: item.size });
  }
  return out;
}

export function diskSpace(): { availableBytes: number; totalBytes: number } {
  return { availableBytes: Paths.availableDiskSpace, totalBytes: Paths.totalDiskSpace };
}

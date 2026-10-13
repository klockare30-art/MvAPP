/**
 * Pure storage arithmetic (no native imports, unit-tested).
 *
 * Bitrate defaults are Apple's published approximations for 30 fps capture
 * (iPhone/iPad Camera settings): ~60 MB/min for 1080p H.264 and ~40 MB/min for
 * 1080p HEVC. Actual size depends on scene and device, so once real recordings
 * exist the measured average replaces the default.
 */
export type VideoQualitySetting = '720p' | '1080p' | '2160p';
export type VideoCodecSetting = 'hevc' | 'h264';

const MB = 1024 * 1024;

const DEFAULT_MB_PER_MINUTE: Record<VideoQualitySetting, Record<VideoCodecSetting, number>> = {
  '720p': { h264: 45, hevc: 30 },
  '1080p': { h264: 60, hevc: 40 },
  '2160p': { h264: 350, hevc: 170 },
};

/** Free space kept untouched so iOS and the database keep working. */
export const RESERVED_BYTES = 500 * MB;
/** Below this, recording is blocked. */
export const BLOCK_RECORDING_BYTES = 1024 * MB;
/** Below this, a warning is shown. */
export const LOW_STORAGE_BYTES = 4 * 1024 * MB;

export function defaultBytesPerMinute(quality: VideoQualitySetting, codec: VideoCodecSetting): number {
  return DEFAULT_MB_PER_MINUTE[quality][codec] * MB;
}

/**
 * Uses the measured average when there is enough recorded material (≥ 2 min),
 * otherwise the published default.
 */
export function effectiveBytesPerMinute(
  quality: VideoQualitySetting,
  codec: VideoCodecSetting,
  measured: { bytes: number; durationMs: number } | null,
): number {
  if (measured && measured.durationMs >= 120_000 && measured.bytes > 0) {
    return measured.bytes / (measured.durationMs / 60_000);
  }
  return defaultBytesPerMinute(quality, codec);
}

export function estimateRecordingMinutes(availableBytes: number, bytesPerMinute: number): number {
  if (bytesPerMinute <= 0) return 0;
  return Math.max(0, Math.floor((availableBytes - RESERVED_BYTES) / bytesPerMinute));
}

export type StorageLevel = 'ok' | 'low' | 'critical';

export function storageLevel(availableBytes: number): StorageLevel {
  if (availableBytes < BLOCK_RECORDING_BYTES) return 'critical';
  if (availableBytes < LOW_STORAGE_BYTES) return 'low';
  return 'ok';
}

/** Hard cap passed to the camera so a single recording can never fill the disk. */
export function maxFileSizeForRecording(availableBytes: number): number {
  return Math.max(0, availableBytes - RESERVED_BYTES);
}

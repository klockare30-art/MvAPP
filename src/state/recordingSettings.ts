import type { SqlExecutor } from '@/db/types';
import { getSetting, setSetting } from '@/repositories/settings';
import type { VideoCodecSetting, VideoQualitySetting } from '@/services/storageEstimate';

export interface RecordingSettings {
  quality: VideoQualitySetting;
  codec: VideoCodecSetting;
  recordAudio: boolean;
}

/**
 * 1080p is the highest quality supported by the iPad 9th gen rear camera and
 * the default. H.264 is the default codec because published videos are played
 * in the goaltenders' web browsers, where H.264 is universally supported while
 * HEVC depends on browser and hardware. HEVC (≈ 1/3 smaller) stays selectable.
 */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  quality: '1080p',
  codec: 'h264',
  recordAudio: true,
};

const KEY = 'recordingSettings';

export async function loadRecordingSettings(db: SqlExecutor): Promise<RecordingSettings> {
  const stored = await getSetting<Partial<RecordingSettings>>(db, KEY);
  return { ...DEFAULT_RECORDING_SETTINGS, ...(stored ?? {}) };
}

export async function saveRecordingSettings(db: SqlExecutor, s: RecordingSettings): Promise<void> {
  await setSetting(db, KEY, s);
}

/** expo-camera codec identifiers. */
export function cameraCodec(codec: VideoCodecSetting): 'hvc1' | 'avc1' {
  return codec === 'hevc' ? 'hvc1' : 'avc1';
}

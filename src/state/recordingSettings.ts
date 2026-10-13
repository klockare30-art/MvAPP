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
 * the default. HEVC roughly halves file size compared with H.264 and is
 * hardware-encoded on A10+ chips.
 */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  quality: '1080p',
  codec: 'hevc',
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

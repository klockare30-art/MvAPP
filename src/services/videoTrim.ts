import { requireOptionalNativeModule } from 'expo';

/** Native module in modules/goalievision-trim (iOS, AVAssetExportSession passthrough). */
interface TrimModule {
  trimAsync(sourceUri: string, destinationUri: string, startMs: number, endMs: number): Promise<{
    uri: string;
    sizeBytes: number;
    durationMs: number;
  }>;
}

const native = requireOptionalNativeModule<TrimModule>('GoalieVisionTrim');

/**
 * False in Expo Go and on web: trimming needs the app's own native code, i.e. a
 * development or preview build made with EAS.
 */
export function isTrimAvailable(): boolean {
  return native != null;
}

export type Trimmer = (sourceUri: string, destinationUri: string, startMs: number, endMs: number) => Promise<{ sizeBytes: number; durationMs: number }>;

export const nativeTrim: Trimmer = async (sourceUri, destinationUri, startMs, endMs) => {
  if (!native) throw new Error('Klippning kräver en egen build av appen (fungerar inte i Expo Go).');
  return native.trimAsync(sourceUri, destinationUri, startMs, endMs);
};

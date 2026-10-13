import {
  BLOCK_RECORDING_BYTES,
  defaultBytesPerMinute,
  effectiveBytesPerMinute,
  estimateRecordingMinutes,
  LOW_STORAGE_BYTES,
  maxFileSizeForRecording,
  RESERVED_BYTES,
  storageLevel,
} from '../storageEstimate';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('storage estimates', () => {
  test('defaults: HEVC smaller than H.264', () => {
    expect(defaultBytesPerMinute('1080p', 'hevc')).toBeLessThan(defaultBytesPerMinute('1080p', 'h264'));
    expect(defaultBytesPerMinute('1080p', 'h264')).toBe(60 * MB);
  });

  test('uses measured average only with ≥ 2 min material', () => {
    expect(effectiveBytesPerMinute('1080p', 'h264', { bytes: 100 * MB, durationMs: 60_000 })).toBe(60 * MB);
    expect(effectiveBytesPerMinute('1080p', 'h264', { bytes: 100 * MB, durationMs: 200_000 })).toBeCloseTo(30 * MB);
  });

  test('minutes left keeps a reserve', () => {
    expect(estimateRecordingMinutes(RESERVED_BYTES, 40 * MB)).toBe(0);
    expect(estimateRecordingMinutes(RESERVED_BYTES + 400 * MB, 40 * MB)).toBe(10);
    expect(estimateRecordingMinutes(10 * GB, 0)).toBe(0);
  });

  test('levels', () => {
    expect(storageLevel(BLOCK_RECORDING_BYTES - 1)).toBe('critical');
    expect(storageLevel(LOW_STORAGE_BYTES - 1)).toBe('low');
    expect(storageLevel(LOW_STORAGE_BYTES)).toBe('ok');
  });

  test('max file size never negative', () => {
    expect(maxFileSizeForRecording(0)).toBe(0);
    expect(maxFileSizeForRecording(RESERVED_BYTES + 5)).toBe(5);
  });
});

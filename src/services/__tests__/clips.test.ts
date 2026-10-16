import { createGoaltender } from '@/repositories/goaltenders';
import { getVideo, insertVideo, listVideos, setPublication } from '@/repositories/videos';
import { newId } from '@/utils/id';

import { openBootstrappedDatabase } from '../../../test/helpers/nodeDb';
import { createClip, estimateClipBytes, validateClipRange } from '../clips';
import * as videoFiles from '../videoFiles';

// In-memory stand-in for the video directory.
const mockFiles = new Set<string>();
jest.mock('../videoFiles', () => ({
  videoUri: (n: string) => `file:///videos/${n}`,
  videoFile: (n: string) => ({ uri: `file:///videos/${n}` }),
  videoFileExists: (n: string) => mockFiles.has(n),
  deleteVideoFile: jest.fn((n: string) => mockFiles.delete(n)),
  diskSpace: jest.fn(() => ({ availableBytes: 20 * 1024 ** 3, totalBytes: 64 * 1024 ** 3 })),
}));
jest.mock('../videoTrim', () => ({ nativeTrim: jest.fn() }));

const fakeTrim = jest.fn(async (_src: string, dest: string, start: number, end: number) => {
  mockFiles.add(dest.replace('file:///videos/', ''));
  return { sizeBytes: 1000, durationMs: end - start };
});

async function setup() {
  mockFiles.clear();
  jest.clearAllMocks();
  const { db } = await openBootstrappedDatabase();
  const g = await createGoaltender(db, { firstName: 'Erik', jerseyNumber: 30 });
  const id = newId();
  const fileName = `${id}.mov`;
  mockFiles.add(fileName);
  await insertVideo(db, {
    id, sessionId: null, goaltenderId: g.id, focusAreaId: null, exerciseId: null, fileName,
    recordedAt: '2026-10-13T16:00:00.000Z', durationMs: 135_000, fileSizeBytes: 135_000_000, codec: 'avc1',
  });
  return { db, g, id, fileName };
}

describe('clips', () => {
  test('range validation', () => {
    expect(validateClipRange(42_000, 63_000, 135_000)).toBeNull();
    expect(validateClipRange(1000, 1500, 135_000)).toContain('minst 1 sekund');
    expect(validateClipRange(0, 200_000, 135_000)).toContain('utanför');
    expect(validateClipRange(0, 1000, 0)).toContain('okänd');
  });

  test('size estimate is proportional with margin', () => {
    expect(estimateClipBytes(135_000_000, 135_000, 42_000, 63_000)).toBe(Math.ceil(21_000_000 * 1.1));
  });

  test('keep original: 02:15 recording → 00:42–01:03 gives a 21 s clip owned by the same goaltender', async () => {
    const { db, g, id, fileName } = await setup();
    const clipId = await createClip(db, { sourceVideoId: id, startMs: 42_000, endMs: 63_000, replaceOriginal: false }, fakeTrim);
    const clip = await getVideo(db, clipId);
    expect(clip?.kind).toBe('clip');
    expect(clip?.goaltenderId).toBe(g.id);
    expect(clip?.sourceVideoId).toBe(id);
    expect(clip?.durationMs).toBe(21_000);
    expect(clip?.clipStartMs).toBe(42_000);
    expect(clip?.recordedAt).toBe('2026-10-13T16:00:42.000Z');
    expect(await getVideo(db, id)).not.toBeNull();
    expect(mockFiles.has(fileName)).toBe(true);
  });

  test('multiple clips from one recording', async () => {
    const { db, g, id } = await setup();
    await createClip(db, { sourceVideoId: id, startMs: 0, endMs: 10_000, replaceOriginal: false }, fakeTrim);
    await createClip(db, { sourceVideoId: id, startMs: 60_000, endMs: 75_000, replaceOriginal: false }, fakeTrim);
    expect(await listVideos(db, { goaltenderId: g.id })).toHaveLength(3);
  });

  test('replace original: clip saved first, then original row and file removed', async () => {
    const { db, g, id, fileName } = await setup();
    const clipId = await createClip(db, { sourceVideoId: id, startMs: 42_000, endMs: 63_000, replaceOriginal: true }, fakeTrim);
    expect(await getVideo(db, id)).toBeNull();
    expect(mockFiles.has(fileName)).toBe(false);
    const all = await listVideos(db, { goaltenderId: g.id });
    expect(all.map((v) => v.id)).toEqual([clipId]);
    expect(all[0]?.sourceVideoId).toBeNull();
  });

  test('export failure keeps the original and leaves no partial file', async () => {
    const { db, id, fileName } = await setup();
    const failing = jest.fn(async (_s: string, dest: string) => {
      mockFiles.add(dest.replace('file:///videos/', '')); // partial output
      throw new Error('ERR_TRIM_FAILED');
    });
    await expect(createClip(db, { sourceVideoId: id, startMs: 0, endMs: 5000, replaceOriginal: true }, failing)).rejects.toThrow('ERR_TRIM_FAILED');
    expect(await getVideo(db, id)).not.toBeNull();
    expect([...mockFiles]).toEqual([fileName]);
  });

  test('replacing a published video is blocked', async () => {
    const { db, id } = await setup();
    await setPublication(db, id, { status: 'published', remoteId: 'c/g/v.mov' });
    await expect(createClip(db, { sourceVideoId: id, startMs: 0, endMs: 5000, replaceOriginal: true }, fakeTrim)).rejects.toThrow('publicerad');
    expect(fakeTrim).not.toHaveBeenCalled();
  });

  test('stops before exporting when storage is short', async () => {
    const { db, id } = await setup();
    (videoFiles.diskSpace as jest.Mock).mockReturnValueOnce({ availableBytes: 100 * 1024 * 1024, totalBytes: 1 });
    await expect(createClip(db, { sourceVideoId: id, startMs: 0, endMs: 100_000, replaceOriginal: false }, fakeTrim)).rejects.toThrow('lagringsutrymme');
    expect(fakeTrim).not.toHaveBeenCalled();
  });
});

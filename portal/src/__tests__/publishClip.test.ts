import { describe, expect, test } from 'vitest';

import { accountBlocker, publishClip, recordedAtFor, type ClipPortalApi, type CoachAccount } from '../publishClip';

const ACTIVE: CoachAccount = {
  status: 'active', planName: 'Start', paidUntil: null, isActive: true,
  maxStorageBytes: 1000, usedStorageBytes: 0, maxGoaltenders: 10, goaltenderCount: 1,
};

function fakeApi(over: Partial<ClipPortalApi> = {}) {
  const calls: string[] = [];
  const api: ClipPortalApi = {
    userId: async () => 'coach-1',
    uploadFile: async (path) => void calls.push(`upload:${path}`),
    insertVideo: async (row) => void calls.push(`row:${row.focus_area}:${row.session_title}`),
    removeObject: async (path) => void calls.push(`remove:${path}`),
    ...over,
  };
  return { api, calls };
}

const clip = {
  videoId: 'v1', goaltenderId: 'g1', blob: new Blob(['x']), tagLabel: 'Skott', matchTitle: 'Hemma mot AIK', teamName: 'J18',
  matchDate: '2026-10-18', atSec: 125, durationMs: 9000, width: 1920, height: 1080,
};

describe('publishing a match clip', () => {
  test('uploads into the coach/goaltender folder, then registers the clip', async () => {
    const { api, calls } = fakeApi();
    await publishClip(api, clip);
    expect(calls).toEqual(['upload:coach-1/g1/v1.mp4', 'row:Skott:Hemma mot AIK']);
  });

  test('removes the uploaded file if registering fails', async () => {
    const { api, calls } = fakeApi({ insertVideo: async () => { throw new Error('rls'); } });
    await expect(publishClip(api, clip)).rejects.toThrow('rls');
    expect(calls).toEqual(['upload:coach-1/g1/v1.mp4', 'remove:coach-1/g1/v1.mp4']);
  });

  test('clips sort in match order', () => {
    expect(new Date(recordedAtFor('2026-10-18', 125)).getTime() - new Date('2026-10-18T00:00:00').getTime()).toBe(125_000);
  });

  test('account must be approved, paid and have room', () => {
    expect(accountBlocker(null)).toContain('väntar på godkännande');
    expect(accountBlocker({ ...ACTIVE, status: 'suspended', isActive: false })).toContain('avstängt');
    expect(accountBlocker({ ...ACTIVE, isActive: false, paidUntil: '2026-01-31' })).toContain('2026-01-31');
    expect(accountBlocker({ ...ACTIVE, usedStorageBytes: 900 }, 200)).toContain('Lagringen');
    expect(accountBlocker(ACTIVE, 200)).toBeNull();
  });
});

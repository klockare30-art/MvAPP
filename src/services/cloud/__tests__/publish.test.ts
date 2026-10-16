import { createGoaltender, getGoaltender, updateGoaltender } from '@/repositories/goaltenders';
import { getVideo, insertVideo } from '@/repositories/videos';
import { newId } from '@/utils/id';

import { openBootstrappedDatabase } from '../../../../test/helpers/nodeDb';
import {
  publishBlocker,
  publishVideo,
  removeGoaltenderFromPortal,
  storagePathFor,
  unpublishVideo,
  accountBlocker,
  type CoachAccount,
  type PortalApi,
} from '../publish';

const ACTIVE: CoachAccount = {
  status: 'active', planName: 'Start', paidUntil: null, isActive: true,
  maxStorageBytes: 1_000_000, usedStorageBytes: 0, maxGoaltenders: 10, goaltenderCount: 0,
};

function fakeApi(overrides: Partial<PortalApi> = {}) {
  const calls: string[] = [];
  const api: PortalApi = {
    currentUserId: async () => 'coach-1',
    ensureCoach: async () => void calls.push('coach'),
    coachAccount: async () => ({ ...ACTIVE }),
    upsertGoaltender: async (row) => void calls.push(`goalie:${row.email}`),
    createSignedUpload: async (path) => (calls.push(`sign:${path}`), { signedUrl: 'https://x/sign' }),
    uploadFile: async (_f, _u, type, onProgress) => {
      calls.push(`upload:${type}`);
      onProgress?.(1);
    },
    insertPublishedVideo: async (row) => void calls.push(`row:${row.focus_area}`),
    deletePublishedVideo: async () => void calls.push('delete-row'),
    removeObject: async (p) => void calls.push(`remove:${p}`),
    deleteGoaltender: async (id) => void calls.push(`delete-goalie:${id}`),
    ...overrides,
  };
  return { api, calls };
}

async function setup(consent = true) {
  const { db } = await openBootstrappedDatabase();
  const g = await createGoaltender(db, { firstName: 'Erik', jerseyNumber: 30, email: 'erik@mail.se', publishConsent: consent });
  const id = newId();
  await insertVideo(db, {
    id, sessionId: null, goaltenderId: g.id, focusAreaId: null, exerciseId: null, fileName: `${id}.mov`,
    recordedAt: new Date().toISOString(), durationMs: 30_000, fileSizeBytes: 1000, codec: 'hvc1',
  });
  return { db, g, id };
}

describe('publishing to the goaltender portal', () => {
  test('storage path layout matches the storage policies', () => {
    expect(storagePathFor('c', 'g', 'v', 'abc.MOV')).toBe('c/g/v.mov');
    expect(storagePathFor('c', 'g', 'v', 'abc.mp4')).toBe('c/g/v.mp4');
  });

  test('requires e-mail and recorded consent', async () => {
    const { db, g, id } = await setup(false);
    const v = await getVideo(db, id);
    expect(publishBlocker(g, v)).toContain('Samtycke');
    expect(publishBlocker({ ...g, email: null }, v)).toContain('e-postadress');
    const { api, calls } = fakeApi();
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('Samtycke');
    expect(calls).toEqual([]); // nothing leaves the device
  });

  test('consent cannot be recorded without an e-mail address', async () => {
    const { db } = await openBootstrappedDatabase();
    await expect(createGoaltender(db, { firstName: 'X', publishConsent: true })).rejects.toThrow('E-postadress');
  });

  test('happy path: profile → upload → row, then marked published', async () => {
    const { db, g, id } = await setup();
    const { api, calls } = fakeApi();
    const progress: number[] = [];
    await publishVideo(db, api, id, 'Coach', (f) => progress.push(f));
    expect(calls).toEqual([
      'coach',
      'goalie:erik@mail.se',
      `sign:coach-1/${g.id}/${id}.mov`,
      'upload:video/quicktime',
      'row:null',
    ]);
    expect(progress).toEqual([1]);
    const v = await getVideo(db, id);
    expect(v?.publicationStatus).toBe('published');
    expect(v?.reviewStatus).toBe('published');
    expect(v?.remoteId).toBe(`coach-1/${g.id}/${id}.mov`);
    expect(v?.publishedAt).toBeTruthy();
  });

  test('metadata failure removes the uploaded file and marks the video failed', async () => {
    const { db, g, id } = await setup();
    const { api, calls } = fakeApi({
      insertPublishedVideo: async () => {
        throw new Error('row-level security');
      },
    });
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('row-level security');
    expect(calls).toContain(`remove:coach-1/${g.id}/${id}.mov`);
    const v = await getVideo(db, id);
    expect(v?.publicationStatus).toBe('failed');
    expect(v?.publishError).toContain('row-level security');
    expect(v?.reviewStatus).toBe('not_reviewed');
  });

  test('upload failure does not try to remove a file that was never stored', async () => {
    const { db, id } = await setup();
    const { api, calls } = fakeApi({
      uploadFile: async () => {
        throw new Error('Uppladdningen misslyckades (413)');
      },
    });
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('413');
    expect(calls.some((c) => c.startsWith('remove:'))).toBe(false);
    expect((await getVideo(db, id))?.publicationStatus).toBe('failed');
  });

  test('requires a logged-in coach', async () => {
    const { db, id } = await setup();
    const { api } = fakeApi({ currentUserId: async () => null });
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('Logga in');
  });

  test('unpublish removes row and file, keeps the local video', async () => {
    const { db, g, id } = await setup();
    const { api, calls } = fakeApi();
    await publishVideo(db, api, id, 'Coach');
    await unpublishVideo(db, api, id);
    expect(calls.slice(-2)).toEqual(['delete-row', `remove:coach-1/${g.id}/${id}.mov`]);
    const v = await getVideo(db, id);
    expect(v?.publicationStatus).toBe('local');
    expect(v?.reviewStatus).toBe('keep');
    expect(v?.remoteId).toBeNull();
  });

  test('withdrawing consent clears it; re-confirming sets a new date', async () => {
    const { db, g } = await setup();
    await updateGoaltender(db, g.id, { firstName: 'Erik', email: 'erik@mail.se', publishConsent: false });
    const row = await db.first<{ c: string | null }>('SELECT publish_consent_at AS c FROM goaltenders WHERE id = ?', [g.id]);
    expect(row?.c).toBeNull();
  });

  test('erasure: removes files and profile, keeps local videos, withdraws consent', async () => {
    const { db, g, id } = await setup();
    const { api, calls } = fakeApi();
    await publishVideo(db, api, id, 'Coach');
    expect(await removeGoaltenderFromPortal(db, api, g.id)).toBe(1);
    expect(calls.slice(-2)).toEqual([`remove:coach-1/${g.id}/${id}.mov`, `delete-goalie:${g.id}`]);
    const v = await getVideo(db, id);
    expect(v?.publicationStatus).toBe('local');
    expect((await getGoaltender(db, g.id))?.publishConsentAt).toBeNull();
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('Samtycke');
  });
  test('coach account must be approved, paid and have storage left', () => {
    expect(accountBlocker(null)).toContain('väntar på godkännande');
    expect(accountBlocker({ ...ACTIVE, status: 'pending', isActive: false })).toContain('väntar på godkännande');
    expect(accountBlocker({ ...ACTIVE, status: 'suspended', isActive: false })).toContain('avstängt');
    expect(accountBlocker({ ...ACTIVE, isActive: false, paidUntil: '2026-01-31' })).toContain('betalt till');
    expect(accountBlocker({ ...ACTIVE, usedStorageBytes: 999_500 }, 1000)).toContain('Lagringen räcker inte');
    expect(accountBlocker({ ...ACTIVE, usedStorageBytes: 999_000 }, 1000)).toBeNull();
  });

  test('an unapproved coach uploads nothing and the video stays local', async () => {
    const { db, id } = await setup();
    const { api, calls } = fakeApi({ coachAccount: async () => ({ ...ACTIVE, status: 'pending', isActive: false }) });
    await expect(publishVideo(db, api, id, 'Coach')).rejects.toThrow('väntar på godkännande');
    expect(calls).toEqual(['coach']);
    expect((await getVideo(db, id))?.publicationStatus).toBe('local');
  });
});

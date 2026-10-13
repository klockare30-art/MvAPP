import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapDatabase } from '@/db/bootstrap';
import { createDemoData } from '@/db/demoData';
import { runMigrations } from '@/db/migrations';
import { newId } from '@/utils/id';

import { openBootstrappedDatabase } from '../../../test/helpers/nodeDb';
import { findOrCreateExercise, findOrCreateFocusArea, listFocusAreas, markUsed } from '../focusAreas';
import { createGoaltender, listGoaltenderTeams, updateGoaltender } from '../goaltenders';
import {
  createSession,
  deleteSession,
  duplicateSession,
  getSessionDetails,
  setActiveSelection,
  updateSession,
} from '../sessions';
import { setSetting } from '../settings';
import { createTeam, listTeamGoaltenders } from '../teams';
import {
  countVideosByFocusArea,
  countVideosByGoaltender,
  getVideo,
  insertVideo,
  latestVideoInSession,
  listVideos,
  setReviewStatus,
  updateMediaInfo,
} from '../videos';

async function setup() {
  const { db, trainer } = await openBootstrappedDatabase();
  const team = await createTeam(db, { clubName: 'Borlänge Hockey', name: 'U16', season: '2026/2027' });
  const erik = await createGoaltender(db, { firstName: 'Erik', jerseyNumber: 30, teamIds: [team.id] });
  const william = await createGoaltender(db, { firstName: 'William', jerseyNumber: 35, teamIds: [team.id] });
  const forfl = await findOrCreateFocusArea(db, 'Förflyttningar');
  const stolp = await findOrCreateFocusArea(db, 'Stolpspel');
  const tpush = await findOrCreateExercise(db, forfl.id, 'T-push');
  const sessionId = await createSession(db, {
    teamId: team.id,
    trainerId: trainer.id,
    title: 'Träning',
    scheduledAt: new Date().toISOString(),
    goaltenderIds: [erik.id, william.id],
    focusAreaIds: [forfl.id, stolp.id],
    exerciseIds: [tpush.id],
  });
  return { db, trainer, team, erik, william, forfl, stolp, tpush, sessionId };
}

function video(over: Partial<Parameters<typeof insertVideo>[1]> & { goaltenderId: string }) {
  const id = newId();
  return {
    id,
    sessionId: null,
    focusAreaId: null,
    exerciseId: null,
    fileName: `${id}.mov`,
    recordedAt: new Date().toISOString(),
    durationMs: 1000,
    fileSizeBytes: 1000,
    codec: 'hvc1',
    ...over,
  };
}

describe('migrations', () => {
  test('are idempotent', async () => {
    const { db } = await openBootstrappedDatabase();
    expect(await runMigrations(db)).toBe(0);
  });

  test('seed default focus areas with exercises', async () => {
    const { db } = await openBootstrappedDatabase();
    const areas = await listFocusAreas(db);
    expect(areas.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Förflyttningar', 'Stolpspel', 'Butterfly', 'Scanning']),
    );
  });

  test('upgrade from seed v1 adds only new defaults (deleted v1 defaults stay deleted)', async () => {
    const { db } = await openBootstrappedDatabase();
    // Simulate a v1 install: legacy flag, no Scanning, coach removed Positionering.
    await db.run("DELETE FROM app_settings WHERE key = 'focusAreaSeedVersion'");
    await setSetting(db, 'seededFocusAreas', true);
    await db.run("DELETE FROM focus_areas WHERE name IN ('Scanning', 'Positionering')");
    await bootstrapDatabase(db);
    const names = (await listFocusAreas(db)).map((a) => a.name);
    expect(names).toContain('Scanning');
    expect(names).not.toContain('Positionering');
    // Running again is a no-op.
    await bootstrapDatabase(db);
    expect((await listFocusAreas(db)).filter((a) => a.name === 'Scanning')).toHaveLength(1);
  });
});

describe('teams and goaltenders', () => {
  test('a goaltender can belong to several teams without duplicate profiles', async () => {
    const { db, team, erik } = await setup();
    const u18 = await createTeam(db, { clubName: 'borlänge hockey', name: 'U18' });
    expect(u18.clubId).toBe(team.clubId); // club matched case-insensitively
    await updateGoaltender(db, erik.id, { firstName: 'Erik', jerseyNumber: 30, teamIds: [team.id, u18.id] });
    const teams = await listGoaltenderTeams(db, erik.id);
    expect(teams.map((t) => t.name).sort()).toEqual(['U16', 'U18']);
    expect((await listTeamGoaltenders(db, u18.id)).map((g) => g.id)).toEqual([erik.id]);
    const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM goaltenders WHERE first_name = ?', ['Erik']);
    expect(count?.n).toBe(1);
  });

  test('validation', async () => {
    const { db } = await setup();
    await expect(createGoaltender(db, { firstName: ' ' })).rejects.toThrow('Förnamn');
    await expect(createGoaltender(db, { firstName: 'A', jerseyNumber: 100 })).rejects.toThrow('Tröjnummer');
    await expect(createGoaltender(db, { firstName: 'A', email: 'nope' })).rejects.toThrow('E-post');
  });
});

describe('focus areas', () => {
  test('find-or-create is case-insensitive and usage is tracked', async () => {
    const { db, forfl } = await setup();
    const again = await findOrCreateFocusArea(db, 'förflyttningar');
    expect(again.id).toBe(forfl.id);
    await markUsed(db, forfl.id, null);
    await markUsed(db, forfl.id, null);
    const areas = await listFocusAreas(db);
    expect(areas[0]?.id).toBe(forfl.id); // most used first
  });
});

describe('training sessions', () => {
  test('details include participants, focus areas and exercises in order', async () => {
    const { db, sessionId, erik, william, forfl, stolp, tpush } = await setup();
    const s = await getSessionDetails(db, sessionId);
    expect(s?.participants.map((g) => g.id)).toEqual([erik.id, william.id]);
    expect(s?.focusAreas.map((f) => f.id)).toEqual([forfl.id, stolp.id]);
    expect(s?.exercises.map((e) => e.id)).toEqual([tpush.id]);
    expect(s?.status).toBe('planned');
  });

  test('duplicate keeps goaltenders, focus areas and exercises', async () => {
    const { db, sessionId } = await setup();
    const copyId = await duplicateSession(db, sessionId, new Date().toISOString());
    const a = await getSessionDetails(db, sessionId);
    const b = await getSessionDetails(db, copyId);
    expect(b?.participants.map((g) => g.id)).toEqual(a?.participants.map((g) => g.id));
    expect(b?.focusAreas.map((f) => f.id)).toEqual(a?.focusAreas.map((f) => f.id));
    expect(b?.exercises.map((e) => e.id)).toEqual(a?.exercises.map((e) => e.id));
    expect(b?.id).not.toBe(a?.id);
  });

  test('cannot remove a participant who already has recordings; transaction rolls back', async () => {
    const { db, sessionId, erik, william, forfl, trainer, team } = await setup();
    await insertVideo(db, video({ sessionId, goaltenderId: erik.id, focusAreaId: forfl.id }));
    await expect(
      updateSession(db, sessionId, {
        teamId: team.id,
        trainerId: trainer.id,
        title: 'Ny titel',
        scheduledAt: new Date().toISOString(),
        goaltenderIds: [william.id],
        focusAreaIds: [forfl.id],
      }),
    ).rejects.toThrow('inspelningar');
    const s = await getSessionDetails(db, sessionId);
    expect(s?.title).toBe('Träning');
    expect(s?.participants).toHaveLength(2);
  });

  test('sessions with videos cannot be deleted', async () => {
    const { db, sessionId, erik } = await setup();
    await insertVideo(db, video({ sessionId, goaltenderId: erik.id }));
    await expect(deleteSession(db, sessionId)).rejects.toThrow();
  });

  test('active selection persists and stale selection is cleared on plan change', async () => {
    const { db, sessionId, erik, william, forfl, stolp, trainer, team } = await setup();
    await setActiveSelection(db, sessionId, { goaltenderId: william.id, focusAreaId: stolp.id, exerciseId: null });
    await updateSession(db, sessionId, {
      teamId: team.id,
      trainerId: trainer.id,
      title: 'Träning',
      scheduledAt: new Date().toISOString(),
      goaltenderIds: [erik.id, william.id],
      focusAreaIds: [forfl.id],
    });
    const s = await getSessionDetails(db, sessionId);
    expect(s?.activeGoaltenderId).toBe(william.id);
    expect(s?.activeFocusAreaId).toBeNull();
  });
});

describe('videos', () => {
  test('every video must belong to an existing goaltender (FK enforced)', async () => {
    const { db } = await setup();
    await expect(insertVideo(db, video({ goaltenderId: 'does-not-exist' }))).rejects.toThrow();
    await expect(insertVideo(db, video({ goaltenderId: '' }))).rejects.toThrow('målvakt');
  });

  test('goaltender with videos cannot be hard-deleted', async () => {
    const { db, erik } = await setup();
    await insertVideo(db, video({ goaltenderId: erik.id }));
    await expect(db.run('DELETE FROM goaltenders WHERE id = ?', [erik.id])).rejects.toThrow();
  });

  test('ownership, filters, counts and latest', async () => {
    const { db, sessionId, erik, william, forfl, stolp, tpush, team } = await setup();
    const t = Date.now();
    const v1 = video({ sessionId, goaltenderId: erik.id, focusAreaId: forfl.id, exerciseId: tpush.id, recordedAt: new Date(t).toISOString() });
    const v2 = video({ sessionId, goaltenderId: william.id, focusAreaId: forfl.id, recordedAt: new Date(t + 1000).toISOString() });
    const v3 = video({ sessionId, goaltenderId: erik.id, focusAreaId: stolp.id, recordedAt: new Date(t + 2000).toISOString() });
    for (const v of [v1, v2, v3]) await insertVideo(db, v);

    expect((await listVideos(db, { goaltenderId: erik.id })).map((v) => v.id)).toEqual([v3.id, v1.id]);
    expect((await listVideos(db, { goaltenderId: william.id })).map((v) => v.id)).toEqual([v2.id]);
    expect((await listVideos(db, { focusAreaId: forfl.id })).length).toBe(2);
    expect((await listVideos(db, { exerciseId: tpush.id })).map((v) => v.id)).toEqual([v1.id]);
    expect((await listVideos(db, { teamId: team.id })).length).toBe(3);
    expect((await listVideos(db, { from: new Date(t + 500).toISOString() })).length).toBe(2);

    const latest = await latestVideoInSession(db, sessionId);
    expect(latest?.id).toBe(v3.id);
    const counts = await countVideosByGoaltender(db, sessionId);
    expect(counts.get(erik.id)).toBe(2);
    expect(counts.get(william.id)).toBe(1);
    const byFocus = await countVideosByFocusArea(db, erik.id);
    expect(byFocus.map((f) => [f.focusAreaName, f.count])).toEqual(
      expect.arrayContaining([
        ['Förflyttningar', 1],
        ['Stolpspel', 1],
      ]),
    );

    const full = await getVideo(db, v1.id);
    expect(full?.goaltenderName).toBe('Erik');
    expect(full?.jerseyNumber).toBe(30);
    expect(full?.exerciseName).toBe('T-push');
    expect(full?.reviewStatus).toBe('not_reviewed');
    expect(full?.publicationStatus).toBe('local');
  });

  test('media info replaces clock duration; review status bulk update', async () => {
    const { db, erik } = await setup();
    const v = video({ goaltenderId: erik.id, durationMs: 120_400 });
    await insertVideo(db, v);
    await updateMediaInfo(db, v.id, { durationMs: 119_966, width: 1920, height: 1080, frameRate: 30 });
    const r = await getVideo(db, v.id);
    expect(r?.durationMs).toBe(119_966);
    expect(r?.durationSource).toBe('media');
    expect(r?.frameRate).toBe(30);
    await setReviewStatus(db, [v.id], 'keep');
    expect((await getVideo(db, v.id))?.reviewStatus).toBe('keep');
  });
});

describe('serialized transactions', () => {
  test('rollback on error and no interleaving of concurrent writes', async () => {
    const { db, erik } = await setup();
    const before = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM video_recordings');
    const txn = db.transaction(async (tx) => {
      await insertVideo(tx, video({ goaltenderId: erik.id }));
      await new Promise((r) => setTimeout(r, 20));
      throw new Error('boom');
    });
    // Issued while the transaction is open: must wait, not join (and be rolled back with) the transaction.
    const outside = insertVideo(db, video({ goaltenderId: erik.id }));
    await expect(txn).rejects.toThrow('boom');
    await outside;
    const after = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM video_recordings');
    // The concurrent write outside the transaction survives; the one inside was rolled back.
    expect((after?.n ?? 0) - (before?.n ?? 0)).toBe(1);
  });
});

describe('acceptance data flow (database level)', () => {
  test('videos and metadata survive closing and reopening the database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gv-'));
    const path = join(dir, 'goalievision.db');
    try {
      const first = await openBootstrappedDatabase(path);
      const sessionId = await createDemoData(first.db, first.trainer.id);
      const s = await getSessionDetails(first.db, sessionId);
      const erik = s!.participants.find((g) => g.firstName === 'Erik')!;
      const william = s!.participants.find((g) => g.firstName === 'William')!;
      const forfl = s!.focusAreas.find((f) => f.name === 'Förflyttningar')!;
      await insertVideo(first.db, video({ sessionId, goaltenderId: erik.id, focusAreaId: forfl.id, durationMs: 120_000 }));
      await insertVideo(first.db, video({ sessionId, goaltenderId: william.id, focusAreaId: forfl.id, durationMs: 30_000 }));
      first.db.close();

      const second = await openBootstrappedDatabase(path);
      expect(second.trainer.id).toBe(first.trainer.id);
      const erikVideos = await listVideos(second.db, { goaltenderId: erik.id });
      const williamVideos = await listVideos(second.db, { goaltenderId: william.id });
      expect(erikVideos).toHaveLength(1);
      expect(williamVideos).toHaveLength(1);
      expect(erikVideos[0]?.focusAreaName).toBe('Förflyttningar');
      expect(williamVideos[0]?.focusAreaName).toBe('Förflyttningar');
      expect(erikVideos[0]?.sessionId).toBe(sessionId);
      // Demo data is idempotent for team/goalies.
      await createDemoData(second.db, second.trainer.id);
      const goalies = await second.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM goaltenders');
      expect(goalies?.n).toBe(3);
      second.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

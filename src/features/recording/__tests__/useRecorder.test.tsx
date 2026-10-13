import type { CameraView } from 'expo-camera';
import { act, createRef, type RefObject } from 'react';
import TestRenderer from 'react-test-renderer';

import type { SqlDatabase } from '@/db/types';
import { findOrCreateFocusArea } from '@/repositories/focusAreas';
import { createGoaltender } from '@/repositories/goaltenders';
import { createSession, getSession } from '@/repositories/sessions';
import { getSetting } from '@/repositories/settings';
import { createTeam } from '@/repositories/teams';
import { listVideos } from '@/repositories/videos';
import * as videoFiles from '@/services/videoFiles';
import { DEFAULT_RECORDING_SETTINGS } from '@/state/recordingSettings';

import { openBootstrappedDatabase } from '../../../../test/helpers/nodeDb';
import { useRecorder } from '../useRecorder';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/services/videoFiles', () => ({
  diskSpace: jest.fn(() => ({ availableBytes: 50 * 1024 ** 3, totalBytes: 64 * 1024 ** 3 })),
  persistCameraFile: jest.fn(async (_uri: string, id: string) => ({ fileName: `${id}.mov`, sizeBytes: 123_456 })),
  listCameraCacheFiles: jest.fn(() => []),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Fake camera: recordAsync resolves when stopRecording is called. */
function fakeCamera() {
  let finish: ((v: { uri: string }) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  let n = 0;
  const cam = {
    recordAsync: jest.fn(
      () =>
        new Promise<{ uri: string }>((resolve, reject) => {
          n++;
          finish = resolve;
          fail = reject;
        }),
    ),
    stopRecording: jest.fn(() => finish?.({ uri: `file:///cache/Camera/rec-${n}.mov` })),
    crash: (msg: string) => fail?.(new Error(msg)),
  };
  return cam;
}

type Recorder = ReturnType<typeof useRecorder>;

async function mount(db: SqlDatabase, camera: ReturnType<typeof fakeCamera>) {
  const ref = createRef<CameraView>() as RefObject<CameraView | null>;
  (ref as { current: unknown }).current = camera;
  const out: { current: Recorder | null } = { current: null };
  function Harness() {
    out.current = useRecorder({ cameraRef: ref, db, settings: DEFAULT_RECORDING_SETTINGS, sessionStatus: 'planned' });
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Harness />);
  });
  return out as { current: Recorder };
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function setup() {
  const { db, trainer } = await openBootstrappedDatabase();
  const team = await createTeam(db, { clubName: 'Borlänge Hockey', name: 'U16' });
  const erik = await createGoaltender(db, { firstName: 'Erik', jerseyNumber: 30, teamIds: [team.id] });
  const william = await createGoaltender(db, { firstName: 'William', jerseyNumber: 35, teamIds: [team.id] });
  const forfl = await findOrCreateFocusArea(db, 'Förflyttningar');
  const sessionId = await createSession(db, {
    teamId: team.id,
    trainerId: trainer.id,
    title: 'Träning',
    scheduledAt: new Date().toISOString(),
    goaltenderIds: [erik.id, william.id],
    focusAreaIds: [forfl.id],
  });
  return { db, erik, william, forfl, sessionId };
}

describe('useRecorder pipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  test('acceptance flow: Erik then William, each video saved to the right owner', async () => {
    const { db, erik, william, forfl, sessionId } = await setup();
    const cam = fakeCamera();
    const rec = await mount(db, cam);

    await act(async () => {
      void rec.current.start({ sessionId, goaltenderId: erik.id, focusAreaId: forfl.id, exerciseId: null });
    });
    await flush();
    expect(rec.current.state.status).toBe('RECORDING');
    expect(await getSetting(db, 'activeRecordingJournal')).not.toBeNull();
    expect((await getSession(db, sessionId))?.status).toBe('active');

    // Trying to start for William while recording must not change the owner.
    await act(async () => {
      void rec.current.start({ sessionId, goaltenderId: william.id, focusAreaId: forfl.id, exerciseId: null });
    });
    expect(cam.recordAsync).toHaveBeenCalledTimes(1);

    await act(async () => rec.current.stop());
    await flush();
    await flush();
    expect(rec.current.state.status).toBe('SAVED');
    expect(await getSetting(db, 'activeRecordingJournal')).toBeNull();

    // Same focus area, switch to William, record again.
    await act(async () => {
      void rec.current.start({ sessionId, goaltenderId: william.id, focusAreaId: forfl.id, exerciseId: null });
    });
    await flush();
    await act(async () => rec.current.stop());
    await flush();
    await flush();
    expect(rec.current.state.status).toBe('SAVED');

    const erikVideos = await listVideos(db, { goaltenderId: erik.id });
    const williamVideos = await listVideos(db, { goaltenderId: william.id });
    expect(erikVideos).toHaveLength(1);
    expect(williamVideos).toHaveLength(1);
    expect(erikVideos[0]?.focusAreaId).toBe(forfl.id);
    expect(williamVideos[0]?.focusAreaId).toBe(forfl.id);
    expect(erikVideos[0]?.codec).toBe('avc1');
    expect(rec.current.state.lastSavedVideoId).toBe(williamVideos[0]?.id);
    expect(videoFiles.persistCameraFile).toHaveBeenCalledTimes(2);
  });

  test('double taps: one recordAsync and one stopRecording', async () => {
    const { db, erik, sessionId } = await setup();
    const cam = fakeCamera();
    const rec = await mount(db, cam);
    const own = { sessionId, goaltenderId: erik.id, focusAreaId: null, exerciseId: null };
    await act(async () => {
      void rec.current.start(own);
      void rec.current.start(own);
      void rec.current.start(own);
    });
    await flush();
    expect(cam.recordAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      rec.current.stop();
      rec.current.stop();
    });
    await flush();
    await flush();
    expect(cam.stopRecording).toHaveBeenCalledTimes(1);
    expect(await listVideos(db, { goaltenderId: erik.id })).toHaveLength(1);
  });

  test('file verification failure → ERROR, no metadata row, nothing marked saved', async () => {
    const { db, erik, sessionId } = await setup();
    (videoFiles.persistCameraFile as jest.Mock).mockRejectedValueOnce(new Error('Videofilen är tom.'));
    const cam = fakeCamera();
    const rec = await mount(db, cam);
    await act(async () => {
      void rec.current.start({ sessionId, goaltenderId: erik.id, focusAreaId: null, exerciseId: null });
    });
    await flush();
    await act(async () => rec.current.stop());
    await flush();
    await flush();
    expect(rec.current.state.status).toBe('ERROR');
    expect(rec.current.state.error).toContain('Videofilen är tom');
    expect(rec.current.state.lastSavedVideoId).toBeNull();
    expect(await listVideos(db, {})).toHaveLength(0);
  });

  test('camera failure during recording → ERROR and journal consumed', async () => {
    const { db, erik, sessionId } = await setup();
    const cam = fakeCamera();
    const rec = await mount(db, cam);
    await act(async () => {
      void rec.current.start({ sessionId, goaltenderId: erik.id, focusAreaId: null, exerciseId: null });
    });
    await flush();
    await act(async () => cam.crash('session interrupted'));
    await flush();
    await flush();
    expect(rec.current.state.status).toBe('ERROR');
    expect(rec.current.state.error).toContain('avbröts');
    expect(await getSetting(db, 'activeRecordingJournal')).toBeNull();
  });

  test('blocks recording when storage is critically low', async () => {
    const { db, erik, sessionId } = await setup();
    (videoFiles.diskSpace as jest.Mock).mockReturnValueOnce({ availableBytes: 100 * 1024 * 1024, totalBytes: 1 });
    const cam = fakeCamera();
    const rec = await mount(db, cam);
    await act(async () => {
      await rec.current.start({ sessionId, goaltenderId: erik.id, focusAreaId: null, exerciseId: null });
    });
    expect(cam.recordAsync).not.toHaveBeenCalled();
    expect(rec.current.state.status).toBe('ERROR');
    expect(rec.current.state.error).toContain('Lagringsutrymmet');
  });
});

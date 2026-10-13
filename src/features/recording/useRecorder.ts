import type { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState } from 'react-native';

import type { SqlDatabase } from '@/db/types';
import { markUsed } from '@/repositories/focusAreas';
import { startSession } from '@/repositories/sessions';
import { insertVideo } from '@/repositories/videos';
import { clearJournal, recoverInterruptedRecording, writeJournal } from '@/services/recordingJournal';
import { BLOCK_RECORDING_BYTES, maxFileSizeForRecording } from '@/services/storageEstimate';
import { diskSpace, persistCameraFile } from '@/services/videoFiles';
import { notifyDataChanged } from '@/state/dataEvents';
import { cameraCodec, type RecordingSettings } from '@/state/recordingSettings';
import { newId } from '@/utils/id';

import {
  canStart,
  canStop,
  initialRecordingState,
  recordingReducer,
  type RecordingEvent,
  type RecordingOwnership,
  type RecordingState,
} from './recordingMachine';

/** If the camera has not delivered the file this long after STOPPA, treat it as failed. */
const STOP_WATCHDOG_MS = 15_000;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Drives one camera through the recording state machine and the save
 * pipeline: record → stop → verify file → move to durable storage → write
 * metadata (single transaction) → SAVED.
 *
 * The machine state lives in a ref so guards (canStart/canStop) are evaluated
 * synchronously; React state only mirrors it for rendering. This is what makes
 * rapid double taps on SPELA IN / STOPPA harmless.
 */
export function useRecorder({
  cameraRef,
  db,
  settings,
  sessionStatus,
}: {
  cameraRef: RefObject<CameraView | null>;
  db: SqlDatabase;
  settings: RecordingSettings;
  sessionStatus: 'planned' | 'active' | 'completed' | undefined;
}) {
  const machine = useRef<RecordingState>(initialRecordingState);
  const [state, setState] = useState<RecordingState>(initialRecordingState);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const dispatch = useCallback((e: RecordingEvent) => {
    const next = recordingReducer(machine.current, e);
    if (next !== machine.current) {
      machine.current = next;
      if (mounted.current) setState(next);
    }
    return next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (watchdog.current) clearTimeout(watchdog.current);
    };
  }, []);

  const save = useCallback(
    async (attempt: number, ownership: RecordingOwnership, uri: string, startedAt: number, stoppedAt: number) => {
      const videoId = newId();
      let persisted: { fileName: string; sizeBytes: number } | null = null;
      try {
        persisted = await persistCameraFile(uri, videoId);
        const p = persisted;
        await db.transaction(async (tx) => {
          await insertVideo(tx, {
            id: videoId,
            sessionId: ownership.sessionId,
            goaltenderId: ownership.goaltenderId,
            focusAreaId: ownership.focusAreaId,
            exerciseId: ownership.exerciseId,
            fileName: p.fileName,
            recordedAt: new Date(startedAt).toISOString(),
            durationMs: Math.max(0, stoppedAt - startedAt),
            fileSizeBytes: p.sizeBytes,
            codec: cameraCodec(settings.codec),
          });
          await markUsed(tx, ownership.focusAreaId, ownership.exerciseId);
        });
        await clearJournal(db);
        dispatch({ type: 'SAVE_OK', attempt, videoId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        notifyDataChanged();
      } catch (e) {
        // Never delete anything here: the camera file (or the moved file) is kept.
        await clearJournal(db).catch(() => undefined);
        const msg = persisted
          ? `Videofilen sparades men kunde inte registreras i databasen (${errorMessage(e)}). Filen finns kvar och visas under Inställningar → Lagring.`
          : `Inspelningen kunde inte sparas: ${errorMessage(e)}`;
        dispatch({ type: 'SAVE_FAILED', attempt, error: msg });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      }
    },
    [db, dispatch, settings.codec],
  );

  /** Tries to salvage the temp file through the journal after a capture failure. */
  const salvage = useCallback(async (attempt: number, reason: string) => {
    let recovered = 0;
    try {
      recovered = (await recoverInterruptedRecording(db)).recoveredVideoIds.length;
    } catch {
      // Ignore; the error below is what matters to the coach.
    }
    if (recovered) notifyDataChanged();
    dispatch({
      type: 'FAIL',
      attempt,
      error: recovered
        ? `${reason} Den del som hann spelas in har sparats och markerats som återställd.`
        : reason,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, [db, dispatch]);

  const start = useCallback(
    async (ownership: RecordingOwnership) => {
      if (!canStart(machine.current)) return;
      const camera = cameraRef.current;
      const s = dispatch({ type: 'START', ownership });
      if (s.status !== 'PREPARING') return;
      const attempt = s.attempt;

      if (!camera) {
        dispatch({ type: 'FAIL', attempt, error: 'Kameran är inte redo. Vänta ett ögonblick och försök igen.' });
        return;
      }
      let available = 0;
      try {
        available = diskSpace().availableBytes;
      } catch {
        available = Number.MAX_SAFE_INTEGER; // Unknown: do not block, the camera's own limits apply.
      }
      if (available < BLOCK_RECORDING_BYTES) {
        dispatch({
          type: 'FAIL',
          attempt,
          error: 'Lagringsutrymmet är nästan slut. Radera gamla videor under Inställningar → Lagring innan du spelar in.',
        });
        return;
      }

      const startedAt = Date.now();
      try {
        await writeJournal(db, { ownership, startedAt, codec: cameraCodec(settings.codec) });
        if (sessionStatus === 'planned') await startSession(db, ownership.sessionId);
      } catch (e) {
        dispatch({ type: 'FAIL', attempt, error: `Databasfel före inspelning: ${errorMessage(e)}` });
        return;
      }

      let recording: Promise<{ uri: string } | undefined>;
      try {
        recording = camera.recordAsync({
          codec: cameraCodec(settings.codec),
          maxFileSize: available === Number.MAX_SAFE_INTEGER ? undefined : maxFileSizeForRecording(available),
        });
      } catch (e) {
        await clearJournal(db).catch(() => undefined);
        dispatch({ type: 'FAIL', attempt, error: `Inspelningen kunde inte startas: ${errorMessage(e)}` });
        return;
      }
      // expo-camera has no "recording started" event; the call above starts capture synchronously on the session queue.
      dispatch({ type: 'STARTED', attempt, at: Date.now() });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);

      let result: { uri: string } | undefined;
      try {
        result = await recording;
      } catch (e) {
        if (watchdog.current) clearTimeout(watchdog.current);
        if (machine.current.attempt !== attempt) return;
        await salvage(attempt, `Inspelningen avbröts: ${errorMessage(e)}.`);
        return;
      }
      if (watchdog.current) clearTimeout(watchdog.current);
      if (machine.current.attempt !== attempt || machine.current.status === 'ERROR') return;

      const capturedAt = Date.now();
      const afterCapture = dispatch({ type: 'CAPTURED', attempt, at: capturedAt });
      if (afterCapture.status !== 'SAVING') return;
      if (!result?.uri) {
        await clearJournal(db).catch(() => undefined);
        dispatch({ type: 'SAVE_FAILED', attempt, error: 'Kameran levererade ingen videofil.' });
        return;
      }
      await save(attempt, ownership, result.uri, afterCapture.startedAt ?? startedAt, afterCapture.stoppedAt ?? capturedAt);
    },
    [cameraRef, db, dispatch, save, salvage, sessionStatus, settings.codec],
  );

  const stop = useCallback(() => {
    if (!canStop(machine.current)) return;
    const s = dispatch({ type: 'STOP', at: Date.now() });
    const attempt = s.attempt;
    try {
      cameraRef.current?.stopRecording();
    } catch {
      // Handled by the watchdog below.
    }
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      if (machine.current.attempt === attempt && machine.current.status === 'STOPPING') {
        void salvage(attempt, 'Kameran svarade inte när inspelningen stoppades.');
      }
    }, STOP_WATCHDOG_MS);
  }, [cameraRef, dispatch, salvage]);

  const dismiss = useCallback(() => {
    dispatch({ type: 'DISMISS' });
  }, [dispatch]);

  // iOS stops the capture session when the app goes to the background. Stop
  // cleanly ourselves so the file is finalized and saved for the right owner.
  // ('inactive' — e.g. Control Center pulled down — does not stop capture.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && canStop(machine.current)) stop();
    });
    return () => sub.remove();
  }, [stop]);

  return { state, start, stop, dismiss, machine };
}

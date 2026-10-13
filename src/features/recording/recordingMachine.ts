import type { Id } from '@/domain/types';

/**
 * Recording state machine.
 *
 *   IDLE ──START──▶ PREPARING ──STARTED──▶ RECORDING ──STOP──▶ STOPPING
 *                       │                      │                  │
 *                       └──FAIL──▶ ERROR ◀──FAIL┘          CAPTURED ▼
 *                                    ▲                          SAVING
 *                                    └──────────SAVE_FAILED───────┤
 *                                                     SAVE_OK ▼
 *                                                           SAVED
 *
 * SAVED and ERROR behave like IDLE for starting a new recording, so the coach
 * can immediately record again. Every event that is not valid for the current
 * state is ignored, which makes double taps and racing callbacks harmless.
 */
export type RecordingStatus = 'IDLE' | 'PREPARING' | 'RECORDING' | 'STOPPING' | 'SAVING' | 'SAVED' | 'ERROR';

/**
 * Snapshot of who/what a recording belongs to, captured when SPELA IN is
 * pressed. The owner can never change while the recording is in progress.
 */
export interface RecordingOwnership {
  sessionId: Id;
  goaltenderId: Id;
  focusAreaId: Id | null;
  exerciseId: Id | null;
}

export interface RecordingState {
  status: RecordingStatus;
  /** Monotonic id of the current attempt; stale async callbacks carry an older id and are ignored. */
  attempt: number;
  ownership: RecordingOwnership | null;
  /** Wall clock (ms since epoch) when capture started. */
  startedAt: number | null;
  stoppedAt: number | null;
  lastSavedVideoId: Id | null;
  error: string | null;
}

export type RecordingEvent =
  | { type: 'START'; ownership: RecordingOwnership }
  | { type: 'STARTED'; attempt: number; at: number }
  | { type: 'STOP'; at: number }
  | { type: 'CAPTURED'; attempt: number; at: number }
  | { type: 'SAVE_OK'; attempt: number; videoId: Id }
  | { type: 'SAVE_FAILED'; attempt: number; error: string }
  | { type: 'FAIL'; attempt: number; error: string }
  | { type: 'DISMISS' };

export const initialRecordingState: RecordingState = {
  status: 'IDLE',
  attempt: 0,
  ownership: null,
  startedAt: null,
  stoppedAt: null,
  lastSavedVideoId: null,
  error: null,
};

export function canStart(s: RecordingState): boolean {
  return s.status === 'IDLE' || s.status === 'SAVED' || s.status === 'ERROR';
}

export function canStop(s: RecordingState): boolean {
  return s.status === 'RECORDING';
}

/** While true, goaltender / focus area / exercise selection must not change. */
export function isSelectionLocked(s: RecordingState): boolean {
  return s.status === 'PREPARING' || s.status === 'RECORDING' || s.status === 'STOPPING' || s.status === 'SAVING';
}

export function isBusy(s: RecordingState): boolean {
  return isSelectionLocked(s);
}

export function recordingReducer(s: RecordingState, e: RecordingEvent): RecordingState {
  switch (e.type) {
    case 'START':
      if (!canStart(s) || !e.ownership.goaltenderId || !e.ownership.sessionId) return s;
      return {
        ...s,
        status: 'PREPARING',
        attempt: s.attempt + 1,
        ownership: e.ownership,
        startedAt: null,
        stoppedAt: null,
        error: null,
      };
    case 'STARTED':
      if (s.status !== 'PREPARING' || e.attempt !== s.attempt) return s;
      return { ...s, status: 'RECORDING', startedAt: e.at };
    case 'STOP':
      if (!canStop(s)) return s;
      return { ...s, status: 'STOPPING', stoppedAt: e.at };
    case 'CAPTURED':
      if (e.attempt !== s.attempt) return s;
      // Capture can also end without STOP (max duration/size reached, app backgrounded).
      if (s.status !== 'STOPPING' && s.status !== 'RECORDING') return s;
      return { ...s, status: 'SAVING', stoppedAt: s.stoppedAt ?? e.at };
    case 'SAVE_OK':
      if (s.status !== 'SAVING' || e.attempt !== s.attempt) return s;
      return { ...s, status: 'SAVED', lastSavedVideoId: e.videoId };
    case 'SAVE_FAILED':
      if (s.status !== 'SAVING' || e.attempt !== s.attempt) return s;
      return { ...s, status: 'ERROR', error: e.error };
    case 'FAIL':
      if (e.attempt !== s.attempt || !isBusy(s)) return s;
      return { ...s, status: 'ERROR', error: e.error };
    case 'DISMISS':
      if (s.status !== 'SAVED' && s.status !== 'ERROR') return s;
      return { ...s, status: 'IDLE', error: null };
    default:
      return s;
  }
}

/** Elapsed recording time in ms for the on-screen timer. */
export function elapsedMs(s: RecordingState, now: number): number {
  if (s.startedAt == null) return 0;
  const end = s.status === 'RECORDING' ? now : (s.stoppedAt ?? now);
  return Math.max(0, end - s.startedAt);
}

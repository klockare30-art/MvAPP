import {
  canStart,
  canStop,
  elapsedMs,
  initialRecordingState,
  isSelectionLocked,
  recordingReducer,
  type RecordingEvent,
  type RecordingOwnership,
  type RecordingState,
} from '../recordingMachine';

const erik: RecordingOwnership = { sessionId: 's1', goaltenderId: 'erik', focusAreaId: 'forfl', exerciseId: null };
const william: RecordingOwnership = { ...erik, goaltenderId: 'william' };

function run(events: RecordingEvent[], from: RecordingState = initialRecordingState): RecordingState {
  return events.reduce(recordingReducer, from);
}

describe('recording state machine', () => {
  test('happy path IDLE → PREPARING → RECORDING → STOPPING → SAVING → SAVED → IDLE', () => {
    let s = run([{ type: 'START', ownership: erik }]);
    expect(s.status).toBe('PREPARING');
    expect(s.attempt).toBe(1);
    s = run([{ type: 'STARTED', attempt: 1, at: 1000 }], s);
    expect(s.status).toBe('RECORDING');
    s = run([{ type: 'STOP', at: 121_000 }], s);
    expect(s.status).toBe('STOPPING');
    s = run([{ type: 'CAPTURED', attempt: 1, at: 121_500 }], s);
    expect(s.status).toBe('SAVING');
    expect(s.stoppedAt).toBe(121_000);
    s = run([{ type: 'SAVE_OK', attempt: 1, videoId: 'v1' }], s);
    expect(s.status).toBe('SAVED');
    expect(s.lastSavedVideoId).toBe('v1');
    expect(elapsedMs(s, 999_999)).toBe(120_000);
    s = run([{ type: 'DISMISS' }], s);
    expect(s.status).toBe('IDLE');
    expect(s.lastSavedVideoId).toBe('v1');
  });

  test('double START is ignored while busy (no second attempt)', () => {
    const s = run([
      { type: 'START', ownership: erik },
      { type: 'START', ownership: william },
    ]);
    expect(s.attempt).toBe(1);
    expect(s.ownership?.goaltenderId).toBe('erik');
  });

  test('owner cannot change during recording', () => {
    const s = run([
      { type: 'START', ownership: erik },
      { type: 'STARTED', attempt: 1, at: 0 },
      { type: 'START', ownership: william },
    ]);
    expect(s.status).toBe('RECORDING');
    expect(s.ownership?.goaltenderId).toBe('erik');
    expect(isSelectionLocked(s)).toBe(true);
  });

  test('START without goaltender is rejected', () => {
    const s = run([{ type: 'START', ownership: { ...erik, goaltenderId: '' } }]);
    expect(s.status).toBe('IDLE');
  });

  test('STOP only valid while RECORDING; double STOP ignored', () => {
    expect(run([{ type: 'STOP', at: 1 }]).status).toBe('IDLE');
    const s = run([
      { type: 'START', ownership: erik },
      { type: 'STARTED', attempt: 1, at: 0 },
      { type: 'STOP', at: 10 },
      { type: 'STOP', at: 20 },
    ]);
    expect(s.status).toBe('STOPPING');
    expect(s.stoppedAt).toBe(10);
  });

  test('capture ending without STOP (e.g. backgrounding) still saves', () => {
    const s = run([
      { type: 'START', ownership: erik },
      { type: 'STARTED', attempt: 1, at: 0 },
      { type: 'CAPTURED', attempt: 1, at: 5000 },
    ]);
    expect(s.status).toBe('SAVING');
    expect(s.stoppedAt).toBe(5000);
  });

  test('stale callbacks from an older attempt are ignored', () => {
    let s = run([
      { type: 'START', ownership: erik },
      { type: 'FAIL', attempt: 1, error: 'x' },
      { type: 'START', ownership: william },
    ]);
    expect(s.attempt).toBe(2);
    s = run([{ type: 'STARTED', attempt: 1, at: 0 }], s);
    expect(s.status).toBe('PREPARING');
    s = run([{ type: 'STARTED', attempt: 2, at: 0 }, { type: 'SAVE_OK', attempt: 1, videoId: 'old' }], s);
    expect(s.status).toBe('RECORDING');
    expect(s.lastSavedVideoId).toBeNull();
  });

  test('save failure → ERROR, and a new recording can start from ERROR and SAVED', () => {
    let s = run([
      { type: 'START', ownership: erik },
      { type: 'STARTED', attempt: 1, at: 0 },
      { type: 'STOP', at: 1 },
      { type: 'CAPTURED', attempt: 1, at: 2 },
      { type: 'SAVE_FAILED', attempt: 1, error: 'disk' },
    ]);
    expect(s.status).toBe('ERROR');
    expect(s.error).toBe('disk');
    expect(canStart(s)).toBe(true);
    s = run([{ type: 'START', ownership: william }], s);
    expect(s.status).toBe('PREPARING');
    expect(s.error).toBeNull();
  });

  test('guards', () => {
    expect(canStart(initialRecordingState)).toBe(true);
    expect(canStop(initialRecordingState)).toBe(false);
    for (const status of ['PREPARING', 'RECORDING', 'STOPPING', 'SAVING'] as const) {
      const s = { ...initialRecordingState, status };
      expect(canStart(s)).toBe(false);
      expect(isSelectionLocked(s)).toBe(true);
    }
    for (const status of ['IDLE', 'SAVED', 'ERROR'] as const) {
      expect(isSelectionLocked({ ...initialRecordingState, status })).toBe(false);
    }
  });

  test('FAIL ignored when not busy', () => {
    expect(run([{ type: 'FAIL', attempt: 0, error: 'x' }]).status).toBe('IDLE');
  });
});

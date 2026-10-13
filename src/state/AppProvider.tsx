import * as ScreenOrientation from 'expo-screen-orientation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { bootstrapDatabase } from '@/db/bootstrap';
import { openExpoDatabase } from '@/db/expoAdapter';
import type { SqlDatabase } from '@/db/types';
import type { Trainer } from '@/domain/types';
import { recoverInterruptedRecording } from '@/services/recordingJournal';

import { notifyDataChanged } from './dataEvents';
import {
  DEFAULT_RECORDING_SETTINGS,
  loadRecordingSettings,
  saveRecordingSettings,
  type RecordingSettings,
} from './recordingSettings';

interface AppContextValue {
  db: SqlDatabase;
  trainer: Trainer;
  recordingSettings: RecordingSettings;
  updateRecordingSettings: (s: RecordingSettings) => Promise<void>;
  /** Set when a recording interrupted by app termination was recovered at launch. */
  recoveredVideoIds: string[];
  dismissRecoveryNotice: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

type InitState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; db: SqlDatabase; trainer: Trainer; settings: RecordingSettings; recovered: string[] };

export function AppProvider({
  children,
  renderLoading,
  renderError,
}: {
  children: ReactNode;
  renderLoading: () => ReactNode;
  renderError: (message: string, retry: () => void) => ReactNode;
}) {
  const [state, setState] = useState<InitState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Also enforced by app.json; this covers Expo Go, which ignores the native setting.
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
        const db = await openExpoDatabase();
        const { trainer } = await bootstrapDatabase(db);
        let recovered: string[] = [];
        try {
          recovered = (await recoverInterruptedRecording(db)).recoveredVideoIds;
        } catch (e) {
          console.warn('Recovery of interrupted recording failed', e);
        }
        const settings = await loadRecordingSettings(db);
        if (!cancelled) setState({ phase: 'ready', db, trainer, settings, recovered });
      } catch (e) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: `Databasen kunde inte öppnas. ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const updateRecordingSettings = useCallback(
    async (s: RecordingSettings) => {
      if (state.phase !== 'ready') return;
      await saveRecordingSettings(state.db, s);
      setState({ ...state, settings: s });
    },
    [state],
  );

  const dismissRecoveryNotice = useCallback(() => {
    setState((prev) => (prev.phase === 'ready' ? { ...prev, recovered: [] } : prev));
    notifyDataChanged();
  }, []);

  const value = useMemo<AppContextValue | null>(
    () =>
      state.phase === 'ready'
        ? {
            db: state.db,
            trainer: state.trainer,
            recordingSettings: state.settings ?? DEFAULT_RECORDING_SETTINGS,
            updateRecordingSettings,
            recoveredVideoIds: state.recovered,
            dismissRecoveryNotice,
          }
        : null,
    [state, updateRecordingSettings, dismissRecoveryNotice],
  );

  if (state.phase === 'loading') return <>{renderLoading()}</>;
  if (state.phase === 'error') return <>{renderError(state.message, () => setAttempt((a) => a + 1))}</>;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

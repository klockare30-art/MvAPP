import { useCallback, useSyncExternalStore } from 'react';

// Shared clock snapshot so render stays pure (Date.now() is only called in timers).
let snapshot = Date.now();
const getSnapshot = () => snapshot;

/** Current time in ms, refreshed every `intervalMs` while `enabled`. */
export function useNow(intervalMs: number, enabled = true): number {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled) return () => undefined;
      snapshot = Date.now();
      const t = setInterval(() => {
        snapshot = Date.now();
        notify();
      }, intervalMs);
      return () => clearInterval(t);
    },
    [intervalMs, enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SqlDatabase } from '@/db/types';

import { useApp } from './AppProvider';
import { subscribeDataChanged } from './dataEvents';

export interface QueryResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs a read against the local database and keeps it fresh: it re-runs when
 * the screen regains focus, when `deps` change, and whenever any mutation
 * calls notifyDataChanged(). Out-of-order results are discarded.
 *
 * `loader` must only depend on values listed in `deps` (like useEffect).
 */
export function useDbQuery<T>(loader: (db: SqlDatabase) => Promise<T>, deps: unknown[]): QueryResult<T> {
  const { db } = useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const depsKey = JSON.stringify(deps);

  const run = useCallback(() => {
    const mySeq = ++seq.current;
    setLoading(true);
    loader(db)
      .then((d) => {
        if (mySeq !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mySeq !== seq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (mySeq === seq.current) setLoading(false);
      });
    // `loader` is intentionally keyed by `depsKey` (callers pass inline closures).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, depsKey]);

  useEffect(() => subscribeDataChanged(run), [run]);

  // Runs on mount/focus, and again whenever `run` changes (deps changed) while focused.
  useFocusEffect(run);

  return { data, error, loading, reload: run };
}

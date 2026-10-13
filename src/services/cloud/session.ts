import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSupabase } from './client';
import { readCloudConfig } from './config';
import { createPortalApi } from './portalApi';
import type { PortalApi } from './publish';

export type CloudState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; session: Session };

/** Current portal login state for the coach. */
export function useCloudSession(): CloudState {
  const supabase = getSupabase();
  const [state, setState] = useState<CloudState>(supabase ? { kind: 'loading' } : { kind: 'unconfigured' });
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setState(data.session ? { kind: 'signedIn', session: data.session } : { kind: 'signedOut' });
      })
      .catch(() => alive && setState({ kind: 'signedOut' }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setState(s ? { kind: 'signedIn', session: s } : { kind: 'signedOut' });
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);
  return state;
}

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Målvaktsportalen är inte konfigurerad i den här versionen av appen.');
  return supabase;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error('Inloggningen misslyckades. Kontrollera e-post och lösenord.');
}

/** Creates a coach account. Supabase sends a confirmation e-mail before the first login. */
export async function signUp(email: string, password: string): Promise<'confirm-email' | 'signed-in'> {
  if (password.length < 10) throw new Error('Välj ett lösenord med minst 10 tecken.');
  const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(`Kontot kunde inte skapas: ${error.message}`);
  return data.session ? 'signed-in' : 'confirm-email';
}

export async function signOut(): Promise<void> {
  await requireClient().auth.signOut();
}

export function getPortalApi(): PortalApi {
  const supabase = requireClient();
  const cfg = readCloudConfig();
  return createPortalApi(supabase, cfg?.supabaseAnonKey ?? '');
}

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { Library } from './Library';
import { Login } from './Login';
import { isConfigured, supabase } from './supabase';
import { VideoView } from './VideoView';

/** Minimal hash routing: "#/" library, "#/video/<id>" player (keeps the back button working). */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const hash = useHashRoute();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Portalen är inte konfigurerad</h1>
          <p className="muted">Sätt VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY och bygg om portalen.</p>
        </div>
      </main>
    );
  }
  if (session === undefined) return <main className="center"><div className="spinner" aria-label="Laddar" /></main>;
  if (!session) return <Login />;

  const match = /^#\/video\/([0-9a-f-]{36})$/.exec(hash);
  if (match?.[1]) return <VideoView videoId={match[1]} userId={session.user.id} />;
  return <Library email={session.user.email ?? ''} userId={session.user.id} />;
}

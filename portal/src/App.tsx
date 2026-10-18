import { lazy, Suspense, useEffect, useState } from 'react';

import { Admin } from './Admin';
import { ControlPanel } from './ControlPanel';
import { currentUser, isPortalConfigured, onUserChange, type PortalUser } from './auth';
import { IS_DEMO } from './demo';
import { Library } from './Library';
import { Login } from './Login';
import { Teams } from './Teams';
import { VideoView } from './VideoView';

// The tagging tool pulls in the MP4 library; load it only for coaches who open it.
const MatchTagger = lazy(() => import('./MatchTagger').then((m) => ({ default: m.MatchTagger })));

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

function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demoBanner" role="note">
      DEMO – exempeldata. Inget sparas på någon server och inga riktiga videor visas.
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<PortalUser | null | undefined>(undefined);
  const hash = useHashRoute();

  useEffect(() => {
    if (!isPortalConfigured) return;
    currentUser().then(setUser).catch(() => setUser(null));
    return onUserChange(setUser);
  }, []);

  if (!isPortalConfigured) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Portalen är inte konfigurerad</h1>
          <p className="muted">Sätt VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY och bygg om portalen.</p>
        </div>
      </main>
    );
  }

  let page;
  if (user === undefined) page = <main className="center"><div className="spinner" aria-label="Laddar" /></main>;
  else if (!user) page = <Login />;
  else {
    const match = /^#\/video\/([0-9a-f-]{36})$/.exec(hash);
    page = hash === '#/admin' ? (
      <Admin />
    ) : hash === '#/kontrollpanel' ? (
      <ControlPanel />
    ) : hash === '#/lag' ? (
      <Teams />
    ) : hash === '#/tagga' ? (
      <Suspense fallback={<main className="center"><div className="spinner" aria-label="Laddar" /></main>}>
        <MatchTagger />
      </Suspense>
    ) : match?.[1] ? (
      <VideoView videoId={match[1]} userId={user.id} />
    ) : (
      <Library email={user.email} userId={user.id} />
    );
  }
  return (
    <>
      <DemoBanner />
      {page}
    </>
  );
}

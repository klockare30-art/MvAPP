import { useEffect, useMemo, useState } from 'react';

import { claimProfiles, loadProfiles, loadVideos } from './api';
import { filterByFocus, focusAreaCounts, formatDuration, formatTime, groupByDay } from './format';
import { signOut } from './auth';
import type { GoaltenderProfile, PublishedVideo } from './types';

export function Library({ email, userId }: { email: string; userId: string }) {
  const [videos, setVideos] = useState<PublishedVideo[] | null>(null);
  const [profiles, setProfiles] = useState<GoaltenderProfile[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await claimProfiles();
        const [p, v] = await Promise.all([loadProfiles(), loadVideos()]);
        if (!cancelled) {
          setProfiles(p);
          setVideos(v);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => focusAreaCounts(videos ?? []), [videos]);
  const groups = useMemo(() => groupByDay(filterByFocus(videos ?? [], focus)), [videos, focus]);
  const me = profiles.find((p) => p.user_id === userId);
  const goalieName = (id: string) => {
    const g = profiles.find((p) => p.id === id);
    return g ? `${g.first_name}${g.jersey_number != null ? ` #${g.jersey_number}` : ''}` : null;
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>●</span>
          <div>
            <strong>GoalieVision</strong>
            <span className="muted small">{me ? `${me.first_name} ${me.last_name}`.trim() : email}</span>
          </div>
        </div>
        <button className="btn ghost" onClick={() => void signOut()}>
          Logga ut
        </button>
      </header>

      <main className="content">
        <h1>Mina videor</h1>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {videos === null && !error ? <div className="spinner" aria-label="Laddar" /> : null}

        {videos && videos.length === 0 ? (
          <div className="card">
            <h2>Inga videor ännu</h2>
            <p className="muted">
              När din tränare publicerar ett klipp till dig dyker det upp här. Inloggad som {email}. Om du inte ser något
              efter träningen – kontrollera att tränaren har registrerat just den här e-postadressen.
            </p>
          </div>
        ) : null}

        {counts.length > 0 ? (
          <div className="chips" role="toolbar" aria-label="Filtrera på fokusområde">
            <button className={`chip ${focus == null ? 'on' : ''}`} onClick={() => setFocus(null)}>
              Alla ({videos?.length ?? 0})
            </button>
            {counts.map((c) => (
              <button key={c.name} className={`chip ${focus === c.name ? 'on' : ''}`} onClick={() => setFocus(c.name)}>
                {c.name} – {c.count}
              </button>
            ))}
          </div>
        ) : null}

        {groups.map((g) => (
          <section key={g.day} className="day">
            <h2 className="dayTitle">{g.day}</h2>
            <div className="grid">
              {g.videos.map((v) => (
                <a key={v.id} className="videoCard" href={`#/video/${v.id}`}>
                  <div className="thumb">
                    <span className="play" aria-hidden>▶</span>
                    <span className="dur">{formatDuration(v.duration_ms)}</span>
                  </div>
                  <div className="meta">
                    <strong>{[v.focus_area ?? 'Utan fokusområde', v.exercise].filter(Boolean).join(' · ')}</strong>
                    <span className="muted small">
                      {formatTime(v.recorded_at)}
                      {v.team_name ? ` · ${v.team_name}` : ''}
                      {v.coach_id === userId && goalieName(v.goaltender_id) ? ` · ${goalieName(v.goaltender_id)}` : ''}
                    </span>
                    {v.coach_note ? <span className="note">{v.coach_note}</span> : null}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

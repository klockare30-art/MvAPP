import { useEffect, useMemo, useState } from 'react';

import { claimProfiles, deleteVideos, isAdmin, isCoach, loadProfiles, loadVideos } from './api';
import { filterByFocus, focusAreaCounts, formatDuration, formatTime, groupByMatch } from './format';
import { signOut } from './auth';
import type { GoaltenderProfile, PublishedVideo } from './types';

export function Library({ email, userId }: { email: string; userId: string }) {
  const [videos, setVideos] = useState<PublishedVideo[] | null>(null);
  const [profiles, setProfiles] = useState<GoaltenderProfile[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [coach, setCoach] = useState(false);

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
    isAdmin()
      .then((a) => !cancelled && setAdmin(a))
      .catch(() => undefined);
    isCoach()
      .then((c) => !cancelled && setCoach(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => focusAreaCounts(videos ?? []), [videos]);
  const groups = useMemo(() => groupByMatch(filterByFocus(videos ?? [], focus)), [videos, focus]);
  const [manage, setManage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ownCount = (videos ?? []).filter((v) => v.coach_id === userId).length;

  /** Coach only: removes the given clips (own clips only – the database refuses others). */
  const remove = async (list: PublishedVideo[], what: string) => {
    const own = list.filter((v) => v.coach_id === userId);
    if (own.length === 0) return;
    const goalies = [...new Set(own.map((v) => goalieName(v.goaltender_id)).filter(Boolean))].join(', ');
    if (!window.confirm(`Ta bort ${what} (${own.length} klipp${goalies ? ` till ${goalies}` : ''})? Målvakten ser dem inte längre och kommentarerna tas bort. Det går inte att ångra.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteVideos(own);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      const ids = new Set(own.map((v) => v.id));
      setVideos((prev) => (prev ? prev.filter((v) => !ids.has(v.id)) : prev));
      setDeleting(false);
      void loadVideos().then(setVideos).catch(() => undefined);
    }
  };
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
        <div className="topActions">
          {coach || admin ? (
            <>
              <a className="btn" href="#/kontrollpanel">
                Kontrollpanel
              </a>
              <a className="btn" href="#/lag">
                Mina lag
              </a>
              <a className="btn" href="#/tagga">
                Tagga match
              </a>
            </>
          ) : null}
          {admin ? (
            <a className="btn" href="#/admin">
              Admin
            </a>
          ) : null}
          <button className="btn ghost" onClick={() => void signOut()}>
            Logga ut
          </button>
        </div>
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

        {ownCount > 0 ? (
          <div className="manageBar">
            <button className={`btn ${manage ? 'primary' : ''}`} onClick={() => setManage((m) => !m)}>
              {manage ? 'Klar' : 'Hantera klipp'}
            </button>
            {manage ? <span className="small muted">Ta bort enskilda klipp eller en hel match. Bara klipp du själv har publicerat.</span> : null}
          </div>
        ) : null}

        {groups.map((g) => (
          <section key={g.key} className="day">
            <div className="groupHead">
              <h2 className="dayTitle">{g.title}</h2>
              {manage && g.videos.some((v) => v.coach_id === userId) ? (
                <button className="btn small danger" disabled={deleting} onClick={() => void remove(g.videos, 'hela matchen')}>
                  Ta bort matchen
                </button>
              ) : null}
            </div>
            <div className="grid">
              {g.videos.map((v) => (
                <div key={v.id} className="cardWrap">
                <a className="videoCard" href={`#/video/${v.id}`}>
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
                {manage && v.coach_id === userId ? (
                  <button className="cardDelete" disabled={deleting} onClick={() => void remove([v], 'klippet')} aria-label="Ta bort klippet">
                    Ta bort
                  </button>
                ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

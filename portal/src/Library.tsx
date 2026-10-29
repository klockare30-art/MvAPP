import { useEffect, useMemo, useState } from 'react';

import { claimProfiles, deleteVideos, isAdmin, isCoach, listClubs, listMyGoaltenders, listTeams, loadProfiles, loadVideos, reorderVideos } from './api';
import { buildVideoTree, filterByFocus, focusAreaCounts, formatDuration, formatTime, groupByMatch, KIND_LABEL } from './format';
import { signOut } from './auth';
import type { Club, CoachGoaltender, Team } from './publishClip';
import { loadNav, saveNav } from './nav';
import { formatClock, moveInList } from './tagging';
import type { GoaltenderProfile, PublishedVideo } from './types';
import { ClipThumb } from './ClipThumb';
import { Logo } from './Logo';

type CoachData = { goalies: CoachGoaltender[]; teams: Team[]; clubs: Club[] };

/** "1:24:13" – seconds since local midnight of the recorded time. */
function formatMatchClock(iso: string): string {
  const d = new Date(iso);
  return formatClock(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
}

export function Library({ email, userId }: { email: string; userId: string }) {
  const [videos, setVideos] = useState<PublishedVideo[] | null>(null);
  const [profiles, setProfiles] = useState<GoaltenderProfile[]>([]);
  // The filter survives a trip to a video and back (per tab).
  const [focus, setFocusState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('gv-focus');
    } catch {
      return null;
    }
  });
  const setFocus = (f: string | null) => {
    setFocusState(f);
    try {
      if (f) sessionStorage.setItem('gv-focus', f);
      else sessionStorage.removeItem('gv-focus');
    } catch {
      // ignore
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [coach, setCoach] = useState(false);
  const [coachData, setCoachData] = useState<CoachData | null>(null);
  const [manage, setManage] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      .then(async (c) => {
        if (cancelled) return;
        setCoach(c);
        if (!c) return;
        // The coach's structure for the club → team → goaltender view.
        const [goalies, teams, clubs] = await Promise.all([listMyGoaltenders(), listTeams(), listClubs()]);
        if (!cancelled) setCoachData({ goalies, teams, clubs });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => filterByFocus(videos ?? [], focus), [videos, focus]);
  const counts = useMemo(() => focusAreaCounts(videos ?? []), [videos]);
  // Clips this coach published → tree; clips the user receives as a goaltender → by match, as before.
  const own = useMemo(() => filtered.filter((v) => v.coach_id === userId), [filtered, userId]);
  const received = useMemo(() => filtered.filter((v) => v.coach_id !== userId), [filtered, userId]);
  const tree = useMemo(
    () => (coachData ? buildVideoTree(own, coachData.goalies, coachData.teams, coachData.clubs) : []),
    [own, coachData],
  );
  const groups = useMemo(() => groupByMatch(received), [received]);
  // Clips in on-screen order (after the filter) – the video view uses this for previous/next.
  const orderedIds = useMemo(
    () => [
      ...tree.flatMap((c) => c.teams.flatMap((t) => t.goalies.flatMap((g) => g.kinds.flatMap((k) => k.sessions.flatMap((s) => s.videos.map((v) => v.id)))))),
      ...groups.flatMap((g) => g.videos.map((v) => v.id)),
    ],
    [tree, groups],
  );
  const rememberList = () => {
    const prev = loadNav();
    saveNav({ ids: orderedIds, label: focus ?? 'Alla klipp', autoplay: prev?.autoplay, rate: prev?.rate });
  };
  const ownCount = (videos ?? []).filter((v) => v.coach_id === userId).length;

  const goalieName = (id: string) => {
    const g = coachData?.goalies.find((x) => x.id === id) ?? profiles.find((p) => p.id === id);
    return g ? `${g.first_name}${g.jersey_number != null ? ` #${g.jersey_number}` : ''}` : null;
  };

  /** Coach only: removes the given clips (own clips only – the database refuses others). */
  const remove = async (list: PublishedVideo[], what: string) => {
    const mine = list.filter((v) => v.coach_id === userId);
    if (mine.length === 0) return;
    const names = [...new Set(mine.map((v) => goalieName(v.goaltender_id)).filter(Boolean))].join(', ');
    if (!window.confirm(`Ta bort ${what} (${mine.length} klipp${names ? ` till ${names}` : ''})? Målvakten ser dem inte längre och kommentarerna tas bort. Det går inte att ångra.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteVideos(mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      const ids = new Set(mine.map((v) => v.id));
      setVideos((prev) => (prev ? prev.filter((v) => !ids.has(v.id)) : prev));
      setDeleting(false);
      void loadVideos().then(setVideos).catch(() => undefined);
    }
  };

  /** Coach only: moves a clip one step within its match/training. Both the coach and the goaltender see the new order. */
  const move = async (siblings: PublishedVideo[], id: string, delta: -1 | 1) => {
    const ids = moveInList(siblings, id, delta).map((v) => v.id);
    const order = new Map(ids.map((x, i) => [x, i]));
    setVideos((prev) => (prev ? prev.map((v) => (order.has(v.id) ? { ...v, sort_order: order.get(v.id) } : v)) : prev));
    setError(null);
    try {
      await reorderVideos(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void loadVideos().then(setVideos).catch(() => undefined);
    }
  };

  const me = profiles.find((p) => p.user_id === userId);

  const card = (v: PublishedVideo, showGoalie: boolean, siblings?: PublishedVideo[]) => (
    <div key={v.id} className="cardWrap">
      <a className="videoCard" href={`#/video/${v.id}`} onClick={rememberList}>
        <div className="thumb">
          <ClipThumb video={v} />
          <span className="dur">{formatDuration(v.duration_ms)}</span>
        </div>
        <div className="meta">
          <strong>{[v.focus_area ?? 'Utan fokusområde', v.exercise].filter(Boolean).join(' · ')}</strong>
          <span className="muted small">
            {/* Match clips are stored as match date + position in the match (keeps them in match order). */}
            {v.session_kind === 'match' ? `${formatMatchClock(v.recorded_at)} in i matchen` : formatTime(v.recorded_at)}
            {v.team_name ? ` · ${v.team_name}` : ''}
            {showGoalie && goalieName(v.goaltender_id) ? ` · ${goalieName(v.goaltender_id)}` : ''}
          </span>
          {v.coach_note ? <span className="note">{v.coach_note}</span> : null}
        </div>
      </a>
      {manage && v.coach_id === userId ? (
        <div className="cardTools">
          {siblings && siblings.length > 1 ? (
            <span className="orderButtons">
              <button className="orderBtn" disabled={siblings[0]?.id === v.id} onClick={() => void move(siblings, v.id, -1)} aria-label="Flytta klippet tidigare">
                ↑
              </button>
              <button
                className="orderBtn"
                disabled={siblings[siblings.length - 1]?.id === v.id}
                onClick={() => void move(siblings, v.id, 1)}
                aria-label="Flytta klippet senare"
              >
                ↓
              </button>
            </span>
          ) : null}
          <button className="cardDelete" disabled={deleting} onClick={() => void remove([v], 'klippet')} aria-label="Ta bort klippet">
            Ta bort
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <Logo />
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
              {coach
                ? 'Klipp du sparar från matchtaggningen eller iPad-appen hamnar här, sorterade per klubb, lag och målvakt.'
                : `När din tränare publicerar ett klipp till dig dyker det upp här. Inloggad som ${email}. Om du inte ser något efter träningen – kontrollera att tränaren har registrerat just den här e-postadressen.`}
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
            {manage ? (
              <span className="small muted">
                Ändra ordningen med ↑ ↓ (målvakten ser samma ordning), ta bort enskilda klipp eller en hel match/träning. Bara klipp du själv har publicerat.
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Coach: club → team → goaltender → match/training → date + title → clips */}
        {own.length > 0 && coachData === null ? <div className="spinner" aria-label="Laddar" /> : null}
        {tree.map((club) => (
          <section key={club.id} className="treeClub">
            <h2 className="treeClubName">{club.name}</h2>
            {club.teams.map((team) => (
              <div key={team.id} className="treeTeam">
                <h3 className="treeTeamName">{team.name}</h3>
                {team.goalies.map((g) => (
                  <details key={g.id} className="treeGoalie" open={tree.length === 1 && club.teams.length === 1 && team.goalies.length === 1}>
                    <summary>
                      <strong>{g.label}</strong>
                      <span className="muted small">{g.count} klipp</span>
                    </summary>
                    {g.kinds.map((k) => (
                      <div key={k.kind} className="treeKind">
                        <h4 className="dayTitle">{KIND_LABEL[k.kind]}</h4>
                        {k.sessions.map((s, i) => (
                          <details key={s.key} className="treeSession" open={i === 0}>
                            <summary>
                              <span>
                                <strong>{s.title}</strong> <span className="muted small">· {s.dayLabel}</span>
                              </span>
                              <span className="muted small">{s.videos.length} klipp</span>
                              {manage ? (
                                <button
                                  className="btn small danger"
                                  disabled={deleting}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    void remove(s.videos, k.kind === 'traning' ? 'hela träningen' : 'hela matchen');
                                  }}
                                >
                                  Ta bort {k.kind === 'traning' ? 'träningen' : 'matchen'}
                                </button>
                              ) : null}
                            </summary>
                            <div className="grid">{s.videos.map((v) => card(v, false, s.videos))}</div>
                          </details>
                        ))}
                      </div>
                    ))}
                  </details>
                ))}
              </div>
            ))}
          </section>
        ))}

        {/* Goaltender (or a coach who is also someone's goaltender): by match/session, as before */}
        {received.length > 0 && own.length > 0 ? <h2 className="treeClubName">Videor till mig</h2> : null}
        {groups.map((g) => (
          <section key={g.key} className="day">
            <div className="groupHead">
              <h2 className="dayTitle">{g.title}</h2>
            </div>
            <div className="grid">{g.videos.map((v) => card(v, false))}</div>
          </section>
        ))}
      </main>
    </div>
  );
}

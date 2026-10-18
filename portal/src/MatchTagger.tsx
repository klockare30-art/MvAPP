import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addGoaltender, becomeCoach, clipPortalApi, listClubs, listMyGoaltenders, listTeams, myCoachAccount } from './api';
import { GoalieForm, TeamOptions } from './GoalieForm';
import { exportClip, inspectMatchFile, type MatchFileInfo } from './clipExport';
import { formatBytes, localDateIso } from './format';
import { accountBlocker, goalieLabel, publishClip, type Club, type CoachAccount, type CoachGoaltender, type Team } from './publishClip';
import {
  clipFileName,
  clipRange,
  countByType,
  DEFAULT_AFTER_SEC,
  DEFAULT_BEFORE_SEC,
  chosenTags,
  formatClock,
  goaliesInTeam,
  newTag,
  NO_TEAM,
  parseStoredTags,
  REWIND_ON_RELEASE_SEC,
  sortTags,
  SPEEDS,
  storageKeyFor,
  TAG_TYPES,
  tagTypeById,
  tagTypeForKey,
  type MatchTag,
} from './tagging';

type PublishState = { kind: 'working' } | { kind: 'error'; message: string };
type ClipState = { kind: 'working' } | { kind: 'done'; url: string; startSec: number; endSec: number; size: number } | { kind: 'error'; message: string };

function readStored(key: string): MatchTag[] {
  try {
    return parseStoredTags(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeStored(key: string, tags: MatchTag[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(tags));
  } catch {
    // Private mode / blocked storage: tagging still works, it is just not kept across reloads.
  }
}

/**
 * Match tagging (#/tagga). The match file is opened from the coach's computer and
 * never uploaded: hold to fast-forward, press a key to tag, save clips locally.
 */
export function MatchTagger() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<MatchFileInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [tags, setTags] = useState<MatchTag[]>([]);
  const [speed, setSpeed] = useState<number>(8);
  const [fast, setFast] = useState(false);
  const [before, setBefore] = useState(DEFAULT_BEFORE_SEC);
  const [after, setAfter] = useState(DEFAULT_AFTER_SEC);
  const [clips, setClips] = useState<Record<string, ClipState>>({});
  const [lastTag, setLastTag] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  /** Presentation: plays the chosen clips one after another. */
  const [show, setShow] = useState<{ ids: string[]; i: number } | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [publishing, setPublishing] = useState<Record<string, PublishState>>({});
  const [account, setAccount] = useState<CoachAccount | null | undefined>(undefined);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [goalies, setGoalies] = useState<CoachGoaltender[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [goalieId, setGoalieId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDate, setMatchDate] = useState(() => localDateIso());
  const video = useRef<HTMLVideoElement>(null);
  const fastRef = useRef(false);
  const rewindRef = useRef(false);
  const rewindFrame = useRef(0);
  const resumeAfterRewind = useRef(false);

  const loadCoach = useCallback(async () => {
    try {
      const a = await myCoachAccount();
      setAccount(a);
      setAccountError(null);
      if (a) {
        const [all, c, t] = await Promise.all([listMyGoaltenders(), listClubs(), listTeams()]);
        // Goaltenders whose access is turned off cannot receive new clips.
        const g = all.filter((x) => !x.access_revoked_at);
        setGoalies(g);
        setClubs(c);
        setTeams(t);
        // Start on the first team that has goaltenders (else "no team").
        const ids = t.map((x) => x.id);
        const firstTeam = t.find((x) => g.some((y) => y.team_id === x.id))?.id ?? NO_TEAM;
        setTeamId((cur) => cur || firstTeam);
        setGoalieId((cur) => cur || goaliesInTeam(g, ids, firstTeam)[0]?.id || '');
      }
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadCoach();
  }, [loadCoach]);

  const storageKey = file ? storageKeyFor(file) : null;
  const duration = info?.durationSec ?? 0;

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setInfo(null);
    setInfoError(null);
    setClips({});
    setTags(readStored(storageKeyFor(f)));
    try {
      setInfo(await inspectMatchFile(f));
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : String(e));
    }
  };

  const updateTags = useCallback(
    (fn: (prev: MatchTag[]) => MatchTag[]) => {
      setTags((prev) => {
        const next = sortTags(fn(prev));
        if (storageKey) writeStored(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const addTag = useCallback(
    (type: string) => {
      const v = video.current;
      if (!v) return;
      const tag = newTag(type, v.currentTime, before, after);
      updateTags((prev) => [...prev, tag]);
      setLastTag(tag.id);
    },
    [before, after, updateTags],
  );

  const startFast = useCallback(() => {
    const v = video.current;
    if (!v || fastRef.current) return;
    fastRef.current = true;
    setFast(true);
    v.playbackRate = speed;
    void v.play().catch(() => undefined);
  }, [speed]);

  const stopFast = useCallback(() => {
    const v = video.current;
    if (!v || !fastRef.current) return;
    fastRef.current = false;
    setFast(false);
    v.playbackRate = 1;
    v.currentTime = Math.max(0, v.currentTime - REWIND_ON_RELEASE_SEC);
  }, []);

  // Browsers cannot play backwards, so rewinding steps the position back while held.
  const startRewind = useCallback(() => {
    const v = video.current;
    if (!v || rewindRef.current || fastRef.current) return;
    rewindRef.current = true;
    setRewinding(true);
    resumeAfterRewind.current = !v.paused;
    v.pause();
    let last = performance.now();
    const step = (now: number) => {
      if (!rewindRef.current) return;
      const dt = (now - last) / 1000;
      // Wait for the previous seek; the elapsed time is kept, so the speed stays right.
      if (!v.seeking && dt >= 0.08) {
        v.currentTime = Math.max(0, v.currentTime - speed * dt);
        last = now;
      }
      rewindFrame.current = requestAnimationFrame(step);
    };
    rewindFrame.current = requestAnimationFrame(step);
  }, [speed]);

  const stopRewind = useCallback(() => {
    const v = video.current;
    if (!rewindRef.current) return;
    rewindRef.current = false;
    setRewinding(false);
    cancelAnimationFrame(rewindFrame.current);
    if (v && resumeAfterRewind.current) void v.play().catch(() => undefined);
  }, []);

  const seek = (sec: number, play = false) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || v.duration || 0, sec));
    if (play) void v.play().catch(() => undefined);
  };

  // Keyboard: hold F = fast-forward, Space = play/pause, ←/→ = 5 s, tag keys add a tag.
  useEffect(() => {
    if (!url) return;
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      // Enter/Esc leaves a text field so the tag keys work again.
      if (isTyping(e) && (e.key === 'Enter' || e.key === 'Escape')) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!e.repeat) startFast();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (!e.repeat) startRewind();
        return;
      }
      if (e.repeat) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (v.paused) void v.play().catch(() => undefined);
        else v.pause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        v.currentTime = v.currentTime + 5;
      } else {
        const type = tagTypeForKey(e.key);
        if (type) {
          e.preventDefault();
          addTag(type.id);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') stopFast();
      if (e.key === 'b' || e.key === 'B') stopRewind();
    };
    const blur = () => {
      stopFast();
      stopRewind();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [url, startFast, stopFast, startRewind, stopRewind, addTag]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const saveClip = async (tag: MatchTag) => {
    if (!file) return;
    setClips((c) => ({ ...c, [tag.id]: { kind: 'working' } }));
    try {
      const r = clipRange(tag, duration);
      const clip = await exportClip(file, r.startSec, r.endSec);
      const clipUrl = URL.createObjectURL(clip.blob);
      setClips((c) => ({ ...c, [tag.id]: { kind: 'done', url: clipUrl, startSec: clip.startSec, endSec: clip.endSec, size: clip.blob.size } }));
      const a = document.createElement('a');
      a.href = clipUrl;
      a.download = clipFileName(tag);
      a.click();
    } catch (e) {
      setClips((c) => ({ ...c, [tag.id]: { kind: 'error', message: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const chosen = chosenTags(tags, marked);
  const saveAll = async () => {
    for (const t of chosen) await saveClip(t);
  };

  const toggleMark = (id: string) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const markType = (type: string | null) =>
    setMarked(new Set(tags.filter((t) => type == null || t.type === type).map((t) => t.id)));

  const showTag = show ? tags.find((t) => t.id === show.ids[show.i]) ?? null : null;

  // Presentation: jump to each clip's start, play at normal speed, advance at its end.
  useEffect(() => {
    const v = video.current;
    if (!v || !showTag) return;
    const r = clipRange(showTag, duration);
    v.playbackRate = 1;
    v.currentTime = r.startSec;
    void v.play().catch(() => undefined);
    const onTime = () => {
      if (v.currentTime < r.endSec) return;
      setShow((s) => {
        if (!s) return s;
        if (s.i + 1 < s.ids.length) return { ...s, i: s.i + 1 };
        v.pause();
        return null;
      });
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [showTag, duration]);

  const stepShow = (d: number) =>
    setShow((s) => (s ? { ...s, i: Math.min(s.ids.length - 1, Math.max(0, s.i + d)) } : s));

  const teamIds = teams.map((t) => t.id);
  const teamGoalies = goaliesInTeam(goalies, teamIds, teamId);
  const goalie = teamGoalies.find((g) => g.id === goalieId) ?? null;
  /** The clip's goaltender: chosen on the tag, else the match goaltender. */
  const goalieFor = (tag: MatchTag) => (tag.goalieId ? goalies.find((g) => g.id === tag.goalieId) ?? null : goalie);

  const chooseTeam = (id: string) => {
    setTeamId(id);
    setGoalieId(goaliesInTeam(goalies, teamIds, id)[0]?.id ?? '');
  };

  const publishTag = async (tag: MatchTag) => {
    const goalie = goalieFor(tag);
    if (!file || !goalie) return;
    setPublishing((p) => ({ ...p, [tag.id]: { kind: 'working' } }));
    try {
      const r = clipRange(tag, duration);
      const clip = await exportClip(file, r.startSec, r.endSec);
      const blocker = accountBlocker((await myCoachAccount()) ?? null, clip.blob.size);
      if (blocker) throw new Error(blocker);
      await publishClip(clipPortalApi, {
        videoId: crypto.randomUUID(),
        goaltenderId: goalie.id,
        blob: clip.blob,
        tagLabel: tagTypeById(tag.type).label,
        matchTitle,
        teamName: teams.find((t) => t.id === goalie.team_id)?.name ?? null,
        matchDate,
        atSec: tag.atSec,
        durationMs: Math.round((clip.endSec - clip.startSec) * 1000),
        width: info?.width ?? null,
        height: info?.height ?? null,
      });
      updateTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, publishedTo: goalieLabel(goalie) } : t)));
      setPublishing((p) => {
        const { [tag.id]: _done, ...rest } = p;
        return rest;
      });
    } catch (e) {
      setPublishing((p) => ({ ...p, [tag.id]: { kind: 'error', message: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const publishAll = async () => {
    for (const t of chosen) if (!t.publishedTo) await publishTag(t);
    void loadCoach();
  };

  const canPublish = !!account?.isActive && !!info;
  const unsaved = chosen.filter((t) => !t.publishedTo);

  const setMargin = (id: string, field: 'beforeSec' | 'afterSec', value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 120) return;
    updateTags((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const playable = useMemo(() => {
    if (!info?.codecString) return null;
    const probe = document.createElement('video');
    return probe.canPlayType(`video/mp4; codecs="${info.codecString}"`) !== '';
  }, [info]);

  const counts = countByType(tags);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>●</span>
          <div>
            <strong>GoalieVision</strong>
            <span className="muted small">Matchtaggning (test)</span>
          </div>
        </div>
        <a className="btn ghost" href="#/">
          Till videorna
        </a>
      </header>

      <main className="content">
        {!file ? (
          <div className="card stack">
            <h1>Tagga en match</h1>
            <p className="muted">
              Välj matchfilen på din dator. Den laddas <strong>inte</strong> upp – den spelas direkt från disken. Bara
              klippen du sparar skapas, utan omkodning.
            </p>
            <label className="btn primary filePick">
              Välj matchfil (MP4)
              <input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={(e) => void openFile(e.target.files?.[0])} />
            </label>
            <p className="small muted">Fungerar bäst i Chrome eller Edge på dator.</p>
          </div>
        ) : (
          <>
            <div className="fileInfo small muted">
              <strong>{file.name}</strong> · {formatBytes(file.size)}
              {info ? (
                <>
                  {' '}· {formatClock(info.durationSec)} · {info.width}×{info.height} · {info.videoCodec?.toUpperCase() ?? 'okänt format'}
                  {info.hasAudio ? ' · ljud' : ' · inget ljud'}
                  {info.keyFrameIntervalSec != null ? ` · nyckelbild var ${info.keyFrameIntervalSec.toFixed(1).replace('.', ',')} s` : ''}
                </>
              ) : infoError ? null : (
                ' · analyserar…'
              )}
              <button className="link" onClick={() => setFile(null)}>
                Byt fil
              </button>
            </div>
            {infoError ? <p className="error">Filen kunde inte läsas: {infoError}</p> : null}
            {playable === false ? (
              <p className="error">
                {info?.videoCodec === 'avc'
                  ? 'Den här webbläsaren kan inte spela H.264-video. Öppna sidan i Chrome eller Edge.'
                  : `Videoformatet (${info?.codecString}) spelas troligen inte i den här webbläsaren. Prova Chrome/Edge, eller exportera matchen som H.264 (MP4).`}{' '}
                Klippning fungerar ändå.
              </p>
            ) : null}

            <div className="tagLayout">
              <section className="tagPlayer">
                <div className="videoBox showBox">
                  {url ? <video ref={video} src={url} controls playsInline preload="auto" /> : null}
                  {show && showTag ? (
                    <div className="showBar">
                      <span>
                        <strong>
                          {show.i + 1} / {show.ids.length}
                        </strong>{' '}
                        · {tagTypeById(showTag.type).label} {formatClock(showTag.atSec)}
                        {goalieFor(showTag) ? ` · ${goalieLabel(goalieFor(showTag)!)}` : ''}
                      </span>
                      <span className="showButtons">
                        <button className="btn small" disabled={show.i === 0} onClick={() => stepShow(-1)}>
                          ◀ Föregående
                        </button>
                        <button className="btn small" disabled={show.i + 1 >= show.ids.length} onClick={() => stepShow(1)}>
                          Nästa ▶
                        </button>
                        <button
                          className="btn small"
                          onClick={() => {
                            setShow(null);
                            video.current?.pause();
                          }}
                        >
                          Avsluta
                        </button>
                      </span>
                    </div>
                  ) : null}
                </div>

                <TagTimeline tags={tags} duration={duration} onSeek={(s) => seek(s)} />

                <div className="controls">
                  <button
                    className={`btn big ffBtn rwBtn ${rewinding ? 'on' : ''}`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      startRewind();
                    }}
                    onPointerUp={stopRewind}
                    onPointerCancel={stopRewind}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {rewinding ? `◀◀ ${speed}x` : `Håll: bakåt (B)`}
                  </button>
                  <button
                    className={`btn big ffBtn ${fast ? 'on' : ''}`}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      startFast();
                    }}
                    onPointerUp={stopFast}
                    onPointerCancel={stopFast}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {fast ? `▶▶ ${speed}x` : `Håll: framåt ${speed}x (F)`}
                  </button>
                  {SPEEDS.map((s) => (
                    <button key={s} className={`btn speed ${s === speed ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                      {s}x
                    </button>
                  ))}
                </div>
                <p className="small muted center-text">
                  Håll F framåt / B bakåt. Släpper du framåt går videon tillbaka till normal fart, {REWIND_ON_RELEASE_SEC} s bakåt.
                  Mellanslag = spela/pausa, ←/→ = 5 s. I ett textfält: Enter för att tagga igen.
                </p>

                <div className="tagButtons">
                  {TAG_TYPES.map((t) => (
                    <button key={t.id} className="btn tagBtn" style={{ borderColor: t.color }} onClick={() => addTag(t.id)}>
                      <span className="tagDot" style={{ background: t.color }} />
                      {t.label}
                      <kbd>{t.key.toUpperCase()}</kbd>
                    </button>
                  ))}
                </div>
                <div className="marginRow small muted">
                  Nya taggar: klipp
                  <input type="number" min={0} max={120} value={before} onChange={(e) => setBefore(Number(e.target.value))} /> s före och
                  <input type="number" min={0} max={120} value={after} onChange={(e) => setAfter(Number(e.target.value))} /> s efter
                </div>
              </section>

              <section className="tagList card">
                <PortalPanel
                  account={account}
                  accountError={accountError}
                  goalies={goalies}
                  clubs={clubs}
                  teams={teams}
                  teamId={teamId}
                  onTeam={chooseTeam}
                  teamGoalies={teamGoalies}
                  goalieId={goalieId}
                  onGoalie={setGoalieId}
                  matchTitle={matchTitle}
                  onMatchTitle={setMatchTitle}
                  matchDate={matchDate}
                  onMatchDate={setMatchDate}
                  onChanged={loadCoach}
                  onAdded={(g) => {
                    setGoalies((prev) => [...prev, g]);
                    setTeamId(g.team_id && teamIds.includes(g.team_id) ? g.team_id : NO_TEAM);
                    setGoalieId(g.id);
                  }}
                />
                <div className="tagListHead">
                  <h2>Taggar ({tags.length})</h2>
                  <div className="tagListActions">
                    <button
                      className="btn"
                      disabled={chosen.length === 0 || !info}
                      onClick={() => setShow({ ids: chosen.map((t) => t.id), i: 0 })}
                    >
                      ▶ Visa {marked.size > 0 ? `markerade (${chosen.length})` : 'alla'}
                    </button>
                    <button
                      className="btn primary"
                      disabled={!canPublish || unsaved.length === 0 || unsaved.some((t) => !goalieFor(t))}
                      onClick={() => void publishAll()}
                    >
                      Spara {marked.size > 0 ? 'markerade' : 'alla'}
                      {unsaved.length > 0 ? ` (${unsaved.length})` : ''}
                    </button>
                  </div>
                </div>
                {tags.length > 0 ? (
                  <div className="markBar small">
                    <span className="muted">Markera:</span>
                    <button className={`chip mini ${marked.size === tags.length ? 'on' : ''}`} onClick={() => markType(null)}>
                      Alla
                    </button>
                    {counts.map((c) => (
                      <button key={c.type.id} className="chip mini" onClick={() => markType(c.type.id)}>
                        {c.type.label} ({c.count})
                      </button>
                    ))}
                    {marked.size > 0 ? (
                      <button className="link small" onClick={() => setMarked(new Set())}>
                        Avmarkera ({marked.size})
                      </button>
                    ) : null}
                    <button className="link small" disabled={chosen.length === 0 || !info} onClick={() => void saveAll()}>
                      Ladda ner {marked.size > 0 ? 'markerade' : 'alla'}
                    </button>
                  </div>
                ) : null}
                {counts.length > 0 ? (
                  <p className="small muted">{counts.map((c) => `${c.type.label} ${c.count}`).join(' · ')}</p>
                ) : (
                  <p className="small muted">Tryck på en tagg (eller tangenten) när något händer. Taggen sparas vid aktuell tid.</p>
                )}
                <ul>
                  {tags.map((t) => {
                    const type = tagTypeById(t.type);
                    const r = clipRange(t, duration);
                    const st = clips[t.id];
                    const pub = publishing[t.id];
                    return (
                      <li
                        key={t.id}
                        className={`${t.id === lastTag ? 'fresh' : ''} ${marked.has(t.id) ? 'marked' : ''} ${showTag?.id === t.id ? 'playing' : ''}`}
                        style={{ borderLeftColor: type.color }}
                      >
                        <div className="tagRowHead">
                          <input
                            type="checkbox"
                            className="markBox"
                            checked={marked.has(t.id)}
                            onChange={() => toggleMark(t.id)}
                            aria-label={`Markera ${type.label} ${formatClock(t.atSec)}`}
                          />
                          <button className="stamp" onClick={() => seek(r.startSec, true)} title="Spela klippet">
                            ▶ {formatClock(t.atSec)}
                          </button>
                          <strong>{type.label}</strong>
                          <button className="link small" onClick={() => updateTags((prev) => prev.filter((x) => x.id !== t.id))}>
                            Ta bort
                          </button>
                        </div>
                        <div className="tagRowEdit small muted">
                          <input type="number" min={0} max={120} value={t.beforeSec} onChange={(e) => setMargin(t.id, 'beforeSec', Number(e.target.value))} />
                          s före ·
                          <input type="number" min={0} max={120} value={t.afterSec} onChange={(e) => setMargin(t.id, 'afterSec', Number(e.target.value))} />
                          s efter
                          <button className="link small" disabled={!info || st?.kind === 'working'} onClick={() => void saveClip(t)}>
                            {st?.kind === 'working' ? 'Klipper…' : 'Ladda ner'}
                          </button>
                        </div>
                        <div className="tagRowSave small">
                          {t.publishedTo ? (
                            <span className="published">✓ Sparat hos {t.publishedTo}</span>
                          ) : (
                            <>
                              <select
                                value={t.goalieId ?? ''}
                                onChange={(e) =>
                                  updateTags((prev) => prev.map((x) => (x.id === t.id ? { ...x, goalieId: e.target.value || undefined } : x)))
                                }
                                aria-label="Målvakt för klippet"
                              >
                                <option value="">{goalie ? `Matchens målvakt (${goalieLabel(goalie)})` : 'Välj målvakt'}</option>
                                {goalies
                                  .filter((g) => g.id !== goalie?.id)
                                  .map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {goalieLabel(g)}
                                    </option>
                                  ))}
                              </select>
                              <button
                                className="btn small primary"
                                disabled={!canPublish || !goalieFor(t) || pub?.kind === 'working'}
                                onClick={() => void publishTag(t)}
                              >
                                {pub?.kind === 'working' ? 'Sparar…' : 'Spara klipp'}
                              </button>
                            </>
                          )}
                        </div>
                        {pub?.kind === 'error' ? <div className="error small">{pub.message}</div> : null}
                        {st?.kind === 'done' ? (
                          <div className="small muted">
                            Sparat {formatClock(st.startSec)}–{formatClock(st.endSec)} ({formatBytes(st.size)}).{' '}
                            <a href={st.url} download={clipFileName(t)}>
                              Ladda ner igen
                            </a>
                          </div>
                        ) : null}
                        {st?.kind === 'error' ? <div className="error small">{st.message}</div> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function TagTimeline({ tags, duration, onSeek }: { tags: MatchTag[]; duration: number; onSeek: (sec: number) => void }) {
  if (!(duration > 0)) return null;
  return (
    <div
      className="tagTimeline"
      role="presentation"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * duration);
      }}
    >
      {tags.map((t) => (
        <span
          key={t.id}
          className="tagTick"
          title={`${tagTypeById(t.type).label} ${formatClock(t.atSec)}`}
          style={{ left: `${(t.atSec / duration) * 100}%`, background: tagTypeById(t.type).color }}
        />
      ))}
    </div>
  );
}

/** Where clips go: coach status, goaltender choice and match name/date. */
function PortalPanel(props: {
  account: CoachAccount | null | undefined;
  accountError: string | null;
  goalies: CoachGoaltender[];
  clubs: Club[];
  teams: Team[];
  teamId: string;
  onTeam: (id: string) => void;
  teamGoalies: CoachGoaltender[];
  goalieId: string;
  onGoalie: (id: string) => void;
  matchTitle: string;
  onMatchTitle: (v: string) => void;
  matchDate: string;
  onMatchDate: (v: string) => void;
  onChanged: () => Promise<void>;
  onAdded: (g: CoachGoaltender) => void;
}) {
  const { account, goalies, teams } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (props.accountError) return <p className="error small">{props.accountError}</p>;
  if (account === undefined) return null;

  if (account === null) {
    return (
      <div className="portalPanel">
        <strong>Spara klipp</strong>
        <p className="small muted">Kräver en tränarprofil som administratören godkänner.</p>
        {error ? <p className="error small">{error}</p> : null}
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            becomeCoach('')
              .then(props.onChanged)
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Skapa tränarprofil
        </button>
      </div>
    );
  }

  const blocker = accountBlocker(account);
  if (blocker) {
    return (
      <div className="portalPanel">
        <strong>Spara klipp</strong>
        <p className="demoHint small">{blocker}</p>
        <button className="link small" onClick={() => void props.onChanged()}>
          Uppdatera
        </button>
      </div>
    );
  }

  const withoutTeam = goaliesInTeam(goalies, teams.map((t) => t.id), NO_TEAM);

  return (
    <div className="portalPanel">
      <strong>Spara matchens klipp</strong>
      <p className="small muted">Klippen sparas under valt lag och målvakt. Målvakten ser dem direkt i portalen.</p>
      <div className="portalFields">
        <label className="field">
          Lag
          <select value={props.teamId} onChange={(e) => props.onTeam(e.target.value)}>
            {teams.length === 0 && withoutTeam.length === 0 ? <option value="">Inga lag än</option> : null}
            <TeamOptions clubs={props.clubs} teams={teams} />
            {withoutTeam.length > 0 ? <option value={NO_TEAM}>Målvakter utan lag</option> : null}
          </select>
        </label>
        <label className="field">
          Målvakt
          <select value={props.goalieId} onChange={(e) => props.onGoalie(e.target.value)}>
            {props.teamGoalies.length === 0 ? <option value="">Inga målvakter i laget</option> : null}
            {props.teamGoalies.map((g) => (
              <option key={g.id} value={g.id}>
                {goalieLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Match
          <input value={props.matchTitle} onChange={(e) => props.onMatchTitle(e.target.value)} placeholder="t.ex. Hemma mot AIK" />
        </label>
        <label className="field">
          Datum
          <input type="date" value={props.matchDate} onChange={(e) => props.onMatchDate(e.target.value)} />
        </label>
      </div>
      {!adding ? (
        <div className="linkRow small">
          <button className="link" onClick={() => setAdding(true)}>
            + Lägg till målvakt
          </button>
          <a className="link" href="#/lag">
            Hantera klubbar, lag och målvakter
          </a>
        </div>
      ) : (
        <GoalieForm
          clubs={props.clubs}
          teams={teams}
          defaultTeamId={props.teamId === NO_TEAM ? null : props.teamId}
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            const g = await addGoaltender(input);
            props.onAdded(g);
            setAdding(false);
          }}
        />
      )}
      {account.maxStorageBytes != null ? (
        <p className="small muted">
          Nivå {account.planName}: {formatBytes(account.usedStorageBytes)} av {formatBytes(account.maxStorageBytes)} använt
          {account.maxGoaltenders != null ? ` · ${account.goaltenderCount} av ${account.maxGoaltenders} målvakter` : ''}
        </p>
      ) : null}
    </div>
  );
}

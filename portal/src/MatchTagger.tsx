import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { exportClip, inspectMatchFile, type MatchFileInfo } from './clipExport';
import { formatBytes } from './format';
import {
  clipFileName,
  clipRange,
  countByType,
  DEFAULT_AFTER_SEC,
  DEFAULT_BEFORE_SEC,
  formatClock,
  newTag,
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
  const video = useRef<HTMLVideoElement>(null);
  const fastRef = useRef(false);

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
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = video.current;
      if (!v) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!e.repeat) startFast();
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
    };
    const blur = () => stopFast();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [url, startFast, stopFast, addTag]);

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

  const saveAll = async () => {
    for (const t of tags) await saveClip(t);
  };

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
                <div className="videoBox">
                  {url ? <video ref={video} src={url} controls playsInline preload="auto" /> : null}
                </div>

                <TagTimeline tags={tags} duration={duration} onSeek={(s) => seek(s)} />

                <div className="controls">
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
                    {fast ? `▶▶ ${speed}x` : `Håll: snabbspola ${speed}x (F)`}
                  </button>
                  {SPEEDS.map((s) => (
                    <button key={s} className={`btn speed ${s === speed ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                      {s}x
                    </button>
                  ))}
                </div>
                <p className="small muted center-text">
                  Släpp knappen → tillbaka till normal fart, {REWIND_ON_RELEASE_SEC} s bakåt. Mellanslag = spela/pausa, ←/→ = 5 s.
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
                <div className="tagListHead">
                  <h2>Taggar ({tags.length})</h2>
                  <button className="btn primary" disabled={tags.length === 0 || !info} onClick={() => void saveAll()}>
                    Spara alla klipp
                  </button>
                </div>
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
                    return (
                      <li key={t.id} className={t.id === lastTag ? 'fresh' : ''} style={{ borderLeftColor: type.color }}>
                        <div className="tagRowHead">
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
                          <button className="btn small" disabled={!info || st?.kind === 'working'} onClick={() => void saveClip(t)}>
                            {st?.kind === 'working' ? 'Klipper…' : 'Spara klipp'}
                          </button>
                        </div>
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

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { addComment, deleteComment, deleteVideos, loadComments, loadVideo, signedVideoUrl } from './api';
import { formatDate, formatPosition, formatTime, sortComments, stepFrame } from './format';
import { loadNav, neighbours, saveNav } from './nav';
import type { PublishedVideo, VideoComment } from './types';

const SPEEDS = [1, 0.5, 0.25];

export function VideoView({ videoId, userId }: { videoId: string; userId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<PublishedVideo | null | undefined>(undefined);
  const [src, setSrc] = useState<string | null>(null);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // Previous/next within the list the library showed (e.g. filtered on one focus area).
  const [nav] = useState(() => loadNav());
  const pos = nav ? neighbours(nav.ids, videoId) : null;
  const [autoplay, setAutoplay] = useState(nav?.autoplay ?? false);
  const [rate, setRate] = useState(nav?.rate ?? 1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [text, setText] = useState('');
  const [attachTime, setAttachTime] = useState(true);
  const [sending, setSending] = useState(false);

  const refreshComments = useCallback(async () => {
    setComments(sortComments(await loadComments(videoId)));
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await loadVideo(videoId);
        if (cancelled) return;
        setVideo(v);
        if (!v) return;
        const [url, c] = await Promise.all([signedVideoUrl(v.storage_path), loadComments(videoId)]);
        if (cancelled) return;
        setSrc(url);
        setComments(sortComments(c));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const AUTOSTART = 'gv-clip-autostart';
  const go = (id: string | null, start: boolean) => {
    if (!id || !nav) return;
    saveNav({ ...nav, autoplay, rate });
    try {
      if (start) sessionStorage.setItem(AUTOSTART, '1');
    } catch {
      // ignore
    }
    window.location.hash = `#/video/${id}`;
  };
  const toggleAutoplay = (on: boolean) => {
    setAutoplay(on);
    if (nav) saveNav({ ...nav, autoplay: on, rate });
  };
  /** Start playing when we arrived here via "next" in a series. */
  const autostart = (v: HTMLVideoElement) => {
    try {
      if (sessionStorage.getItem(AUTOSTART) === '1') {
        sessionStorage.removeItem(AUTOSTART);
        void v.play().catch(() => undefined);
      }
    } catch {
      // ignore
    }
  };

  const el = () => ref.current;
  const fps = video?.frame_rate ?? 30;
  const isCoach = video?.coach_id === userId;

  const togglePlay = () => {
    const v = el();
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const seek = (sec: number) => {
    const v = el();
    if (!v) return;
    const t = Math.min(Math.max(0, sec), v.duration || sec);
    v.currentTime = t;
    setTime(t);
  };
  /** Jump from a timestamped comment: pause, seek and bring the video into view. */
  const jumpTo = (sec: number) => {
    el()?.pause();
    seek(sec);
    el()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const frame = (delta: number) => {
    const v = el();
    if (!v) return;
    v.pause();
    v.currentTime = stepFrame(v.currentTime, delta, fps, v.duration);
    setTime(v.currentTime);
  };
  const setSpeed = (r: number) => {
    const v = el();
    if (v) v.playbackRate = r;
    setRate(r);
    if (nav) saveNav({ ...nav, autoplay, rate: r });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await addComment({
        videoId,
        role: isCoach ? 'trainer' : 'goaltender',
        timestampMs: attachTime ? Math.round(time * 1000) : null,
        content: text,
      });
      setText('');
      await refreshComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (video === null) {
    return (
      <main className="center">
        <div className="card narrow">
          <h1>Videon finns inte</h1>
          <p className="muted">Den kan ha tagits bort, eller så har du inte åtkomst till den.</p>
          <a className="btn primary" href="#/">Till mina videor</a>
        </div>
      </main>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <a className="btn ghost" href="#/">‹ Mina videor</a>
        {video ? (
          <div className="titleBlock">
            <strong>{[video.focus_area ?? 'Utan fokusområde', video.exercise].filter(Boolean).join(' · ')}</strong>
            <span className="muted small">
              {formatDate(video.recorded_at)} {formatTime(video.recorded_at)}
              {video.team_name ? ` · ${video.team_name}` : ''}
            </span>
          </div>
        ) : null}
        {video && isCoach ? (
          <button
            className="btn small danger"
            onClick={() => {
              if (!window.confirm('Ta bort klippet? Målvakten ser det inte längre och kommentarerna tas bort. Det går inte att ångra.')) return;
              deleteVideos([video])
                .then(() => {
                  window.location.hash = '#/';
                })
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
            }}
          >
            Ta bort klipp
          </button>
        ) : null}
      </header>

      <main className="content player">
        {error ? <p className="error" role="alert">{error}</p> : null}
        {pos && pos.total > 1 ? (
          <div className="clipNav">
            <button className="btn" disabled={!pos.prev} onClick={() => go(pos.prev, playing)} aria-label="Föregående klipp">
              ‹ Föregående
            </button>
            <span className="clipNavInfo">
              <strong>
                {pos.index + 1} / {pos.total}
              </strong>
              <span className="muted small">{nav?.label}</span>
            </span>
            <button className="btn" disabled={!pos.next} onClick={() => go(pos.next, playing)} aria-label="Nästa klipp">
              Nästa ›
            </button>
          </div>
        ) : null}
        <div className="videoBox">
          {src ? (
            <video
              ref={ref}
              src={src}
              playsInline
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                e.currentTarget.playbackRate = rate;
                autostart(e.currentTarget);
              }}
              onEnded={() => {
                if (autoplay && pos?.next) go(pos.next, true);
              }}
              onClick={togglePlay}
            />
          ) : (
            <div className="spinner" aria-label="Laddar video" />
          )}
        </div>

        <input
          className="scrub"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Tidslinje"
        />
        <div className="timeRow">
          <span>{formatPosition(time)}</span>
          <span>{formatPosition(duration)}</span>
        </div>

        <div className="controls">
          <button className="btn" onClick={() => seek(time - 5)} aria-label="Bakåt 5 sekunder">−5 s</button>
          <button className="btn" onClick={() => frame(-1)} aria-label="En bild bakåt">‹ bild</button>
          <button className="btn primary big" onClick={togglePlay}>{playing ? 'Pausa' : 'Spela'}</button>
          <button className="btn" onClick={() => frame(1)} aria-label="En bild framåt">bild ›</button>
          <button className="btn" onClick={() => seek(time + 5)} aria-label="Framåt 5 sekunder">+5 s</button>
        </div>
        {pos && pos.total > 1 ? (
          <label className="check autoplayToggle small">
            <input type="checkbox" checked={autoplay} onChange={(e) => toggleAutoplay(e.target.checked)} />
            Spela upp i följd (nästa klipp startar när ett tar slut)
          </label>
        ) : null}
        <div className="controls">
          {SPEEDS.map((r) => (
            <button key={r} className={`btn speed ${rate === r ? 'on' : ''}`} onClick={() => setSpeed(r)}>
              {r === 1 ? 'Normal' : `${r}x`}
            </button>
          ))}
        </div>

        {video?.coach_note ? (
          <div className="card">
            <span className="label">Tränarens anteckning</span>
            <p>{video.coach_note}</p>
          </div>
        ) : null}

        <section className="card comments">
          <h2>Kommentarer</h2>
          {comments.length === 0 ? <p className="muted">Inga kommentarer ännu. Ställ en fråga till din tränare!</p> : null}
          <ul>
            {comments.map((c) => (
              <li key={c.id} className={c.author_role}>
                <div className="commentHead">
                  <span className="who">{c.author_role === 'trainer' ? 'Tränare' : 'Målvakt'}</span>
                  {c.timestamp_ms != null ? (
                    <button className="stamp" onClick={() => jumpTo(c.timestamp_ms! / 1000)}>
                      {formatPosition(c.timestamp_ms / 1000)}
                    </button>
                  ) : null}
                  {c.author_id === userId ? (
                    <button
                      className="link small"
                      onClick={async () => {
                        await deleteComment(c.id);
                        await refreshComments();
                      }}
                    >
                      Ta bort
                    </button>
                  ) : null}
                </div>
                <p>{c.content}</p>
              </li>
            ))}
          </ul>
          <form onSubmit={submit} className="stack">
            <textarea
              rows={3}
              maxLength={2000}
              placeholder={isCoach ? 'Kommentar till målvakten…' : 'Fråga eller kommentar till tränaren…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="check">
              <input type="checkbox" checked={attachTime} onChange={(e) => setAttachTime(e.target.checked)} />
              Koppla till {formatPosition(time)} i videon
            </label>
            <button className="btn primary" disabled={sending || !text.trim()}>
              {sending ? 'Skickar…' : 'Skicka kommentar'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

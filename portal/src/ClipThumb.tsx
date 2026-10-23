import { useEffect, useRef, useState } from 'react';

import { signedVideoUrl } from './api';
import { clipFrame } from './thumbs';
import type { PublishedVideo } from './types';

/**
 * A frame from the clip, made when the card scrolls into view. If the frame cannot be
 * read (e.g. the storage server refuses canvas access) the browser shows the frame itself.
 */
export function ClipThumb({ video }: { video: PublishedVideo }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const start = () => {
      let url: Promise<string> | null = null;
      const getUrl = () => (url ??= signedVideoUrl(video.storage_path));
      void clipFrame(video.id, getUrl).then(async (f) => {
        if (cancelled) return;
        if (f) setFrame(f);
        else {
          const u = await getUrl().catch(() => null);
          if (!cancelled && u) setFallback(`${u}#t=0.8`);
        }
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      start();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [video.id, video.storage_path]);

  return (
    <span ref={ref} className="thumbFrame" aria-hidden>
      {frame ? <img src={frame} alt="" /> : fallback ? <video src={fallback} muted playsInline preload="metadata" tabIndex={-1} /> : null}
    </span>
  );
}

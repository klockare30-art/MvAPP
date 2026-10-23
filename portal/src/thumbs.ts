/**
 * Thumbnails: a real frame from the clip instead of a black box. Made in the browser
 * from the same signed URL the player uses, so nothing new is stored or published.
 */

/** Where we look for a frame: a few points early in the clip, never past its middle. */
export function candidateTimes(durationSec: number): number[] {
  if (!(durationSec > 0)) return [0.5];
  const limit = durationSec * 0.5;
  const times = [0.3, 0.8, 1.5, 2.5, 4].filter((t) => t <= limit);
  return times.length > 0 ? times : [durationSec / 3];
}

/** Mean luma (0–255) and variance of the Laplacian (higher = sharper) of an RGBA image. */
export function frameStats(rgba: Uint8ClampedArray, width: number, height: number): { luma: number; sharpness: number } {
  const y = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < width * height; i++) {
    const v = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    y[i] = v;
    sum += v;
  }
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      const i = r * width + c;
      const lap = y[i - 1]! + y[i + 1]! + y[i - width]! + y[i + width]! - 4 * y[i]!;
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  return { luma: sum / (width * height), sharpness: n > 1 ? m2 / (n - 1) : 0 };
}

export type FrameScore = { time: number; luma: number; sharpness: number };

/**
 * The first frame that is not dark (fade/black) and is close to the sharpest one found
 * (motion blur, focus hunting at the start). Falls back to the sharpest frame.
 */
export function pickFrame(scores: FrameScore[]): number | null {
  if (scores.length === 0) return null;
  const lit = scores.filter((s) => s.luma >= 20);
  const pool = lit.length > 0 ? lit : scores;
  const best = Math.max(...pool.map((s) => s.sharpness));
  const first = pool.find((s) => s.sharpness >= best * 0.6);
  return (first ?? pool[0]!).time;
}

const SAMPLE_W = 96;
const SAMPLE_H = 54;
const THUMB_W = 480;
const TIMEOUT_MS = 10000;

function once(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      el.removeEventListener('error', bad);
      resolve();
    };
    const bad = () => {
      el.removeEventListener(event, ok);
      reject(new Error('video error'));
    };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

async function seek(el: HTMLVideoElement, t: number) {
  const done = once(el, 'seeked');
  el.currentTime = t;
  await done;
}

/** Grabs the chosen frame as a JPEG data URL, or null (CORS, codec, timeout …). */
async function capture(url: string): Promise<string | null> {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  const work = (async () => {
    const meta = once(v, 'loadeddata');
    v.src = url;
    await meta;
    const sample = document.createElement('canvas');
    sample.width = SAMPLE_W;
    sample.height = SAMPLE_H;
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    const scores: FrameScore[] = [];
    for (const t of candidateTimes(v.duration)) {
      await seek(v, t);
      sctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
      // Throws a SecurityError when the server does not allow CORS – then we fall back.
      const { luma, sharpness } = frameStats(sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data, SAMPLE_W, SAMPLE_H);
      scores.push({ time: t, luma, sharpness });
    }
    const t = pickFrame(scores);
    if (t == null) return null;
    await seek(v, t);
    const out = document.createElement('canvas');
    out.width = THUMB_W;
    out.height = Math.round((THUMB_W * (v.videoHeight || 9)) / (v.videoWidth || 16));
    out.getContext('2d')?.drawImage(v, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.75);
  })().catch(() => null);
  try {
    return await Promise.race([work, timeout]);
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

// One frame per clip per page load, at most two clips decoded at a time.
const cache = new Map<string, Promise<string | null>>();
let running = 0;
const queue: (() => void)[] = [];

function slot(): Promise<void> {
  if (running < 2) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  const next = queue.shift();
  if (next) next();
  else running--;
}

export function clipFrame(key: string, url: () => Promise<string>): Promise<string | null> {
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        return await capture(await url());
      } catch {
        return null;
      } finally {
        release();
      }
    })();
    cache.set(key, p);
  }
  return p;
}

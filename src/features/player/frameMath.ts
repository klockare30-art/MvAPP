/**
 * Frame-accurate stepping on top of exact (zero-tolerance) seeks.
 *
 * expo-video seeks with zero tolerance by default, so seeking to a time inside
 * a frame's display interval shows exactly that frame. Frame k of a
 * constant-frame-rate video is displayed during [k/fps, (k+1)/fps); we target
 * the middle of that interval to be robust against rounding.
 *
 * Limitation: this assumes a constant frame rate starting at t = 0, which holds
 * for iPad camera recordings. Variable-frame-rate files may be off by one frame.
 */
export const DEFAULT_FPS = 30;

export function frameIndexAt(timeSec: number, fps: number): number {
  const f = fps > 0 ? fps : DEFAULT_FPS;
  // Small epsilon so a time exactly on a boundary maps to the frame starting there.
  return Math.max(0, Math.floor(timeSec * f + 1e-6));
}

export function timeForFrame(index: number, fps: number): number {
  const f = fps > 0 ? fps : DEFAULT_FPS;
  return (Math.max(0, index) + 0.5) / f;
}

export function stepFrameTime(currentSec: number, delta: number, fps: number, durationSec: number): number {
  const f = fps > 0 ? fps : DEFAULT_FPS;
  const lastFrame = durationSec > 0 ? Math.max(0, Math.ceil(durationSec * f) - 1) : Number.MAX_SAFE_INTEGER;
  const target = Math.min(lastFrame, Math.max(0, frameIndexAt(currentSec, f) + delta));
  return timeForFrame(target, f);
}

export function clampTime(t: number, durationSec: number): number {
  if (!(durationSec > 0)) return Math.max(0, t);
  return Math.min(Math.max(0, t), durationSec);
}

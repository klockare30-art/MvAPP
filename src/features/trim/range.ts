import { MIN_CLIP_MS } from '@/services/clips';

export interface ClipRange {
  startMs: number;
  endMs: number;
}

/** Default selection when the editor opens: the whole video. */
export function initialRange(durationMs: number): ClipRange {
  return { startMs: 0, endMs: Math.max(0, Math.round(durationMs)) };
}

/** Moves the start marker, keeping at least MIN_CLIP_MS before the end marker. */
export function setStart(r: ClipRange, ms: number, durationMs: number): ClipRange {
  const maxStart = Math.max(0, Math.min(r.endMs, durationMs) - MIN_CLIP_MS);
  return { ...r, startMs: Math.round(Math.min(Math.max(0, ms), maxStart)) };
}

/** Moves the end marker, keeping at least MIN_CLIP_MS after the start marker. */
export function setEnd(r: ClipRange, ms: number, durationMs: number): ClipRange {
  const minEnd = Math.min(durationMs, r.startMs + MIN_CLIP_MS);
  return { ...r, endMs: Math.round(Math.max(minEnd, Math.min(ms, durationMs))) };
}

/** While previewing the selection, playback past the end jumps back to the start. */
export function loopPosition(r: ClipRange, positionMs: number): number | null {
  if (positionMs >= r.endMs - 20 || positionMs < r.startMs - 250) return r.startMs;
  return null;
}

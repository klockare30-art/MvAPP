import type { PublishedVideo, VideoComment } from './types';

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Position with tenths, for slow-motion review: "00:42.3" */
export function formatPosition(sec: number): string {
  // Work in whole milliseconds: 4.3 % 1 is 0.2999… in floating point.
  const ms = Math.max(0, Math.round(sec * 1000));
  return `${formatDuration(ms)}.${Math.floor((ms % 1000) / 100)}`;
}

const DATE = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/** Focus areas with counts, most recorded first: "Förflyttningar — 18". */
export function focusAreaCounts(videos: PublishedVideo[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of videos) {
    const key = v.focus_area ?? 'Utan fokusområde';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv'));
}

export function filterByFocus(videos: PublishedVideo[], focus: string | null): PublishedVideo[] {
  if (focus == null) return videos;
  return videos.filter((v) => (v.focus_area ?? 'Utan fokusområde') === focus);
}

/** Videos grouped per calendar day (local time), newest day first. */
export function groupByDay(videos: PublishedVideo[]): { day: string; videos: PublishedVideo[] }[] {
  const sorted = [...videos].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const groups: { day: string; videos: PublishedVideo[] }[] = [];
  for (const v of sorted) {
    const day = formatDate(v.recorded_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.videos.push(v);
    else groups.push({ day, videos: [v] });
  }
  return groups;
}

/** Timestamped comments first (in video order), then general comments by time. */
export function sortComments(comments: VideoComment[]): VideoComment[] {
  return [...comments].sort((a, b) => {
    if (a.timestamp_ms != null && b.timestamp_ms != null) return a.timestamp_ms - b.timestamp_ms;
    if (a.timestamp_ms != null) return -1;
    if (b.timestamp_ms != null) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** Frame stepping: target the middle of the next/previous frame interval. */
export function stepFrame(currentSec: number, delta: number, fps: number, durationSec: number): number {
  const f = fps > 0 ? fps : 30;
  const idx = Math.floor(currentSec * f + 1e-6) + delta;
  const last = durationSec > 0 ? Math.ceil(durationSec * f) - 1 : Number.MAX_SAFE_INTEGER;
  return (Math.min(last, Math.max(0, idx)) + 0.5) / f;
}

const GB = 1024 ** 3;

/** "1,5 GB", "320 MB" – Swedish decimal comma. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}

export const bytesToGb = (bytes: number): number => Math.round((bytes / GB) * 10) / 10;
export const gbToBytes = (gb: number): number => Math.round(gb * GB);

/** Today's date as YYYY-MM-DD in local time (for date inputs). */
export function localDateIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

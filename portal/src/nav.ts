/**
 * Browsing between clips: the library remembers the clips currently shown (after
 * filtering, in on-screen order) so the video view can offer previous/next.
 * Kept in sessionStorage – per tab, gone when the tab closes.
 */
export interface ClipNav {
  ids: string[];
  /** What the list is, e.g. "Klubbhantering" or "Alla". */
  label: string;
  /** Play the next clip automatically when one ends. */
  autoplay?: boolean;
  /** Playback speed carried between clips (slow-motion review of a series). */
  rate?: number;
}

const KEY = 'gv-clip-nav';

export function saveNav(nav: ClipNav): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(nav));
  } catch {
    // Storage blocked: the video view simply shows no previous/next.
  }
}

export function loadNav(): ClipNav | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ClipNav>;
    if (!Array.isArray(v.ids) || !v.ids.every((x) => typeof x === 'string')) return null;
    return { ids: v.ids, label: typeof v.label === 'string' ? v.label : '', autoplay: v.autoplay === true, rate: typeof v.rate === 'number' ? v.rate : undefined };
  } catch {
    return null;
  }
}

/** Position of the clip in the list and its neighbours (null at the ends or when not in the list). */
export function neighbours(ids: string[], id: string): { index: number; total: number; prev: string | null; next: string | null } | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return { index: i, total: ids.length, prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

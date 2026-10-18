/** Match tagging: pure logic (tested), used by MatchTagger.tsx. */

export interface TagType {
  id: string;
  label: string;
  /** Keyboard shortcut (lower case). */
  key: string;
  color: string;
}

export const TAG_TYPES: readonly TagType[] = [
  { id: 'skott', label: 'Skott', key: 's', color: '#2f7bff' },
  { id: 'retur', label: 'Retur', key: 'r', color: '#f97316' },
  { id: 'ingang', label: 'Ingång', key: 'i', color: '#a855f7' },
  { id: 'scanning', label: 'Scanning', key: 'c', color: '#22c55e' },
  { id: 'mal', label: 'Mål', key: 'm', color: '#ef3b3b' },
  { id: 'ovrigt', label: 'Övrigt', key: 'o', color: '#facc15' },
];

export interface MatchTag {
  id: string;
  type: string;
  /** Moment the coach pressed the key, in seconds into the match. */
  atSec: number;
  beforeSec: number;
  afterSec: number;
  /** Goaltender for this clip when it differs from the match goaltender (e.g. a change mid-game). */
  goalieId?: string;
  /** Set once the clip is saved: who it went to (shown after a reload, prevents double uploads). */
  publishedTo?: string;
}

export const DEFAULT_BEFORE_SEC = 6;
export const DEFAULT_AFTER_SEC = 3;
export const SPEEDS = [2, 4, 8, 16] as const;
/** Jump back this much when fast-forward is released: you always react a little late. */
export const REWIND_ON_RELEASE_SEC = 2;

export function tagTypeById(id: string): TagType {
  return TAG_TYPES.find((t) => t.id === id) ?? TAG_TYPES[TAG_TYPES.length - 1]!;
}

export function tagTypeForKey(key: string): TagType | null {
  return TAG_TYPES.find((t) => t.key === key.toLowerCase()) ?? null;
}

export function newTag(type: string, atSec: number, beforeSec = DEFAULT_BEFORE_SEC, afterSec = DEFAULT_AFTER_SEC): MatchTag {
  return { id: `${type}-${Math.round(atSec * 1000)}-${Math.random().toString(36).slice(2, 7)}`, type, atSec, beforeSec, afterSec };
}

/** Requested clip range, clamped to the match. */
export function clipRange(tag: MatchTag, durationSec: number): { startSec: number; endSec: number } {
  return {
    startSec: Math.max(0, tag.atSec - tag.beforeSec),
    endSec: Math.min(durationSec, tag.atSec + tag.afterSec),
  };
}

export function sortTags(tags: MatchTag[]): MatchTag[] {
  return [...tags].sort((a, b) => a.atSec - b.atSec);
}

/** "1:24:13" or "4:05" – match clock for lists. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** "Skott_1-24-13.mp4" – safe on Windows (no colons). */
export function clipFileName(tag: MatchTag): string {
  return `${tagTypeById(tag.type).label}_${formatClock(tag.atSec).replace(/:/g, '-')}.mp4`;
}

/** Tags are kept per match file in the browser, so a reload does not lose work. */
export function storageKeyFor(file: { name: string; size: number }): string {
  return `gv-tags:${file.name}:${file.size}`;
}

export function parseStoredTags(raw: string | null): MatchTag[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (t): t is MatchTag =>
        typeof t === 'object' && t != null &&
        typeof (t as MatchTag).id === 'string' && typeof (t as MatchTag).type === 'string' &&
        Number.isFinite((t as MatchTag).atSec) && Number.isFinite((t as MatchTag).beforeSec) &&
        Number.isFinite((t as MatchTag).afterSec),
    );
  } catch {
    return [];
  }
}

export function countByType(tags: MatchTag[]): { type: TagType; count: number }[] {
  return TAG_TYPES.map((type) => ({ type, count: tags.filter((t) => t.type === type.id).length })).filter((c) => c.count > 0);
}

/** Pseudo team id for goaltenders that are not in any team. */
export const NO_TEAM = '__none__';

/** Goaltenders shown for a chosen team (NO_TEAM = those without a valid team). */
export function goaliesInTeam<G extends { team_id: string | null }>(goalies: G[], teamIds: string[], teamId: string): G[] {
  return teamId === NO_TEAM
    ? goalies.filter((g) => !g.team_id || !teamIds.includes(g.team_id))
    : goalies.filter((g) => g.team_id === teamId);
}

/** Clips to act on: the marked ones, or every tag when nothing is marked. Always in match order. */
export function chosenTags(tags: MatchTag[], marked: ReadonlySet<string>): MatchTag[] {
  return sortTags(marked.size > 0 ? tags.filter((t) => marked.has(t.id)) : tags);
}

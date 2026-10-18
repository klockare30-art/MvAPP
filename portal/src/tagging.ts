/** Match tagging: pure logic (tested), used by MatchTagger.tsx. */

export interface TagType {
  id: string;
  label: string;
  /** Keyboard shortcut (lower case). */
  key: string;
  color: string;
  /** Default clip margins for this tag. */
  beforeSec: number;
  afterSec: number;
}

const tt = (id: string, label: string, key: string, color: string): TagType => ({ id, label, key, color, beforeSec: 6, afterSec: 3 });

/** Used until the coach saves an own list in the control panel. */
export const DEFAULT_TAG_TYPES: readonly TagType[] = [
  tt('skott', 'Skott', 's', '#2f7bff'),
  tt('retur', 'Retur', 'r', '#f97316'),
  tt('ingang', 'Ingång', 'i', '#a855f7'),
  tt('scanning', 'Scanning', 'c', '#22c55e'),
  tt('mal', 'Mål', 'm', '#ef3b3b'),
  tt('ovrigt', 'Övrigt', 'o', '#facc15'),
];

/** Keys the tagger uses for itself: F/B = fast-forward/rewind. */
export const RESERVED_KEYS = ['f', 'b'];
const KEY = /^[a-z0-9åäö]$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_TAG_TYPES = 30;

/** Swedish reason the list cannot be saved (null = OK). Mirrors the database checks. */
export function tagTypesProblem(types: TagType[]): string | null {
  if (types.length === 0) return 'Lägg till minst en tagg.';
  if (types.length > MAX_TAG_TYPES) return `Högst ${MAX_TAG_TYPES} taggar.`;
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const t of types) {
    const label = t.label.trim();
    const key = t.key.toLowerCase();
    if (!label) return 'Varje tagg behöver ett namn.';
    if (label.length > 30) return `"${label}" är för långt (högst 30 tecken).`;
    if (!KEY.test(key)) return `"${label}": kortkommandot ska vara en bokstav eller siffra.`;
    if (RESERVED_KEYS.includes(key)) return `"${label}": ${key.toUpperCase()} används för snabbspolning. Välj en annan tangent.`;
    if (keys.has(key)) return `Tangenten ${key.toUpperCase()} används av flera taggar.`;
    if (labels.has(label.toLowerCase())) return `Namnet "${label}" finns redan.`;
    if (!COLOR.test(t.color)) return `"${label}": ogiltig färg.`;
    for (const v of [t.beforeSec, t.afterSec]) {
      if (!Number.isInteger(v) || v < 0 || v > 60) return `"${label}": före/efter ska vara 0–60 sekunder.`;
    }
    keys.add(key);
    labels.add(label.toLowerCase());
  }
  return null;
}

/** Stable id for a new tag type, e.g. "Pass bakom mål" → "pass-bakom-mal". */
export function tagTypeId(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'tagg';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** Shown for tags whose type was removed in the control panel. */
const removedType = (id: string): TagType => ({ id, label: 'Borttagen tagg', key: '', color: '#7d8ba8', beforeSec: 6, afterSec: 3 });

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

export function tagTypeById(types: readonly TagType[], id: string): TagType {
  return types.find((t) => t.id === id) ?? removedType(id);
}

export function tagTypeForKey(types: readonly TagType[], key: string): TagType | null {
  return types.find((t) => t.key === key.toLowerCase()) ?? null;
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
export function clipFileName(types: readonly TagType[], tag: MatchTag): string {
  const label = tagTypeById(types, tag.type).label.replace(/[^\p{L}\p{N}]+/gu, '-');
  return `${label}_${formatClock(tag.atSec).replace(/:/g, '-')}.mp4`;
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

export function countByType(types: readonly TagType[], tags: MatchTag[]): { type: TagType; count: number }[] {
  const known = types.map((type) => ({ type, count: tags.filter((t) => t.type === type.id).length }));
  const removed = [...new Set(tags.filter((t) => !types.some((x) => x.id === t.type)).map((t) => t.type))].map((id) => ({
    type: removedType(id),
    count: tags.filter((t) => t.type === id).length,
  }));
  return [...known, ...removed].filter((c) => c.count > 0);
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

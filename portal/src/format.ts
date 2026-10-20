import type { PublishedVideo, SessionKind, VideoComment } from './types';

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

/**
 * Videos grouped per day and match/session (local time), newest first:
 * "fre 18 okt. 2026 · Hemma mot AIK". Clips from the same match stay together.
 */
export function groupByMatch(videos: PublishedVideo[]): { key: string; title: string; videos: PublishedVideo[] }[] {
  const sorted = [...videos].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const groups = new Map<string, { key: string; title: string; videos: PublishedVideo[] }>();
  for (const v of sorted) {
    const day = formatDate(v.recorded_at);
    const session = v.session_title?.trim() ?? '';
    const key = `${day}|${session}`;
    const g = groups.get(key);
    if (g) g.videos.push(v);
    else groups.set(key, { key, title: session ? `${day} · ${session}` : day, videos: [v] });
  }
  return [...groups.values()];
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

// ---------------------------------------------------------------------------
// Coach library: club → team → goaltender → match/training → session → clips
// ---------------------------------------------------------------------------

export const KIND_LABEL: Record<SessionKind | 'none', string> = {
  match: 'Matcher',
  traning: 'Träningar',
  none: 'Utan typ (äldre klipp)',
};

export interface TreeSession {
  key: string;
  /** Local date "YYYY-MM-DD" (for sorting) and its Swedish label. */
  day: string;
  dayLabel: string;
  title: string;
  videos: PublishedVideo[];
}
export interface TreeGoalie {
  id: string;
  label: string;
  kinds: { kind: SessionKind | 'none'; sessions: TreeSession[] }[];
  count: number;
}
export interface TreeTeam {
  id: string;
  name: string;
  goalies: TreeGoalie[];
}
export interface TreeClub {
  id: string;
  name: string;
  teams: TreeTeam[];
}

type GoalieInfo = { id: string; first_name: string; last_name: string; jersey_number: number | null; team_id: string | null };
type TeamInfo = { id: string; club_id: string; name: string; season?: string };
type ClubInfo = { id: string; name: string };

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function sessionsOf(videos: PublishedVideo[]): TreeSession[] {
  const map = new Map<string, TreeSession>();
  for (const v of [...videos].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) {
    const day = localDay(v.recorded_at);
    const title = v.session_title?.trim() || 'Utan rubrik';
    const key = `${day}|${title}`;
    const s = map.get(key);
    if (s) s.videos.push(v);
    else map.set(key, { key, day, dayLabel: formatDate(v.recorded_at), title, videos: [v] });
  }
  // Newest session first; clips inside in match/recording order.
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title, 'sv'));
}

/**
 * Groups the coach's clips into club → team → goaltender → match/training →
 * date + title. Goaltenders without a (known) team end up under "Utan klubb/lag".
 */
export function buildVideoTree(videos: PublishedVideo[], goalies: GoalieInfo[], teams: TeamInfo[], clubs: ClubInfo[]): TreeClub[] {
  const byGoalie = new Map<string, PublishedVideo[]>();
  for (const v of videos) byGoalie.set(v.goaltender_id, [...(byGoalie.get(v.goaltender_id) ?? []), v]);

  const goalieNode = (id: string, vids: PublishedVideo[]): TreeGoalie => {
    const g = goalies.find((x) => x.id === id);
    const label = g ? `${g.first_name} ${g.last_name}`.trim() + (g.jersey_number != null ? ` #${g.jersey_number}` : '') : 'Okänd målvakt';
    const kinds = (['match', 'traning', 'none'] as const)
      .map((kind) => ({ kind, sessions: sessionsOf(vids.filter((v) => (v.session_kind ?? 'none') === kind)) }))
      .filter((k) => k.sessions.length > 0);
    return { id, label, kinds, count: vids.length };
  };
  const byLabel = (a: TreeGoalie, b: TreeGoalie) => a.label.localeCompare(b.label, 'sv');

  const clubNodes: TreeClub[] = [];
  const placed = new Set<string>();
  for (const club of [...clubs].sort((a, b) => a.name.localeCompare(b.name, 'sv'))) {
    const teamNodes: TreeTeam[] = [];
    for (const team of teams.filter((t) => t.club_id === club.id).sort((a, b) => a.name.localeCompare(b.name, 'sv'))) {
      const gs = [...byGoalie.entries()]
        .filter(([gid]) => goalies.find((g) => g.id === gid)?.team_id === team.id)
        .map(([gid, vids]) => {
          placed.add(gid);
          return goalieNode(gid, vids);
        })
        .sort(byLabel);
      if (gs.length > 0) teamNodes.push({ id: team.id, name: team.season ? `${team.name} (${team.season})` : team.name, goalies: gs });
    }
    if (teamNodes.length > 0) clubNodes.push({ id: club.id, name: club.name, teams: teamNodes });
  }
  const rest = [...byGoalie.entries()].filter(([gid]) => !placed.has(gid)).map(([gid, vids]) => goalieNode(gid, vids)).sort(byLabel);
  if (rest.length > 0) clubNodes.push({ id: 'none', name: 'Utan klubb/lag', teams: [{ id: 'none', name: 'Målvakter utan lag', goalies: rest }] });
  return clubNodes;
}

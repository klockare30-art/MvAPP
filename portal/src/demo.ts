/**
 * DEMO MODE (built only with VITE_DEMO=1, e.g. `npm run build:demo`).
 * An in-browser stand-in for Supabase with example data, so the portal can be
 * tried without any account or server. Never enabled in the real build.
 */
import type { ClipPortalApi, Club, CoachAccount, CoachGoaltender, GoaltenderInput, Team } from './publishClip';
import type { AdminCoach, CoachStatus, GoaltenderProfile, Plan, PublishedVideo, VideoComment } from './types';

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

const USER_ID = 'demo-erik';
const COACH_ID = 'demo-coach';
const GOALIE_ID = 'demo-goalie-erik';

const profile: GoaltenderProfile = {
  id: GOALIE_ID, coach_id: COACH_ID, first_name: 'Erik', last_name: 'Andersson', jersey_number: 30, user_id: USER_ID,
};

function day(offsetDays: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const videos: PublishedVideo[] = [
  ['d1', 'Förflyttningar', 'T-push', day(1, 18, 12), 8000, 'Bra position före skottet – behåll balansen längre efter förflyttningen.'],
  ['d2', 'Förflyttningar', null, day(1, 18, 31), 8000, null],
  ['d3', 'Stolpspel', 'RVH', day(1, 18, 45), 8000, null],
  ['d4', 'Scanning', null, day(4, 17, 5), 8000, 'Titta upp tidigare innan passningen går.'],
  ['d5', 'Butterfly', null, day(4, 17, 20), 8000, null],
].map(([id, focus, exercise, at, ms, note]) => ({
  id: `00000000-0000-4000-8000-0000000000${(id as string).slice(1).padStart(2, '0')}`,
  coach_id: COACH_ID,
  goaltender_id: GOALIE_ID,
  storage_path: 'demo',
  focus_area: focus as string,
  exercise: exercise as string | null,
  session_title: 'Målvaktsträning U16',
  team_name: 'Borlänge Hockey U16',
  recorded_at: at as string,
  duration_ms: ms as number,
  frame_rate: 30,
  coach_note: note as string | null,
  published_at: at as string,
}));

const COMMENTS_KEY = 'gv-demo-comments';
function initialComments(): VideoComment[] {
  const v = videos[0]?.id ?? '';
  return [
    { id: 'c1', video_id: v, author_id: COACH_ID, author_role: 'trainer', timestamp_ms: 1800, content: 'Bra positionering här.', created_at: day(1, 20, 0) },
    { id: 'c2', video_id: v, author_id: COACH_ID, author_role: 'trainer', timestamp_ms: 4300, content: 'Här tappar du vinkeln vid förflyttningen.', created_at: day(1, 20, 1) },
    { id: 'c3', video_id: v, author_id: USER_ID, author_role: 'goaltender', timestamp_ms: 4300, content: 'Ska jag starta T-pushen tidigare?', created_at: day(1, 21, 10) },
  ];
}
function readComments(): VideoComment[] {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    return raw ? (JSON.parse(raw) as VideoComment[]) : initialComments();
  } catch {
    return initialComments();
  }
}
function writeComments(c: VideoComment[]): void {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(c));
  } catch {
    // Private browsing: comments then last until the page is reloaded.
  }
  memory = c;
}
let memory: VideoComment[] | null = null;
const comments = () => (memory ??= readComments());

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

// Admin example data (reachable at #/admin in the demo; kept in memory only).
let demoPlans: Plan[] = [
  { id: 'start', name: 'Start', max_storage_bytes: 1024 ** 3, max_goaltenders: 10, price_note: '', sort_order: 1 },
  { id: 'plus', name: 'Plus', max_storage_bytes: 10 * 1024 ** 3, max_goaltenders: 30, price_note: 'exempelpris', sort_order: 2 },
];
let demoCoaches: AdminCoach[] = [
  { id: 'c1', email: 'ny.tranare@exempel.se', name: 'Anna Berg', status: 'pending', plan_id: null, paid_until: null,
    created_at: day(0, 9, 10), goaltender_count: 0, video_count: 0, storage_bytes: 0 },
  { id: COACH_ID, email: 'tranare@exempel.se', name: 'Johan Lind', status: 'active', plan_id: 'plus', paid_until: day(-60, 12, 0).slice(0, 10),
    created_at: day(40, 9, 0), goaltender_count: 6, video_count: 48, storage_bytes: 3.2 * 1024 ** 3 },
  { id: 'c3', email: 'gammal@exempel.se', name: 'Per Ek', status: 'active', plan_id: 'start', paid_until: day(3, 12, 0).slice(0, 10),
    created_at: day(200, 9, 0), goaltender_count: 4, video_count: 31, storage_bytes: 0.9 * 1024 ** 3 },
];

// Clips "published" from the tagging page in the demo live only in this tab.
const demoUploads = new Map<string, string>();
let demoClubs: Club[] = [{ id: 'club-1', name: 'Exempelklubben IF' }];
let demoTeams: Team[] = [
  { id: 'team-1', club_id: 'club-1', name: 'J18', season: '2026/27' },
  { id: 'team-2', club_id: 'club-1', name: 'U16', season: '2026/27' },
];
let demoCoachGoalies: CoachGoaltender[] = [
  { id: GOALIE_ID, first_name: 'Erik', last_name: 'Andersson', jersey_number: 30, email: 'erik@exempel.se',
    team_id: 'team-1', user_id: USER_ID, access_revoked_at: null },
  { id: 'demo-goalie-william', first_name: 'William', last_name: 'Berg', jersey_number: 35, email: 'william@exempel.se',
    team_id: 'team-1', user_id: null, access_revoked_at: null },
  { id: 'demo-goalie-oliver', first_name: 'Oliver', last_name: 'Ek', jersey_number: 1, email: 'oliver@exempel.se',
    team_id: 'team-2', user_id: null, access_revoked_at: null },
];
const goalieFields = (g: GoaltenderInput) => ({
  first_name: g.firstName.trim(), last_name: g.lastName.trim(), jersey_number: g.jerseyNumber, email: g.email.trim(), team_id: g.teamId,
});
const demoAccount: CoachAccount = {
  status: 'active', planName: 'Plus', paidUntil: null, isActive: true,
  maxStorageBytes: 10 * 1024 ** 3, usedStorageBytes: 0, maxGoaltenders: 30, goaltenderCount: 1,
};

/** Same functions as supabaseApi.ts, backed by the example data above. */
export const demoApi = {
  async claimProfiles() {
    await wait();
    return 0;
  },
  async loadProfiles() {
    await wait();
    return [profile];
  },
  async loadVideos() {
    await wait();
    return videos;
  },
  async loadVideo(id: string) {
    await wait();
    return videos.find((v) => v.id === id) ?? null;
  },
  async signedVideoUrl(path?: string) {
    await wait();
    const uploaded = path ? demoUploads.get(path) : undefined;
    if (uploaded) return uploaded;
    // The demo clip is a test pattern with a frame counter (makes frame stepping visible).
    const probe = document.createElement('video');
    return probe.canPlayType('video/mp4; codecs="avc1.42E01E"') ? 'demo/demo.mp4' : 'demo/demo.webm';
  },
  async loadComments(videoId: string) {
    await wait();
    return comments().filter((c) => c.video_id === videoId);
  },
  async addComment(input: { videoId: string; role: 'trainer' | 'goaltender'; timestampMs: number | null; content: string }) {
    await wait();
    writeComments([
      ...comments(),
      {
        id: `c${Date.now()}`,
        video_id: input.videoId,
        author_id: USER_ID,
        author_role: input.role,
        timestamp_ms: input.timestampMs,
        content: input.content.trim(),
        created_at: new Date().toISOString(),
      },
    ]);
  },
  async deleteComment(id: string) {
    await wait();
    writeComments(comments().filter((c) => c.id !== id));
  },
  // The demo user is a goaltender, so no admin link is shown; #/admin still works for trying the page.
  async isAdmin() {
    await wait();
    return false;
  },
  // Shown in the demo so the tagging tool can be tried (it works fully offline).
  async isCoach() {
    await wait();
    return true;
  },
  async myCoachAccount() {
    await wait();
    return { ...demoAccount, goaltenderCount: demoCoachGoalies.length };
  },
  async becomeCoach(_name: string) {
    await wait();
  },
  async listMyGoaltenders() {
    await wait();
    return demoCoachGoalies;
  },
  async addGoaltender(g: GoaltenderInput) {
    await wait();
    const goalie: CoachGoaltender = { id: `demo-${Date.now()}`, ...goalieFields(g), user_id: null, access_revoked_at: null };
    demoCoachGoalies = [...demoCoachGoalies, goalie];
    return goalie;
  },
  async updateGoaltender(id: string, g: GoaltenderInput) {
    await wait();
    demoCoachGoalies = demoCoachGoalies.map((x) => (x.id === id ? { ...x, ...goalieFields(g) } : x));
  },
  async setGoaltenderAccess(id: string, enabled: boolean) {
    await wait();
    demoCoachGoalies = demoCoachGoalies.map((x) => (x.id === id ? { ...x, access_revoked_at: enabled ? null : new Date().toISOString() } : x));
  },
  async eraseGoaltender(id: string) {
    await wait();
    demoCoachGoalies = demoCoachGoalies.filter((x) => x.id !== id);
  },
  async listClubs() {
    await wait();
    return demoClubs;
  },
  async saveClub(club: { id?: string; name: string }) {
    await wait();
    demoClubs = club.id
      ? demoClubs.map((c) => (c.id === club.id ? { ...c, name: club.name.trim() } : c))
      : [...demoClubs, { id: `club-${Date.now()}`, name: club.name.trim() }];
  },
  async deleteClub(id: string) {
    await wait();
    const gone = demoTeams.filter((t) => t.club_id === id).map((t) => t.id);
    demoClubs = demoClubs.filter((c) => c.id !== id);
    demoTeams = demoTeams.filter((t) => t.club_id !== id);
    demoCoachGoalies = demoCoachGoalies.map((g) => (g.team_id && gone.includes(g.team_id) ? { ...g, team_id: null } : g));
  },
  async listTeams() {
    await wait();
    return demoTeams;
  },
  async saveTeam(team: { id?: string; clubId: string; name: string; season: string }) {
    await wait();
    const row = { club_id: team.clubId, name: team.name.trim(), season: team.season.trim() };
    demoTeams = team.id
      ? demoTeams.map((t) => (t.id === team.id ? { ...t, ...row } : t))
      : [...demoTeams, { id: `team-${Date.now()}`, ...row }];
  },
  async deleteTeam(id: string) {
    await wait();
    demoTeams = demoTeams.filter((t) => t.id !== id);
    demoCoachGoalies = demoCoachGoalies.map((g) => (g.team_id === id ? { ...g, team_id: null } : g));
  },
  clipPortalApi: {
    userId: async () => COACH_ID,
    async uploadFile(path: string, blob: Blob) {
      await wait(400);
      demoUploads.set(path, URL.createObjectURL(blob));
    },
    async insertVideo(row) {
      await wait();
      videos.unshift({
        id: row.id, coach_id: row.coach_id, goaltender_id: row.goaltender_id, storage_path: row.storage_path,
        focus_area: row.focus_area, exercise: row.exercise, session_title: row.session_title, team_name: row.team_name,
        recorded_at: row.recorded_at, duration_ms: row.duration_ms, frame_rate: row.frame_rate, coach_note: row.coach_note,
        published_at: new Date().toISOString(),
      });
    },
    async removeObject(path: string) {
      demoUploads.delete(path);
    },
  } satisfies ClipPortalApi,
  async adminListCoaches() {
    await wait();
    return demoCoaches;
  },
  async adminUpdateCoach(id: string, status: CoachStatus, planId: string | null, paidUntil: string | null) {
    await wait();
    if (status === 'active' && !planId) throw new Error('Välj en nivå innan tränaren aktiveras.');
    demoCoaches = demoCoaches.map((c) => (c.id === id ? { ...c, status, plan_id: planId, paid_until: paidUntil } : c));
  },
  async loadPlans() {
    await wait();
    return demoPlans;
  },
  async adminSavePlan(plan: Plan) {
    await wait();
    demoPlans = [...demoPlans.filter((p) => p.id !== plan.id), plan].sort((a, b) => a.sort_order - b.sort_order);
  },
};

export const DEMO_USER = { id: USER_ID, email: 'erik@exempel.se' };

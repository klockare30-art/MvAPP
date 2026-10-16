/**
 * DEMO MODE (built only with VITE_DEMO=1, e.g. `npm run build:demo`).
 * An in-browser stand-in for Supabase with example data, so the portal can be
 * tried without any account or server. Never enabled in the real build.
 */
import type { GoaltenderProfile, PublishedVideo, VideoComment } from './types';

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
  async signedVideoUrl() {
    await wait();
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
};

export const DEMO_USER = { id: USER_ID, email: 'erik@exempel.se' };

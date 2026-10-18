import { supabase } from './supabase';
import type { ClipPortalApi, Club, CoachAccount, CoachGoaltender, GoaltenderInput, Team } from './publishClip';
import type { AdminCoach, CoachStatus, GoaltenderProfile, Plan, PublishedVideo, VideoComment } from './types';

function client() {
  if (!supabase) throw new Error('Portalen är inte konfigurerad.');
  return supabase;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Links goaltender profiles registered to the user's verified e-mail. */
export async function claimProfiles(): Promise<number> {
  const { data, error } = await client().rpc('claim_my_goaltender_profiles');
  fail(error);
  return (data as number | null) ?? 0;
}

export async function loadProfiles(): Promise<GoaltenderProfile[]> {
  const { data, error } = await client()
    .from('goaltenders')
    .select('id, coach_id, first_name, last_name, jersey_number, user_id')
    .order('first_name');
  fail(error);
  return (data ?? []) as GoaltenderProfile[];
}

/** RLS returns only videos the user may see (own videos; a coach sees what they published). */
export async function loadVideos(): Promise<PublishedVideo[]> {
  const { data, error } = await client()
    .from('published_videos')
    .select('*')
    .order('recorded_at', { ascending: false });
  fail(error);
  return (data ?? []) as PublishedVideo[];
}

/** Short-lived private link; videos are never publicly addressable. */
export async function signedVideoUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from('videos').createSignedUrl(path, 60 * 60);
  fail(error);
  if (!data?.signedUrl) throw new Error('Kunde inte hämta videolänken.');
  return data.signedUrl;
}

export async function loadComments(videoId: string): Promise<VideoComment[]> {
  const { data, error } = await client()
    .from('video_comments')
    .select('*')
    .eq('video_id', videoId)
    .order('created_at');
  fail(error);
  return (data ?? []) as VideoComment[];
}

export async function addComment(input: {
  videoId: string;
  role: 'trainer' | 'goaltender';
  timestampMs: number | null;
  content: string;
}): Promise<void> {
  const { error } = await client().from('video_comments').insert({
    video_id: input.videoId,
    author_role: input.role,
    timestamp_ms: input.timestampMs,
    content: input.content.trim(),
  });
  fail(error);
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await client().from('video_comments').delete().eq('id', id);
  fail(error);
}

export async function loadVideo(id: string): Promise<PublishedVideo | null> {
  const { data, error } = await client().from('published_videos').select('*').eq('id', id).maybeSingle();
  fail(error);
  return (data as PublishedVideo | null) ?? null;
}

// ---------------------------------------------------------------------------
// Admin (the database rejects these calls for everyone who is not in public.admins)
// ---------------------------------------------------------------------------

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await client().rpc('is_admin');
  fail(error);
  return data === true;
}

export async function adminListCoaches(): Promise<AdminCoach[]> {
  const { data, error } = await client().rpc('admin_list_coaches');
  fail(error);
  return ((data ?? []) as AdminCoach[]).map((c) => ({
    ...c,
    goaltender_count: Number(c.goaltender_count),
    video_count: Number(c.video_count),
    storage_bytes: Number(c.storage_bytes),
  }));
}

export async function adminUpdateCoach(id: string, status: CoachStatus, planId: string | null, paidUntil: string | null): Promise<void> {
  const { error } = await client().rpc('admin_update_coach', {
    p_coach_id: id,
    p_status: status,
    p_plan_id: planId,
    p_paid_until: paidUntil,
  });
  fail(error);
}

export async function loadPlans(): Promise<Plan[]> {
  const { data, error } = await client().from('plans').select('*').order('sort_order').order('name');
  fail(error);
  return ((data ?? []) as Plan[]).map((p) => ({ ...p, max_storage_bytes: Number(p.max_storage_bytes) }));
}

export async function adminSavePlan(plan: Plan): Promise<void> {
  const { error } = await client().rpc('admin_save_plan', {
    p_id: plan.id,
    p_name: plan.name,
    p_max_storage_bytes: plan.max_storage_bytes,
    p_max_goaltenders: plan.max_goaltenders,
    p_price_note: plan.price_note,
    p_sort_order: plan.sort_order,
  });
  fail(error);
}

/** True when the user has a coach account (sees the match tagging tool). */
export async function isCoach(): Promise<boolean> {
  const { data, error } = await client().from('coaches').select('id').limit(1);
  fail(error);
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Coach (match tagging → publish clips)
// ---------------------------------------------------------------------------

async function uid(): Promise<string> {
  const { data, error } = await client().auth.getUser();
  fail(error);
  if (!data.user) throw new Error('Inte inloggad.');
  return data.user.id;
}

/** null when the user has no coach profile yet. */
export async function myCoachAccount(): Promise<CoachAccount | null> {
  const { data, error } = await client().rpc('my_coach_account');
  fail(error);
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (!r) return null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    status: r.status as CoachAccount['status'],
    planName: (r.plan_name as string | null) ?? null,
    paidUntil: (r.paid_until as string | null) ?? null,
    isActive: r.is_active === true,
    maxStorageBytes: num(r.max_storage_bytes),
    usedStorageBytes: num(r.used_storage_bytes) ?? 0,
    maxGoaltenders: num(r.max_goaltenders),
    goaltenderCount: num(r.goaltender_count) ?? 0,
  };
}

/** Creates the coach profile (status pending until the admin approves). */
export async function becomeCoach(name: string): Promise<void> {
  const { error } = await client().from('coaches').upsert({ id: await uid(), name }, { onConflict: 'id', ignoreDuplicates: true });
  fail(error);
}

const GOALIE_COLUMNS = 'id, first_name, last_name, jersey_number, email, team_id, user_id, access_revoked_at';

/** All of the coach's goaltenders, including those whose access is turned off. */
export async function listMyGoaltenders(): Promise<CoachGoaltender[]> {
  const { data, error } = await client()
    .from('goaltenders')
    .select(GOALIE_COLUMNS)
    .eq('coach_id', await uid())
    .order('first_name');
  fail(error);
  return (data ?? []) as CoachGoaltender[];
}

function goalieRow(g: GoaltenderInput) {
  return {
    first_name: g.firstName.trim(),
    last_name: g.lastName.trim(),
    jersey_number: g.jerseyNumber,
    email: g.email.trim(),
    team_id: g.teamId,
  };
}

/** Adds a goaltender with recorded consent (the coach confirms consent in the form). */
export async function addGoaltender(g: GoaltenderInput): Promise<CoachGoaltender> {
  const { data, error } = await client()
    .from('goaltenders')
    .insert({ id: crypto.randomUUID(), coach_id: await uid(), consent_confirmed_at: new Date().toISOString(), ...goalieRow(g) })
    .select(GOALIE_COLUMNS)
    .single();
  if (error?.code === '42501') {
    throw new Error('Målvakten kunde inte läggas till: kontot är inte aktivt eller nivåns gräns för antal målvakter är nådd.');
  }
  fail(error);
  return data as CoachGoaltender;
}

export async function updateGoaltender(id: string, g: GoaltenderInput): Promise<void> {
  const { error } = await client().from('goaltenders').update(goalieRow(g)).eq('id', id);
  fail(error);
}

/** Turns the goaltender's portal access off (videos stay) or back on. */
export async function setGoaltenderAccess(id: string, enabled: boolean): Promise<void> {
  const { error } = await client()
    .from('goaltenders')
    .update({ access_revoked_at: enabled ? null : new Date().toISOString() })
    .eq('id', id);
  fail(error);
}

/** Erasure on request: removes the video files, then the profile (rows and comments cascade). */
export async function eraseGoaltender(id: string): Promise<void> {
  const { data, error } = await client().from('published_videos').select('storage_path').eq('goaltender_id', id);
  fail(error);
  const paths = (data ?? []).map((r) => (r as { storage_path: string }).storage_path);
  if (paths.length > 0) {
    const { error: rmErr } = await client().storage.from('videos').remove(paths);
    fail(rmErr);
  }
  const { error: delErr } = await client().from('goaltenders').delete().eq('id', id);
  fail(delErr);
}

export async function listClubs(): Promise<Club[]> {
  const { data, error } = await client().from('clubs').select('id, name').order('name');
  fail(error);
  return (data ?? []) as Club[];
}

/** Creates or renames a club; returns its id. */
export async function saveClub(club: { id?: string; name: string }): Promise<string> {
  if (club.id) {
    const { error } = await client().from('clubs').update({ name: club.name.trim() }).eq('id', club.id);
    fail(error);
    return club.id;
  }
  const id = crypto.randomUUID();
  const { error } = await client().from('clubs').insert({ id, name: club.name.trim() });
  fail(error);
  return id;
}

export async function deleteClub(id: string): Promise<void> {
  const { error } = await client().from('clubs').delete().eq('id', id);
  fail(error);
}

export async function listTeams(): Promise<Team[]> {
  const { data, error } = await client().from('teams').select('id, club_id, name, season').order('name');
  fail(error);
  return (data ?? []) as Team[];
}

export async function saveTeam(team: { id?: string; clubId: string; name: string; season: string }): Promise<void> {
  const row = { club_id: team.clubId, name: team.name.trim(), season: team.season.trim() };
  const { error } = team.id
    ? await client().from('teams').update(row).eq('id', team.id)
    : await client().from('teams').insert(row);
  fail(error);
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await client().from('teams').delete().eq('id', id);
  fail(error);
}

export const clipPortalApi: ClipPortalApi = {
  userId: uid,
  async uploadFile(path, blob) {
    const bucket = client().storage.from('videos');
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Uppladdningen kunde inte förberedas: ${error?.message ?? 'okänt fel'}`);
    const { error: upErr } = await bucket.uploadToSignedUrl(path, data.token, blob, { contentType: 'video/mp4' });
    if (upErr) throw new Error(`Uppladdningen misslyckades: ${upErr.message}`);
  },
  async insertVideo(row) {
    const { error } = await client().from('published_videos').insert(row);
    if (error) throw new Error(`Klippet kunde inte registreras: ${error.message}`);
  },
  async removeObject(path) {
    const { error } = await client().storage.from('videos').remove([path]);
    fail(error);
  },
};

/**
 * Coach removes published clips: rows first (the goaltender loses access at once,
 * comments cascade), then the files. The database only allows the coach's own.
 */
export async function deleteVideos(videos: { id: string; storage_path: string }[]): Promise<void> {
  if (videos.length === 0) return;
  const { error } = await client().from('published_videos').delete().in('id', videos.map((v) => v.id));
  fail(error);
  const { error: rmErr } = await client().storage.from('videos').remove(videos.map((v) => v.storage_path));
  if (rmErr) throw new Error(`Klippen är borttagna för målvakten, men filerna kunde inte raderas: ${rmErr.message}`);
}

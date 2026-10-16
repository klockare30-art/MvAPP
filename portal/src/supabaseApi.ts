import { supabase } from './supabase';
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

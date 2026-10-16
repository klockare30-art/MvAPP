import { supabase } from './supabase';
import type { GoaltenderProfile, PublishedVideo, VideoComment } from './types';

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

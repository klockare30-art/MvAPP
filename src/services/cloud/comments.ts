import { getSupabase } from './client';

export interface PortalComment {
  id: string;
  author_role: 'trainer' | 'goaltender';
  timestamp_ms: number | null;
  content: string;
  created_at: string;
}

/** Comments on a published video, written in the portal by the goaltender or the coach. */
export async function fetchPortalComments(videoId: string): Promise<PortalComment[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('video_comments')
    .select('id, author_role, timestamp_ms, content, created_at')
    .eq('video_id', videoId)
    .order('created_at');
  if (error) throw new Error(`Kommentarerna kunde inte hämtas: ${error.message}`);
  return (data ?? []) as PortalComment[];
}

export async function addTrainerComment(videoId: string, content: string, timestampMs: number | null): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Målvaktsportalen är inte konfigurerad.');
  const { error } = await supabase
    .from('video_comments')
    .insert({ video_id: videoId, author_role: 'trainer', timestamp_ms: timestampMs, content: content.trim() });
  if (error) throw new Error(`Kommentaren kunde inte sparas: ${error.message}`);
}

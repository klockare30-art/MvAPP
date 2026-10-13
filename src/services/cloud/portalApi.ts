import type { SupabaseClient } from '@supabase/supabase-js';
import { UploadType } from 'expo-file-system';

import { videoFile } from '@/services/videoFiles';

import type { PortalApi } from './publish';

const BUCKET = 'videos';

function fail(error: { message: string; code?: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Real PortalApi backed by Supabase. */
export function createPortalApi(supabase: SupabaseClient, anonKey: string): PortalApi {
  return {
    async currentUserId() {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async ensureCoach(id, name) {
      const { error } = await supabase.from('coaches').upsert({ id, name }, { onConflict: 'id', ignoreDuplicates: true });
      fail(error, 'Tränarkontot kunde inte skapas');
    },

    async upsertGoaltender(row) {
      // Plain upsert would also try to update id/coach_id, which the coach may not change.
      const { error } = await supabase.from('goaltenders').insert(row);
      if (!error) return;
      if (error.code !== '23505') fail(error, 'Målvakten kunde inte sparas i portalen');
      const { error: updErr } = await supabase
        .from('goaltenders')
        .update({
          first_name: row.first_name,
          last_name: row.last_name,
          jersey_number: row.jersey_number,
          email: row.email,
          consent_confirmed_at: row.consent_confirmed_at,
        })
        .eq('id', row.id);
      fail(updErr, 'Målvakten kunde inte uppdateras i portalen');
    },

    async createSignedUpload(path) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      fail(error, 'Uppladdningen kunde inte förberedas');
      if (!data) throw new Error('Uppladdningen kunde inte förberedas.');
      return { signedUrl: data.signedUrl };
    },

    async uploadFile(fileName, signedUrl, contentType, onProgress) {
      // Native streaming upload from disk (no full-file copy in JS memory).
      const result = await videoFile(fileName).upload(signedUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          'content-type': contentType,
          'x-upsert': 'false',
          'cache-control': 'max-age=3600',
          apikey: anonKey,
        },
        onProgress: onProgress
          ? ({ bytesSent, totalBytes }) => onProgress(totalBytes > 0 ? bytesSent / totalBytes : 0)
          : undefined,
      });
      if (result.status < 200 || result.status >= 300) {
        let detail = result.body;
        try {
          detail = (JSON.parse(result.body) as { message?: string }).message ?? result.body;
        } catch {
          // Body was not JSON.
        }
        throw new Error(`Uppladdningen misslyckades (${result.status}): ${detail}`);
      }
    },

    async insertPublishedVideo(row) {
      const { error } = await supabase.from('published_videos').insert(row);
      fail(error, 'Videon kunde inte registreras i portalen');
    },

    async deletePublishedVideo(id) {
      const { error } = await supabase.from('published_videos').delete().eq('id', id);
      fail(error, 'Videon kunde inte tas bort från portalen');
    },

    async deleteGoaltender(id) {
      const { error } = await supabase.from('goaltenders').delete().eq('id', id);
      fail(error, 'Målvakten kunde inte tas bort från portalen');
    },

    async removeObject(path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      fail(error, 'Videofilen kunde inte tas bort från lagringen');
    },
  };
}

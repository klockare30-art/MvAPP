import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { readCloudConfig } from './config';

let client: SupabaseClient | null | undefined;

/**
 * Lazily created Supabase client, or null when the portal is not configured.
 * Nothing here runs during recording; the client is only used when the coach
 * logs in, publishes or reads portal comments.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const cfg = readCloudConfig();
  if (!cfg) {
    client = null;
    return client;
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      // Session persisted in expo-sqlite's localStorage implementation (survives restarts).
      storage: globalThis.localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  const c = client;
  // Only refresh tokens while the app is in the foreground (recommended for React Native).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') c.auth.startAutoRefresh();
    else c.auth.stopAutoRefresh();
  });
  return client;
}

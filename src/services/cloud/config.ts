/**
 * Portal configuration, provided at build time through EXPO_PUBLIC_* variables
 * (.env locally, `eas env` for EAS builds). The anon key is public by design;
 * all access control is enforced server-side by row-level security.
 */
export interface CloudConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Address of the goaltender portal, shown to the coach so it can be shared. */
  portalUrl: string | null;
}

export function readCloudConfig(): CloudConfig | null {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey, portalUrl: process.env.EXPO_PUBLIC_PORTAL_URL || null };
}

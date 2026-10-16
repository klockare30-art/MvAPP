import { DEMO_USER, IS_DEMO } from './demo';
import { supabase } from './supabase';

export interface PortalUser {
  id: string;
  email: string;
}

type Listener = (u: PortalUser | null) => void;
const DEMO_KEY = 'gv-demo-session';
const demoListeners = new Set<Listener>();

function demoUser(): PortalUser | null {
  try {
    return localStorage.getItem(DEMO_KEY) ? DEMO_USER : null;
  } catch {
    return null;
  }
}
function setDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_KEY, '1');
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    // ignore
  }
  demoListeners.forEach((l) => l(on ? DEMO_USER : null));
}

export const isPortalConfigured = IS_DEMO || supabase != null;

export async function currentUser(): Promise<PortalUser | null> {
  if (IS_DEMO) return demoUser();
  const { data } = await supabase!.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? '' } : null;
}

export function onUserChange(l: Listener): () => void {
  if (IS_DEMO) {
    demoListeners.add(l);
    return () => demoListeners.delete(l);
  }
  const { data } = supabase!.auth.onAuthStateChange((_e, s) => l(s ? { id: s.user.id, email: s.user.email ?? '' } : null));
  return () => data.subscription.unsubscribe();
}

/** Sends the e-mail with login link and code. */
export async function sendLoginEmail(email: string): Promise<void> {
  if (IS_DEMO) return;
  const { error } = await supabase!.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<void> {
  if (IS_DEMO) {
    setDemo(true);
    return;
  }
  const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) return setDemo(false);
  await supabase!.auth.signOut();
}

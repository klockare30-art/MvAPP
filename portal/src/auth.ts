import { DEMO_COACH, DEMO_USER, IS_DEMO } from './demo';
import { supabase } from './supabase';

export interface PortalUser {
  id: string;
  email: string;
}

type Listener = (u: PortalUser | null) => void;
const DEMO_KEY = 'gv-demo-session';
const demoListeners = new Set<Listener>();

// Demo: an e-mail starting with "tranare" logs in as the coach, anything else as goaltender Erik.
const demoFor = (role: string | null): PortalUser | null => (role === 'coach' ? DEMO_COACH : role ? DEMO_USER : null);

function demoUser(): PortalUser | null {
  try {
    return demoFor(localStorage.getItem(DEMO_KEY));
  } catch {
    return null;
  }
}
function setDemo(role: 'coach' | 'goalie' | null) {
  try {
    if (role) localStorage.setItem(DEMO_KEY, role);
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    // ignore
  }
  demoListeners.forEach((l) => l(demoFor(role)));
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
    setDemo(/^tranare/i.test(email.trim()) ? 'coach' : 'goalie');
    return;
  }
  const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) return setDemo(null);
  await supabase!.auth.signOut();
}

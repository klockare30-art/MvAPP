import { DEMO_COACH, DEMO_USER, IS_DEMO } from './demo';
import { supabase } from './supabase';

export interface PortalUser {
  id: string;
  email: string;
  /** Signed up as a coach (portal "Tränare" tab) – the coach profile is created on first login. */
  wantsCoach?: boolean;
}

type SupaUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
const toPortalUser = (u: SupaUser): PortalUser => ({ id: u.id, email: u.email ?? '', wantsCoach: u.user_metadata?.role === 'coach' });

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
  return u ? toPortalUser(u) : null;
}

export function onUserChange(l: Listener): () => void {
  if (IS_DEMO) {
    demoListeners.add(l);
    return () => demoListeners.delete(l);
  }
  const { data } = supabase!.auth.onAuthStateChange((_e, s) => l(s ? toPortalUser(s.user) : null));
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

/**
 * Sets a password on the signed-in account, so the same account can log in to
 * the iPad app (which uses e-mail + password). The portal itself keeps using codes.
 */
export async function setAccountPassword(password: string): Promise<void> {
  if (password.length < 10) throw new Error('Välj ett lösenord med minst 10 tecken.');
  if (IS_DEMO) return;
  const { error } = await supabase!.auth.updateUser({ password });
  if (!error) return;
  if (/reauthenticat/i.test(error.message)) {
    throw new Error('Supabase kräver ny inloggning för lösenordsbyte. Logga ut, logga in igen med koden och försök direkt efteråt.');
  }
  if (/weak|pwned|leaked|compromised/i.test(error.message)) {
    throw new Error('Lösenordet är för svagt eller har läckt tidigare. Välj ett annat.');
  }
  throw new Error(`Lösenordet kunde inte sparas: ${error.message}`);
}

/** Coach login with e-mail + password (the default for coaches; goaltenders use codes). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (IS_DEMO) {
    setDemo('coach');
    return;
  }
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/not confirmed/i.test(error.message)) throw new Error('Bekräfta e-postadressen först: klicka på länken i mejlet du fick när kontot skapades.');
    throw new Error('Fel e-post eller lösenord. Har du inget lösenord än? Logga in med kod och sätt ett i Kontrollpanelen.');
  }
}

/** New coach account with password. Supabase sends a confirmation e-mail before the first login. */
export async function signUpCoach(email: string, password: string): Promise<'confirm-email' | 'signed-in'> {
  if (password.length < 10) throw new Error('Välj ett lösenord med minst 10 tecken.');
  if (IS_DEMO) {
    setDemo('coach');
    return 'signed-in';
  }
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { role: 'coach' }, emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) {
    if (/weak|pwned|leaked|compromised/i.test(error.message)) throw new Error('Lösenordet är för svagt eller har läckt tidigare. Välj ett annat.');
    throw new Error(`Kontot kunde inte skapas: ${error.message}`);
  }
  // Supabase does not reveal whether the address already exists; an existing user gets no new identity.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Det finns redan ett konto med den e-postadressen. Logga in med lösenord, eller med kod om du inte har satt något lösenord.');
  }
  return data.session ? 'signed-in' : 'confirm-email';
}

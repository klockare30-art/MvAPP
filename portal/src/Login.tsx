import { useState, type FormEvent } from 'react';

import { supabase } from './supabase';

/**
 * Passwordless login. The e-mail contains both a link and a 6-digit code; the
 * code helps when the link opens in a different browser than the one the
 * goaltender started in (common with mail apps on phones).
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (err) setError('Kunde inte skicka inloggningsmejlet. Kontrollera adressen och försök igen.');
    else setStep('code');
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (err) setError('Koden stämmer inte eller har gått ut. Begär en ny kod.');
  };

  return (
    <main className="center">
      <div className="card narrow">
        <div className="brand">
          <span className="logo" aria-hidden>●</span>
          <div>
            <h1>GoalieVision</h1>
            <p className="muted">Målvaktsportal</p>
          </div>
        </div>
        {step === 'email' ? (
          <form onSubmit={send} className="stack">
            <p>Logga in med e-postadressen som din målvaktstränare har registrerat.</p>
            <label className="field">
              <span>E-post</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Skickar…' : 'Skicka inloggningslänk'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p>
              Vi har skickat ett mejl till <strong>{email}</strong>. Klicka på länken i mejlet, eller skriv in koden här.
            </p>
            <label className="field">
              <span>Kod från mejlet</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button className="btn primary" disabled={busy || code.trim().length < 6}>
              {busy ? 'Loggar in…' : 'Logga in'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setStep('email')}>
              Använd en annan adress
            </button>
          </form>
        )}
        {error ? <p className="error" role="alert">{error}</p> : null}
        <p className="muted small">
          Videorna är privata och visas bara för dig och din tränare. Saknar du åtkomst? Kontakta din målvaktstränare.
        </p>
      </div>
    </main>
  );
}

import { useState, type FormEvent } from 'react';

import { sendLoginEmail, verifyCode } from './auth';
import { IS_DEMO } from './demo';

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
    setBusy(true);
    setError(null);
    try {
      await sendLoginEmail(email);
      setStep('code');
    } catch {
      setError('Kunde inte skicka inloggningsmejlet. Kontrollera adressen och försök igen.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email, code);
    } catch {
      setError('Koden stämmer inte eller har gått ut. Begär en ny kod.');
    } finally {
      setBusy(false);
    }
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
            {IS_DEMO ? <p className="demoHint">Demo: skriv valfri e-postadress.</p> : null}
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
            {IS_DEMO ? <p className="demoHint">Demo: inget mejl skickas – skriv valfri sexsiffrig kod, t.ex. 123456.</p> : null}
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

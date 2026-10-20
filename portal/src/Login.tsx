import { useState, type FormEvent } from 'react';

import { sendLoginEmail, signInWithPassword, signUpCoach, verifyCode } from './auth';
import { IS_DEMO } from './demo';

type Tab = 'goalie' | 'coach';
const TAB_KEY = 'gv-login-tab';

function storedTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'coach' ? 'coach' : 'goalie';
  } catch {
    return 'goalie';
  }
}

/**
 * Two ways in: goaltenders log in without a password (e-mail with link + 6-digit
 * code; the code helps when the link opens in another browser), coaches with
 * e-mail + password by default. The last used tab is remembered on the device.
 */
export function Login() {
  const [tab, setTabState] = useState<Tab>(storedTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignore
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
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'goalie'} className={`tab ${tab === 'goalie' ? 'on' : ''}`} onClick={() => setTab('goalie')}>
            Målvakt
          </button>
          <button role="tab" aria-selected={tab === 'coach'} className={`tab ${tab === 'coach' ? 'on' : ''}`} onClick={() => setTab('coach')}>
            Tränare
          </button>
        </div>
        {tab === 'goalie' ? <CodeLogin /> : <CoachLogin onUseCode={() => setTab('goalie')} />}
        <p className="muted small">
          Videorna är privata och visas bara för målvakten och tränaren. Saknar du åtkomst? Kontakta din målvaktstränare.
        </p>
      </div>
    </main>
  );
}

function CodeLogin() {
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

  return step === 'email' ? (
    <form onSubmit={send} className="stack">
      <p>Logga in med e-postadressen som din målvaktstränare har registrerat. Du får en länk och en kod via mejl.</p>
      {IS_DEMO ? (
        <p className="demoHint">Demo: skriv valfri e-postadress för målvaktens vy, eller en som börjar med "tranare" för tränarens.</p>
      ) : null}
      <label className="field">
        <span>E-post</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy}>
        {busy ? 'Skickar…' : 'Skicka inloggningslänk'}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  ) : (
    <form onSubmit={verify} className="stack">
      <p>
        Vi har skickat ett mejl till <strong>{email}</strong>. Klicka på länken i mejlet, eller skriv in koden här.
      </p>
      {IS_DEMO ? <p className="demoHint">Demo: inget mejl skickas – skriv valfri sexsiffrig kod, t.ex. 123456.</p> : null}
      <label className="field">
        <span>Kod från mejlet</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <button className="btn primary" disabled={busy || code.trim().length < 6}>
        {busy ? 'Loggar in…' : 'Logga in'}
      </button>
      <button type="button" className="btn ghost" onClick={() => setStep('email')}>
        Använd en annan adress
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}

function CoachLogin({ onUseCode }: { onUseCode: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'check-mail'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await signInWithPassword(email, pw);
      } else {
        if (pw !== pw2) throw new Error('Lösenorden är inte lika.');
        const r = await signUpCoach(email, pw);
        if (r === 'confirm-email') setMode('check-mail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'check-mail') {
    return (
      <div className="stack">
        <p>
          Kontot är skapat. Vi har skickat ett mejl till <strong>{email}</strong> – klicka på länken för att bekräfta
          adressen. Därefter loggar du in här med ditt lösenord.
        </p>
        <p className="muted small">Ditt tränarkonto behöver sedan godkännas av administratören innan du kan publicera.</p>
        <button className="btn primary" onClick={() => setMode('login')}>
          Till inloggningen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      <p>{mode === 'login' ? 'Logga in med e-post och lösenord. Samma konto fungerar i iPad-appen.' : 'Skapa ett tränarkonto.'}</p>
      {IS_DEMO ? <p className="demoHint">Demo: valfri e-post och valfritt lösenord på minst 10 tecken.</p> : null}
      <label className="field">
        <span>E-post</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Lösenord{mode === 'signup' ? ' (minst 10 tecken)' : ''}</span>
        <input
          type="password"
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </label>
      {mode === 'signup' ? (
        <label className="field">
          <span>Upprepa lösenordet</span>
          <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
      ) : null}
      <button className="btn primary" disabled={busy || !email || pw.length < (mode === 'signup' ? 10 : 1)}>
        {busy ? 'Vänta…' : mode === 'login' ? 'Logga in' : 'Skapa tränarkonto'}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="linkRow small">
        {mode === 'login' ? (
          <>
            <button type="button" className="link" onClick={() => setMode('signup')}>
              Nytt tränarkonto
            </button>
            <button type="button" className="link" onClick={onUseCode}>
              Glömt lösenord eller inget lösenord? Logga in med kod
            </button>
          </>
        ) : (
          <button type="button" className="link" onClick={() => setMode('login')}>
            Har redan konto – logga in
          </button>
        )}
      </div>
      {mode === 'login' ? (
        <p className="muted small">Med kod kommer du in utan lösenord och kan sedan sätta ett nytt under Kontrollpanel.</p>
      ) : null}
    </form>
  );
}

import { useState } from 'react';

import type { Club, CoachGoaltender, GoaltenderInput, Team } from './publishClip';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Team options grouped by club, for <select>. */
export function TeamOptions({ clubs, teams }: { clubs: Club[]; teams: Team[] }) {
  return (
    <>
      {clubs.map((c) => {
        const own = teams.filter((t) => t.club_id === c.id);
        return own.length > 0 ? (
          <optgroup key={c.id} label={c.name}>
            {own.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.season ? ` (${t.season})` : ''}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}

/**
 * Add or edit a goaltender. Adding requires the coach to confirm consent
 * (goaltender, and guardian if under 18) – the database stores the time.
 */
export function GoalieForm(props: {
  clubs: Club[];
  teams: Team[];
  goalie?: CoachGoaltender;
  defaultTeamId?: string | null;
  onSave: (input: GoaltenderInput) => Promise<void>;
  onCancel: () => void;
}) {
  const g = props.goalie;
  const [first, setFirst] = useState(g?.first_name ?? '');
  const [last, setLast] = useState(g?.last_name ?? '');
  const [jersey, setJersey] = useState(g?.jersey_number != null ? String(g.jersey_number) : '');
  const [email, setEmail] = useState(g?.email ?? '');
  const [teamId, setTeamId] = useState(g ? (g.team_id ?? '') : (props.defaultTeamId ?? ''));
  const [consent, setConsent] = useState(!!g);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jerseyNum = jersey.trim() === '' ? null : Number(jersey);
  const jerseyOk = jerseyNum === null || (Number.isInteger(jerseyNum) && jerseyNum >= 0 && jerseyNum <= 99);
  const valid = first.trim() !== '' && EMAIL.test(email.trim()) && jerseyOk && consent;
  const emailChanged = !!g && g.email.trim().toLowerCase() !== email.trim().toLowerCase();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.onSave({ firstName: first, lastName: last, jerseyNumber: jerseyNum, email, teamId: teamId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="addGoalie">
      <div className="portalFields">
        <label className="field">
          Förnamn
          <input value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label className="field">
          Efternamn
          <input value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
        <label className="field">
          Nummer
          <input inputMode="numeric" value={jersey} onChange={(e) => setJersey(e.target.value)} />
        </label>
        <label className="field">
          E-post (inloggning)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Lag
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Inget lag</option>
            <TeamOptions clubs={props.clubs} teams={props.teams} />
          </select>
        </label>
      </div>
      {emailChanged ? (
        <p className="demoHint small">Ny e-post: målvakten loggar in med den nya adressen. Den gamla förlorar åtkomsten direkt.</p>
      ) : null}
      {!g ? (
        <label className="check small">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Samtycke finns från målvakten (och vårdnadshavare om under 18) till att videor lagras och visas i portalen.
        </label>
      ) : null}
      {error ? <p className="error small">{error}</p> : null}
      <div className="adminActions">
        <button className="btn" onClick={props.onCancel}>
          Avbryt
        </button>
        <button className="btn primary" disabled={busy || !valid} onClick={() => void save()}>
          {busy ? 'Sparar…' : g ? 'Spara' : 'Lägg till målvakt'}
        </button>
      </div>
    </div>
  );
}

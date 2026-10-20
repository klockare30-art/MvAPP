import { useEffect, useState } from 'react';

import { loadTagTypes, saveTagTypes } from './api';
import { setAccountPassword } from './auth';
import { DEFAULT_TAG_TYPES, MAX_TAG_TYPES, RESERVED_KEYS, tagTypeId, tagTypesProblem, type TagType } from './tagging';

const PALETTE = ['#2f7bff', '#f97316', '#a855f7', '#22c55e', '#ef3b3b', '#facc15', '#14b8a6', '#ec4899', '#94a3b8'];

/** First free shortcut for a new tag. */
function freeKey(types: TagType[]): string {
  const used = new Set([...types.map((t) => t.key.toLowerCase()), ...RESERVED_KEYS]);
  return [...'aeghjklnpqtuvwxyzdijmorsc0123456789'].find((k) => !used.has(k)) ?? '';
}

/**
 * Coach control panel (#/kontrollpanel): the coach's own tags with keyboard
 * shortcuts, colours and clip lengths. Saved on the coach's account.
 */
export function ControlPanel() {
  const [types, setTypes] = useState<TagType[] | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTagTypes()
      .then((t) => {
        setTypes(t ?? DEFAULT_TAG_TYPES.map((x) => ({ ...x })));
        setIsDefault(!t);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const edit = (fn: (prev: TagType[]) => TagType[]) => {
    setTypes((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
    setSaved(false);
  };
  const update = (i: number, patch: Partial<TagType>) => edit((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, d: number) =>
    edit((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const problem = types ? tagTypesProblem(types) : null;

  const save = async () => {
    if (!types || problem) return;
    setBusy(true);
    setError(null);
    try {
      await saveTagTypes(types);
      setDirty(false);
      setIsDefault(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>●</span>
          <div>
            <strong>GoalieVision</strong>
            <span className="muted small">Kontrollpanel</span>
          </div>
        </div>
        <div className="topActions">
          <a className="btn" href="#/tagga">
            Tagga match
          </a>
          <a className="btn" href="#/lag">
            Mina lag
          </a>
          <a className="btn ghost" href="#/">
            Till videorna
          </a>
        </div>
      </header>

      <main className="content">
        <h1>Kontrollpanel</h1>
        {types === null && !error ? <div className="spinner" aria-label="Laddar" /> : null}

        {types ? (
          <section className="card">
            <h2>Taggar och kortkommandon</h2>
            <p className="muted small">
              Taggarna används i matchtaggningen. Tryck på tangenten när något händer, så skapas ett klipp med vald längd före
              och efter. {RESERVED_KEYS.map((k) => k.toUpperCase()).join(' och ')} är reserverade för snabbspolning.
              {isDefault ? ' Du använder standardlistan – ändringar sparas på ditt konto.' : ''}
            </p>

            <div className="tagTypeTable">
              <div className="tagTypeRow head small muted">
                <span>Färg</span>
                <span>Namn</span>
                <span>Tangent</span>
                <span>Sek före</span>
                <span>Sek efter</span>
                <span />
              </div>
              {types.map((t, i) => (
                <div key={t.id} className="tagTypeRow">
                  <input type="color" value={t.color} onChange={(e) => update(i, { color: e.target.value })} aria-label="Färg" />
                  <input value={t.label} maxLength={30} onChange={(e) => update(i, { label: e.target.value })} aria-label="Namn" />
                  <input
                    className="keyInput"
                    value={t.key.toUpperCase()}
                    maxLength={1}
                    onChange={(e) => update(i, { key: e.target.value.slice(-1).toLowerCase() })}
                    aria-label="Tangent"
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={t.beforeSec}
                    onChange={(e) => update(i, { beforeSec: Math.round(Number(e.target.value)) })}
                    aria-label="Sekunder före"
                  />
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={t.afterSec}
                    onChange={(e) => update(i, { afterSec: Math.round(Number(e.target.value)) })}
                    aria-label="Sekunder efter"
                  />
                  <span className="rowActions">
                    <button className="link small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Flytta upp">
                      ↑
                    </button>
                    <button className="link small" disabled={i === types.length - 1} onClick={() => move(i, 1)} aria-label="Flytta ner">
                      ↓
                    </button>
                    <button className="link small danger" onClick={() => edit((prev) => prev.filter((_, j) => j !== i))}>
                      Ta bort
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <div className="panelActions">
              <button
                className="btn"
                disabled={types.length >= MAX_TAG_TYPES}
                onClick={() =>
                  edit((prev) => [
                    ...prev,
                    {
                      id: tagTypeId(`ny-tagg-${prev.length + 1}`, prev.map((t) => t.id)),
                      label: '',
                      key: freeKey(prev),
                      color: PALETTE[prev.length % PALETTE.length]!,
                      beforeSec: 6,
                      afterSec: 3,
                    },
                  ])
                }
              >
                + Lägg till tagg
              </button>
              <button
                className="link small"
                onClick={() => {
                  if (window.confirm('Återställ till standardtaggarna? Dina egna taggar ersätts när du sparar.')) {
                    edit(() => DEFAULT_TAG_TYPES.map((x) => ({ ...x })));
                  }
                }}
              >
                Återställ standard
              </button>
              <span className="spacer" />
              {problem && dirty ? <span className="error small">{problem}</span> : null}
              {saved ? <span className="published">✓ Sparat</span> : null}
              <button className="btn primary" disabled={busy || !dirty || !!problem} onClick={() => void save()}>
                {busy ? 'Sparar…' : 'Spara'}
              </button>
            </div>
            <p className="small muted">
              Tar du bort en tagg finns redan gjorda taggar kvar i matcher, men visas som "Borttagen tagg". Byter du namn behålls
              kopplingen.
            </p>
          </section>
        ) : null}

        <PasswordCard />

        {error ? <p className="error" role="alert">{error}</p> : null}
      </main>
    </div>
  );
}

/** Lets a coach who logs in with codes set a password for the iPad app (same account, same teams). */
function PasswordCard() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = pw.length >= 10 && pw === pw2;

  return (
    <section className="card">
      <h2>Lösenord för iPad-appen</h2>
      <p className="muted small">
        Portalen loggar in med kod via mejl. iPad-appen loggar in med e-post och lösenord. Sätt ett lösenord här, så
        loggar du in i appen med <strong>samma e-post</strong> och samma konto – med dina lag och målvakter.
      </p>
      <div className="portalFields">
        <label className="field">
          Nytt lösenord (minst 10 tecken)
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field">
          Upprepa lösenordet
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
      </div>
      {pw2 && pw !== pw2 ? <p className="error small">Lösenorden är inte lika.</p> : null}
      {msg ? <p className={msg.ok ? 'published' : 'error small'}>{msg.text}</p> : null}
      <div className="adminActions">
        <button
          className="btn primary"
          disabled={busy || !valid}
          onClick={() => {
            setBusy(true);
            setMsg(null);
            setAccountPassword(pw)
              .then(() => {
                setMsg({ ok: true, text: '✓ Lösenordet är sparat. Logga in i iPad-appen med din e-post och det här lösenordet.' });
                setPw('');
                setPw2('');
              })
              .catch((e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Sparar…' : 'Spara lösenord'}
        </button>
      </div>
    </section>
  );
}

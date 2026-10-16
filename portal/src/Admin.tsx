import { useCallback, useEffect, useState } from 'react';

import { adminListCoaches, adminSavePlan, adminUpdateCoach, loadPlans } from './api';
import { bytesToGb, formatBytes, formatDate, gbToBytes, localDateIso } from './format';
import type { AdminCoach, CoachStatus, Plan } from './types';

const STATUS_LABEL: Record<CoachStatus, string> = {
  pending: 'Väntar på godkännande',
  active: 'Aktiv',
  suspended: 'Avstängd',
};

function addMonths(iso: string | null, months: number): string {
  const today = localDateIso();
  const base = iso && iso > today ? new Date(`${iso}T12:00:00`) : new Date();
  base.setMonth(base.getMonth() + months);
  return localDateIso(base);
}

/**
 * Admin page (#/admin): approve coaches after payment, choose their level and
 * paid period, and edit the levels. The database enforces who may do this.
 */
export function Admin() {
  const [coaches, setCoaches] = useState<AdminCoach[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([adminListCoaches(), loadPlans()]);
      setCoaches(c);
      setPlans(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const order: Record<CoachStatus, number> = { pending: 0, active: 1, suspended: 2 };
  const sorted = [...(coaches ?? [])].sort((a, b) => order[a.status] - order[b.status]);
  const pending = sorted.filter((c) => c.status === 'pending').length;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>●</span>
          <div>
            <strong>GoalieVision</strong>
            <span className="muted small">Administration</span>
          </div>
        </div>
        <a className="btn ghost" href="#/">
          Till videorna
        </a>
      </header>

      <main className="content">
        {error ? <p className="error" role="alert">{error}</p> : null}
        {coaches === null && !error ? <div className="spinner" aria-label="Laddar" /> : null}

        {coaches ? (
          <>
            <h1>Tränare{pending > 0 ? ` – ${pending} väntar` : ''}</h1>
            <p className="muted">
              En tränare dyker upp här när hen loggat in i iPad-appen. Aktivera efter betalning: välj nivå och betalt
              till och med. Efter det datumet stoppas nya uppladdningar automatiskt; publicerade videor finns kvar.
            </p>
            {sorted.length === 0 ? <div className="card muted">Inga tränare ännu.</div> : null}
            <div className="adminList">
              {sorted.map((c) => (
                <CoachRow key={c.id} coach={c} plans={plans} onSaved={reload} />
              ))}
            </div>

            <h1 className="sectionTitle">Nivåer</h1>
            <p className="muted">
              Gränserna gäller direkt för alla tränare på nivån. Kontrollera att summan ryms i ert Supabase-abonnemang.
            </p>
            <div className="adminList">
              {plans.map((p) => (
                <PlanRow key={p.id} plan={p} onSaved={reload} />
              ))}
              <PlanRow onSaved={reload} />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function CoachRow({ coach, plans, onSaved }: { coach: AdminCoach; plans: Plan[]; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<CoachStatus>(coach.status);
  const [planId, setPlanId] = useState<string>(coach.plan_id ?? '');
  const [paidUntil, setPaidUntil] = useState<string>(coach.paid_until ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === coach.plan_id);
  const expired = coach.status === 'active' && coach.paid_until != null && coach.paid_until < localDateIso();
  const overStorage = plan != null && coach.storage_bytes >= plan.max_storage_bytes;
  const dirty = status !== coach.status || planId !== (coach.plan_id ?? '') || paidUntil !== (coach.paid_until ?? '');

  const save = async (next?: { status: CoachStatus; planId: string; paidUntil: string }) => {
    const v = next ?? { status, planId, paidUntil };
    setBusy(true);
    setError(null);
    try {
      await adminUpdateCoach(coach.id, v.status, v.planId || null, v.paidUntil || null);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // One-click approval: first level, paid one month ahead.
  const approve = () => {
    const v = { status: 'active' as const, planId: planId || plans[0]?.id || '', paidUntil: paidUntil || addMonths(null, 1) };
    setStatus(v.status);
    setPlanId(v.planId);
    setPaidUntil(v.paidUntil);
    void save(v);
  };

  return (
    <div className={`card adminRow ${coach.status}`}>
      <div className="adminHead">
        <div className="meta">
          <strong>{coach.name || coach.email}</strong>
          <span className="muted small">
            {coach.email} · registrerad {formatDate(coach.created_at)}
          </span>
        </div>
        <span className={`badge ${expired ? 'expired' : coach.status}`}>
          {expired ? 'Betaltiden har gått ut' : STATUS_LABEL[coach.status]}
        </span>
      </div>

      <p className="small muted">
        {coach.goaltender_count}
        {plan ? ` av ${plan.max_goaltenders}` : ''} målvakter · {coach.video_count} videor · {formatBytes(coach.storage_bytes)}
        {plan ? ` av ${formatBytes(plan.max_storage_bytes)}` : ''}
        {overStorage ? ' · lagringsgränsen är nådd' : ''}
      </p>

      <div className="adminFields">
        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as CoachStatus)}>
            {(Object.keys(STATUS_LABEL) as CoachStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nivå
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Ingen</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.price_note ? ` (${p.price_note})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Betalt t.o.m.
          <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
        </label>
      </div>

      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="adminActions">
        {coach.status === 'pending' ? (
          <button className="btn primary" disabled={busy || plans.length === 0} onClick={approve}>
            Godkänn (1 månad)
          </button>
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={() => setPaidUntil(addMonths(paidUntil || null, 1))}>
              +1 månad
            </button>
            <button className="btn" disabled={busy} onClick={() => setPaidUntil(addMonths(paidUntil || null, 12))}>
              +1 år
            </button>
          </>
        )}
        <button className="btn primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Sparar…' : 'Spara'}
        </button>
      </div>
    </div>
  );
}

function PlanRow({ plan, onSaved }: { plan?: Plan; onSaved: () => Promise<void> }) {
  const [id, setId] = useState(plan?.id ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [gb, setGb] = useState(plan ? String(bytesToGb(plan.max_storage_bytes)).replace('.', ',') : '');
  const [goalies, setGoalies] = useState(plan ? String(plan.max_goaltenders) : '');
  const [price, setPrice] = useState(plan?.price_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gbNum = Number(gb.replace(',', '.'));
  const goaliesNum = Number(goalies);
  const valid =
    /^[a-z0-9-]{1,40}$/.test(id) && name.trim() !== '' && gbNum >= 0 && gb !== '' && Number.isInteger(goaliesNum) && goaliesNum >= 0 && goalies !== '';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminSavePlan({
        id,
        name: name.trim(),
        max_storage_bytes: gbToBytes(gbNum),
        max_goaltenders: goaliesNum,
        price_note: price.trim(),
        sort_order: plan?.sort_order ?? 100,
      });
      await onSaved();
      if (!plan) {
        setId('');
        setName('');
        setGb('');
        setGoalies('');
        setPrice('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card adminRow">
      {!plan ? <strong>Ny nivå</strong> : null}
      <div className="adminFields">
        {!plan ? (
          <label className="field">
            Kod (a–z, 0–9, -)
            <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="t.ex. plus" />
          </label>
        ) : null}
        <label className="field">
          Namn
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Lagring (GB)
          <input inputMode="decimal" value={gb} onChange={(e) => setGb(e.target.value)} />
        </label>
        <label className="field">
          Max målvakter
          <input inputMode="numeric" value={goalies} onChange={(e) => setGoalies(e.target.value)} />
        </label>
        <label className="field">
          Pris (anteckning)
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="t.ex. 199 kr/mån" />
        </label>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="adminActions">
        <button className="btn primary" disabled={busy || !valid} onClick={() => void save()}>
          {busy ? 'Sparar…' : plan ? 'Spara nivå' : 'Lägg till nivå'}
        </button>
      </div>
    </div>
  );
}

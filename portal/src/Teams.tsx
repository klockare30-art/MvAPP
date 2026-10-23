import { useCallback, useEffect, useState } from 'react';

import {
  addGoaltender,
  becomeCoach,
  deleteClub,
  deleteTeam,
  eraseGoaltender,
  listClubs,
  listMyGoaltenders,
  listTeams,
  myCoachAccount,
  saveClub,
  saveTeam,
  setGoaltenderAccess,
  updateGoaltender,
} from './api';
import { GoalieForm } from './GoalieForm';
import { accountBlocker, goalieLabel, type Club, type CoachAccount, type CoachGoaltender, type Team } from './publishClip';
import { Logo } from './Logo';

type Data = { account: CoachAccount | null; clubs: Club[]; teams: Team[]; goalies: CoachGoaltender[] };

/**
 * The coach's structure (#/lag): clubs → teams → goaltenders.
 * Everything here belongs to the signed-in coach only (enforced by the database).
 */
export function Teams() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newClub, setNewClub] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const account = await myCoachAccount();
      if (!account) {
        setData({ account: null, clubs: [], teams: [], goalies: [] });
        return;
      }
      const [clubs, teams, goalies] = await Promise.all([listClubs(), listTeams(), listMyGoaltenders()]);
      setData({ account, clubs, teams, goalies });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const blocker = data?.account ? accountBlocker(data.account) : null;
  const teamIds = new Set(data?.teams.map((t) => t.id));
  const withoutTeam = data?.goalies.filter((g) => !g.team_id || !teamIds.has(g.team_id)) ?? [];

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <strong>GoalieVision</strong>
            <span className="muted small">Mina lag</span>
          </div>
        </div>
        <div className="topActions">
          <a className="btn" href="#/kontrollpanel">
            Kontrollpanel
          </a>
          <a className="btn" href="#/tagga">
            Tagga match
          </a>
          <a className="btn ghost" href="#/">
            Till videorna
          </a>
        </div>
      </header>

      <main className="content">
        <h1>Klubbar, lag och målvakter</h1>
        {error ? (
          <div className="toast error" role="alert">
            {error}
            <button className="link small" onClick={() => setError(null)}>
              Stäng
            </button>
          </div>
        ) : null}
        {data === null && !error ? <div className="spinner" aria-label="Laddar" /> : null}

        {data && !data.account ? (
          <div className="card stack">
            <p className="muted">Du behöver en tränarprofil. Administratören godkänner den.</p>
            <button className="btn primary alignStart" disabled={busy} onClick={() => void run(() => becomeCoach(''))}>
              Skapa tränarprofil
            </button>
          </div>
        ) : null}

        {data?.account ? (
          <>
            {blocker ? (
              <p className="demoHint">
                {blocker} Du kan bygga upp klubbar och lag redan nu; målvakter kan läggas till när kontot är aktivt.
              </p>
            ) : null}

            <NewTeam clubs={data.clubs} run={run} busy={busy} />

            {data.clubs.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                teams={data.teams.filter((t) => t.club_id === club.id)}
                allClubs={data.clubs}
                allTeams={data.teams}
                goalies={data.goalies}
                canAddGoalies={!blocker}
                run={run}
                busy={busy}
              />
            ))}

            <div className="card addRow">
              <input value={newClub} onChange={(e) => setNewClub(e.target.value)} placeholder="Ny klubb, t.ex. Djurgårdens IF" />
              <button
                className="btn primary"
                disabled={busy || !newClub.trim()}
                onClick={() =>
                  void run(async () => {
                    await saveClub({ name: newClub });
                    setNewClub('');
                  })
                }
              >
                Lägg till klubb
              </button>
            </div>

            {withoutTeam.length > 0 || (data.clubs.length === 0 && !blocker) ? (
              <section className="card">
                <h2>Målvakter utan lag</h2>
                <GoalieList goalies={withoutTeam} clubs={data.clubs} teams={data.teams} run={run} />
                {!blocker ? <AddGoalie clubs={data.clubs} teams={data.teams} teamId={null} run={run} /> : null}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

type Run = (fn: () => Promise<void>) => Promise<void>;

function ClubCard(props: {
  club: Club;
  teams: Team[];
  allClubs: Club[];
  allTeams: Team[];
  goalies: CoachGoaltender[];
  canAddGoalies: boolean;
  run: Run;
  busy: boolean;
}) {
  const { club, run } = props;
  const [name, setName] = useState(club.name);
  const [teamName, setTeamName] = useState('');
  const [season, setSeason] = useState('');

  return (
    <section className="card clubCard">
      <div className="clubHead">
        <input className="clubName" value={name} onChange={(e) => setName(e.target.value)} aria-label="Klubbens namn" />
        {name.trim() && name !== club.name ? (
          <button className="btn small" onClick={() => void run(async () => { await saveClub({ id: club.id, name }); })}>
            Spara namn
          </button>
        ) : null}
        <button
          className="link small"
          onClick={() => {
            if (window.confirm(`Ta bort ${club.name} och dess lag? Målvakterna finns kvar utan lag.`)) void run(() => deleteClub(club.id));
          }}
        >
          Ta bort klubb
        </button>
      </div>

      {props.teams.map((team) => (
        <TeamBlock
          key={team.id}
          team={team}
          clubs={props.allClubs}
          teams={props.allTeams}
          goalies={props.goalies.filter((g) => g.team_id === team.id)}
          canAddGoalies={props.canAddGoalies}
          run={run}
        />
      ))}

      <div className="addRow">
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nytt lag, t.ex. J18" />
        <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Säsong, t.ex. 2026/27" className="seasonInput" />
        <button
          className="btn"
          disabled={props.busy || !teamName.trim()}
          onClick={() =>
            void run(async () => {
              await saveTeam({ clubId: club.id, name: teamName, season });
              setTeamName('');
              setSeason('');
            })
          }
        >
          Lägg till lag
        </button>
      </div>
    </section>
  );
}

function TeamBlock(props: { team: Team; clubs: Club[]; teams: Team[]; goalies: CoachGoaltender[]; canAddGoalies: boolean; run: Run }) {
  const { team, run } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [season, setSeason] = useState(team.season);

  return (
    <div className="teamBlock">
      {editing ? (
        <div className="addRow">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Lagets namn" />
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Säsong" className="seasonInput" />
          <button className="btn" onClick={() => setEditing(false)}>
            Avbryt
          </button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() =>
              void run(async () => {
                await saveTeam({ id: team.id, clubId: team.club_id, name, season });
                setEditing(false);
              })
            }
          >
            Spara
          </button>
        </div>
      ) : (
        <div className="teamHead">
          <h2>
            {team.name}
            {team.season ? <span className="muted small"> · {team.season}</span> : null}
          </h2>
          <span className="muted small">{props.goalies.length} {props.goalies.length === 1 ? 'målvakt' : 'målvakter'}</span>
          <button className="link small" onClick={() => setEditing(true)}>
            Ändra
          </button>
          <button
            className="link small"
            onClick={() => {
              if (window.confirm(`Ta bort laget ${team.name}? Målvakterna finns kvar utan lag.`)) void run(() => deleteTeam(team.id));
            }}
          >
            Ta bort
          </button>
        </div>
      )}
      <GoalieList goalies={props.goalies} clubs={props.clubs} teams={props.teams} run={run} />
      {props.canAddGoalies ? <AddGoalie clubs={props.clubs} teams={props.teams} teamId={team.id} run={run} /> : null}
    </div>
  );
}

function AddGoalie(props: { clubs: Club[]; teams: Team[]; teamId: string | null; run: Run }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="link small addGoalieLink" onClick={() => setOpen(true)}>
        + Lägg till målvakt
      </button>
    );
  }
  return (
    <GoalieForm
      clubs={props.clubs}
      teams={props.teams}
      defaultTeamId={props.teamId}
      onCancel={() => setOpen(false)}
      onSave={async (input) => {
        await addGoaltender(input);
        setOpen(false);
        await props.run(async () => undefined);
      }}
    />
  );
}

function GoalieList(props: { goalies: CoachGoaltender[]; clubs: Club[]; teams: Team[]; run: Run }) {
  const [editId, setEditId] = useState<string | null>(null);
  if (props.goalies.length === 0) return <p className="small muted">Inga målvakter.</p>;
  return (
    <ul className="goalieList">
      {props.goalies.map((g) =>
        editId === g.id ? (
          <li key={g.id}>
            <GoalieForm
              clubs={props.clubs}
              teams={props.teams}
              goalie={g}
              onCancel={() => setEditId(null)}
              onSave={async (input) => {
                await updateGoaltender(g.id, input);
                setEditId(null);
                await props.run(async () => undefined);
              }}
            />
          </li>
        ) : (
          <li key={g.id} className={g.access_revoked_at ? 'revoked' : ''}>
            <div className="meta">
              <strong>{goalieLabel(g)}</strong>
              <span className="muted small">
                {g.email} ·{' '}
                {g.access_revoked_at ? 'åtkomst avstängd' : g.user_id ? 'har loggat in' : 'har inte loggat in än'}
              </span>
            </div>
            <div className="goalieActions">
              <button className="link small" onClick={() => setEditId(g.id)}>
                Ändra
              </button>
              <button
                className="link small"
                onClick={() => void props.run(() => setGoaltenderAccess(g.id, !!g.access_revoked_at))}
              >
                {g.access_revoked_at ? 'Slå på åtkomst' : 'Stäng av åtkomst'}
              </button>
              <button
                className="link small danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Radera ${goalieLabel(g)} helt? Alla publicerade videor och kommentarer tas bort. Det går inte att ångra.`,
                    )
                  ) {
                    void props.run(() => eraseGoaltender(g.id));
                  }
                }}
              >
                Radera
              </button>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}

/** Always-visible "new team" form: pick a club or type a new one (no club needed beforehand). */
function NewTeam(props: { clubs: Club[]; run: Run; busy: boolean }) {
  const NEW = '__new__';
  const [clubId, setClubId] = useState(props.clubs[0]?.id ?? NEW);
  const [clubName, setClubName] = useState('');
  const [name, setName] = useState('');
  const [season, setSeason] = useState('');
  const choice = props.clubs.some((c) => c.id === clubId) ? clubId : NEW;
  const valid = name.trim() !== '' && (choice !== NEW || clubName.trim() !== '');

  return (
    <section className="card newTeam">
      <h2>Nytt lag</h2>
      <div className="portalFields">
        <label className="field">
          Klubb
          <select value={choice} onChange={(e) => setClubId(e.target.value)}>
            {props.clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW}>+ Ny klubb…</option>
          </select>
        </label>
        {choice === NEW ? (
          <label className="field">
            Klubbens namn
            <input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="t.ex. Djurgårdens IF" />
          </label>
        ) : null}
        <label className="field">
          Lag
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. J18" />
        </label>
        <label className="field">
          Säsong (valfri)
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="t.ex. 2026/27" />
        </label>
      </div>
      <div className="adminActions">
        <button
          className="btn primary"
          disabled={props.busy || !valid}
          onClick={() =>
            void props.run(async () => {
              const id = choice === NEW ? await saveClub({ name: clubName }) : choice;
              await saveTeam({ clubId: id, name, season });
              setClubId(id);
              setClubName('');
              setName('');
              setSeason('');
            })
          }
        >
          Skapa lag
        </button>
      </div>
    </section>
  );
}

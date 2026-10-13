import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorText, Field, Loading, Row, Screen, SectionTitle, SelectTile } from '@/components/ui';
import {
  goaltenderShortLabel,
  type Exercise,
  type FocusArea,
  type Goaltender,
  type Id,
  type Team,
  type TrainingSessionDetails,
} from '@/domain/types';
import { findOrCreateExercise, findOrCreateFocusArea, listExercises, listFocusAreas } from '@/repositories/focusAreas';
import { listAllMemberships, listGoaltenders } from '@/repositories/goaltenders';
import { createSession, getSessionDetails, updateSession } from '@/repositories/sessions';
import { listTeams } from '@/repositories/teams';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';
import { parseLocalDateTime, toDateInput, toTimeInput } from '@/utils/time';

function toggle(list: Id[], id: Id): Id[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function EditSessionScreen() {
  const { id, teamId: teamParam } = useLocalSearchParams<{ id?: string; teamId?: string }>();
  const { data: base, loading } = useDbQuery(async (d) => {
    const [teams, focusAreas, exercises, allGoalies, memberships, existing] = await Promise.all([
      listTeams(d),
      listFocusAreas(d),
      listExercises(d),
      listGoaltenders(d),
      listAllMemberships(d),
      id ? getSessionDetails(d, id) : Promise.resolve(null),
    ]);
    return { teams, focusAreas, exercises, allGoalies, memberships, existing };
  }, [id]);

  if (loading && !base) return <Loading />;
  if (!base) return null;
  return <SessionForm id={id} teamParam={teamParam} base={base} />;
}

interface FormBase {
  teams: Team[];
  focusAreas: FocusArea[];
  exercises: Exercise[];
  allGoalies: Goaltender[];
  memberships: Map<Id, Id[]>;
  existing: TrainingSessionDetails | null;
}

function teamGoalieIds(base: FormBase, teamId: Id): Id[] {
  return base.allGoalies.filter((g) => (base.memberships.get(g.id) ?? []).includes(teamId)).map((g) => g.id);
}

function SessionForm({ id, teamParam, base }: { id?: string; teamParam?: string; base: FormBase }) {
  const { db, trainer } = useApp();
  const editing = !!id;
  const s = base.existing;
  const initialTeam = s?.teamId ?? teamParam ?? (base.teams.length === 1 ? (base.teams[0]?.id ?? null) : null);
  const initialTeamName = base.teams.find((t) => t.id === initialTeam)?.name;
  const [initialDate] = useState(() => {
    const d = s ? new Date(s.scheduledAt) : new Date(Math.ceil(new Date().getTime() / 900_000) * 900_000);
    return { date: toDateInput(d), time: toTimeInput(d) };
  });

  const [teamId, setTeamId] = useState<Id | null>(initialTeam);
  const [goalieIds, setGoalieIds] = useState<Id[]>(
    s ? s.participants.map((g) => g.id) : initialTeam ? teamGoalieIds(base, initialTeam) : [],
  );
  const [focusIds, setFocusIds] = useState<Id[]>(s ? s.focusAreas.map((f) => f.id) : []);
  const [exerciseIds, setExerciseIds] = useState<Id[]>(s ? s.exercises.map((e) => e.id) : []);
  const [title, setTitle] = useState(s?.title ?? (initialTeamName ? `Målvaktsträning ${initialTeamName}` : ''));
  const [titleTouched, setTitleTouched] = useState(!!s);
  const [date, setDate] = useState(initialDate.date);
  const [time, setTime] = useState(initialDate.time);
  const [notes, setNotes] = useState(s?.notes ?? '');
  const [newFocus, setNewFocus] = useState('');
  const [newExercise, setNewExercise] = useState<Record<Id, string>>({});
  const [showAllGoalies, setShowAllGoalies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectTeam = (tid: Id) => {
    setTeamId(tid);
    // For a new session, picking a team preselects its goaltenders and suggests a title.
    if (!editing) setGoalieIds(teamGoalieIds(base, tid));
    const t = base.teams.find((x) => x.id === tid);
    if (!titleTouched && t) setTitle(`Målvaktsträning ${t.name}`);
  };

  const goalieChoices = useMemo(() => {
    if (showAllGoalies || !teamId) return base.allGoalies;
    // Team goalies plus any already-selected outsiders.
    const ids = new Set(teamGoalieIds(base, teamId));
    return base.allGoalies.filter((g) => ids.has(g.id) || goalieIds.includes(g.id));
  }, [base, showAllGoalies, teamId, goalieIds]);

  const addFocusArea = async () => {
    try {
      const fa = await findOrCreateFocusArea(db, newFocus, trainer.id);
      setFocusIds((ids) => (ids.includes(fa.id) ? ids : [...ids, fa.id]));
      setNewFocus('');
      notifyDataChanged();
    } catch (e) {
      Alert.alert('Kunde inte lägga till', e instanceof Error ? e.message : String(e));
    }
  };

  const addExercise = async (focusAreaId: Id) => {
    try {
      const ex = await findOrCreateExercise(db, focusAreaId, newExercise[focusAreaId] ?? '');
      setExerciseIds((ids) => (ids.includes(ex.id) ? ids : [...ids, ex.id]));
      setNewExercise((m) => ({ ...m, [focusAreaId]: '' }));
      notifyDataChanged();
    } catch (e) {
      Alert.alert('Kunde inte lägga till', e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setError(null);
    const when = parseLocalDateTime(date, time);
    if (!when) {
      setError('Ogiltigt datum eller klockslag. Använd formatet ÅÅÅÅ-MM-DD och TT:MM.');
      return;
    }
    if (!teamId) {
      setError('Välj ett lag.');
      return;
    }
    // Keep only exercises whose focus area is still selected.
    const validExercises = exerciseIds.filter((eid) => {
      const ex = base.exercises.find((e) => e.id === eid);
      return ex ? focusIds.includes(ex.focusAreaId) : false;
    });
    const input = {
      teamId,
      trainerId: trainer.id,
      title,
      scheduledAt: when.toISOString(),
      notes,
      goaltenderIds: goalieIds,
      focusAreaIds: focusIds,
      exerciseIds: validExercises,
    };
    setSaving(true);
    try {
      if (editing && id) {
        await updateSession(db, id, input);
        notifyDataChanged();
        router.back();
      } else {
        const newId = await createSession(db, input);
        notifyDataChanged();
        router.replace(`/sessions/${newId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={editing ? 'Redigera träning' : 'Ny träning'}
      subtitle="Förbered allt i förväg – i ishallen trycker du bara på Starta"
      onBack={() => router.back()}
      actions={<Button title="Spara träning" icon="checkmark" onPress={save} loading={saving} />}
    >
      <ErrorText>{error}</ErrorText>

      <SectionTitle>1. Lag</SectionTitle>
      {base.teams.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Inga lag ännu"
          action={<Button title="Skapa lag" icon="add" onPress={() => router.push('/teams/edit')} />}
        />
      ) : (
        <Row>
          {base.teams.map((t) => (
            <SelectTile
              key={t.id}
              label={t.name}
              sublabel={[t.clubName, t.season].filter(Boolean).join(' · ')}
              selected={t.id === teamId}
              accent="blue"
              style={{ minWidth: 260 }}
              minHeight={72}
              onPress={() => selectTeam(t.id)}
            />
          ))}
        </Row>
      )}

      <SectionTitle
        right={
          <Button
            title={showAllGoalies ? 'Visa lagets målvakter' : 'Visa alla målvakter'}
            variant="ghost"
            size="compact"
            onPress={() => setShowAllGoalies((v) => !v)}
          />
        }
      >
        2. Deltagande målvakter
      </SectionTitle>
      {teamId && goalieChoices.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Laget har inga registrerade målvakter.</Text>
          <Button
            title="Lägg till målvakt"
            icon="person-add"
            variant="secondary"
            onPress={() => router.push({ pathname: '/goalies/edit', params: { teamId } })}
          />
        </Card>
      ) : null}
      <Row>
        {goalieChoices.map((g) => (
          <SelectTile
            key={g.id}
            label={goaltenderShortLabel(g)}
            sublabel={g.lastName || null}
            selected={goalieIds.includes(g.id)}
            accent="blue"
            style={{ minWidth: 220 }}
            minHeight={72}
            onPress={() => setGoalieIds((ids) => toggle(ids, g.id))}
          />
        ))}
      </Row>

      <SectionTitle>3. Fokusområden</SectionTitle>
      <Row>
        {base.focusAreas.map((f) => (
          <Chip key={f.id} label={f.name} selected={focusIds.includes(f.id)} onPress={() => setFocusIds((ids) => toggle(ids, f.id))} />
        ))}
      </Row>
      <Row>
        <Field label="Nytt fokusområde" value={newFocus} onChangeText={setNewFocus} placeholder="t.ex. Skottläsning" onSubmitEditing={addFocusArea} returnKeyType="done" />
        <Button title="Lägg till" icon="add" variant="secondary" onPress={addFocusArea} disabled={!newFocus.trim()} style={{ alignSelf: 'flex-end' }} />
      </Row>

      <SectionTitle>4. Övningar (valfritt)</SectionTitle>
      {focusIds.length === 0 ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>Välj fokusområden först.</Text>
      ) : null}
      {focusIds.map((fid) => {
        const fa = base.focusAreas.find((f) => f.id === fid);
        if (!fa) return null;
        const exs = base.exercises.filter((e) => e.focusAreaId === fid);
        return (
          <Card key={fid}>
            <Text style={[typography.heading, { color: colors.text }]}>{fa.name}</Text>
            <Row gap={spacing.sm}>
              {exs.map((e) => (
                <Chip key={e.id} label={e.name} selected={exerciseIds.includes(e.id)} onPress={() => setExerciseIds((ids) => toggle(ids, e.id))} />
              ))}
            </Row>
            <Row>
              <Field
                label="Ny övning"
                value={newExercise[fid] ?? ''}
                onChangeText={(t) => setNewExercise((m) => ({ ...m, [fid]: t }))}
                placeholder="t.ex. T-push"
                onSubmitEditing={() => addExercise(fid)}
              />
              <Button
                title="Lägg till"
                icon="add"
                variant="secondary"
                onPress={() => addExercise(fid)}
                disabled={!(newExercise[fid] ?? '').trim()}
                style={{ alignSelf: 'flex-end' }}
              />
            </Row>
          </Card>
        );
      })}

      <SectionTitle>5. Namn och tid</SectionTitle>
      <Row>
        <Field
          label="Namn"
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            setTitleTouched(true);
          }}
        />
        <Field label="Datum" value={date} onChangeText={setDate} placeholder="ÅÅÅÅ-MM-DD" keyboardType="numbers-and-punctuation" />
        <Field label="Tid" value={time} onChangeText={setTime} placeholder="TT:MM" keyboardType="numbers-and-punctuation" />
      </Row>
      <Field label="Anteckningar" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 96, paddingTop: 12 }} />

      <View style={{ alignItems: 'flex-end' }}>
        <Button title="Spara träning" icon="checkmark" onPress={save} loading={saving} size="large" />
      </View>
    </Screen>
  );
}

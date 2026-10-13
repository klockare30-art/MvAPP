import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Chip, EmptyState, ErrorText, Row, Screen, SectionTitle } from '@/components/ui';
import { VideoCard } from '@/components/VideoCard';
import { goaltenderShortLabel, type Id } from '@/domain/types';
import { listExercises, listFocusAreas } from '@/repositories/focusAreas';
import { listGoaltenders } from '@/repositories/goaltenders';
import { listSessions } from '@/repositories/sessions';
import { listTeams } from '@/repositories/teams';
import { listVideos } from '@/repositories/videos';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';
import { formatDate } from '@/utils/time';

type Period = 'all' | 'today' | '7d' | '30d' | 'season';

function periodStart(p: Period): string | undefined {
  const now = new Date();
  switch (p) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000).toISOString();
    case 'season': {
      const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
      return new Date(startYear, 7, 1).toISOString();
    }
    default:
      return undefined;
  }
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Allt' },
  { key: 'today', label: 'Idag' },
  { key: '7d', label: '7 dagar' },
  { key: '30d', label: '30 dagar' },
  { key: 'season', label: 'Säsongen' },
];

export default function LibraryScreen() {
  const [goalieId, setGoalieId] = useState<Id | undefined>();
  const [teamId, setTeamId] = useState<Id | undefined>();
  const [sessionId, setSessionId] = useState<Id | undefined>();
  const [focusId, setFocusId] = useState<Id | undefined>();
  const [exerciseId, setExerciseId] = useState<Id | undefined>();
  const [period, setPeriod] = useState<Period>('all');

  const { data: filters } = useDbQuery(async (db) => {
    const [goalies, teams, focusAreas, sessions] = await Promise.all([
      listGoaltenders(db),
      listTeams(db),
      listFocusAreas(db),
      listSessions(db, { limit: 30 }),
    ]);
    return { goalies, teams, focusAreas, sessions: sessions.filter((s) => s.videoCount > 0) };
  }, []);
  const { data: exercises } = useDbQuery((db) => (focusId ? listExercises(db, focusId) : Promise.resolve([])), [focusId]);
  const { data: videos, error } = useDbQuery(
    (db) => listVideos(db, { goaltenderId: goalieId, teamId, sessionId, focusAreaId: focusId, exerciseId, from: periodStart(period) }),
    [goalieId, teamId, sessionId, focusId, exerciseId, period],
  );

  const toggle = <T,>(cur: T | undefined, v: T, set: (x: T | undefined) => void) => set(cur === v ? undefined : v);

  return (
    <Screen title="Videobibliotek" subtitle={`${videos?.length ?? 0} videor`}>
      <ErrorText>{error}</ErrorText>
      <FilterRow label="Målvakt">
        {filters?.goalies.map((g) => (
          <Chip key={g.id} label={goaltenderShortLabel(g)} accent="blue" selected={goalieId === g.id} onPress={() => toggle(goalieId, g.id, setGoalieId)} />
        ))}
      </FilterRow>
      {filters && filters.teams.length > 1 ? (
        <FilterRow label="Lag">
          {filters.teams.map((t) => (
            <Chip key={t.id} label={`${t.name} (${t.clubName})`} accent="blue" selected={teamId === t.id} onPress={() => toggle(teamId, t.id, setTeamId)} />
          ))}
        </FilterRow>
      ) : null}
      <FilterRow label="Fokus">
        {filters?.focusAreas.map((f) => (
          <Chip
            key={f.id}
            label={f.name}
            selected={focusId === f.id}
            onPress={() => {
              toggle(focusId, f.id, setFocusId);
              setExerciseId(undefined);
            }}
          />
        ))}
      </FilterRow>
      {focusId && exercises?.length ? (
        <FilterRow label="Övning">
          {exercises.map((e) => (
            <Chip key={e.id} label={e.name} selected={exerciseId === e.id} onPress={() => toggle(exerciseId, e.id, setExerciseId)} />
          ))}
        </FilterRow>
      ) : null}
      <FilterRow label="Period">
        {PERIODS.map((p) => (
          <Chip key={p.key} label={p.label} accent="blue" selected={period === p.key} onPress={() => setPeriod(p.key)} />
        ))}
      </FilterRow>
      {filters?.sessions.length ? (
        <FilterRow label="Träning">
          {filters.sessions.slice(0, 12).map((s) => (
            <Chip
              key={s.id}
              label={`${formatDate(s.scheduledAt)} ${s.teamName}`}
              accent="blue"
              selected={sessionId === s.id}
              onPress={() => toggle(sessionId, s.id, setSessionId)}
            />
          ))}
        </FilterRow>
      ) : null}

      <SectionTitle>Resultat</SectionTitle>
      {videos && videos.length === 0 ? <EmptyState icon="film-outline" title="Inga videor matchar filtret" /> : null}
      <View style={{ gap: spacing.sm }}>
        {videos?.map((v) => (
          <VideoCard key={v.id} video={v} />
        ))}
      </View>
    </Screen>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      <Text style={[typography.label, { color: colors.textMuted, width: 88, paddingTop: 18 }]}>{label.toUpperCase()}</Text>
      <Row gap={spacing.sm} style={{ flex: 1 }}>
        {children}
      </Row>
    </View>
  );
}

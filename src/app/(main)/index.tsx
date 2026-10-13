import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { SessionCard } from '@/components/SessionCard';
import { Banner, Button, Card, EmptyState, ErrorText, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { VideoCard } from '@/components/VideoCard';
import { listGoaltenders } from '@/repositories/goaltenders';
import { listSessions } from '@/repositories/sessions';
import { listTeams } from '@/repositories/teams';
import { listVideos, videoStorageStats } from '@/repositories/videos';
import { storageLevel } from '@/services/storageEstimate';
import { diskSpace } from '@/services/videoFiles';
import { useApp } from '@/state/AppProvider';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, typography } from '@/theme';
import { formatBytes } from '@/utils/time';

export default function Dashboard() {
  const { recoveredVideoIds, dismissRecoveryNotice } = useApp();
  const { data, error } = useDbQuery(async (db) => {
    const [teams, goalies, active, planned, completed, recent, stats] = await Promise.all([
      listTeams(db),
      listGoaltenders(db),
      listSessions(db, { status: ['active'] }),
      listSessions(db, { status: ['planned'], order: 'asc', limit: 6 }),
      listSessions(db, { status: ['completed'], limit: 4 }),
      listVideos(db, { limit: 6 }),
      videoStorageStats(db),
    ]);
    return { teams, goalies, active, planned, completed, recent, stats };
  }, []);

  let disk: { availableBytes: number } | null = null;
  try {
    disk = diskSpace();
  } catch {
    disk = null;
  }
  const level = disk ? storageLevel(disk.availableBytes) : 'ok';

  return (
    <Screen
      title="Översikt"
      subtitle="Planera, spela in och granska målvaktsträning"
      actions={<Button title="Ny träning" icon="add" onPress={() => router.push('/sessions/edit')} />}
    >
      <ErrorText>{error}</ErrorText>
      {recoveredVideoIds.length ? (
        <Banner
          tone="warning"
          icon="refresh-circle"
          action={<Button title="OK" size="compact" variant="secondary" onPress={dismissRecoveryNotice} />}
        >
          Appen avslutades under en inspelning. {recoveredVideoIds.length} video återställdes och är markerad som
          ”Återställd” – kontrollera att den går att spela upp.
        </Banner>
      ) : null}
      {level !== 'ok' && disk ? (
        <Banner tone={level === 'critical' ? 'danger' : 'warning'} icon="warning">
          Lite ledigt lagringsutrymme: {formatBytes(disk.availableBytes)} kvar. Se Inställningar → Lagring.
        </Banner>
      ) : null}

      {data && data.teams.length === 0 ? (
        <Card>
          <Text style={[typography.heading, { color: colors.text }]}>Kom igång</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            1. Skapa ett lag  →  2. Lägg till målvakter  →  3. Planera en träning  →  4. Spela in på isen
          </Text>
          <Row>
            <Button title="Skapa lag" icon="people" onPress={() => router.push('/teams/edit')} />
            <Button title="Lägg till målvakt" icon="person-add" variant="secondary" onPress={() => router.push('/goalies/edit')} />
          </Row>
        </Card>
      ) : null}

      {data ? (
        <Row>
          <Stat label="Lag" value={data.teams.length} />
          <Stat label="Målvakter" value={data.goalies.length} tone="blue" />
          <Stat label="Videor" value={data.stats.count} tone="green" />
          <Stat label="Videolagring" value={formatBytes(data.stats.bytes)} />
        </Row>
      ) : null}

      {data?.active.length ? (
        <View style={{ gap: 12 }}>
          <SectionTitle>Pågående träning</SectionTitle>
          {data.active.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionTitle right={<Button title="Alla träningar" variant="ghost" size="compact" onPress={() => router.replace('/sessions')} />}>
          Kommande träningar
        </SectionTitle>
        {data && data.planned.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Inga planerade träningar"
            message="Förbered träningen i förväg så att du bara behöver trycka på Starta i ishallen."
            action={<Button title="Planera träning" icon="add" onPress={() => router.push('/sessions/edit')} />}
          />
        ) : null}
        {data?.planned.map((s) => <SessionCard key={s.id} session={s} />)}
      </View>

      {data?.recent.length ? (
        <View style={{ gap: 12 }}>
          <SectionTitle right={<Button title="Videobibliotek" variant="ghost" size="compact" onPress={() => router.replace('/library')} />}>
            Senaste videor
          </SectionTitle>
          {data.recent.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </View>
      ) : null}

      {data?.completed.length ? (
        <View style={{ gap: 12 }}>
          <SectionTitle>Senast avslutade</SectionTitle>
          {data.completed.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

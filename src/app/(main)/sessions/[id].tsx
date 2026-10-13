import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorText, Loading, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { VideoCard } from '@/components/VideoCard';
import { goaltenderShortLabel } from '@/domain/types';
import { completeSession, deleteSession, duplicateSession, getSessionDetails, startSession } from '@/repositories/sessions';
import { listVideos } from '@/repositories/videos';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { useNow } from '@/state/useNow';
import { colors, spacing, typography } from '@/theme';
import { formatDateTime, formatDuration } from '@/utils/time';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useApp();
  const now = useNow(30_000);
  const { data, error, loading } = useDbQuery(async (d) => {
    const [session, videos] = await Promise.all([getSessionDetails(d, id), listVideos(d, { sessionId: id })]);
    return { session, videos };
  }, [id]);

  if (loading && !data) return <Loading />;
  const session = data?.session;
  if (!session) {
    return (
      <Screen title="Träning" onBack={() => router.back()}>
        <ErrorText>{error ?? 'Träningen hittades inte.'}</ErrorText>
      </Screen>
    );
  }
  const videos = data?.videos ?? [];

  const durationMs = session.startedAt
    ? (session.endedAt ? new Date(session.endedAt).getTime() : now) - new Date(session.startedAt).getTime()
    : 0;

  const onDuplicate = async () => {
    try {
      const newId = await duplicateSession(db, session.id, new Date().toISOString());
      notifyDataChanged();
      // Open the copy in edit mode so date/participants can be adjusted before starting.
      router.replace({ pathname: '/sessions/edit', params: { id: newId } });
    } catch (e) {
      Alert.alert('Kunde inte duplicera', e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = () => {
    Alert.alert('Ta bort träning?', 'Träningsplanen tas bort. Detta går inte att ångra.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSession(db, session.id);
            notifyDataChanged();
            router.back();
          } catch (e) {
            Alert.alert('Kunde inte ta bort', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const onComplete = () => {
    Alert.alert('Avsluta träningen?', 'Inspelningarna finns kvar och kan granskas när du vill.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Avsluta',
        onPress: async () => {
          await completeSession(db, session.id);
          notifyDataChanged();
        },
      },
    ]);
  };

  const onReopen = async () => {
    await startSession(db, session.id);
    notifyDataChanged();
  };

  return (
    <Screen
      title={session.title}
      subtitle={`${session.team.clubName} · ${session.team.name} · ${formatDateTime(session.scheduledAt)}`}
      onBack={() => router.back()}
    >
      <Row>
        {session.status !== 'completed' ? (
          <Button
            title={session.status === 'active' ? 'FORTSÄTT INSPELNING' : 'STARTA TRÄNING'}
            icon="videocam"
            variant="record"
            size="large"
            onPress={() => router.push(`/record/${session.id}`)}
            style={{ minWidth: 300 }}
          />
        ) : (
          <Button title="Återuppta träningen" icon="refresh" variant="secondary" onPress={onReopen} />
        )}
        {session.status === 'active' ? <Button title="Avsluta träning" icon="flag-outline" variant="secondary" size="large" onPress={onComplete} /> : null}
        <View style={{ flex: 1 }} />
        <Button title="Redigera" icon="create-outline" variant="secondary" size="compact" onPress={() => router.push({ pathname: '/sessions/edit', params: { id: session.id } })} />
        <Button title="Duplicera" icon="copy-outline" variant="secondary" size="compact" onPress={onDuplicate} />
        {videos.length === 0 ? <Button title="Ta bort" icon="trash-outline" variant="danger" size="compact" onPress={onDelete} /> : null}
      </Row>

      <SectionTitle>Sammanfattning</SectionTitle>
      <Row>
        <Stat label="Träningstid" value={session.startedAt ? formatDuration(durationMs) : '–'} />
        <Stat label="Inspelningar" value={videos.length} tone="green" />
        {session.participants.map((g) => (
          <Stat key={g.id} label={`${goaltenderShortLabel(g)} · videor`} value={videos.filter((v) => v.goaltenderId === g.id).length} tone="blue" />
        ))}
      </Row>

      <SectionTitle>Plan</SectionTitle>
      <Card>
        <Text style={styles.label}>MÅLVAKTER</Text>
        <Text style={styles.value}>{session.participants.map(goaltenderShortLabel).join(', ')}</Text>
        <Text style={[styles.label, { marginTop: spacing.sm }]}>FOKUSOMRÅDEN</Text>
        <Text style={styles.value}>{session.focusAreas.map((f) => f.name).join(', ') || '–'}</Text>
        {session.exercises.length ? (
          <>
            <Text style={[styles.label, { marginTop: spacing.sm }]}>ÖVNINGAR</Text>
            <Text style={styles.value}>
              {session.exercises
                .map((e) => `${session.focusAreas.find((f) => f.id === e.focusAreaId)?.name ?? ''}: ${e.name}`)
                .join(', ')}
            </Text>
          </>
        ) : null}
        {session.notes ? (
          <>
            <Text style={[styles.label, { marginTop: spacing.sm }]}>ANTECKNINGAR</Text>
            <Text style={styles.value}>{session.notes}</Text>
          </>
        ) : null}
      </Card>

      <SectionTitle>Inspelningar</SectionTitle>
      {videos.length === 0 ? (
        <EmptyState icon="videocam-outline" title="Inga inspelningar ännu" message="Starta träningen för att spela in." />
      ) : (
        session.participants.map((g) => {
          const own = videos.filter((v) => v.goaltenderId === g.id);
          if (!own.length) return null;
          return (
            <View key={g.id} style={{ gap: spacing.sm }}>
              <Text style={[typography.heading, { color: colors.text }]}>
                {goaltenderShortLabel(g)} – {own.length} {own.length === 1 ? 'video' : 'videor'}
              </Text>
              {own.map((v) => (
                <VideoCard key={v.id} video={v} showGoalie={false} />
              ))}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = {
  label: { ...typography.label, color: colors.textMuted },
  value: { ...typography.body, color: colors.text },
};

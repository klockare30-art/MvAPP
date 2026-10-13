import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorText, Loading, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { VideoCard } from '@/components/VideoCard';
import { goaltenderDisplayName, type Id } from '@/domain/types';
import { getGoaltender, listGoaltenderTeams } from '@/repositories/goaltenders';
import { countVideosByFocusArea, listVideos } from '@/repositories/videos';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';
import { formatDate } from '@/utils/time';

const NO_FOCUS = '__none__';

export default function GoalieProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [focus, setFocus] = useState<Id | null>(null);

  const { data, error, loading } = useDbQuery(async (db) => {
    const [goalie, teams, byFocus, videos, sessions] = await Promise.all([
      getGoaltender(db, id),
      listGoaltenderTeams(db, id),
      countVideosByFocusArea(db, id),
      listVideos(db, { goaltenderId: id }),
      db.all<{ id: string; title: string; scheduled_at: string; n: number }>(
        `SELECT s.id, s.title, s.scheduled_at, COUNT(v.id) AS n FROM training_sessions s
         JOIN training_participants p ON p.session_id = s.id AND p.goaltender_id = ?
         LEFT JOIN video_recordings v ON v.session_id = s.id AND v.goaltender_id = ?
         GROUP BY s.id ORDER BY s.scheduled_at DESC LIMIT 20`,
        [id, id],
      ),
    ]);
    return { goalie, teams, byFocus, videos, sessions };
  }, [id]);

  if (loading && !data) return <Loading />;
  const g = data?.goalie;
  if (!g || !data) {
    return (
      <Screen title="Målvakt" onBack={() => router.back()}>
        <ErrorText>{error ?? 'Målvakten hittades inte.'}</ErrorText>
      </Screen>
    );
  }

  const shown = data.videos.filter((v) =>
    focus == null ? true : focus === NO_FOCUS ? v.focusAreaId == null : v.focusAreaId === focus,
  );

  return (
    <Screen
      title={`${goaltenderDisplayName(g)}${g.jerseyNumber != null ? ` #${g.jerseyNumber}` : ''}`}
      subtitle={data.teams.map((t) => `${t.clubName} ${t.name}`).join(' · ') || 'Inget lag'}
      onBack={() => router.back()}
      actions={<Button title="Redigera" icon="create-outline" variant="secondary" size="compact" onPress={() => router.push({ pathname: '/goalies/edit', params: { id: g.id } })} />}
    >
      <Row>
        <Stat label="Videor" value={data.videos.length} tone="green" />
        <Stat label="Träningar" value={data.sessions.length} tone="blue" />
        <Stat label="Fokusområden" value={data.byFocus.filter((f) => f.focusAreaId).length} />
      </Row>

      <SectionTitle>Videobibliotek per fokusområde</SectionTitle>
      {data.byFocus.length === 0 ? (
        <EmptyState icon="film-outline" title="Inga videor ännu" />
      ) : (
        <Row gap={spacing.sm}>
          <Chip label={`Alla (${data.videos.length})`} selected={focus == null} onPress={() => setFocus(null)} />
          {data.byFocus.map((f) => (
            <Chip
              key={f.focusAreaId ?? NO_FOCUS}
              label={`${f.focusAreaName ?? 'Utan fokusområde'} – ${f.count}`}
              selected={focus === (f.focusAreaId ?? NO_FOCUS)}
              onPress={() => setFocus(f.focusAreaId ?? NO_FOCUS)}
            />
          ))}
        </Row>
      )}
      <View style={{ gap: spacing.sm }}>
        {shown.map((v) => (
          <VideoCard key={v.id} video={v} showGoalie={false} />
        ))}
      </View>

      {data.sessions.length ? (
        <>
          <SectionTitle>Träningshistorik</SectionTitle>
          <Card>
            {data.sessions.map((s) => (
              <Text
                key={s.id}
                onPress={() => router.push(`/sessions/${s.id}`)}
                style={[typography.body, { color: colors.textSecondary, paddingVertical: 10 }]}
              >
                {formatDate(s.scheduled_at)} · {s.title} · {s.n} videor
              </Text>
            ))}
          </Card>
        </>
      ) : null}
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        Tränarkommentarer och målvaktens egna kommentarer visas här när de införs (fas 3–4).
      </Text>
    </Screen>
  );
}

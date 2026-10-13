import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorText, Screen } from '@/components/ui';
import { listTeams } from '@/repositories/teams';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';

export default function TeamsScreen() {
  const { data, error } = useDbQuery(async (db) => {
    const [teams, counts] = await Promise.all([
      listTeams(db),
      db.all<{ team_id: string; n: number }>('SELECT team_id, COUNT(*) AS n FROM team_memberships GROUP BY team_id'),
    ]);
    return { teams, counts: new Map(counts.map((c) => [c.team_id, c.n])) };
  }, []);

  return (
    <Screen title="Lag" subtitle="Klubbar, lag och säsonger" actions={<Button title="Nytt lag" icon="add" onPress={() => router.push('/teams/edit')} />}>
      <ErrorText>{error}</ErrorText>
      {data && data.teams.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Inga lag ännu"
          message="Exempel: Klubb Borlänge Hockey, lag U16, säsong 2026/2027."
          action={<Button title="Skapa lag" icon="add" onPress={() => router.push('/teams/edit')} />}
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {data?.teams.map((t) => (
          <Card key={t.id} style={{ width: 360 }} onPress={() => router.push(`/teams/${t.id}`)}>
            <Text style={[typography.label, { color: colors.textMuted }]}>{t.clubName.toUpperCase()}</Text>
            <Text style={[typography.title, { color: colors.text }]}>{t.name}</Text>
            <Text style={[typography.body, { color: colors.textSecondary }]}>
              {[t.ageCategory, t.season].filter(Boolean).join(' · ') || '–'}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{data.counts.get(t.id) ?? 0} målvakter</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

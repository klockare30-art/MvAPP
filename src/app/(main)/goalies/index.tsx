import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorText, Screen } from '@/components/ui';
import { goaltenderDisplayName } from '@/domain/types';
import { listAllMemberships, listGoaltenders } from '@/repositories/goaltenders';
import { listTeams } from '@/repositories/teams';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, radius, spacing, typography } from '@/theme';

export default function GoaliesScreen() {
  const { data, error } = useDbQuery(async (db) => {
    const [goalies, teams, memberships, counts] = await Promise.all([
      listGoaltenders(db),
      listTeams(db),
      listAllMemberships(db),
      db.all<{ goaltender_id: string; n: number }>('SELECT goaltender_id, COUNT(*) AS n FROM video_recordings GROUP BY goaltender_id'),
    ]);
    return { goalies, teams, memberships, counts: new Map(counts.map((c) => [c.goaltender_id, c.n])) };
  }, []);

  return (
    <Screen
      title="Målvakter"
      subtitle="Individuella profiler och videobibliotek"
      actions={<Button title="Ny målvakt" icon="person-add" onPress={() => router.push('/goalies/edit')} />}
    >
      <ErrorText>{error}</ErrorText>
      {data && data.goalies.length === 0 ? (
        <EmptyState
          icon="person-outline"
          title="Inga målvakter ännu"
          message="Lägg till målvakter och koppla dem till ett eller flera lag."
          action={<Button title="Lägg till målvakt" icon="person-add" onPress={() => router.push('/goalies/edit')} />}
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {data?.goalies.map((g) => {
          const teamNames = (data.memberships.get(g.id) ?? [])
            .map((tid) => data.teams.find((t) => t.id === tid))
            .filter((t) => !!t)
            .map((t) => t.name);
          return (
            <Card key={g.id} style={{ width: 360 }} onPress={() => router.push(`/goalies/${g.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.accentBlueSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[typography.title, { color: colors.accentBlue }]}>{g.jerseyNumber ?? '–'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
                    {goaltenderDisplayName(g)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {teamNames.join(', ') || 'Inget lag'}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{data.counts.get(g.id) ?? 0} videor</Text>
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

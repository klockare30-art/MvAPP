import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptyState, ErrorText, Loading, Row, Screen, SectionTitle, SelectTile } from '@/components/ui';
import { goaltenderShortLabel } from '@/domain/types';
import { listGoaltenders } from '@/repositories/goaltenders';
import { addMembership, getTeam, listTeamGoaltenders, removeMembership } from '@/repositories/teams';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { spacing } from '@/theme';

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useApp();
  const { data, error, loading } = useDbQuery(async (d) => {
    const [team, members, all] = await Promise.all([getTeam(d, id), listTeamGoaltenders(d, id), listGoaltenders(d)]);
    return { team, members, all };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (!data?.team) {
    return (
      <Screen title="Lag" onBack={() => router.back()}>
        <ErrorText>{error ?? 'Laget hittades inte.'}</ErrorText>
      </Screen>
    );
  }
  const team = data.team;
  const memberIds = new Set(data.members.map((g) => g.id));

  const toggle = async (goalieId: string) => {
    if (memberIds.has(goalieId)) await removeMembership(db, team.id, goalieId);
    else await addMembership(db, team.id, goalieId);
    notifyDataChanged();
  };

  return (
    <Screen
      title={`${team.clubName} ${team.name}`}
      subtitle={[team.ageCategory, team.season].filter(Boolean).join(' · ')}
      onBack={() => router.back()}
      actions={
        <>
          <Button title="Redigera" icon="create-outline" variant="secondary" size="compact" onPress={() => router.push({ pathname: '/teams/edit', params: { id: team.id } })} />
          <Button title="Planera träning" icon="calendar" onPress={() => router.push({ pathname: '/sessions/edit', params: { teamId: team.id } })} />
        </>
      }
    >
      <SectionTitle
        right={<Button title="Ny målvakt" icon="person-add" variant="ghost" size="compact" onPress={() => router.push({ pathname: '/goalies/edit', params: { teamId: team.id } })} />}
      >
        Målvakter i laget (tryck för att lägga till / ta bort)
      </SectionTitle>
      {data.all.length === 0 ? (
        <EmptyState
          icon="person-outline"
          title="Inga målvakter registrerade"
          action={<Button title="Lägg till målvakt" icon="person-add" onPress={() => router.push({ pathname: '/goalies/edit', params: { teamId: team.id } })} />}
        />
      ) : null}
      <Row>
        {data.all.map((g) => (
          <SelectTile
            key={g.id}
            label={goaltenderShortLabel(g)}
            sublabel={g.lastName || null}
            selected={memberIds.has(g.id)}
            accent="blue"
            minHeight={72}
            style={{ minWidth: 240 }}
            onPress={() => toggle(g.id)}
          />
        ))}
      </Row>
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

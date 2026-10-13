import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Button, Card, ErrorText, Field, Loading, Row, Screen, SectionTitle, SelectTile } from '@/components/ui';
import type { Goaltender, Id, Team } from '@/domain/types';
import { archiveGoaltender, createGoaltender, getGoaltender, listGoaltenderTeams, updateGoaltender } from '@/repositories/goaltenders';
import { listTeams } from '@/repositories/teams';
import { PortalEraseButton } from '@/features/portal/PortalEraseButton';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';
import { formatDate } from '@/utils/time';

export default function EditGoalieScreen() {
  const { id, teamId } = useLocalSearchParams<{ id?: string; teamId?: string }>();
  const { data, loading } = useDbQuery(async (d) => {
    const [teams, goalie, goalieTeams] = await Promise.all([
      listTeams(d),
      id ? getGoaltender(d, id) : Promise.resolve(null),
      id ? listGoaltenderTeams(d, id) : Promise.resolve([]),
    ]);
    return { teams, goalie, goalieTeams };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (!data) return null;
  return <GoalieForm id={id} data={data} defaultTeamId={teamId} />;
}

function GoalieForm({
  id,
  data,
  defaultTeamId,
}: {
  id?: string;
  data: { teams: Team[]; goalie: Goaltender | null; goalieTeams: Team[] };
  defaultTeamId?: string;
}) {
  const { db } = useApp();
  const g = data.goalie;
  const [firstName, setFirstName] = useState(g?.firstName ?? '');
  const [lastName, setLastName] = useState(g?.lastName ?? '');
  const [jersey, setJersey] = useState(g?.jerseyNumber != null ? String(g.jerseyNumber) : '');
  const [email, setEmail] = useState(g?.email ?? '');
  const [consent, setConsent] = useState(!!g?.publishConsentAt);
  const [teamIds, setTeamIds] = useState<Id[]>(
    g ? data.goalieTeams.map((t) => t.id) : defaultTeamId ? [defaultTeamId] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    const trimmed = jersey.trim();
    const jerseyNumber = trimmed === '' ? null : Number(trimmed);
    if (jerseyNumber != null && Number.isNaN(jerseyNumber)) {
      setError('Tröjnummer måste vara en siffra.');
      return;
    }
    const input = { firstName, lastName, jerseyNumber, email, teamIds, publishConsent: consent };
    setSaving(true);
    try {
      if (id) await updateGoaltender(db, id, input);
      else await createGoaltender(db, input);
      notifyDataChanged();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const archive = () => {
    if (!id) return;
    Alert.alert('Arkivera målvakt?', 'Profilen döljs från listor. Videor och historik finns kvar.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Arkivera',
        style: 'destructive',
        onPress: async () => {
          await archiveGoaltender(db, id);
          notifyDataChanged();
          router.replace('/goalies');
        },
      },
    ]);
  };

  return (
    <Screen
      title={id ? 'Redigera målvakt' : 'Ny målvakt'}
      onBack={() => router.back()}
      actions={
        <>
          {id ? <Button title="Arkivera" icon="archive-outline" variant="danger" size="compact" onPress={archive} /> : null}
          <Button title="Spara" icon="checkmark" onPress={save} loading={saving} />
        </>
      }
    >
      <ErrorText>{error}</ErrorText>
      <Row>
        <Field label="Förnamn *" value={firstName} onChangeText={setFirstName} autoFocus={!id} autoCapitalize="words" />
        <Field label="Efternamn" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <Field label="Tröjnummer" value={jersey} onChangeText={setJersey} keyboardType="number-pad" maxLength={2} />
      </Row>
      <Field
        label="E-post"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        hint="Målvakten loggar in i målvaktsportalen med exakt den här adressen."
      />
      <SectionTitle>Målvaktsportal</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Samtycke till publicering</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Bekräfta att målvakten – och vårdnadshavare om målvakten är under 18 år – har gett samtycke till att
              utvalda videor lagras i molnet och visas i målvaktsportalen. Endast videor du själv publicerar laddas upp.
              Stäng av för att stoppa ny publicering; redan publicerade videor tar du bort från respektive video.
            </Text>
            {g?.publishConsentAt && consent ? (
              <Text style={[typography.caption, { color: colors.accentGreen }]}>Registrerat {formatDate(g.publishConsentAt)}</Text>
            ) : null}
          </View>
          <Switch
            value={consent}
            onValueChange={setConsent}
            trackColor={{ true: colors.accentGreen, false: colors.surfaceRaised }}
            style={{ transform: [{ scale: 1.3 }] }}
            accessibilityLabel="Samtycke till publicering"
          />
        </View>
        {g ? <PortalEraseButton goalie={g} onDone={() => setConsent(false)} /> : null}
      </Card>

      <SectionTitle>Lag</SectionTitle>
      <Row>
        {data.teams.map((t) => (
          <SelectTile
            key={t.id}
            label={t.name}
            sublabel={[t.clubName, t.season].filter(Boolean).join(' · ')}
            selected={teamIds.includes(t.id)}
            accent="blue"
            minHeight={72}
            style={{ minWidth: 260 }}
            onPress={() => setTeamIds((ids) => (ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
          />
        ))}
      </Row>
      <View style={{ alignItems: 'flex-end' }}>
        <Button title="Spara" icon="checkmark" onPress={save} loading={saving} size="large" />
      </View>
    </Screen>
  );
}

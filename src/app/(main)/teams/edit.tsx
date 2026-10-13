import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Loading, Row, Screen, SectionTitle } from '@/components/ui';
import type { Team } from '@/domain/types';
import { archiveTeam, createTeam, getTeam, listClubNames, updateTeam } from '@/repositories/teams';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { currentSeason } from '@/utils/time';

export default function EditTeamScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, loading } = useDbQuery(async (d) => {
    const [team, clubs] = await Promise.all([id ? getTeam(d, id) : Promise.resolve(null), listClubNames(d)]);
    return { team, clubs };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (!data) return null;
  return <TeamForm id={id} data={data} />;
}

function TeamForm({ id, data }: { id?: string; data: { team: Team | null; clubs: string[] } }) {
  const { db } = useApp();
  const t = data.team;
  const [clubName, setClubName] = useState(t?.clubName ?? (data.clubs.length === 1 ? (data.clubs[0] ?? '') : ''));
  const [name, setName] = useState(t?.name ?? '');
  const [ageCategory, setAgeCategory] = useState(t?.ageCategory ?? '');
  const [season, setSeason] = useState(t ? (t.season ?? '') : currentSeason());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!clubName.trim()) {
      setError('Ange klubbens namn.');
      return;
    }
    setSaving(true);
    try {
      const input = { clubName, name, ageCategory, season };
      if (id) {
        await updateTeam(db, id, input);
        notifyDataChanged();
        router.back();
      } else {
        const team = await createTeam(db, input);
        notifyDataChanged();
        router.replace(`/teams/${team.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const archive = () => {
    if (!id) return;
    Alert.alert('Arkivera lag?', 'Laget döljs. Träningar och videor finns kvar.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Arkivera',
        style: 'destructive',
        onPress: async () => {
          await archiveTeam(db, id);
          notifyDataChanged();
          router.replace('/teams');
        },
      },
    ]);
  };

  return (
    <Screen
      title={id ? 'Redigera lag' : 'Nytt lag'}
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
        <Field label="Klubb *" value={clubName} onChangeText={setClubName} placeholder="Borlänge Hockey" autoCapitalize="words" />
        <Field label="Lag *" value={name} onChangeText={setName} placeholder="U16" />
      </Row>
      {data.clubs.length ? (
        <>
          <SectionTitle>Befintliga klubbar</SectionTitle>
          <Row>
            {data.clubs.map((c) => (
              <Chip key={c} label={c} selected={c === clubName} accent="blue" onPress={() => setClubName(c)} />
            ))}
          </Row>
        </>
      ) : null}
      <Row>
        <Field label="Åldersklass" value={ageCategory} onChangeText={setAgeCategory} placeholder="U16" />
        <Field label="Säsong" value={season} onChangeText={setSeason} placeholder="2026/2027" />
      </Row>
      <View style={{ alignItems: 'flex-end' }}>
        <Button title="Spara" icon="checkmark" onPress={save} loading={saving} size="large" />
      </View>
    </Screen>
  );
}

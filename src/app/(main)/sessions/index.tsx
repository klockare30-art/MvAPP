import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SessionCard } from '@/components/SessionCard';
import { Button, Chip, EmptyState, ErrorText, Row, Screen } from '@/components/ui';
import type { SessionStatus } from '@/domain/types';
import { listSessions } from '@/repositories/sessions';
import { useDbQuery } from '@/state/useDbQuery';

const FILTERS: { key: SessionStatus; label: string }[] = [
  { key: 'planned', label: 'Planerade' },
  { key: 'active', label: 'Pågående' },
  { key: 'completed', label: 'Avslutade' },
];

export default function SessionsScreen() {
  const [status, setStatus] = useState<SessionStatus>('planned');
  const { data, error } = useDbQuery(
    (db) => listSessions(db, { status: [status], order: status === 'planned' ? 'asc' : 'desc' }),
    [status],
  );
  return (
    <Screen
      title="Träningar"
      subtitle="Förbered, starta och granska träningspass"
      actions={<Button title="Ny träning" icon="add" onPress={() => router.push('/sessions/edit')} />}
    >
      <Row>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={status === f.key} accent="blue" onPress={() => setStatus(f.key)} />
        ))}
      </Row>
      <ErrorText>{error}</ErrorText>
      {data && data.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Inga träningar här" message="Skapa en ny träning eller duplicera en tidigare." />
      ) : null}
      <View style={{ gap: 12 }}>
        {data?.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </View>
    </Screen>
  );
}

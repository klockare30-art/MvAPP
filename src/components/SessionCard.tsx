import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { SessionListItem } from '@/repositories/sessions';
import { colors, radius, spacing, typography } from '@/theme';
import { formatDate, formatTime, formatWeekday } from '@/utils/time';

import { Button, Card } from './ui';

const STATUS: Record<SessionListItem['status'], { label: string; color: string }> = {
  planned: { label: 'Planerad', color: colors.accentBlue },
  active: { label: 'Pågår', color: colors.recordRed },
  completed: { label: 'Avslutad', color: colors.textMuted },
};

export function SessionCard({ session, showRecord = true }: { session: SessionListItem; showRecord?: boolean }) {
  const st = STATUS[session.status];
  return (
    <Card onPress={() => router.push(`/sessions/${session.id}`)} style={styles.card}>
      <View style={styles.dateBox}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{formatWeekday(session.scheduledAt)}</Text>
        <Text style={[typography.heading, { color: colors.text }]}>{formatDate(session.scheduledAt)}</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>{formatTime(session.scheduledAt)}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={[styles.status, { borderColor: st.color }]}>
            <Text style={[typography.caption, { color: st.color, fontWeight: '800' }]}>{st.label.toUpperCase()}</Text>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {session.clubName} · {session.teamName}
          </Text>
        </View>
        <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
          {session.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <Meta icon="person" text={`${session.participantCount} målvakter`} />
          <Meta icon="film" text={`${session.videoCount} videor`} />
        </View>
      </View>
      {showRecord && session.status !== 'completed' ? (
        <Button
          title={session.status === 'active' ? 'Fortsätt' : 'Starta'}
          icon="videocam"
          variant={session.status === 'active' ? 'record' : 'primary'}
          onPress={() => router.push(`/record/${session.id}`)}
        />
      ) : null}
    </Card>
  );
}

function Meta({ icon, text }: { icon: 'person' | 'film'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={[typography.body, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  dateBox: {
    width: 150,
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  status: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});

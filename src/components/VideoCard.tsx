import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReviewStatus, VideoListItem } from '@/domain/types';
import { colors, radius, spacing, touch, typography } from '@/theme';
import { formatDate, formatDuration, formatTime } from '@/utils/time';

import { tapFeedback } from './ui';

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  not_reviewed: 'Ej granskad',
  keep: 'Behåll',
  edit: 'Redigera',
  delete: 'Radera',
  ready_to_publish: 'Redo att publicera',
  published: 'Publicerad',
};

export function VideoCard({ video, showGoalie = true }: { video: VideoListItem; showGoalie?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Spela video ${video.goaltenderName} ${video.focusAreaName ?? ''}`}
      onPress={() => {
        tapFeedback();
        router.push(`/video/${video.id}`);
      }}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      <View style={styles.thumb}>
        <Ionicons name="play" size={28} color={colors.text} />
        <Text style={styles.duration}>{formatDuration(video.durationMs)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {showGoalie ? (
          <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {video.goaltenderName}
            {video.jerseyNumber != null ? ` #${video.jerseyNumber}` : ''}
          </Text>
        ) : null}
        <Text style={[typography.body, { color: showGoalie ? colors.textSecondary : colors.text }]} numberOfLines={1}>
          {[video.focusAreaName ?? 'Inget fokusområde', video.exerciseName].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {formatDate(video.recordedAt)} {formatTime(video.recordedAt)}
          {video.teamName ? ` · ${video.teamName}` : ''}
          {video.sessionTitle ? ` · ${video.sessionTitle}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {video.kind === 'clip' ? <Tag text="Klipp" color={colors.annotationYellow} /> : null}
        {video.recovered ? <Tag text="Återställd" color={colors.warning} /> : null}
        <Tag text={REVIEW_LABEL[video.reviewStatus]} color={video.reviewStatus === 'not_reviewed' ? colors.textMuted : colors.accentGreen} />
      </View>
    </Pressable>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[typography.caption, { color, fontWeight: '700' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
    minHeight: touch.large,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    width: 112,
    height: 63,
    borderRadius: radius.md,
    backgroundColor: '#05080F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
  },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});

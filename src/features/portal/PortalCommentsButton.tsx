import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field } from '@/components/ui';
import type { VideoListItem } from '@/domain/types';
import { addTrainerComment, fetchPortalComments, type PortalComment } from '@/services/cloud/comments';
import { useCloudSession } from '@/services/cloud/session';
import { colors, radius, spacing, typography } from '@/theme';
import { formatDateTime, formatPosition } from '@/utils/time';

/** Two-way comments with the goaltender, read from the portal (requires network). */
export function PortalCommentsButton({ video }: { video: VideoListItem }) {
  const cloud = useCloudSession();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PortalComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setComments(await fetchPortalComments(video.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [video.id]);

  if (cloud.kind !== 'signedIn' || video.publicationStatus !== 'published') return null;

  return (
    <>
      <Button
        title="Kommentarer"
        icon="chatbubbles-outline"
        variant="secondary"
        size="compact"
        onPress={() => {
          setOpen(true);
          void load();
        }}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} supportedOrientations={['landscape']}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={[typography.title, { color: colors.text, flex: 1 }]}>Kommentarer i portalen</Text>
              <Button title="Stäng" variant="secondary" size="compact" onPress={() => setOpen(false)} />
            </View>
            {error ? <Banner tone="danger" icon="cloud-offline-outline">{error}</Banner> : null}
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: spacing.sm }}>
              {comments?.length === 0 ? (
                <Text style={[typography.body, { color: colors.textSecondary }]}>Inga kommentarer ännu.</Text>
              ) : null}
              {comments?.map((c) => (
                <View key={c.id} style={[styles.comment, { borderLeftColor: c.author_role === 'trainer' ? colors.annotationYellow : colors.accentBlue }]}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {c.author_role === 'trainer' ? 'Tränare' : 'Målvakt'}
                    {c.timestamp_ms != null ? ` · ${formatPosition(c.timestamp_ms)}` : ''} · {formatDateTime(c.created_at)}
                  </Text>
                  <Text style={[typography.body, { color: colors.text }]}>{c.content}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, alignItems: 'flex-end' }}>
              <Field label="Svar till målvakten" value={text} onChangeText={setText} multiline maxLength={2000} />
              <Button
                title="Skicka"
                icon="send"
                loading={sending}
                disabled={!text.trim()}
                onPress={async () => {
                  setSending(true);
                  try {
                    await addTrainerComment(video.id, text, null);
                    setText('');
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSending(false);
                  }
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '70%',
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comment: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4, gap: 4 },
});

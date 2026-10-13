import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/ui';
import type { VideoListItem } from '@/domain/types';
import { getGoaltender } from '@/repositories/goaltenders';
import { publishBlocker, publishVideo, unpublishVideo } from '@/services/cloud/publish';
import { getPortalApi, useCloudSession } from '@/services/cloud/session';
import { useApp } from '@/state/AppProvider';

const KEEP_AWAKE_TAG = 'portal-upload';

/** Publish / unpublish one video to its goaltender's portal account. Hidden when the portal is not configured. */
export function PublishButton({ video }: { video: VideoListItem }) {
  const { db, trainer } = useApp();
  const cloud = useCloudSession();
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (cloud.kind === 'unconfigured' || cloud.kind === 'loading') return null;
  const published = video.publicationStatus === 'published';
  const name = video.goaltenderName.split(' ')[0] ?? video.goaltenderName;

  const doPublish = async () => {
    setBusy(true);
    setProgress(0);
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    try {
      await publishVideo(db, getPortalApi(), video.id, trainer.name, setProgress);
      Alert.alert('Publicerad', `${name} kan nu se videon i målvaktsportalen.`);
    } catch (e) {
      Alert.alert('Publiceringen misslyckades', `${e instanceof Error ? e.message : String(e)}\n\nVideon finns kvar på iPaden.`);
    } finally {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      setBusy(false);
      setProgress(null);
    }
  };

  const onPress = async () => {
    if (cloud.kind !== 'signedIn') {
      Alert.alert('Inte inloggad', 'Logga in på målvaktsportalen under Inställningar för att publicera.', [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Till Inställningar', onPress: () => router.push('/settings') },
      ]);
      return;
    }
    if (published) {
      Alert.alert('Ta bort från portalen?', `${name} kommer inte längre att se videon. Kommentarer i portalen raderas. Videon finns kvar på iPaden.`, [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await unpublishVideo(db, getPortalApi(), video.id);
            } catch (e) {
              Alert.alert('Kunde inte ta bort', e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
      return;
    }
    const blocker = publishBlocker(await getGoaltender(db, video.goaltenderId), video);
    if (blocker) {
      Alert.alert('Kan inte publicera ännu', blocker, [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Öppna profilen', onPress: () => router.push({ pathname: '/goalies/edit', params: { id: video.goaltenderId } }) },
      ]);
      return;
    }
    const mb = Math.max(1, Math.round(video.fileSizeBytes / (1024 * 1024)));
    Alert.alert(
      `Publicera till ${name}?`,
      `Videon (${mb} MB) laddas upp och blir synlig för ${name} i målvaktsportalen. Använd gärna Wi-Fi och håll appen öppen tills uppladdningen är klar.` +
        (video.codec === 'hvc1'
          ? '\n\nObs: videon är inspelad i HEVC och kan inte spelas i alla webbläsare (fungerar i Safari och de flesta nyare datorer).'
          : ''),
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Publicera', onPress: () => void doPublish() },
      ],
    );
  };

  const title =
    progress != null
      ? `Laddar upp ${Math.round(progress * 100)} %`
      : published
        ? `Publicerad till ${name}`
        : video.publicationStatus === 'failed' || video.publicationStatus === 'uploading'
          ? 'Försök publicera igen'
          : `Publicera till ${name}`;

  return (
    <Button
      title={title}
      icon={published ? 'cloud-done-outline' : 'cloud-upload-outline'}
      variant={published ? 'success' : 'secondary'}
      size="compact"
      disabled={busy}
      onPress={() => void onPress()}
    />
  );
}

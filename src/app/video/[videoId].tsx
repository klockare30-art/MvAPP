import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Loading } from '@/components/ui';
import { VideoPlayerPanel } from '@/features/player/VideoPlayerPanel';
import { deleteVideoRow, getVideo } from '@/repositories/videos';
import { deleteVideoFile } from '@/services/videoFiles';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { colors } from '@/theme';

export default function VideoScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { db } = useApp();
  const { data: video, loading } = useDbQuery((d) => getVideo(d, videoId), [videoId]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  if (loading && !video) return <Loading />;
  if (!video) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Button title="Videon finns inte längre – tillbaka" icon="chevron-back" variant="secondary" onPress={close} />
      </SafeAreaView>
    );
  }

  const onDelete = () => {
    Alert.alert(
      'Radera video?',
      `Videon av ${video.goaltenderName} raderas permanent från iPaden. Detta går inte att ångra.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove the row first: a leftover file is harmless (shown under Storage),
              // whereas a row without a file would break playback.
              await deleteVideoRow(db, video.id);
              try {
                deleteVideoFile(video.fileName);
              } catch {
                // Reported as an untracked file in Settings → Storage.
              }
              notifyDataChanged();
              close();
            } catch (e) {
              Alert.alert('Kunde inte radera', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.backgroundElevated }}>
      <StatusBar hidden />
      <VideoPlayerPanel
        video={video}
        closeLabel="Tillbaka"
        closeIcon="chevron-back"
        onClose={close}
        headerExtra={<Button title="Radera" icon="trash-outline" variant="danger" size="compact" onPress={onDelete} />}
      />
    </SafeAreaView>
  );
}

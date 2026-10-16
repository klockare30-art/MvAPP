import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Loading } from '@/components/ui';
import { TrimEditor } from '@/features/trim/TrimEditor';
import { getVideo } from '@/repositories/videos';
import { useDbQuery } from '@/state/useDbQuery';
import { colors } from '@/theme';

export default function TrimScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { data: video, loading } = useDbQuery((d) => getVideo(d, videoId), [videoId]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  if (loading && video === undefined) return <Loading />;
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.backgroundElevated }}>
      <StatusBar hidden />
      {video ? (
        // Keyed by id: after "Ersätt originalet" the source disappears; never re-render with stale data.
        <TrimEditor key={video.id} video={video} onClose={close} />
      ) : (
        <Button title="Videon finns inte längre – tillbaka" icon="chevron-back" variant="secondary" onPress={close} />
      )}
    </SafeAreaView>
  );
}

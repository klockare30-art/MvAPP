import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, StatusBar, Text, View } from 'react-native';

import { Button, Loading } from '@/components/ui';
import { RecordingWorkspace } from '@/features/recording/RecordingWorkspace';
import { getSessionDetails } from '@/repositories/sessions';
import { useApp } from '@/state/AppProvider';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';

export default function RecordScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { recordingSettings } = useApp();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const { data: session, loading, error } = useDbQuery((db) => getSessionDetails(db, sessionId), [sessionId]);

  const exit = () => (router.canGoBack() ? router.back() : router.replace(`/sessions/${sessionId}`));

  if (loading && !session) return <Loading />;
  if (error || !session) {
    return <Message icon="alert-circle" title="Träningen kunde inte laddas" text={error ?? 'Träningen hittades inte.'} onBack={exit} />;
  }
  if (session.participants.length === 0) {
    return <Message icon="people" title="Inga målvakter" text="Lägg till målvakter i träningen innan du spelar in." onBack={exit} />;
  }
  if (!camPerm || (recordingSettings.recordAudio && !micPerm)) return <Loading />;

  const needMic = recordingSettings.recordAudio && !micPerm?.granted;
  if (!camPerm.granted || needMic) {
    const blocked = (!camPerm.granted && !camPerm.canAskAgain) || (needMic && micPerm && !micPerm.canAskAgain);
    return (
      <Message
        icon="videocam"
        title="Kamerabehörighet krävs"
        text={
          blocked
            ? 'Åtkomst till kamera eller mikrofon har nekats. Öppna Inställningar på iPaden och tillåt GoalieVision att använda kameran' +
              (recordingSettings.recordAudio ? ' och mikrofonen.' : '.') +
              (needMic ? ' Du kan också stänga av ljudinspelning i appens inställningar.' : '')
            : 'GoalieVision behöver tillgång till kameran' +
              (recordingSettings.recordAudio ? ' och mikrofonen' : '') +
              ' för att spela in träningen. Videor sparas endast lokalt på iPaden.'
        }
        onBack={exit}
        action={
          blocked ? (
            <Button title="Öppna Inställningar" icon="settings" onPress={() => Linking.openSettings()} />
          ) : (
            <Button
              title="Tillåt åtkomst"
              icon="checkmark"
              onPress={async () => {
                if (!camPerm.granted) await requestCam();
                if (recordingSettings.recordAudio && !micPerm?.granted) await requestMic();
              }}
            />
          )
        }
      />
    );
  }

  return (
    <>
      <StatusBar hidden />
      <RecordingWorkspace session={session} onExit={exit} />
    </>
  );
}

function Message({
  icon,
  title,
  text,
  onBack,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl }}>
      <Ionicons name={icon} size={64} color={colors.accentBlue} />
      <Text style={[typography.title, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', maxWidth: 620 }]}>{text}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Button title="Tillbaka" icon="chevron-back" variant="secondary" onPress={onBack} />
        {action}
      </View>
    </View>
  );
}

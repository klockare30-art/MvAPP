import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Loading } from '@/components/ui';
import { AppProvider } from '@/state/AppProvider';
import { colors, spacing, typography } from '@/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.backgroundElevated,
    border: colors.border,
    primary: colors.accentBlue,
    text: colors.text,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <AppProvider
          renderLoading={() => <Loading />}
          renderError={(message, retry) => (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl }}>
              <Text style={[typography.title, { color: colors.text }]}>Något gick fel vid start</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>{message}</Text>
              <Button title="Försök igen" icon="refresh" onPress={retry} />
            </View>
          )}
        >
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(main)" />
            {/* The recording workspace is a dedicated full-screen modal with swipe-to-dismiss disabled,
                so an accidental gesture can never close the camera mid-recording. */}
            <Stack.Screen name="record/[sessionId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="video/[videoId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="video/trim/[videoId]" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
          </Stack>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

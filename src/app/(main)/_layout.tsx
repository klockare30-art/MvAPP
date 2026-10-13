import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Sidebar } from '@/components/Sidebar';
import { colors } from '@/theme';

/** Landscape iPad shell: persistent navigation rail on the left, content stack on the right. */
export default function MainLayout() {
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <Sidebar />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }} />
      </View>
    </View>
  );
}

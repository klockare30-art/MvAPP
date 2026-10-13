import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/theme';

import { tapFeedback, type IconName } from './ui';

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Översikt', icon: 'speedometer-outline', match: (p) => p === '/' },
  { href: '/sessions', label: 'Träningar', icon: 'calendar-outline', match: (p) => p.startsWith('/sessions') },
  { href: '/goalies', label: 'Målvakter', icon: 'person-outline', match: (p) => p.startsWith('/goalies') },
  { href: '/teams', label: 'Lag', icon: 'people-outline', match: (p) => p.startsWith('/teams') },
  { href: '/library', label: 'Videobibliotek', icon: 'film-outline', match: (p) => p.startsWith('/library') },
  { href: '/settings', label: 'Inställningar', icon: 'settings-outline', match: (p) => p.startsWith('/settings') },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.root}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="eye" size={22} color={colors.text} />
        </View>
        <View>
          <Text style={styles.brandName}>GoalieVision</Text>
          <Text style={styles.brandSub}>Målvaktsträning</Text>
        </View>
      </View>
      <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              onPress={() => {
                tapFeedback();
                // Replace instead of push so the sidebar acts as top-level navigation.
                router.replace(item.href as never);
              }}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && !active && { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons name={item.icon} size={24} color={active ? colors.text : colors.textMuted} />
              <Text style={[styles.itemLabel, active && { color: colors.text }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 240,
    backgroundColor: colors.backgroundElevated,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg, paddingHorizontal: spacing.xs },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { ...typography.heading, color: colors.text },
  brandSub: { ...typography.caption, color: colors.textMuted },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  itemActive: { backgroundColor: colors.surfaceRaised, borderLeftWidth: 4, borderLeftColor: colors.accentBlue },
  itemLabel: { ...typography.bodyStrong, color: colors.textMuted },
});

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, touch, typography } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tapFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record' | 'success';

const VARIANT: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: colors.accentBlue, pressed: '#1F63D6', fg: colors.text, border: colors.accentBlue },
  secondary: { bg: colors.surfaceRaised, pressed: colors.surfacePressed, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.surface, fg: colors.textSecondary, border: 'transparent' },
  danger: { bg: colors.recordRedSoft, pressed: 'rgba(239,59,59,0.3)', fg: '#FF8080', border: colors.recordRed },
  record: { bg: colors.recordRed, pressed: '#C92A2A', fg: colors.text, border: colors.recordRed },
  success: { bg: colors.accentGreen, pressed: '#16A34A', fg: '#04210F', border: colors.accentGreen },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  size = 'regular',
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'regular' | 'large' | 'compact';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = VARIANT[variant];
  const height = size === 'large' ? touch.large : size === 'compact' ? touch.min : touch.regular;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: height,
          backgroundColor: pressed ? v.pressed : v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'large' ? 30 : 24} color={v.fg} /> : null}
          <Text style={[typography.button, { color: v.fg, fontSize: size === 'large' ? 22 : 18 }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  disabled,
  color = colors.text,
  size = touch.min,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={color} />
    </Pressable>
  );
}

/** Large toggle used for goaltender / focus-area / exercise selection. */
export function SelectTile({
  label,
  sublabel,
  selected,
  onPress,
  accent = 'blue',
  disabled,
  minHeight = touch.large,
  style,
  badge,
  solid,
  labelSize,
}: {
  label: string;
  sublabel?: string | null;
  selected: boolean;
  onPress: () => void;
  accent?: 'blue' | 'green';
  disabled?: boolean;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  badge?: string | number | null;
  /** Fill the whole tile with the accent colour when selected (no check icon) — readable at a distance. */
  solid?: boolean;
  labelSize?: number;
}) {
  const strong = accent === 'blue' ? colors.accentBlue : colors.accentGreen;
  const soft = accent === 'blue' ? colors.accentBlueSoft : colors.accentGreenSoft;
  const selectedBg = solid ? strong : soft;
  const selectedFg = solid && accent === 'green' ? '#04210F' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        {
          minHeight,
          borderColor: selected ? strong : colors.border,
          backgroundColor: selected ? selectedBg : pressed ? colors.surfacePressed : colors.surface,
          opacity: disabled && !selected ? 0.45 : 1,
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.tileLabel, labelSize ? { fontSize: labelSize } : null, selected && { color: selectedFg }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.tileSub} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {badge != null ? (
        <View style={[styles.badge, selected && { backgroundColor: solid ? 'rgba(0,0,0,0.25)' : strong }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {selected && !solid ? <Ionicons name="checkmark-circle" size={28} color={strong} /> : null}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accent = 'green',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent?: 'blue' | 'green';
}) {
  const strong = accent === 'blue' ? colors.accentBlue : colors.accentGreen;
  const soft = accent === 'blue' ? colors.accentBlueSoft : colors.accentGreenSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? strong : colors.border,
          backgroundColor: selected ? soft : pressed ? colors.surfacePressed : colors.surface,
        },
      ]}
    >
      {selected ? <Ionicons name="checkmark" size={20} color={strong} /> : null}
      <Text style={[styles.chipText, selected && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  title,
  subtitle,
  actions,
  children,
  scroll = true,
  onBack,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  onBack?: () => void;
}) {
  const header = (
    <View style={styles.header}>
      {onBack ? <IconButton icon="chevron-back" label="Tillbaka" onPress={onBack} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[typography.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
  return (
    <SafeAreaView edges={['top', 'bottom', 'right']} style={styles.screen}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tapFeedback();
          onPress();
        }}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfacePressed }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={56} color={colors.textMuted} />
      <Text style={[typography.heading, { color: colors.text, marginTop: spacing.md }]}>{title}</Text>
      {message ? <Text style={[styles.subtitle, { textAlign: 'center', maxWidth: 520 }]}>{message}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: spacing.xs, flex: 1, minWidth: 220 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accentBlue}
        {...props}
        style={[styles.input, props.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Banner({
  tone,
  icon,
  children,
  action,
}: {
  tone: 'warning' | 'danger' | 'info' | 'success';
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  const palette = {
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.recordRedSoft, fg: '#FF8080' },
    info: { bg: colors.accentBlueSoft, fg: '#8DB6FF' },
    success: { bg: colors.accentGreenSoft, fg: colors.accentGreen },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.fg }]}>
      {icon ? <Ionicons name={icon} size={24} color={palette.fg} /> : null}
      <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{children}</Text>
      {action}
    </View>
  );
}

export function Row({ children, style, gap = spacing.md }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'blue' | 'green' | 'red' }) {
  const color = tone === 'blue' ? colors.accentBlue : tone === 'green' ? colors.accentGreen : tone === 'red' ? colors.recordRed : colors.text;
  return (
    <View style={styles.stat}>
      <Text style={[typography.display, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accentBlue} />
    </View>
  );
}

export function ErrorText({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  return <Banner tone="danger" icon="alert-circle">{children}</Banner>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tileLabel: { ...typography.button, fontSize: 20, color: colors.textSecondary },
  tileSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.bodyStrong, color: colors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touch.min,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  chipText: { ...typography.bodyStrong, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.textMuted },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  input: {
    minHeight: touch.min,
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 18,
  },
  hint: { ...typography.caption, color: colors.textMuted },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  stat: {
    flex: 1,
    minWidth: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statLabel: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});

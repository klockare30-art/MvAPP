import type { TextStyle } from 'react-native';

/**
 * GoalieVision design tokens.
 *
 * The app is used inside ice rinks, often with gloves and cold fingers, so
 * touch targets are deliberately large (minimum 56 pt, primary actions 72+ pt).
 */
export const colors = {
  background: '#0B1220',
  backgroundElevated: '#111A2C',
  surface: '#16213A',
  surfaceRaised: '#1D2A47',
  surfacePressed: '#24345A',
  border: '#2A3A5E',
  borderStrong: '#3A4D78',

  text: '#FFFFFF',
  textSecondary: '#B4C0D9',
  textMuted: '#7D8BA8',

  /** Selected goaltender */
  accentBlue: '#2F7BFF',
  accentBlueSoft: 'rgba(47, 123, 255, 0.18)',
  /** Selected focus area / exercise */
  accentGreen: '#22C55E',
  accentGreenSoft: 'rgba(34, 197, 94, 0.18)',
  /** Recording indicator */
  recordRed: '#EF3B3B',
  recordRedSoft: 'rgba(239, 59, 59, 0.18)',
  /** Video annotations */
  annotationYellow: '#FACC15',

  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  danger: '#EF4444',
  success: '#22C55E',

  overlay: 'rgba(5, 9, 18, 0.72)',
  overlayStrong: 'rgba(5, 9, 18, 0.88)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const touch = {
  /** Absolute minimum for any interactive element. */
  min: 56,
  /** Standard buttons. */
  regular: 64,
  /** Primary actions on the recording screen. */
  large: 88,
} as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '800', letterSpacing: 0.3 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: 0.2 },
  heading: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 17, fontWeight: '500' },
  bodyStrong: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', letterSpacing: 1.1 },
  caption: { fontSize: 13, fontWeight: '500' },
  button: { fontSize: 18, fontWeight: '800', letterSpacing: 0.8 },
  mono: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const theme = { colors, spacing, radius, touch, typography };
export type Theme = typeof theme;

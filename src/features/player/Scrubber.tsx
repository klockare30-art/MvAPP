import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors, radius } from '@/theme';

/**
 * Glove-friendly timeline: a tall touch area (64 pt) with a thin visual track.
 * Tap anywhere to jump; drag to scrub.
 */
export function Scrubber({
  position,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  position: number;
  duration: number;
  onSeek: (sec: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const durRef = useRef(duration);
  const cb = useRef({ onSeek, onScrubStart, onScrubEnd });
  useLayoutEffect(() => {
    widthRef.current = width;
    durRef.current = duration;
    cb.current = { onSeek, onScrubStart, onScrubEnd };
  });
  const [dragPos, setDragPos] = useState<number | null>(null);

  // Handlers only read refs when touches happen, never during render.
  // eslint-disable-next-line react-hooks/refs -- PanResponder handlers read refs only when gestures fire
  const [responder] = useState(() =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          cb.current.onScrubStart?.();
          const t = (e.nativeEvent.locationX / widthRef.current) * durRef.current;
          setDragPos(t);
          cb.current.onSeek(t);
        },
        onPanResponderMove: (e) => {
          const x = Math.max(0, Math.min(widthRef.current, e.nativeEvent.locationX));
          const t = (x / widthRef.current) * durRef.current;
          setDragPos(t);
          cb.current.onSeek(t);
        },
        onPanResponderRelease: () => {
          setDragPos(null);
          cb.current.onScrubEnd?.();
        },
        onPanResponderTerminate: () => {
          setDragPos(null);
          cb.current.onScrubEnd?.();
        },
      }),
  );

  const shown = dragPos ?? position;
  const pct = duration > 0 ? Math.min(1, Math.max(0, shown / duration)) : 0;

  return (
    <View
      style={styles.touch}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Tidslinje"
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: pct * width - 12 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touch: { height: 64, justifyContent: 'center' },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.accentBlue },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    borderWidth: 3,
    borderColor: colors.accentBlue,
  },
});

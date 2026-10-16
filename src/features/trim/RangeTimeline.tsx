import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors, radius } from '@/theme';

import type { ClipRange } from './range';

const HANDLE_W = 44;

/**
 * Timeline with a start and an end handle (wide, glove-friendly) plus the
 * playhead. Dragging a handle reports a new position; tapping the track seeks.
 */
export function RangeTimeline({
  durationMs,
  range,
  positionMs,
  onStart,
  onEnd,
  onSeek,
  onDragBegin,
}: {
  durationMs: number;
  range: ClipRange;
  positionMs: number;
  onStart: (ms: number) => void;
  onEnd: (ms: number) => void;
  onSeek: (ms: number) => void;
  onDragBegin?: () => void;
}) {
  const [width, setWidth] = useState(1);
  const latest = useRef({ width, durationMs, range, onStart, onEnd, onSeek, onDragBegin });
  useLayoutEffect(() => {
    latest.current = { width, durationMs, range, onStart, onEnd, onSeek, onDragBegin };
  });
  const grabX = useRef(0);
  const toMs = (x: number) => {
    const { width: w, durationMs: d } = latest.current;
    return (Math.max(0, Math.min(w, x)) / Math.max(1, w)) * d;
  };
  const toX = (ms: number) => (durationMs > 0 ? (ms / durationMs) * width : 0);

  const makeHandle = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const l = latest.current;
        l.onDragBegin?.();
        grabX.current = ((which === 'start' ? l.range.startMs : l.range.endMs) / Math.max(1, l.durationMs)) * l.width;
      },
      onPanResponderMove: (_e, g) => {
        const ms = toMs(grabX.current + g.dx);
        if (which === 'start') latest.current.onStart(ms);
        else latest.current.onEnd(ms);
      },
    });
  // eslint-disable-next-line react-hooks/refs -- handlers read refs only when gestures fire
  const [startHandle] = useState(() => makeHandle('start'));
  // eslint-disable-next-line react-hooks/refs -- handlers read refs only when gestures fire
  const [endHandle] = useState(() => makeHandle('end'));
  // eslint-disable-next-line react-hooks/refs -- handlers read refs only when gestures fire
  const [track] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => latest.current.onSeek(toMs(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => latest.current.onSeek(toMs(e.nativeEvent.locationX)),
    }),
  );

  const sx = toX(range.startMs);
  const ex = toX(range.endMs);
  return (
    <View style={styles.root} onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width))}>
      <View style={styles.track} {...track.panHandlers} accessibilityLabel="Tidslinje">
        <View pointerEvents="none" style={[styles.dim, { left: 0, width: sx }]} />
        <View pointerEvents="none" style={[styles.selection, { left: sx, width: Math.max(0, ex - sx) }]} />
        <View pointerEvents="none" style={[styles.dim, { left: ex, right: 0 }]} />
        <View pointerEvents="none" style={[styles.playhead, { left: toX(positionMs) - 1.5 }]} />
      </View>
      <View
        {...startHandle.panHandlers}
        accessibilityLabel="Startmarkör"
        style={[styles.handle, { left: sx - HANDLE_W / 2 }]}
      >
        <View style={styles.grip} />
      </View>
      <View {...endHandle.panHandlers} accessibilityLabel="Slutmarkör" style={[styles.handle, { left: ex - HANDLE_W / 2 }]}>
        <View style={styles.grip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 88, justifyContent: 'center', marginHorizontal: HANDLE_W / 2 },
  track: { height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(250, 204, 21, 0.28)',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: colors.annotationYellow,
  },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: colors.text },
  handle: {
    position: 'absolute',
    top: 4,
    width: HANDLE_W,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.annotationYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grip: { width: 6, height: 32, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.45)' },
});

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

export const MAX_ZOOM = 4;

function distance(e: GestureResponderEvent): number | null {
  const t = e.nativeEvent.touches;
  if (t.length < 2 || !t[0] || !t[1]) return null;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
}

/**
 * Pinch-to-zoom and one-finger pan for the paused/playing video, implemented
 * with React Native's built-in responder system (no extra native dependency).
 * Zoom can also be set programmatically through `zoom` for glove-friendly
 * buttons. The transform is applied to the whole child, so any overlay
 * rendered inside stays aligned with the video image.
 */
export function ZoomPanView({
  zoom,
  onZoomChange,
  children,
}: {
  zoom: number;
  onZoomChange: (z: number) => void;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [translate] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const offset = useRef({ x: 0, y: 0 });
  const gesture = useRef<{ startDist: number | null; startZoom: number; panStart: { x: number; y: number } }>({
    startDist: null,
    startZoom: 1,
    panStart: { x: 0, y: 0 },
  });
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  const onZoomChangeRef = useRef(onZoomChange);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    sizeRef.current = size;
    onZoomChangeRef.current = onZoomChange;
  });

  const clamp = (x: number, y: number, z: number) => {
    const maxX = ((z - 1) * sizeRef.current.w) / 2;
    const maxY = ((z - 1) * sizeRef.current.h) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  // Re-clamp the pan offset when zoom is reduced (e.g. via the zoom buttons).
  useEffect(() => {
    const c = clamp(offset.current.x, offset.current.y, zoom);
    if (c.x !== offset.current.x || c.y !== offset.current.y) {
      offset.current = c;
      translate.setValue(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, size]);

  // Handlers only read refs when gestures fire, never during render.
  // eslint-disable-next-line react-hooks/refs -- PanResponder handlers read refs only when gestures fire
  const [responder] = useState(() =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2 || zoomRef.current > 1,
        onMoveShouldSetPanResponder: (e, g) =>
          e.nativeEvent.touches.length >= 2 || (zoomRef.current > 1 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)),
        onPanResponderGrant: (e) => {
          gesture.current = { startDist: distance(e), startZoom: zoomRef.current, panStart: { ...offset.current } };
        },
        onPanResponderMove: (e, g) => {
          const d = distance(e);
          if (d != null) {
            if (gesture.current.startDist == null) {
              gesture.current.startDist = d;
              gesture.current.startZoom = zoomRef.current;
            }
            const z = Math.max(1, Math.min(MAX_ZOOM, gesture.current.startZoom * (d / gesture.current.startDist)));
            onZoomChangeRef.current(z);
            return;
          }
          if (zoomRef.current <= 1) return;
          const next = clamp(gesture.current.panStart.x + g.dx, gesture.current.panStart.y + g.dy, zoomRef.current);
          offset.current = next;
          translate.setValue(next);
        },
        onPanResponderTerminationRequest: () => true,
      }),
  );

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...responder.panHandlers}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale: zoom }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

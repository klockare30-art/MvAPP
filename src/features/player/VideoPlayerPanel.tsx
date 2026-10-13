/* eslint-disable react-hooks/immutability --
 * expo-video's API is imperative by design: seeking and speed changes are done by
 * assigning player properties (player.currentTime = t, player.playbackRate = r).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, tapFeedback } from '@/components/ui';
import type { VideoListItem } from '@/domain/types';
import { updateMediaInfo } from '@/repositories/videos';
import { videoFileExists, videoUri } from '@/services/videoFiles';
import { useApp } from '@/state/AppProvider';
import { colors, radius, spacing, touch, typography } from '@/theme';
import { formatDateTime, formatPosition } from '@/utils/time';

import { clampTime, DEFAULT_FPS, stepFrameTime } from './frameMath';
import { Scrubber } from './Scrubber';
import { ZoomPanView } from './ZoomPanView';

const SPEEDS = [
  { rate: 1, label: '1x' },
  { rate: 0.5, label: '0.5x' },
  { rate: 0.25, label: '0.25x' },
] as const;

const ZOOMS = [1, 2, 3] as const;
const SEEK_STEP_SEC = 5;

/**
 * Full playback workspace used both on the ice (opened from the recording
 * screen) and from the libraries. The video is shown with `contain` fit, so
 * the whole frame is visible regardless of the iPad aspect ratio.
 */
export function VideoPlayerPanel({
  video,
  closeLabel,
  closeIcon = 'close',
  onClose,
  headerExtra,
}: {
  video: VideoListItem;
  closeLabel: string;
  closeIcon?: 'camera' | 'close' | 'chevron-back';
  onClose: () => void;
  headerExtra?: ReactNode;
}) {
  const fileOk = useMemo(() => videoFileExists(video.fileName), [video.fileName]);
  const source = useMemo(() => (fileOk ? { uri: videoUri(video.fileName) } : null), [fileOk, video.fileName]);

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.05;
    p.preservesPitch = true;
    p.loop = false;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const timeUpdate = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const [rate, setRate] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [duration, setDuration] = useState(video.durationMs / 1000);
  const [fps, setFps] = useState<number>(video.frameRate ?? DEFAULT_FPS);
  const [fpsKnown, setFpsKnown] = useState(video.frameRate != null);
  const wasPlayingBeforeScrub = useRef(false);
  const { db } = useApp();
  const mediaInfoSaved = useRef(false);

  // Read real media values once loaded; replace the wall-clock estimate in the database.
  // Triggered by statusChange, with timeUpdate as a fallback in case the
  // local file became ready before the listener was attached.
  const readMediaInfo = () => {
    if (mediaInfoSaved.current) return;
    const d = player.duration;
    if (!(d > 0)) return;
    setDuration(d);
    const track = player.videoTrack;
    if (track?.frameRate) {
      setFps(track.frameRate);
      setFpsKnown(true);
    }
    mediaInfoSaved.current = true;
    updateMediaInfo(db, video.id, {
      durationMs: d * 1000,
      width: track?.size.width ?? null,
      height: track?.size.height ?? null,
      frameRate: track?.frameRate ?? null,
    }).catch(() => undefined);
  };
  useEventListener(player, 'statusChange', ({ status: next }) => {
    if (next === 'readyToPlay') readMediaInfo();
  });
  useEventListener(player, 'timeUpdate', readMediaInfo);

  const position = timeUpdate?.currentTime ?? 0;

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      if (duration > 0 && player.currentTime >= duration - 0.05) player.currentTime = 0;
      player.play();
    }
  }, [player, duration]);

  const seekBy = useCallback(
    (delta: number) => {
      player.currentTime = clampTime(player.currentTime + delta, duration);
    },
    [player, duration],
  );

  const stepFrame = useCallback(
    (delta: number) => {
      // Frame stepping only makes sense while paused.
      if (player.playing) player.pause();
      player.currentTime = stepFrameTime(player.currentTime, delta, fps, duration);
    },
    [player, fps, duration],
  );

  const applyRate = useCallback(
    (r: number) => {
      player.playbackRate = r;
      setRate(r);
    },
    [player],
  );

  const onSeek = useCallback(
    (sec: number) => {
      player.currentTime = clampTime(sec, duration);
    },
    [player, duration],
  );

  if (!fileOk) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Button title={closeLabel} icon={closeIcon} variant="secondary" onPress={onClose} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={64} color={colors.recordRed} />
          <Text style={[typography.title, { color: colors.text, marginTop: spacing.md }]}>Videofilen saknas</Text>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', maxWidth: 560 }]}>
            Metadata finns kvar, men filen hittades inte på enheten. Den kan ha raderats utanför appen.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Button title={closeLabel} icon={closeIcon} variant="primary" size="regular" onPress={onClose} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
            {video.goaltenderName}
            {video.jerseyNumber != null ? ` #${video.jerseyNumber}` : ''}
            {video.focusAreaName ? `  ·  ${video.focusAreaName}` : ''}
            {video.exerciseName ? `  ·  ${video.exerciseName}` : ''}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {formatDateTime(video.recordedAt)}
            {video.kind === 'clip' ? '  ·  Klipp' : ''}
            {video.recovered ? '  ·  Återställd efter avbrott (kan vara ofullständig)' : ''}
          </Text>
        </View>
        {headerExtra}
      </View>

      <View style={styles.videoArea}>
        <ZoomPanView zoom={zoom} onZoomChange={setZoom}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        </ZoomPanView>
        {status === 'error' ? (
          <View style={styles.errorOverlay} pointerEvents="none">
            <Text style={[typography.heading, { color: colors.text }]}>Videon kunde inte spelas upp</Text>
            <Text style={[typography.body, { color: colors.textSecondary }]}>{error?.message ?? ''}</Text>
          </View>
        ) : null}
        <View style={styles.zoomBox}>
          {ZOOMS.map((z) => (
            <SmallToggle key={z} label={`${z}x`} active={Math.abs(zoom - z) < 0.05} onPress={() => setZoom(z)} />
          ))}
          {zoom > 1 && !ZOOMS.some((z) => Math.abs(zoom - z) < 0.05) ? (
            <Text style={styles.zoomLabel}>{zoom.toFixed(1)}x</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatPosition(position * 1000)}</Text>
          <View style={{ flex: 1 }}>
            <Scrubber
              position={position}
              duration={duration}
              onSeek={onSeek}
              onScrubStart={() => {
                wasPlayingBeforeScrub.current = player.playing;
                player.pause();
              }}
              onScrubEnd={() => {
                if (wasPlayingBeforeScrub.current) player.play();
              }}
            />
          </View>
          <Text style={styles.time}>{formatPosition(duration * 1000)}</Text>
        </View>

        <View style={styles.buttonRow}>
          <ControlButton icon="play-back" label={`-${SEEK_STEP_SEC} s`} onPress={() => seekBy(-SEEK_STEP_SEC)} />
          <ControlButton icon="caret-back" label="-1 bild" onPress={() => stepFrame(-1)} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pausa' : 'Spela'}
            onPress={() => {
              tapFeedback();
              togglePlay();
            }}
            style={({ pressed }) => [styles.playButton, pressed && { backgroundColor: '#1F63D6' }]}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={44} color={colors.text} />
          </Pressable>
          <ControlButton icon="caret-forward" label="+1 bild" onPress={() => stepFrame(1)} />
          <ControlButton icon="play-forward" label={`+${SEEK_STEP_SEC} s`} onPress={() => seekBy(SEEK_STEP_SEC)} />

          <View style={styles.divider} />

          {SPEEDS.map((s) => (
            <SpeedButton key={s.rate} label={s.label} active={rate === s.rate} onPress={() => applyRate(s.rate)} />
          ))}
        </View>
        {!fpsKnown ? (
          <Text style={styles.note}>
            Bildsteg använder {DEFAULT_FPS} bilder/s tills videons bildfrekvens har lästs in.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ControlButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.ctrl, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      <Ionicons name={icon} size={30} color={colors.text} />
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

function SpeedButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Hastighet ${label}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.speed,
        active && { backgroundColor: colors.annotationYellow, borderColor: colors.annotationYellow },
        pressed && !active && { backgroundColor: colors.surfacePressed },
      ]}
    >
      <Text style={[typography.button, { color: active ? '#1A1400' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function SmallToggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Zoom ${label}`}
      accessibilityState={{ selected: active }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={[styles.zoomBtn, active && { backgroundColor: colors.accentBlue }]}
    >
      <Text style={[typography.bodyStrong, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundElevated,
    gap: spacing.sm,
  },
  videoArea: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    gap: spacing.sm,
  },
  zoomBox: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.overlay,
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  zoomBtn: {
    minWidth: touch.min,
    height: touch.min - 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  zoomLabel: { ...typography.bodyStrong, color: colors.text, paddingHorizontal: spacing.xs },
  controls: {
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  time: { ...typography.mono, fontSize: 18, color: colors.textSecondary, minWidth: 84, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  ctrl: {
    width: 88,
    height: touch.regular + 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  playButton: {
    width: touch.large + 8,
    height: touch.large + 8,
    borderRadius: (touch.large + 8) / 2,
    backgroundColor: colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
  },
  divider: { width: 1, height: 48, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  speed: {
    minWidth: 84,
    height: touch.regular,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
});

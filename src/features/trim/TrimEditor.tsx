/* eslint-disable react-hooks/immutability --
 * expo-video's API is imperative by design (player.currentTime = t).
 */
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '@/components/ui';
import type { VideoListItem } from '@/domain/types';
import { clampTime, DEFAULT_FPS, stepFrameTime } from '@/features/player/frameMath';
import { updateMediaInfo } from '@/repositories/videos';
import { createClip } from '@/services/clips';
import { videoUri } from '@/services/videoFiles';
import { isTrimAvailable } from '@/services/videoTrim';
import { useApp } from '@/state/AppProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { formatPosition } from '@/utils/time';

import { initialRange, loopPosition, setEnd, setStart, type ClipRange } from './range';
import { RangeTimeline } from './RangeTimeline';

/**
 * Cut one or more shorter clips out of a recording. Exports are lossless
 * (passthrough) and the original is only removed when the coach explicitly
 * chooses "Ersätt originalet" – and then only after the clip is saved.
 */
export function TrimEditor({ video, onClose }: { video: VideoListItem; onClose: () => void }) {
  const { db } = useApp();
  const available = isTrimAvailable();
  const player = useVideoPlayer({ uri: videoUri(video.fileName) }, (p) => {
    p.timeUpdateEventInterval = 0.05;
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [durationMs, setDurationMs] = useState(video.durationMs);
  const [fps, setFps] = useState(video.frameRate ?? DEFAULT_FPS);
  const [range, setRange] = useState<ClipRange>(() => initialRange(video.durationMs));
  const [positionMs, setPositionMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [clipsMade, setClipsMade] = useState(0);
  const loopSelection = useRef(false);
  const mediaRead = useRef(false);

  // Use the exact media duration (the stored one may be a wall-clock estimate).
  const readMedia = () => {
    if (mediaRead.current || !(player.duration > 0)) return;
    mediaRead.current = true;
    const d = Math.round(player.duration * 1000);
    setDurationMs(d);
    setRange((r) => (r.endMs === Math.round(video.durationMs) || r.endMs > d ? { ...r, endMs: d } : r));
    if (player.videoTrack?.frameRate) setFps(player.videoTrack.frameRate);
    updateMediaInfo(db, video.id, {
      durationMs: d,
      width: player.videoTrack?.size.width ?? null,
      height: player.videoTrack?.size.height ?? null,
      frameRate: player.videoTrack?.frameRate ?? null,
    }).catch(() => undefined);
  };
  useEventListener(player, 'statusChange', ({ status }) => status === 'readyToPlay' && readMedia());
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    readMedia();
    const ms = currentTime * 1000;
    setPositionMs(ms);
    if (loopSelection.current && player.playing) {
      const jump = loopPosition(range, ms);
      if (jump != null) player.currentTime = jump / 1000;
    }
  });

  const seekMs = useCallback(
    (ms: number) => {
      player.currentTime = clampTime(ms / 1000, durationMs / 1000);
      setPositionMs(ms);
    },
    [player, durationMs],
  );

  const pause = () => {
    loopSelection.current = false;
    player.pause();
  };

  const playSelection = () => {
    if (isPlaying) return pause();
    loopSelection.current = true;
    if (positionMs < range.startMs || positionMs >= range.endMs - 50) seekMs(range.startMs);
    player.play();
  };

  const step = (frames: number) => {
    pause();
    const t = stepFrameTime(player.currentTime, frames, fps, durationMs / 1000);
    player.currentTime = t;
    setPositionMs(t * 1000);
  };

  const save = async (replaceOriginal: boolean) => {
    pause();
    setSaving(true);
    try {
      await createClip(db, { sourceVideoId: video.id, startMs: range.startMs, endMs: range.endMs, replaceOriginal });
      setClipsMade((n) => n + 1);
      if (replaceOriginal) {
        Alert.alert('Originalet ersatt', 'Klippet har sparats och originalinspelningen har tagits bort.');
        onClose();
        return;
      }
      Alert.alert('Klipp sparat', 'Klippet finns i målvaktens bibliotek. Vill du skapa fler klipp från samma inspelning?', [
        { text: 'Klar', onPress: onClose },
        { text: 'Skapa ett till', style: 'cancel' },
      ]);
    } catch (e) {
      Alert.alert('Klippet kunde inte skapas', `${e instanceof Error ? e.message : String(e)}\n\nOriginalet är oförändrat.`);
    } finally {
      setSaving(false);
    }
  };

  const confirmReplace = () =>
    Alert.alert(
      'Ersätt originalet?',
      `Bara ${formatPosition(range.endMs - range.startMs)} behålls. Hela originalinspelningen raderas från iPaden när klippet har sparats. Detta går inte att ångra.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Ersätt', style: 'destructive', onPress: () => void save(true) },
      ],
    );

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Button title="Tillbaka" icon="chevron-back" variant="secondary" size="compact" onPress={onClose} disabled={saving} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
            Klipp video · {video.goaltenderName}
            {video.focusAreaName ? ` · ${video.focusAreaName}` : ''}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            Originalets längd {formatPosition(durationMs)}
            {clipsMade ? ` · ${clipsMade} klipp skapade` : ''}
          </Text>
        </View>
      </View>

      {!available ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <Banner tone="warning" icon="construct-outline">
            Klippning kräver en egen build av appen (development/preview build via EAS). Den fungerar inte i Expo Go.
          </Banner>
        </View>
      ) : null}

      <View style={styles.videoArea}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      </View>

      <View style={styles.panel}>
        <View style={styles.readout}>
          <Readout label="START" value={formatPosition(range.startMs)} />
          <Readout label="LÄNGD" value={formatPosition(range.endMs - range.startMs)} highlight />
          <Readout label="SLUT" value={formatPosition(range.endMs)} />
          <Readout label="POSITION" value={formatPosition(positionMs)} />
        </View>

        <RangeTimeline
          durationMs={durationMs}
          range={range}
          positionMs={positionMs}
          onDragBegin={pause}
          onStart={(ms) => {
            setRange((r) => setStart(r, ms, durationMs));
            seekMs(ms);
          }}
          onEnd={(ms) => {
            setRange((r) => setEnd(r, ms, durationMs));
            seekMs(ms);
          }}
          onSeek={(ms) => {
            pause();
            seekMs(ms);
          }}
        />

        <View style={styles.row}>
          <Button title="Sätt START här" icon="flag-outline" variant="secondary" onPress={() => setRange((r) => setStart(r, positionMs, durationMs))} />
          <Button title="-1 bild" variant="secondary" onPress={() => step(-1)} />
          <Button
            title={isPlaying ? 'Pausa' : 'Spela markering'}
            icon={isPlaying ? 'pause' : 'play'}
            onPress={playSelection}
            style={{ minWidth: 220 }}
          />
          <Button title="+1 bild" variant="secondary" onPress={() => step(1)} />
          <Button title="Sätt SLUT här" icon="flag" variant="secondary" onPress={() => setRange((r) => setEnd(r, positionMs, durationMs))} />
        </View>

        <View style={[styles.row, { justifyContent: 'flex-end' }]}>
          <Button title="Ersätt originalet" icon="swap-horizontal" variant="danger" onPress={confirmReplace} disabled={!available || saving} />
          <Button
            title="Spara som nytt klipp"
            icon="cut-outline"
            variant="success"
            size="large"
            loading={saving}
            disabled={!available}
            onPress={() => void save(false)}
          />
        </View>
      </View>
    </View>
  );
}

function Readout({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.readoutItem}>
      <Text style={[typography.label, { color: colors.textMuted, fontSize: 11 }]}>{label}</Text>
      <Text style={[typography.mono, { color: highlight ? colors.annotationYellow : colors.text, fontSize: 20 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundElevated,
  },
  videoArea: { flex: 1, backgroundColor: '#000' },
  panel: { backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  readout: { flexDirection: 'row', gap: spacing.sm },
  readoutItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});

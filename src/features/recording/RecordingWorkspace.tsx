import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SelectTile, tapFeedback } from '@/components/ui';
import { goaltenderShortLabel, type Exercise, type Id, type TrainingSessionDetails, type VideoListItem } from '@/domain/types';
import { VideoPlayerPanel } from '@/features/player/VideoPlayerPanel';
import { findOrCreateExercise, listExercises } from '@/repositories/focusAreas';
import { setActiveSelection } from '@/repositories/sessions';
import { countVideosByGoaltender, getVideo, listVideos } from '@/repositories/videos';
import { estimateRecordingMinutes, defaultBytesPerMinute, storageLevel } from '@/services/storageEstimate';
import { diskSpace } from '@/services/videoFiles';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { useNow } from '@/state/useNow';
import { colors, radius, spacing, touch, typography } from '@/theme';
import { formatDuration, formatMinutes, formatTime } from '@/utils/time';

import { canStart, elapsedMs, isSelectionLocked, type RecordingState } from './recordingMachine';
import { useRecorder } from './useRecorder';

const CONTROL_STRIP_MIN = 196;
/** Grace period after re-activating the camera (onCameraReady does not fire again). */
const CAMERA_WARMUP_MS = 1200;

/**
 * The on-ice recording workspace.
 *
 * Layout: the camera preview is sized to exactly 16:9 — the aspect ratio of
 * the recorded 1080p/720p video — because iOS renders the preview with
 * aspect-fill. That way the preview shows precisely what is recorded, which
 * matters when framing the net from the puck's perspective. All controls live
 * in a strip below the preview.
 */
export function RecordingWorkspace({ session, onExit }: { session: TrainingSessionDetails; onExit: () => void }) {
  useKeepAwake();
  const { db, recordingSettings } = useApp();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [warmingUp, setWarmingUp] = useState(false);
  const [playerVideo, setPlayerVideo] = useState<VideoListItem | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [showExercises, setShowExercises] = useState(false);

  // --- Active selection (persisted per session so it survives navigation/restarts) ---
  const firstGoalie = session.participants[0]?.id ?? null;
  const firstFocus = session.focusAreas[0]?.id ?? null;
  const [goalieId, setGoalieId] = useState<Id | null>(
    session.participants.some((g) => g.id === session.activeGoaltenderId) ? session.activeGoaltenderId : firstGoalie,
  );
  const [focusId, setFocusId] = useState<Id | null>(
    session.focusAreas.some((f) => f.id === session.activeFocusAreaId) ? session.activeFocusAreaId : firstFocus,
  );
  const [exerciseId, setExerciseId] = useState<Id | null>(session.activeExerciseId);

  const { data: exercisesForFocus } = useDbQuery(
    (d) => (focusId ? listExercises(d, focusId) : Promise.resolve([] as Exercise[])),
    [focusId],
  );
  // An exercise only counts if it belongs to the selected focus area. While the
  // list is still loading, keep the stored id so it is not overwritten.
  const exercise = useMemo(
    () => exercisesForFocus?.find((e) => e.id === exerciseId) ?? null,
    [exercisesForFocus, exerciseId],
  );
  const effectiveExerciseId = exercisesForFocus === undefined ? exerciseId : (exercise?.id ?? null);

  useEffect(() => {
    setActiveSelection(db, session.id, {
      goaltenderId: goalieId,
      focusAreaId: focusId,
      exerciseId: effectiveExerciseId,
    }).catch(() => undefined);
  }, [db, session.id, goalieId, focusId, effectiveExerciseId]);

  const { state, start, stop, dismiss } = useRecorder({
    cameraRef,
    db,
    settings: recordingSettings,
    sessionStatus: session.status,
  });
  const locked = isSelectionLocked(state);

  const { data: counts } = useDbQuery((d) => countVideosByGoaltender(d, session.id), [session.id]);
  const { data: recent } = useDbQuery((d) => listVideos(d, { sessionId: session.id, limit: 30 }), [session.id]);

  // Storage indicator, re-read after every save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const storage = useMemo(() => safeDiskSpace(), [state.lastSavedVideoId]);
  const level = storage ? storageLevel(storage.availableBytes) : 'ok';
  const minutesLeft = storage
    ? estimateRecordingMinutes(storage.availableBytes, defaultBytesPerMinute(recordingSettings.quality, recordingSettings.codec))
    : null;

  // Auto-dismiss the "Sparat" confirmation so the strip returns to normal.
  useEffect(() => {
    if (state.status !== 'SAVED') return;
    const t = setTimeout(dismiss, 2500);
    return () => clearTimeout(t);
  }, [state.status, state.lastSavedVideoId, dismiss]);

  const goalie = session.participants.find((g) => g.id === goalieId) ?? null;
  const focus = session.focusAreas.find((f) => f.id === focusId) ?? null;

  const onRecordPress = useCallback(() => {
    if (state.status === 'RECORDING') {
      stop();
      return;
    }
    if (!canStart(state)) return;
    if (!goalieId) {
      Alert.alert('Välj målvakt', 'Välj vilken målvakt som ska spelas in innan du startar.');
      return;
    }
    void start({ sessionId: session.id, goaltenderId: goalieId, focusAreaId: focusId, exerciseId: effectiveExerciseId });
  }, [state, stop, start, goalieId, focusId, effectiveExerciseId, session.id]);

  const openLatest = useCallback(async () => {
    const id = state.lastSavedVideoId ?? recent?.[0]?.id;
    if (!id) return;
    const v = await getVideo(db, id);
    if (v) setPlayerVideo(v);
  }, [db, recent, state.lastSavedVideoId]);

  const closePlayer = useCallback(() => {
    setPlayerVideo(null);
    setWarmingUp(true);
    setTimeout(() => setWarmingUp(false), CAMERA_WARMUP_MS);
    notifyDataChanged();
  }, []);

  const lockedAlert = () =>
    Alert.alert('Inspelning pågår', 'Stoppa inspelningen innan du byter målvakt, fokusområde eller övning.');

  // --- Layout: 16:9 preview + control strip ---
  const availW = width - insets.left - insets.right;
  const availH = height - insets.top - insets.bottom;
  let camH = Math.min((availW * 9) / 16, availH - CONTROL_STRIP_MIN);
  let camW = (camH * 16) / 9;
  if (camW > availW) {
    camW = availW;
    camH = (camW * 9) / 16;
  }

  const recording = state.status === 'RECORDING';
  const busy = locked;
  const cameraActive = playerVideo == null;
  const canRecord = cameraReady && !warmingUp && !cameraError && (canStart(state) || recording);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={[styles.cameraRow, { height: camH }]}>
        <View style={{ width: camW, height: camH, backgroundColor: '#000' }}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="video"
            videoQuality={recordingSettings.quality}
            mute={!recordingSettings.recordAudio}
            active={cameraActive}
            onCameraReady={() => {
              setCameraReady(true);
              setCameraError(null);
            }}
            onMountError={(e) => setCameraError(e.message || 'Kameran kunde inte startas.')}
          />
          <RecordingOverlay
            state={state}
            ownerLabel={ownerLabel(session, state, goalie?.id ?? null, focus?.name ?? null, exercise?.name ?? null)}
          />
          {(!cameraReady || warmingUp) && !cameraError ? (
            <View style={styles.cameraNotice} pointerEvents="none">
              <Text style={styles.cameraNoticeText}>Kameran startar…</Text>
            </View>
          ) : null}
          {cameraError ? (
            <View style={styles.cameraNotice}>
              <Ionicons name="videocam-off" size={48} color={colors.recordRed} />
              <Text style={styles.cameraNoticeText}>Kameran kunde inte startas</Text>
              <Text style={[typography.body, { color: colors.textSecondary }]}>{cameraError}</Text>
            </View>
          ) : null}
          <View style={styles.topRight}>
            {level !== 'ok' && storage ? (
              <View style={[styles.pill, { backgroundColor: level === 'critical' ? colors.recordRed : colors.warning }]}>
                <Ionicons name="warning" size={18} color="#000" />
                <Text style={[typography.bodyStrong, { color: '#000' }]}>
                  Lagring: ca {formatMinutes(minutesLeft ?? 0)} kvar
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Avsluta inspelningsläget"
              disabled={busy}
              onPress={() => {
                tapFeedback();
                onExit();
              }}
              style={[styles.exitButton, busy && { opacity: 0.35 }]}
            >
              <Ionicons name="close" size={26} color={colors.text} />
              <Text style={[typography.bodyStrong, { color: colors.text }]}>Avsluta</Text>
            </Pressable>
          </View>
        </View>
        {camW < availW - 120 ? (
          <SessionSidePanel session={session} counts={counts} width={availW - camW} />
        ) : null}
      </View>

      {/* ---------------- Control strip ---------------- */}
      <View style={styles.strip}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
            <Text style={styles.rowLabel}>MÅLVAKT</Text>
            {session.participants.map((g) => (
              <SelectTile
                key={g.id}
                label={goaltenderShortLabel(g).toUpperCase()}
                selected={g.id === goalieId}
                accent="blue"
                minHeight={76}
                style={styles.tile}
                badge={counts?.get(g.id) ?? 0}
                disabled={locked && g.id !== goalieId}
                onPress={() => (locked ? lockedAlert() : setGoalieId(g.id))}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
            <Text style={styles.rowLabel}>FOKUS</Text>
            {session.focusAreas.map((f) => (
              <SelectTile
                key={f.id}
                label={f.name.toUpperCase()}
                selected={f.id === focusId}
                accent="green"
                minHeight={76}
                style={styles.tile}
                disabled={locked && f.id !== focusId}
                onPress={() => {
                  if (locked) return lockedAlert();
                  if (f.id !== focusId) {
                    setFocusId(f.id);
                    setExerciseId(null);
                  }
                }}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Välj övning"
              onPress={() => {
                tapFeedback();
                if (locked) return lockedAlert();
                if (!focusId) return;
                setShowExercises(true);
              }}
              style={[styles.exerciseButton, exercise && { borderColor: colors.accentGreen }, (locked || !focusId) && { opacity: 0.45 }]}
            >
              <Text style={styles.exerciseLabel}>ÖVNING</Text>
              <Text style={[typography.bodyStrong, { color: exercise ? colors.text : colors.textMuted }]} numberOfLines={1}>
                {exercise ? exercise.name : 'Ingen (valfri)'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        <View style={styles.sideButtons}>
          <Button
            title="VISA SENASTE KLIPP"
            icon="play-circle"
            variant="secondary"
            onPress={openLatest}
            disabled={busy || !(state.lastSavedVideoId || recent?.length)}
            style={{ minWidth: 220 }}
          />
          <Button
            title={`SENASTE (${recent?.length ?? 0})`}
            icon="list"
            variant="ghost"
            size="compact"
            onPress={() => setShowRecent(true)}
            disabled={busy || !recent?.length}
          />
        </View>

        <RecordButton state={state} disabled={!canRecord} onPress={onRecordPress} />
      </View>

      <StatusToast state={state} onDismiss={dismiss} />

      {/* Exercise picker: changes the optional exercise without leaving the camera. */}
      <ExercisePicker
        visible={showExercises}
        focusName={focus?.name ?? ''}
        focusId={focusId}
        sessionExerciseIds={session.exercises.map((e) => e.id)}
        exercises={exercisesForFocus ?? []}
        selectedId={effectiveExerciseId}
        onSelect={(id) => {
          setExerciseId(id);
          setShowExercises(false);
        }}
        onClose={() => setShowExercises(false)}
      />

      <RecentClipsDrawer
        visible={showRecent}
        videos={recent ?? []}
        onClose={() => setShowRecent(false)}
        onOpen={(v) => {
          setShowRecent(false);
          setPlayerVideo(v);
        }}
      />

      {playerVideo ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoPlayerPanel
            key={playerVideo.id}
            video={playerVideo}
            closeLabel="TILLBAKA TILL KAMERA"
            closeIcon="camera"
            onClose={closePlayer}
            headerExtra={
              <Button
                title="Senaste"
                icon="list"
                variant="secondary"
                size="compact"
                onPress={() => setShowRecent(true)}
              />
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function safeDiskSpace(): { availableBytes: number; totalBytes: number } | null {
  try {
    return diskSpace();
  } catch {
    return null;
  }
}

function ownerLabel(
  session: TrainingSessionDetails,
  state: RecordingState,
  goalieId: Id | null,
  focusName: string | null,
  exerciseName: string | null,
): string {
  // While busy, always show the snapshot owner of the recording in progress.
  if (isSelectionLocked(state) && state.ownership) {
    const g = session.participants.find((p) => p.id === state.ownership?.goaltenderId);
    const f = session.focusAreas.find((x) => x.id === state.ownership?.focusAreaId);
    return [g ? goaltenderShortLabel(g) : '?', f?.name, exerciseName].filter(Boolean).join('  ·  ');
  }
  const g = session.participants.find((p) => p.id === goalieId);
  return [g ? goaltenderShortLabel(g) : 'Ingen målvakt vald', focusName, exerciseName].filter(Boolean).join('  ·  ');
}

function RecordingOverlay({ state, ownerLabel: label }: { state: RecordingState; ownerLabel: string }) {
  const recording = state.status === 'RECORDING';
  const now = useNow(250, recording);
  const active = recording || state.status === 'STOPPING' || state.status === 'PREPARING';
  return (
    <>
      {recording ? <View pointerEvents="none" style={styles.recordFrame} /> : null}
      <View pointerEvents="none" style={styles.topLeft}>
        {active ? (
          <View style={[styles.pill, { backgroundColor: colors.recordRed }]}>
            <View style={[styles.recDot, { opacity: recording && Math.floor(now / 500) % 2 === 0 ? 1 : 0.35 }]} />
            <Text style={[typography.mono, { color: colors.text }]}>
              {state.status === 'PREPARING' ? 'STARTAR' : formatDuration(elapsedMs(state, now))}
            </Text>
          </View>
        ) : null}
        <View style={[styles.pill, { backgroundColor: colors.overlayStrong }]}>
          <Ionicons name="person" size={18} color={colors.accentBlue} />
          <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {active ? 'Spelar in: ' : 'Redo: '}
            {label}
          </Text>
        </View>
      </View>
    </>
  );
}

function RecordButton({ state, disabled, onPress }: { state: RecordingState; disabled: boolean; onPress: () => void }) {
  const recording = state.status === 'RECORDING';
  const transitioning = state.status === 'PREPARING' || state.status === 'STOPPING' || state.status === 'SAVING';
  const label = recording ? 'STOPPA' : state.status === 'STOPPING' ? 'STOPPAR…' : state.status === 'SAVING' ? 'SPARAR…' : state.status === 'PREPARING' ? 'STARTAR…' : 'SPELA IN';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || transitioning, busy: transitioning }}
      disabled={disabled || transitioning}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.recordButton,
        recording ? styles.recordButtonStop : null,
        pressed && { transform: [{ scale: 0.97 }] },
        (disabled || transitioning) && { opacity: 0.55 },
      ]}
    >
      {recording ? <View style={styles.stopSquare} /> : <View style={styles.recCircle} />}
      <Text style={[typography.button, { fontSize: 22, color: recording ? colors.recordRed : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function StatusToast({ state, onDismiss }: { state: RecordingState; onDismiss: () => void }) {
  if (state.status === 'SAVED') {
    return (
      <View style={[styles.toast, { borderColor: colors.accentGreen }]} pointerEvents="box-none">
        <Ionicons name="checkmark-circle" size={28} color={colors.accentGreen} />
        <Text style={[typography.bodyStrong, { color: colors.text }]}>Videon är sparad</Text>
      </View>
    );
  }
  if (state.status === 'ERROR' && state.error) {
    return (
      <View style={[styles.toast, { borderColor: colors.recordRed, maxWidth: 760 }]}>
        <Ionicons name="alert-circle" size={28} color={colors.recordRed} />
        <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{state.error}</Text>
        <Button title="OK" size="compact" variant="secondary" onPress={onDismiss} />
      </View>
    );
  }
  return null;
}

function SessionSidePanel({
  session,
  counts,
  width,
}: {
  session: TrainingSessionDetails;
  counts: Map<Id, number> | undefined;
  width: number;
}) {
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
  return (
    <View style={[styles.sidePanel, { width }]}>
      <Text style={[styles.rowLabel, { width: undefined }]}>{session.team.clubName.toUpperCase()}</Text>
      <Text style={[typography.heading, { color: colors.text }]}>{session.team.name}</Text>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{session.title}</Text>
      <View style={{ height: spacing.md }} />
      {session.participants.map((g) => (
        <View key={g.id} style={styles.sideRow}>
          <Text style={[typography.body, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
            {goaltenderShortLabel(g)}
          </Text>
          <Text style={[typography.bodyStrong, { color: colors.text }]}>{counts?.get(g.id) ?? 0}</Text>
        </View>
      ))}
      <View style={[styles.sideRow, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.xs }]}>
        <Text style={[typography.bodyStrong, { color: colors.textSecondary, flex: 1 }]}>Totalt</Text>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>{total}</Text>
      </View>
    </View>
  );
}

function ExercisePicker({
  visible,
  focusName,
  focusId,
  sessionExerciseIds,
  exercises,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  focusName: string;
  focusId: Id | null;
  sessionExerciseIds: Id[];
  exercises: Exercise[];
  selectedId: Id | null;
  onSelect: (id: Id | null) => void;
  onClose: () => void;
}) {
  const { db } = useApp();
  // Exercises prepared for the session first, then the rest of the catalogue.
  const sorted = [...exercises].sort(
    (a, b) => Number(sessionExerciseIds.includes(b.id)) - Number(sessionExerciseIds.includes(a.id)),
  );
  const addNew = () => {
    if (!focusId) return;
    Alert.prompt?.(
      'Ny övning',
      `Övning inom ${focusName}`,
      async (name?: string) => {
        if (!name?.trim()) return;
        try {
          const ex = await findOrCreateExercise(db, focusId, name);
          notifyDataChanged();
          onSelect(ex.id);
        } catch (e) {
          Alert.alert('Kunde inte spara övningen', e instanceof Error ? e.message : String(e));
        }
      },
      'plain-text',
    );
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <Text style={[typography.title, { color: colors.text }]}>Övning – {focusName}</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            Valfritt. En inspelning kan taggas med enbart fokusområde.
          </Text>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <SelectTile label="INGEN ÖVNING" selected={selectedId == null} accent="green" minHeight={touch.regular} style={{ minWidth: 220 }} onPress={() => onSelect(null)} />
            {sorted.map((e) => (
              <SelectTile
                key={e.id}
                label={e.name}
                sublabel={sessionExerciseIds.includes(e.id) ? 'Planerad' : null}
                selected={e.id === selectedId}
                accent="green"
                minHeight={touch.regular}
                style={{ minWidth: 220 }}
                onPress={() => onSelect(e.id)}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, justifyContent: 'flex-end' }}>
            <Button title="Ny övning" icon="add" variant="secondary" onPress={addNew} />
            <Button title="Stäng" variant="primary" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RecentClipsDrawer({
  visible,
  videos,
  onClose,
  onOpen,
}: {
  visible: boolean;
  videos: VideoListItem[];
  onClose: () => void;
  onOpen: (v: VideoListItem) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={[styles.modalBackdrop, { alignItems: 'flex-end' }]} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.title, { color: colors.text, flex: 1 }]}>Senaste klipp</Text>
            <Button title="Stäng" variant="secondary" size="compact" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
            {videos.map((v) => (
              <Pressable
                key={v.id}
                accessibilityRole="button"
                onPress={() => {
                  tapFeedback();
                  onOpen(v);
                }}
                style={({ pressed }) => [styles.clipRow, pressed && { backgroundColor: colors.surfacePressed }]}
              >
                <Ionicons name="play-circle" size={40} color={colors.accentBlue} />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                    {v.goaltenderName}
                    {v.jerseyNumber != null ? ` #${v.jerseyNumber}` : ''}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[v.focusAreaName ?? 'Inget fokusområde', v.exerciseName].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>{formatTime(v.recordedAt)}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{formatDuration(v.durationMs)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cameraRow: { flexDirection: 'row', backgroundColor: '#000' },
  cameraNotice: {
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
  cameraNoticeText: { ...typography.heading, color: colors.text },
  recordFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 6,
    borderColor: colors.recordRed,
  },
  topLeft: { position: 'absolute', top: spacing.md, left: spacing.md, right: 320, gap: spacing.xs, alignItems: 'flex-start' },
  topRight: { position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  recDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.overlayStrong,
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  rowLabel: { ...typography.label, color: colors.textMuted, width: 92 },
  tile: { minWidth: 168 },
  exerciseButton: {
    minWidth: 180,
    minHeight: 76,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  exerciseLabel: { ...typography.label, fontSize: 12, color: colors.textMuted },
  sideButtons: { gap: spacing.sm, alignItems: 'stretch' },
  recordButton: {
    width: 176,
    height: 168,
    borderRadius: radius.xl,
    backgroundColor: colors.recordRed,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  recordButtonStop: { backgroundColor: colors.text },
  recCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.text, borderWidth: 4, borderColor: 'rgba(0,0,0,0.25)' },
  stopSquare: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.recordRed },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    top: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.backgroundElevated,
  },
  sidePanel: { padding: spacing.lg, backgroundColor: colors.backgroundElevated, gap: 2 },
  sideRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '80%',
    maxHeight: '85%',
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawer: {
    width: 480,
    height: '100%',
    backgroundColor: colors.backgroundElevated,
    padding: spacing.lg,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: touch.regular + 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});

import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, Field, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { createDemoData } from '@/db/demoData';
import { updateTrainer } from '@/repositories/settings';
import { listAllVideoFileNames, videoStorageStats } from '@/repositories/videos';
import {
  effectiveBytesPerMinute,
  estimateRecordingMinutes,
  storageLevel,
  type VideoCodecSetting,
  type VideoQualitySetting,
} from '@/services/storageEstimate';
import { cleanupCameraCache, diskSpace, listCameraCacheFiles, listUntrackedVideoFiles } from '@/services/videoFiles';
import { useApp } from '@/state/AppProvider';
import { notifyDataChanged } from '@/state/dataEvents';
import { useDbQuery } from '@/state/useDbQuery';
import { colors, spacing, typography } from '@/theme';
import { formatBytes, formatMinutes } from '@/utils/time';

const QUALITIES: { key: VideoQualitySetting; label: string; hint: string }[] = [
  { key: '720p', label: '720p', hint: 'Mindre filer' },
  { key: '1080p', label: '1080p (standard)', hint: 'Högsta kvalitet på iPad 9:e gen.' },
  { key: '2160p', label: '4K', hint: 'Endast iPads med 4K-kamera. Annars används högsta tillgängliga.' },
];

export default function SettingsScreen() {
  const { db, trainer, recordingSettings, updateRecordingSettings } = useApp();
  const [trainerName, setTrainerName] = useState(trainer.name);
  const [trainerEmail, setTrainerEmail] = useState(trainer.email ?? '');
  const [busy, setBusy] = useState(false);

  const { data, reload } = useDbQuery(async (d) => {
    const stats = await videoStorageStats(d);
    const known = await listAllVideoFileNames(d);
    let disk: { availableBytes: number; totalBytes: number } | null = null;
    let untracked: { fileName: string; sizeBytes: number }[] = [];
    let cache: { uri: string; sizeBytes: number }[] = [];
    try {
      disk = diskSpace();
      untracked = listUntrackedVideoFiles(known);
      cache = listCameraCacheFiles();
    } catch {
      // File system information is unavailable on web / in tests.
    }
    return { stats, disk, untracked, cache };
  }, []);

  const bpm = effectiveBytesPerMinute(
    recordingSettings.quality,
    recordingSettings.codec,
    data ? { bytes: data.stats.bytes, durationMs: data.stats.durationMs } : null,
  );
  const minutes = data?.disk ? estimateRecordingMinutes(data.disk.availableBytes, bpm) : null;
  const level = data?.disk ? storageLevel(data.disk.availableBytes) : 'ok';
  const cacheBytes = data?.cache.reduce((a, c) => a + c.sizeBytes, 0) ?? 0;

  const set = (patch: Partial<typeof recordingSettings>) => updateRecordingSettings({ ...recordingSettings, ...patch });

  const cleanCache = () => {
    Alert.alert(
      'Rensa tillfälliga filer?',
      'Tar bort tillfälliga kamerafiler som inte hör till någon sparad video. Sparade videor påverkas inte.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Rensa',
          onPress: () => {
            const r = cleanupCameraCache();
            Alert.alert('Klart', `${r.removed} filer (${formatBytes(r.bytes)}) togs bort.`);
            reload();
          },
        },
      ],
    );
  };

  const demo = async () => {
    setBusy(true);
    try {
      const sessionId = await createDemoData(db, trainer.id);
      notifyDataChanged();
      router.push(`/sessions/${sessionId}`);
    } catch (e) {
      Alert.alert('Kunde inte skapa exempeldata', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Inställningar" subtitle="Inspelning, lagring och appen">
      <SectionTitle>Inspelning</SectionTitle>
      <Card>
        <Text style={styles.label}>VIDEOKVALITET</Text>
        <Row>
          {QUALITIES.map((q) => (
            <Chip key={q.key} label={q.label} accent="blue" selected={recordingSettings.quality === q.key} onPress={() => set({ quality: q.key })} />
          ))}
        </Row>
        <Text style={styles.hint}>{QUALITIES.find((q) => q.key === recordingSettings.quality)?.hint} Bildfrekvens: 30 bilder/s (kamerans standard).</Text>

        <Text style={[styles.label, { marginTop: spacing.md }]}>VIDEOFORMAT</Text>
        <Row>
          {(['hevc', 'h264'] as VideoCodecSetting[]).map((c) => (
            <Chip
              key={c}
              label={c === 'hevc' ? 'HEVC (mindre filer)' : 'H.264 (bäst kompatibilitet)'}
              accent="blue"
              selected={recordingSettings.codec === c}
              onPress={() => set({ codec: c })}
            />
          ))}
        </Row>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Spela in ljud</Text>
            <Text style={styles.hint}>Kräver mikrofonbehörighet. Stäng av för att spara utrymme eller av integritetsskäl.</Text>
          </View>
          <Switch
            value={recordingSettings.recordAudio}
            onValueChange={(v) => set({ recordAudio: v })}
            trackColor={{ true: colors.accentBlue, false: colors.surfaceRaised }}
            style={{ transform: [{ scale: 1.3 }] }}
          />
        </View>
      </Card>

      <SectionTitle>Lagring</SectionTitle>
      {level !== 'ok' ? (
        <Banner tone={level === 'critical' ? 'danger' : 'warning'} icon="warning">
          {level === 'critical'
            ? 'Lagringsutrymmet är nästan slut. Inspelning blockeras tills du frigör utrymme.'
            : 'Lite ledigt lagringsutrymme. Radera videor du inte behöver.'}
        </Banner>
      ) : null}
      <Row>
        <Stat label="Ledigt på iPaden" value={data?.disk ? formatBytes(data.disk.availableBytes) : '–'} tone={level === 'ok' ? 'green' : 'red'} />
        <Stat label="Uppskattad inspelningstid" value={minutes != null ? `ca ${formatMinutes(minutes)}` : '–'} tone="blue" />
        <Stat label={`Videor (${data?.stats.count ?? 0})`} value={formatBytes(data?.stats.bytes ?? 0)} />
      </Row>
      <Text style={styles.hint}>
        Uppskattningen bygger på {formatBytes(bpm)} per minut ({data && data.stats.durationMs >= 120_000 ? 'uppmätt snitt av dina inspelningar' : 'Apples riktvärde för vald kvalitet'}).
        Videor raderas aldrig automatiskt.
      </Text>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodyStrong, { color: colors.text }]}>Tillfälliga kamerafiler</Text>
            <Text style={styles.hint}>
              {data?.cache.length ?? 0} filer · {formatBytes(cacheBytes)}
            </Text>
          </View>
          <Button title="Rensa" icon="trash-outline" variant="secondary" onPress={cleanCache} disabled={!data?.cache.length} />
        </Row>
        {data?.untracked.length ? (
          <Text style={[styles.hint, { color: colors.warning }]}>
            {data.untracked.length} videofiler ({formatBytes(data.untracked.reduce((a, f) => a + f.sizeBytes, 0))}) saknar
            metadata – troligen efter ett databasfel. De raderas inte automatiskt; import planeras i fas 2.
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Tränare</SectionTitle>
      <Card>
        <Row>
          <Field label="Namn" value={trainerName} onChangeText={setTrainerName} />
          <Field label="E-post" value={trainerEmail} onChangeText={setTrainerEmail} keyboardType="email-address" autoCapitalize="none" />
        </Row>
        <Button
          title="Spara tränare"
          icon="checkmark"
          variant="secondary"
          onPress={async () => {
            await updateTrainer(db, trainer.id, trainerName, trainerEmail);
            Alert.alert('Sparat');
          }}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>

      <SectionTitle>Testdata</SectionTitle>
      <Card>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          Skapar EXEMPELDATA för acceptanstestet: Borlänge Hockey U16 med Erik #30, William #35 och Oliver #1 samt en
          planerad träning. Inga videor skapas – de spelas in med kameran.
        </Text>
        <Button title="Skapa exempeldata" icon="flask-outline" variant="secondary" onPress={demo} loading={busy} style={{ alignSelf: 'flex-start' }} />
      </Card>

      <SectionTitle>Om appen</SectionTitle>
      <Card>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          GoalieVision {Constants.expoConfig?.version ?? ''} · Allt fungerar offline. Videor lagras endast lokalt på
          iPaden; ingenting laddas upp.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = {
  label: { ...typography.label, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted },
};

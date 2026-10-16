import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Banner, Button, Card, Field, Row } from '@/components/ui';
import { readCloudConfig } from '@/services/cloud/config';
import { accountBlocker, type CoachAccount } from '@/services/cloud/publish';
import { getPortalApi, signIn, signOut, signUp, useCloudSession } from '@/services/cloud/session';
import { useApp } from '@/state/AppProvider';
import { formatBytes, formatDate } from '@/utils/time';
import { colors, spacing, typography } from '@/theme';

/** Coach login to the goaltender portal (Settings). The rest of the app works without it. */
export function PortalSettingsCard() {
  const state = useCloudSession();
  const cfg = readCloudConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | 'out' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state.kind === 'unconfigured') {
    return (
      <Card>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>Målvaktsportalen är inte aktiverad</Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          Den här versionen av appen är byggd utan portalinställningar. Allt annat fungerar offline som vanligt. Se
          README → Målvaktsportal för hur portalen sätts upp.
        </Text>
      </Card>
    );
  }

  const run = async (kind: 'in' | 'up' | 'out', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (state.kind === 'signedIn') {
    return (
      <Card>
        <Text style={[typography.bodyStrong, { color: colors.text }]}>Inloggad som {state.session.user.email}</Text>
        <CoachAccountStatus userId={state.session.user.id} />
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          Publicera videor från videovyn. Målvakterna loggar in med sin e-postadress
          {cfg?.portalUrl ? ` på ${cfg.portalUrl}` : ' i målvaktsportalen'} och ser bara sina egna videor.
        </Text>
        <Button
          title="Logga ut"
          icon="log-out-outline"
          variant="secondary"
          loading={busy === 'out'}
          onPress={() => run('out', signOut)}
          style={{ alignSelf: 'flex-start' }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[typography.bodyStrong, { color: colors.text }]}>Logga in för att publicera till målvaktsportalen</Text>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
        Inloggning krävs bara för publicering. Inspelning och allt annat fungerar utan nätverk.
      </Text>
      {error ? <Banner tone="danger" icon="alert-circle">{error}</Banner> : null}
      <Row>
        <Field label="E-post" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field label="Lösenord" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      </Row>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button
          title="Logga in"
          icon="log-in-outline"
          loading={busy === 'in'}
          disabled={!email || !password}
          onPress={() => run('in', () => signIn(email, password))}
        />
        <Button
          title="Skapa tränarkonto"
          variant="secondary"
          loading={busy === 'up'}
          disabled={!email || !password}
          onPress={() =>
            run('up', async () => {
              const r = await signUp(email, password);
              if (r === 'confirm-email') {
                Alert.alert('Bekräfta e-postadressen', 'Klicka på länken i mejlet som skickats till dig och logga sedan in här.');
              }
            })
          }
        />
      </View>
    </Card>
  );
}

type AccountLoad = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; account: CoachAccount | null };

/**
 * Registers the coach (so the admin sees the request) and shows status, level and usage.
 * Activation, level and paid period are set by the admin in the portal.
 */
function CoachAccountStatus({ userId }: { userId: string }) {
  const { trainer } = useApp();
  const [load, setLoad] = useState<AccountLoad>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    const api = getPortalApi();
    api
      .ensureCoach(userId, trainer.name)
      .then(() => api.coachAccount())
      .then((account) => alive && setLoad({ kind: 'ready', account }))
      .catch((e: unknown) => alive && setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [userId, trainer.name]);

  if (load.kind === 'loading') return null;
  if (load.kind === 'error') return <Banner tone="warning" icon="cloud-offline-outline">{load.message}</Banner>;
  const blocker = accountBlocker(load.account);
  const a = load.account;
  if (blocker || !a) return <Banner tone="warning" icon="time-outline">{blocker}</Banner>;
  const parts = [
    `Nivå ${a.planName ?? '–'}`,
    a.paidUntil ? `betald t.o.m. ${formatDate(a.paidUntil)}` : null,
    a.maxStorageBytes != null ? `lagring ${formatBytes(a.usedStorageBytes)} av ${formatBytes(a.maxStorageBytes)}` : null,
    a.maxGoaltenders != null ? `${a.goaltenderCount} av ${a.maxGoaltenders} målvakter` : null,
  ].filter(Boolean);
  return <Banner tone="success" icon="checkmark-circle">{`Aktivt konto · ${parts.join(' · ')}`}</Banner>;
}

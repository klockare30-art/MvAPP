import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/ui';
import type { Goaltender } from '@/domain/types';
import { removeGoaltenderFromPortal } from '@/services/cloud/publish';
import { getPortalApi, useCloudSession } from '@/services/cloud/session';
import { useApp } from '@/state/AppProvider';

/** Erasure on request: removes the goaltender and everything published to them from the portal. */
export function PortalEraseButton({ goalie, onDone }: { goalie: Goaltender; onDone?: () => void }) {
  const { db } = useApp();
  const cloud = useCloudSession();
  const [busy, setBusy] = useState(false);
  if (cloud.kind !== 'signedIn') return null;

  return (
    <Button
      title="Ta bort all portaldata"
      icon="trash-outline"
      variant="danger"
      size="compact"
      loading={busy}
      style={{ alignSelf: 'flex-start' }}
      onPress={() =>
        Alert.alert(
          `Ta bort ${goalie.firstName} från portalen?`,
          'Alla publicerade videor, kommentarer och profilen i molnet raderas, och samtycket återkallas. Videorna finns kvar på iPaden. Detta går inte att ångra.',
          [
            { text: 'Avbryt', style: 'cancel' },
            {
              text: 'Ta bort',
              style: 'destructive',
              onPress: async () => {
                setBusy(true);
                try {
                  const n = await removeGoaltenderFromPortal(db, getPortalApi(), goalie.id);
                  Alert.alert('Borttaget', `${n} videor och profilen har tagits bort från portalen.`);
                  onDone?.();
                } catch (e) {
                  Alert.alert('Kunde inte ta bort allt', e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              },
            },
          ],
        )
      }
    />
  );
}

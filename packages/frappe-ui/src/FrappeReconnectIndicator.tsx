import { useFrappeConnection } from '@repo/frappe';
import type { FrappeConnectionState, UseFrappeCollectionConfig } from '@repo/frappe';
import { useResolvedKnobs } from '@repo/theme';
import { WifiSlashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Text, XStack } from 'tamagui';

export interface FrappeReconnectIndicatorProps {
  /** The connection config the component's live queries sync through. */
  config: UseFrappeCollectionConfig | undefined;
  /**
   * Story and spec injection. Production callers omit this; the live socket
   * from `useFrappeConnection(config)` wins.
   */
  connection?: FrappeConnectionState;
}

/**
 * Honest realtime-state chip for live Frappe components.
 *
 * Renders ONLY while the realtime socket feeding this connection's live
 * queries is down after having been up (i.e. reconnecting). Fixture-backed
 * configs and environments where realtime never connected render nothing —
 * we never advertise liveness that never existed. Exact catch-up after the
 * gap is owned by the client's reconnect backfill; this chip only tells the
 * user that in-place updates are paused right now.
 */
export function FrappeReconnectIndicator({ config, connection }: FrappeReconnectIndicatorProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const hooked = useFrappeConnection(config);
  const { connected, everConnected } = connection ?? hooked;
  if (!everConnected || connected) {
    return null;
  }
  return (
    <XStack
      role="status"
      aria-live="polite"
      alignItems="center"
      gap="$2"
      {...knobProps.containerRadius}
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      backgroundColor="$orange3"
      alignSelf="flex-start"
      testID="frappe-reconnect-indicator">
      <WifiSlashIcon
        size={14}
        color="var(--orange10)"
      />
      <Text
        fontSize="$2"
        color="$orange11">
        {t('Live updates interrupted — reconnecting…')}
      </Text>
    </XStack>
  );
}

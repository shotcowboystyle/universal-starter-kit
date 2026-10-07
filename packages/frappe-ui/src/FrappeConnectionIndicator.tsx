import { useFrappeConnection } from '@repo/frappe';
import type { FrappeConnectionState, UseFrappeCollectionConfig } from '@repo/frappe';
import { radiusClassProps, useResolvedKnobs } from '@repo/theme';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack, YStack } from 'tamagui';

export interface FrappeConnectionIndicatorProps {
  /** The same connection config the sibling collection hooks use. */
  config: UseFrappeCollectionConfig | undefined;
  /**
   * Story and spec injection. Production callers omit this; the live socket
   * from `useFrappeConnection(config)` wins. Fixture configs always report
   * never-connected, so boards that need the reconnecting pill pass a snapshot.
   */
  connection?: FrappeConnectionState;
}

/**
 * Compact "Reconnecting" status pill for live Frappe views.
 *
 * Shows only while the realtime socket is down after having been up
 * (`everConnected && !connected`) — during that window updates arrive via
 * backfill on reconnect instead of live events. Renders nothing when
 * connected, in fixture mode, or during SSR (realtime never up), so
 * fixture-backed stories stay clean.
 */
export function FrappeConnectionIndicator({ config, connection }: FrappeConnectionIndicatorProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const hooked = useFrappeConnection(config);
  const { connected, everConnected } = connection ?? hooked;
  if (connected || !everConnected) {
    return null;
  }
  return (
    <XStack
      role="status"
      aria-live="polite"
      alignSelf="flex-start"
      alignItems="center"
      gap="$2"
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      {...knobProps.borderRadius}
      backgroundColor="$yellow3"
      borderColor="$yellow7"
      borderWidth={1}>
      <YStack
        {...radiusClassProps('R-PILL', 'connection status dot')}
        width={8}
        height={8}
        borderRadius={4}
        backgroundColor="$yellow10"
      />
      <Text
        fontSize="$2"
        color="$yellow11">
        {t('Reconnecting…')}
      </Text>
    </XStack>
  );
}

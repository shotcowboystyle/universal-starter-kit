import { useResolvedKnobs } from '@repo/theme';
import { Button } from '@repo/ui';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, XStack } from 'tamagui';

export interface SyncErrorNoticeProps {
  /** Human-readable failure message (already localized by the caller). */
  message: string;
  /**
   * Re-issues the failed write (same mutation id — idempotent server-side).
   * Omit to hide the Retry affordance.
   */
  onRetry?: () => void;
  /** Drops the failed entry without retrying. Omit to hide Dismiss. */
  onDismiss?: () => void;
  /** Override the Retry button label (defaults to a localized "Retry"). */
  retryLabel?: string;
  /** Override the Dismiss button label (defaults to a localized "Dismiss"). */
  dismissLabel?: string;
}

/**
 * The rejected-write notice — the visible half of the optimistic mutation
 * contract: when the server rejects a write, the optimistic state has
 * already been rolled back by the sync engine; this primitive surfaces the
 * error inline at the surface that initiated the write, with Retry
 * (re-issues the SAME mutation id) and Dismiss (clears the ledger entry).
 *
 * Pair with `useFrappePendingMutations` from `@repo/frappe`:
 *
 * ```tsx
 * const { failed, retry, dismiss } = useFrappePendingMutations(config, "Comment");
 * {failed.map((entry) => (
 *   <SyncErrorNotice
 *     key={entry.id}
 *     message={entry.error ?? t("Could not save changes")}
 *     onRetry={retry}
 *     onDismiss={() => dismiss(entry.id)}
 *   />
 * ))}
 * ```
 */
export const SyncErrorNotice = ({ message, onRetry, onDismiss, retryLabel, dismissLabel }: SyncErrorNoticeProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      role="alert"
      alignItems="center"
      flexWrap="wrap"
      gap="$2"
      paddingHorizontal="$3"
      paddingVertical="$2"
      {...knobProps.borderRadius}
      backgroundColor="$red3"
      borderColor="$red7"
      borderWidth={1}>
      <Text
        flex={1}
        fontSize="$2"
        color="$red11">
        {message}
      </Text>
      {onRetry && (
        <Button
          size="$2"
          theme="error"
          {...knobProps.borderRadius}
          onPress={onRetry}>
          {retryLabel ?? t('Retry')}
        </Button>
      )}
      {onDismiss && (
        <Button
          size="$2"
          chromeless
          {...knobProps.borderRadius}
          onPress={onDismiss}>
          {dismissLabel ?? t('Dismiss')}
        </Button>
      )}
    </XStack>
  );
};

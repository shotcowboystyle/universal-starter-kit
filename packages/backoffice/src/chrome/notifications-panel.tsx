/**
 * Notifications panel body (desk bell-dropdown parity): header with
 * "Notifications" + mark-all-as-read + settings placeholder, then the
 * newest-first Notification Log list. Presentational — data, routing, and
 * the popover/sheet shell live in NotificationsButton.
 */
import {
  Avatar,
  Button,
  EmptyState,
  Separator,
  SizableText,
  Skeleton,
  SkeletonCircle,
  Text,
  View,
  XStack,
  YStack,
} from '@repo/ui';
import {
  ensureFocusVisibleRing,
  formatRelativeTimestamp,
  menuRowFrame,
  sizeRecipeEscape,
  useResolvedKnobs,
} from '@repo/theme';
import { GearSixIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import type { NotificationItem } from './notifications-data';

export interface NotificationsPanelProps {
  items: readonly NotificationItem[];
  isLoading: boolean;
  /** Panel width — a fixed measure when floating, "100%" in sheet mode. */
  width?: number | string;
  onItemPress: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const subject = item.subjectText || t('notifications.untitled', 'Notification');
  const relative = formatRelativeTimestamp(item.timestampMs ?? item.creation);
  return (
    <XStack
      {...menuRowFrame}
      alignItems="flex-start"
      {...knobProps.gap}
      paddingVertical="$2.5"
      // LC-71: unread is SELECTED fill; the ring is keyboard-only on this row.
      backgroundColor={item.unread ? '$color2' : 'transparent'}
      hoverStyle={{ backgroundColor: '$color3' }}
      pressStyle={{ backgroundColor: '$color4' }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      cursor="pointer"
      role="button"
      tabIndex={0}
      aria-label={subject}
      data-testid="backoffice-notification-row"
      onPress={onPress}
      onKeyDown={
        ((event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPress();
          }
        }) as unknown as () => void
      }>
      <Avatar
        name={item.from_user ?? '?'}
        size="$2.5"
      />
      <YStack
        flex={1}
        minWidth={0}
        gap="$1">
        <Text
          {...knobProps.label}
          fontWeight="400"
          color={item.unread ? '$color12' : '$color11'}
          numberOfLines={2}>
          {subject}
        </Text>
        {relative ? (
          <Text
            {...knobProps.label}
            color="$color9">
            {relative}
          </Text>
        ) : null}
      </YStack>
      {item.unread && (
        <View
          paddingTop="$1.5"
          flexShrink={0}
          aria-hidden>
          <View
            width="$0.75"
            height="$0.75"
            borderRadius={1000}
            backgroundColor="$accentBackground"
          />
        </View>
      )}
    </XStack>
  );
}

function NotificationSkeletonRows() {
  return (
    <YStack data-testid="backoffice-notifications-loading">
      {Array.from({ length: 3 }, (_, index) => (
        <XStack
          key={index}
          alignItems="center"
          gap="$3"
          paddingHorizontal="$3"
          paddingVertical="$2.5">
          <SkeletonCircle size={28} />
          <YStack
            flex={1}
            gap="$1.5">
            <Skeleton width="85%" />
            <Skeleton
              height={sizeRecipeEscape(10, 'timestamp bone: the height of the small caption it stands in for')}
              width="$6"
            />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

export function NotificationsPanel({ items, isLoading, width, onItemPress, onMarkAllRead }: NotificationsPanelProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const hasUnread = items.some((item) => item.unread);

  return (
    <YStack
      width={width}
      maxWidth="100%"
      // LC-02: the panel owns only its border; header and rows own insets.
      paddingVertical={0}
      data-testid="backoffice-notifications-panel">
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$3"
        paddingVertical="$2">
        <SizableText
          {...knobProps.heading}
          flex={1}
          numberOfLines={1}>
          {t('notifications.title', 'Notifications')}
        </SizableText>
        <Button
          chromeless
          size="$2"
          disabled={!hasUnread}
          opacity={hasUnread ? 1 : 0.5}
          onPress={onMarkAllRead}
          data-testid="backoffice-notifications-mark-all">
          {t('notifications.markAllRead', 'Mark all as read')}
        </Button>
        {/* Desk links to /app/notification-settings; the backoffice has no
            settings surface yet — disabled placeholder documents the gap. */}
        <Button
          chromeless
          circular
          size="$2"
          icon={GearSixIcon}
          disabled
          opacity={0.5}
          aria-label={t('notifications.settingsUnavailable', 'Notification settings (not available yet)')}
        />
      </XStack>
      <Separator />
      {isLoading ? (
        <NotificationSkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          paddingVertical="$6"
          title={t('notifications.emptyTitle', 'No new notifications')}
          description={t('notifications.emptyDescription', 'Mentions, assignments, and shares will show up here.')}
        />
      ) : (
        <YStack>
          {items.map((item) => (
            <NotificationRow
              key={item.name}
              item={item}
              onPress={() => {
                onItemPress(item);
              }}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}

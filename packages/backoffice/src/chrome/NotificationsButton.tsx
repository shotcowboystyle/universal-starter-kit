// Navbar bell button + notifications panel (Notification Log, unread badge,
// mark-as-read; desk parity). Self-contained: reads frappe context + the
// backoffice navigator internally; the shell mounts it props-less.
import { Badge } from '@repo/ui';
// House Button: the raw tamagui Button (components re-export) misses the
// house 44px press floor; the 36px bell also crowded the count badge into
// its own glyph (LC-54, LC-53 icon slot).
import { Button, FloatingPanel, useViewportGtSm } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { BellIcon } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeConfig, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { useNotifications } from './notifications-data';
import type { NotificationItem } from './notifications-data';
import { NotificationsPanel } from './notifications-panel';

/** Fixed content width when the panel floats (sheet mode fills instead). */
const PANEL_WIDTH = 400;

export function NotificationsButton() {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { emitEvent } = useBackofficeConfig();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();
  // FloatingPanel pivots float↔sheet on the same viewport check.
  const floating = useViewportGtSm();

  const handleItemPress = useCallback(
    (item: NotificationItem) => {
      if (item.unread) {
        // Fire-and-forget (desk parity): navigation must not wait on the RPC;
        // the optimistic override reverts itself if the write fails.
        markAsRead(item.name).catch((error) => {
          emitEvent({ type: 'error', error, context: 'notifications.markAsRead' });
        });
      }
      if (item.document_type && item.document_name) {
        navigator.navigate(paths.form(item.document_type, item.document_name));
      }
      setOpen(false);
    },
    [markAsRead, navigator, paths, emitEvent],
  );

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead().catch((error) => {
      emitEvent({ type: 'error', error, context: 'notifications.markAllAsRead' });
    });
  }, [markAllAsRead, emitEvent]);

  const label = t('notifications.title', 'Notifications');

  return (
    <FloatingPanel
      open={open}
      onOpenChange={setOpen}
      scrollable
      sizing="fill"
      fitContent
      contentPadding="none"
      triggerA11y={{ label }}
      trigger={
        <Badge
          count={unreadCount}
          max={99}>
          <Button
            chromeless
            circular
            size={knobProps.sizeToken}
            icon={BellIcon}
            aria-label={label}
            data-testid="backoffice-notifications-button"
          />
        </Badge>
      }>
      <NotificationsPanel
        items={items}
        isLoading={isLoading}
        width={floating ? PANEL_WIDTH : '100%'}
        onItemPress={handleItemPress}
        onMarkAllRead={handleMarkAllRead}
      />
    </FloatingPanel>
  );
}

/**
 * "Continue where you left off" strip (MOD-11) — a wrapping band of chips
 * for the most recent backoffice visits, read from the shared desk recent
 * store (chrome/awesomebar-data's readRecentItems over the same
 * "frappe-desk-recent" key frappe-ui's addToRecent writes — one list across
 * navbar recent, sidebar recent, and this strip; no new store).
 *
 * Renders nothing while the store is unread or empty — the strip is
 * discovery chrome, not data the page promised (no skeleton, D-10).
 * Refreshes on mount and on window focus (web); paths outside the
 * provider's basePath (e.g. the frappe-ui `/desk` demo shell writes there
 * too) are filtered out so every chip stays navigable in this app.
 */
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { TOUCH_HEIGHT_FLOOR, ensureFocusVisibleRing, useResolvedKnobs } from '@repo/theme';
import { Card, PageSection, Text, XStack, useTheme } from '@repo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { readRecentItems } from '../chrome/awesomebar-data';
import type { RecentItem } from '../chrome/awesomebar-data';
import { useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

/** Last N visits shown (MOD-11: "last 5 items from the shared recent store"). */
const MAX_RECENTS = 5;

export const WorkspaceRecents = () => {
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width || 16;
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const theme = useTheme();
  // Phosphor icons take a resolved color string, not a tamagui token —
  // read the theme value so native/GTK get a real color (not a CSS var).
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- theme values are string | number; only a string is a color
  const iconColor = typeof theme.color11?.val === 'string' ? theme.color11.val : undefined;
  const [recents, setRecents] = useState<RecentItem[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { base } = paths;
  const refresh = useCallback(async () => {
    const stored = await readRecentItems();
    if (!mountedRef.current) {
      return;
    }
    setRecents(stored.filter((item) => item.path.startsWith(base)).slice(0, MAX_RECENTS));
  }, [base]);

  // Fresh on mount and whenever the window regains focus (another surface
  // may have pushed a visit since) — same staleness contract as the
  // awesomebar's refresh-on-open.
  useEffect(() => {
    void refresh();
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- SSR / native guard: window or its event API may be absent
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  if (recents.length === 0) {
    return null;
  }

  return (
    // Section heading on the shared sectionHeading scale (LC-17); no
    // divider rule over a chip band (Axiom 16 chrome-earns-role).
    <PageSection
      title={t('workspaceRecents', 'Continue where you left off')}
      divider={false}>
      <XStack
        flexWrap="wrap"
        {...knobProps.gap}>
        {recents.map((item) => (
          <Card
            key={item.path}
            // Chip-scale surface: eject the Card's default panelPadding —
            // the inner row owns the compact inset (LC-18 eject-last).
            padding={0}
            onPress={() => {
              navigator.navigate(item.path);
            }}
            cursor="pointer"
            hoverStyle={{ borderColor: '$accentBackground' }}
            pressStyle={{ scale: 0.98 }}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui Card; there is no <a> on native
            role="link"
            aria-label={item.label}
            tabIndex={0}
            outlineWidth={0}
            focusStyle={{ outlineWidth: 0 }}
            // Default ring (offset 0): a recent card is a standalone
            // rectangle on the page ground, so no LC-71 §4 carve-out (MPO-92).
            focusVisibleStyle={ensureFocusVisibleRing()}>
            <XStack
              paddingHorizontal="$3"
              minHeight={TOUCH_HEIGHT_FLOOR}
              alignItems="center"
              {...knobProps.gap}>
              <ClockCounterClockwiseIcon
                size={iconSize}
                color={iconColor}
                aria-hidden
              />
              <Text
                {...knobProps.label}
                fontWeight="400"
                numberOfLines={1}
                flexShrink={1}>
                {item.label}
              </Text>
            </XStack>
          </Card>
        ))}
      </XStack>
    </PageSection>
  );
};

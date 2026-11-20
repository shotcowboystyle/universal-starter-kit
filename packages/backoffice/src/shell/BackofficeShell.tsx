/**
 * Backoffice desk chrome: top navbar (app title → home, centered awesomebar,
 * notifications / help / user menus) and the left workspace sidebar around
 * the routed content.
 *
 * Router-free by design — navigation and the active path come from the
 * BackofficeProvider's navigator (explicit `activePath`/`onNavigate` props
 * override it for stories/tests). Capability flags from the provider gate
 * every piece of chrome; `renderShellHeader`/`renderSidebarFooter` slots
 * replace/extend the built-ins. Narrow viewports collapse the sidebar into
 * an overlay drawer (same breakpoint as frappe-ui's DeskShell:
 * DESK_NARROW_BREAKPOINT === theme NARROW_BREAKPOINT).
 *
 * Shell geometry follows Frappe Desk's inverted-L (full-width banner + left
 * rail) with Linear's pane rules: hairlines are standalone filled rules that
 * span the full banner width and the full rail height (footer included),
 * never a child's box-border that stops at content. Selected workspace is
 * fill (WorkspaceSidebar / LC-71); the rail does not paint selection chrome.
 */
import { ListIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { hairline, sizeRecipeEscape, useLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
import { SizableText, SkipLink, XStack, YStack, isWeb } from '@repo/ui';
// oxlint-disable-next-line sonarjs/no-wildcard-import -- the barrel is capability-checked for ToastViewport below
import * as componentsBarrel from '@repo/ui';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BackofficeAwesomebar } from '../chrome/BackofficeAwesomebar';
import type { BackofficeAwesomebarHandle } from '../chrome/BackofficeAwesomebar';
import { HelpMenu } from '../chrome/HelpMenu';
import { NotificationsButton } from '../chrome/NotificationsButton';
import { useBackofficeShortcuts } from '../chrome/shortcuts';
import { UserMenu } from '../chrome/UserMenu';
import {
  useBackofficeCapabilities,
  useBackofficeLocation,
  useBackofficeNavigator,
  useBackofficePaths,
  useBackofficeSlots,
} from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { WORKSPACE_SIDEBAR_WIDTH, WorkspaceSidebar } from './WorkspaceSidebar';

// Capability-check the barrel instead of a named import: GNOME's curated
// components shim deliberately omits ToastViewport (the @tamagui/toast portal
// machinery stays out of the GJS graph), so on that target the shell simply
// mounts no toast host (ListToastHost precedent in features/pokemon).
// SAFETY: Partial only widens the barrel type, so the missing export reads as undefined
const { ToastViewport } = componentsBarrel as Partial<typeof componentsBarrel>;

export interface BackofficeShellProps {
  children: React.ReactNode;
  /** Current path for the sidebar active state (default: navigator location). */
  activePath?: string;
  /** Navigation handler (default: navigator push). */
  onNavigate?: (path: string) => void;
}

/**
 * Cross-platform narrow-viewport detection: theme `compact` size class =
 * width < NARROW_BREAKPOINT (640) — matchMedia on web, window dimensions on
 * native, so phones get the drawer instead of a permanent desktop rail.
 */
const useIsNarrow = (): boolean => useLayoutSizeClass() === 'compact';

/** Banner height one step above the knob size token (Frappe navbar proportions). */
const bannerHeightFor = (sizeToken: string) => {
  if (sizeToken === '$5') {
    return '$7';
  }
  if (sizeToken === '$3') {
    return '$5';
  }
  return '$6';
};

/** Standalone pane rule — full width (banner) or full height (rail). */
const ShellHairline = ({ axis, testId }: { axis: 'horizontal' | 'vertical'; testId: string }) => (
  <YStack
    {...(axis === 'horizontal' ? hairline.line : hairline.vline)}
    alignSelf="stretch"
    {...(axis === 'horizontal' ? { width: '100%' } : { height: '100%' })}
    flexShrink={0}
    data-testid={testId}
  />
);

export const BackofficeShell = ({ children, activePath, onNavigate }: BackofficeShellProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const capabilities = useBackofficeCapabilities();
  const slots = useBackofficeSlots();
  const navigator = useBackofficeNavigator();
  const location = useBackofficeLocation();
  const paths = useBackofficePaths();
  const isNarrow = useIsNarrow();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const resolvedActivePath = activePath ?? location.path;
  const navigate = onNavigate ?? navigator.navigate;

  const sidebarEnabled = capabilities.sidebar.enabled;

  // Global desk shortcuts (Mod+K / Mod+G → awesomebar). One document
  // listener for the whole chrome; SSR/native-safe, skips editable targets.
  const awesomebarRef = useRef<BackofficeAwesomebarHandle>(null);
  useBackofficeShortcuts({
    onFocusSearch: capabilities.awesomebar.enabled ? () => awesomebarRef.current?.focus() : undefined,
  });

  // Leaving the narrow range always closes the drawer.
  useEffect(() => {
    if (!isNarrow) {
      // oxlint-disable-next-line react/set-state-in-effect -- the drawer must stay closed when the viewport narrows again
      setDrawerOpen(false);
    }
  }, [isNarrow]);

  // Escape dismisses the drawer (web-only keyboard listener).
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined' || !drawerOpen) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const handleNavigate = (path: string) => {
    if (isNarrow) {
      setDrawerOpen(false);
    }
    navigate(path);
  };

  const bannerHeight = bannerHeightFor(knobProps.sizeToken);

  const sidebarContent = (
    <YStack
      flex={1}
      height="100%"
      minHeight={0}
      width={WORKSPACE_SIDEBAR_WIDTH}>
      <YStack
        flex={1}
        minHeight={0}>
        <WorkspaceSidebar
          activePath={resolvedActivePath}
          onNavigate={handleNavigate}
        />
      </YStack>
      {slots.renderSidebarFooter ? (
        <YStack
          flexShrink={0}
          width="100%">
          <ShellHairline
            axis="horizontal"
            testId="backoffice-shell-footer-rule"
          />
          {slots.renderSidebarFooter()}
        </YStack>
      ) : null}
    </YStack>
  );

  const headerContent = (
    <>
      {isNarrow && sidebarEnabled && (
        <Button
          chromeless
          circular
          size={knobProps.sizeToken}
          icon={drawerOpen ? XIcon : ListIcon}
          aria-label={t('shell.toggleSidebar', 'Toggle sidebar')}
          aria-expanded={drawerOpen}
          onPress={() => {
            setDrawerOpen((open) => !open);
          }}
          data-testid="backoffice-sidebar-toggle"
        />
      )}
      <Button
        chromeless
        size={knobProps.sizeToken}
        paddingHorizontal="$2"
        onPress={() => {
          handleNavigate(paths.home());
        }}
        aria-label={t('shell.home', 'Home')}
        data-testid="backoffice-home">
        <SizableText
          {...knobProps.heading}
          fontWeight="400">
          {t('shell.title', 'Backoffice')}
        </SizableText>
      </Button>

      {/* Centered awesomebar (the flex spacer keeps the right chrome pinned
          when the awesomebar capability is off) */}
      <XStack
        flex={1}
        minWidth={0}
        justifyContent="center">
        {capabilities.awesomebar.enabled && (
          <XStack
            flex={1}
            maxWidth={sizeRecipeEscape(560, 'awesomebar: caps the centered search field in the banner')}
            minWidth={0}>
            <BackofficeAwesomebar focusRef={awesomebarRef} />
          </XStack>
        )}
      </XStack>

      {/* Right chrome */}
      <XStack
        alignItems="center"
        gap="$1"
        flexShrink={0}>
        {capabilities.notifications.enabled && <NotificationsButton />}
        {capabilities.help.enabled && <HelpMenu />}
        {capabilities.userMenu.enabled && <UserMenu />}
      </XStack>
    </>
  );

  const rail = (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack: `role` also sets the native accessibility role, a tag is web-only
      role="navigation"
      flexShrink={0}
      height="100%"
      minHeight={0}
      backgroundColor="$color2"
      data-testid="backoffice-sidebar-rail">
      {sidebarContent}
      <ShellHairline
        axis="vertical"
        testId="backoffice-shell-column-rule"
      />
    </XStack>
  );

  return (
    <YStack
      flex={1}
      height="100%"
      width="100%"
      overflow="hidden"
      data-testid="backoffice-shell">
      {isWeb ? <SkipLink targetId="backoffice-main">{t('shell.skipToContent', 'Skip to content')}</SkipLink> : null}

      {/* Top navbar — Frappe inverted-L: full width above the rail. */}
      <XStack
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack: `role` also sets the native accessibility role, a tag is web-only
        role="banner"
        {...knobProps.surface}
        borderWidth={0}
        borderRadius={0}
        height={bannerHeight}
        alignItems="center"
        paddingHorizontal="$3"
        gap="$2"
        flexShrink={0}>
        {slots.renderShellHeader ? slots.renderShellHeader({ defaultContent: headerContent }) : headerContent}
      </XStack>
      <ShellHairline
        axis="horizontal"
        testId="backoffice-shell-banner-rule"
      />

      <XStack
        flex={1}
        minWidth={0}
        position="relative"
        overflow="hidden">
        {sidebarEnabled && !isNarrow && rail}

        {/* Narrow drawer + scrim */}
        {sidebarEnabled && isNarrow && drawerOpen && (
          <>
            <YStack
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              backgroundColor="$shadowColor"
              opacity={0.5}
              zIndex={10}
              onPress={() => {
                setDrawerOpen(false);
              }}
              data-testid="backoffice-sidebar-scrim"
            />
            <XStack
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack: `role` also sets the native accessibility role, a tag is web-only
              role="navigation"
              position="absolute"
              top={0}
              left={0}
              bottom={0}
              zIndex={11}
              backgroundColor="$color2"
              data-testid="backoffice-sidebar-drawer">
              {sidebarContent}
              <ShellHairline
                axis="vertical"
                testId="backoffice-shell-drawer-rule"
              />
            </XStack>
          </>
        )}

        {/* Routed content — pages own their own headers/breadcrumbs */}
        <YStack
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui stack: `role` also sets the native accessibility role, a tag is web-only
          role="main"
          id="backoffice-main"
          tabIndex={-1}
          flex={1}
          minWidth={0}
          minHeight={0}
          overflow="hidden">
          {children}
        </YStack>
      </XStack>

      {/* THE backoffice toast host: one shell-level viewport so every desk
          surface (list, form, report, kanban, …) renders notify()/showToast
          feedback without mounting its own. Double-mount safe — a second
          viewport lower in the tree no-ops (components Toast contract). */}
      {ToastViewport ? <ToastViewport /> : null}
    </YStack>
  );
};

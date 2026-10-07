/**
 * DeskShell - Top-level layout component for Frappe Desk.
 *
 * Composes the Awesomebar (top), DeskSidebar (start-edge), Breadcrumbs,
 * and a main content area into a full-page desk layout.
 *
 * Uses semantic HTML elements via Tamagui's `tag` prop for accessibility:
 * - Header for the top bar
 * - Nav for the sidebar
 * - Main for the content area
 *
 * Narrow viewports (<640px): sidebar becomes an overlay drawer so main
 * content keeps the full width (SB-M-1706). Banner bottom border follows
 * the surface borderWidth knob (SB-M-1708). Shell chrome is R-NONE (no
 * radius on the inverted-L) and consumes house Button / phosphor icons
 * so knobs and DG-IDN-06 reach the banner.
 */

import {
  Breadcrumbs,
  Button,
  CONTENT_MAX_WIDTH,
  PageHeadingScope,
  SizableText,
  SkipLink,
  XStack,
  YStack,
  isWeb,
  useDocumentTitle,
} from '@repo/ui';
import type { BreadcrumbItem } from '@repo/ui';
import { NARROW_BREAKPOINT, useLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
import { ListIcon, XIcon } from '@phosphor-icons/react';
import { useHotkey } from '@tanstack/react-hotkeys';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Awesomebar } from './awesomebar';
import { DeskSidebar } from './DeskSidebar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeskShellProps {
  children: React.ReactNode;
  /** Breadcrumb items */
  breadcrumbs?: BreadcrumbItem[];
  /** Navigation handler */
  onNavigate?: (path: string) => void;
  /** Current path for sidebar active state */
  activePath?: string;
  /** Show sidebar (default true) */
  showSidebar?: boolean;
  /** Show awesomebar (default true) */
  showAwesomebar?: boolean;
}

/**
 * Narrow viewport → sidebar drawer. Same value as theme `layoutBreakpoints.medium`
 * / `NARROW_BREAKPOINT` (640; Tamagui `$sm`). DG-LAY-01.
 */
export const DESK_NARROW_BREAKPOINT = NARROW_BREAKPOINT;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Cross-platform narrow detection: `compact` = width < DESK_NARROW_BREAKPOINT
 * (theme layoutBreakpoints.medium, 640). Web rides matchMedia thresholds,
 * native rides window dimensions — phones get the drawer instead of the rail.
 */
function useIsNarrowDesk(): boolean {
  return useLayoutSizeClass() === 'compact';
}

/** Size token is a HEIGHT key — map the banner min-height from it, never fontSize. */
function bannerMinHeight(sizeToken: string): '$5' | '$6' | '$7' {
  if (sizeToken === '$5') {
    return '$7';
  }
  if (sizeToken === '$3') {
    return '$5';
  }
  return '$6';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeskShell({
  children,
  breadcrumbs,
  onNavigate,
  activePath,
  showSidebar = true,
  showAwesomebar = true,
}: DeskShellProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'DeskShell' });
  const isNarrow = useIsNarrowDesk();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // DG-COPY-04: document title is the reverse breadcrumb trail
  // ("Leaf – Section – App"). Web-only; no-op when there are no breadcrumbs.
  useDocumentTitle(breadcrumbs);

  // Desktop always shows the rail; closing the drawer when leaving narrow keeps state clean.
  useEffect(() => {
    if (!isNarrow) {
      setMobileSidebarOpen(false);
    }
  }, [isNarrow]);

  const handleNavigate = useCallback(
    (path: string) => {
      if (isNarrow) {
        setMobileSidebarOpen(false);
      }
      onNavigate?.(path);
    },
    [isNarrow, onNavigate],
  );

  // Desk-level keyboard shortcuts via @tanstack/react-hotkeys
  useHotkey(
    'Mod+K',
    () => {
      if (typeof document === 'undefined') {
        return;
      }
      const input = document.querySelector<HTMLInputElement>('[data-awesomebar-input]');
      if (input) {
        input.focus();
      }
    },
    { enabled: showAwesomebar, conflictBehavior: 'allow' },
  );

  useHotkey(
    'Escape',
    () => {
      if (isNarrow && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return;
      }
      if (typeof document === 'undefined') {
        return;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    { conflictBehavior: 'allow' },
  );

  const surfaceBorderWidth = knobProps.surface.borderWidth;
  const showMobileToggle = showSidebar && isNarrow;
  const drawerEdge = isWeb ? { insetInlineStart: 0 } : { start: 0 };

  const toggleButton = showMobileToggle ? (
    <Button
      chromeless
      circular
      icon={mobileSidebarOpen ? XIcon : ListIcon}
      aria-label={t('Toggle sidebar')}
      aria-expanded={mobileSidebarOpen}
      aria-controls="desk-sidebar"
      onPress={() => {
        setMobileSidebarOpen((open) => !open);
      }}
      data-testid="desk-sidebar-toggle"
    />
  ) : null;

  const chromeBorder = {
    borderWidth: 0,
    borderRadius: 0,
    borderBottomWidth: surfaceBorderWidth,
    borderBottomColor: knobProps.surface.borderColor,
  } as const;

  return (
    <YStack
      flex={1}
      height="100%"
      width="100%"
      overflow="hidden"
      data-testid="desk-shell">
      {isWeb ? <SkipLink targetId="desk-main">{t('Skip to content')}</SkipLink> : null}

      {/* Header with Awesomebar — R-NONE full-bleed chrome; knobs own pad/gap/type. */}
      {showAwesomebar && (
        <XStack
          role="banner"
          {...knobProps.surface}
          {...knobProps.gap}
          {...knobProps.panelPadding}
          {...chromeBorder}
          minHeight={bannerMinHeight(knobProps.sizeToken)}
          alignItems="center"
          flexShrink={0}>
          {toggleButton}
          <SizableText
            {...knobProps.heading}
            {...knobProps.controlType}
            flexShrink={0}>
            {t('Desk')}
          </SizableText>
          <Awesomebar
            onNavigate={handleNavigate}
            flex={1}
            minWidth={0}
          />
        </XStack>
      )}

      {/* Narrow + no awesomebar: still expose the drawer toggle */}
      {!showAwesomebar && showMobileToggle && (
        <XStack
          {...knobProps.surface}
          {...knobProps.gap}
          {...knobProps.panelPadding}
          {...chromeBorder}
          alignItems="center"
          flexShrink={0}>
          {toggleButton}
        </XStack>
      )}

      <XStack
        flex={1}
        minWidth={0}
        position="relative"
        overflow="hidden">
        {/* Desktop nav sidebar — in flow. Sidebar owns the painted surface. */}
        {showSidebar && !isNarrow && (
          <YStack
            role="navigation"
            aria-label={t('Desk navigation')}
            id="desk-sidebar"
            flexShrink={0}
            data-testid="desk-sidebar-rail">
            <DeskSidebar
              onNavigate={handleNavigate}
              activePath={activePath}
            />
          </YStack>
        )}

        {/* Mobile drawer + scrim */}
        {showSidebar && isNarrow && mobileSidebarOpen && (
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
                setMobileSidebarOpen(false);
              }}
              data-testid="desk-sidebar-scrim"
            />
            <YStack
              role="navigation"
              aria-label={t('Desk navigation')}
              id="desk-sidebar"
              position="absolute"
              top={0}
              bottom={0}
              zIndex={11}
              {...drawerEdge}
              {...knobProps.surface}
              borderRadius={0}
              data-testid="desk-sidebar-drawer">
              <DeskSidebar
                onNavigate={handleNavigate}
                activePath={activePath}
              />
            </YStack>
          </>
        )}

        {/* Main content */}
        <YStack
          role="main"
          id="desk-main"
          tabIndex={-1}
          flex={1}
          minWidth={0}
          minHeight={0}>
          {/* DG-A11Y-02: one h1 budget per desk page (multiple-h1 DEV warn). */}
          <PageHeadingScope name="DeskShell">
            {/* Breadcrumbs — LC-35 WAYFINDING-CHROMELESS / Axiom 16: the
                chromeless trail sits ON the page column's alignment line.
                The shell renders above the page scaffold, so it mirrors
                Screen's content column (max-width cap + centering +
                panelPadding inset on the inline axis) to share the exact x
                that page templates give headings and content. Vertical pad
                stays 0 so the trail does not inflate above the page. */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <YStack
                width="100%"
                maxWidth={CONTENT_MAX_WIDTH}
                alignSelf="center"
                paddingHorizontal={knobProps.panelPadding.padding}
                data-testid="desk-breadcrumb-line">
                <Breadcrumbs
                  items={breadcrumbs}
                  onNavigate={handleNavigate}
                />
              </YStack>
            )}

            {/* Content */}
            <YStack
              flex={1}
              overflow="scroll"
              minWidth={0}>
              {children}
            </YStack>
          </PageHeadingScope>
        </YStack>
      </XStack>
    </YStack>
  );
}

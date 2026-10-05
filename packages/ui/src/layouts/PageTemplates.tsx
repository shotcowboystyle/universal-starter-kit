/**
 * Standard page templates.
 *
 * Thin, compose-only shells over the existing page primitives (`Screen`,
 * `PageHeader`, `ScreenToolbar`) and canonical scaffolds (`SupportingPaneLayout`).
 * They exist so product screens declare intent ("this is a list page") instead
 * of re-assembling scroll + max-width + header + pane plumbing by hand.
 *
 * - **ListPageLayout** — collection screens: header + optional filter toolbar +
 *   a flex content region for tables / grids / feeds.
 * - **DetailPageLayout** — single-record screens: back/actions toolbar + header +
 *   main content with an optional supporting `aside` (⅔ / ⅓ from `expanded` up,
 *   stacked below the main content on compact/medium).
 * - **SettingsPageLayout** — form-heavy screens: content capped at the
 *   `expanded` breakpoint for a comfortable form measure; sections stack with
 *   the semantic between-groups gap. Field grids (e.g. forms' `FormGrid`)
 *   slot into the children.
 *
 * Breakpoints come from the canonical layout tokens — no raw px.
 * Density is unpinned on `Screen`: omit `compact` so the density knob
 * restyles the page; pass `compact` to declare Surface intent for the subtree.
 */

import {
  defaultMaxPanes,
  layoutBreakpoints,
  useLayoutSizeClass,
  useSemanticGaps,
  type LayoutSizeClass,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';

import { PageHeader, Screen, ScreenToolbar, type ScreenProps } from './Page';
import { SupportingPaneLayout } from './PaneScaffold';

// ── Shared header slot ─────────────────────────────────────────────────────

interface TemplateHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Underline navigation (tabs) seated on the page-header hairline. */
  nav?: ReactNode;
  /** Full override — replaces the default `PageHeader`. */
  header?: ReactNode;
}

function renderTemplateHeader({ title, subtitle, actions, nav, header }: TemplateHeaderProps) {
  if (header !== undefined) {
    return header;
  }
  if (!title && !subtitle && !actions && !nav) {
    return null;
  }
  return <PageHeader title={title} subtitle={subtitle} actions={actions} nav={nav} />;
}

// ── ListPageLayout ─────────────────────────────────────────────────────────

export interface ListPageLayoutProps extends ScreenProps, TemplateHeaderProps {
  /** Filter / search / view-switcher row rendered between header and content. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Standard collection screen: `PageHeader` (title + actions), optional filter
 * toolbar, then a flex content region so tables / image grids fill the page.
 *
 * @example
 * <ListPageLayout title="Pokemon" actions={<ViewSwitcher … />}>
 *   <FrappeListView doctype="Pokemon" flex={1} />
 * </ListPageLayout>
 */
export function ListPageLayout({
  title,
  subtitle,
  actions,
  header,
  nav,
  toolbar,
  children,
  ...rest
}: ListPageLayoutProps) {
  return (
    <Screen data-canonical="list-page" {...rest}>
      {renderTemplateHeader({ title, subtitle, actions, header, nav })}
      {toolbar}
      <YStack flex={1} minWidth={0} data-testid="list-page-content">
        {children}
      </YStack>
    </Screen>
  );
}

// ── DetailPageLayout ───────────────────────────────────────────────────────

export interface DetailPageLayoutProps extends ScreenProps, TemplateHeaderProps {
  /** Leading toolbar content (typically a back button). */
  toolbarLeading?: ReactNode;
  /** Trailing toolbar content (typically edit / primary actions). */
  toolbarTrailing?: ReactNode;
  /**
   * Supporting content (metadata, timeline, related records). Side-by-side
   * (⅔ / ⅓) from `expanded` (860) up; stacked below the main content on
   * compact/medium — never hidden.
   */
  aside?: ReactNode;
  /** Optional size-class override (tests / Storybook viewports). */
  sizeClass?: LayoutSizeClass;
  children: ReactNode;
}

/**
 * Standard single-record screen: back/actions toolbar, header, main content
 * with an optional supporting pane.
 *
 * @example
 * <DetailPageLayout
 *   title={displayName}
 *   toolbarLeading={<Button onPress={back}>Back</Button>}
 *   toolbarTrailing={<Button theme="accent">Edit</Button>}
 *   aside={<Timeline … />}
 * >
 *   <FrappeForm doctype="Pokemon" name={id} />
 * </DetailPageLayout>
 */
export function DetailPageLayout({
  title,
  subtitle,
  actions,
  header,
  nav,
  toolbarLeading,
  toolbarTrailing,
  aside,
  sizeClass: sizeClassProp,
  children,
  ...rest
}: DetailPageLayoutProps) {
  const liveClass = useLayoutSizeClass();
  const sizeClass = sizeClassProp ?? liveClass;
  const multi = defaultMaxPanes(sizeClass) >= 2;
  const gaps = useSemanticGaps();

  const toolbar =
    toolbarLeading || toolbarTrailing ? <ScreenToolbar leading={toolbarLeading} trailing={toolbarTrailing} /> : null;

  let body: ReactNode;
  if (aside === null || aside === undefined) {
    body = children;
  } else if (multi) {
    body = (
      <SupportingPaneLayout sizeClass={sizeClass} supporting={aside}>
        {children}
      </SupportingPaneLayout>
    );
  } else {
    // Supporting content stays reachable on small viewports (stacked, not hidden).
    body = (
      <YStack {...gaps.betweenGroups} data-testid="detail-page-stack">
        {children}
        {aside}
      </YStack>
    );
  }

  return (
    <Screen data-canonical="detail-page" {...rest}>
      {toolbar}
      {renderTemplateHeader({ title, subtitle, actions, header, nav })}
      {body}
    </Screen>
  );
}

// ── SettingsPageLayout ─────────────────────────────────────────────────────

export interface SettingsPageLayoutProps extends ScreenProps, TemplateHeaderProps {
  children: ReactNode;
}

/**
 * Standard settings / preferences screen. Content is capped at the `expanded`
 * breakpoint (860) — a comfortable measure for label + control rows — instead
 * of the full `CONTENT_MAX_WIDTH`. Compose `PageSection` blocks as children;
 * field grids (forms' `FormGrid`) collapse to one column on their own below
 * their container threshold.
 *
 * @example
 * <SettingsPageLayout title="Settings" subtitle="Workspace preferences">
 *   <PageSection title="Profile">…fields…</PageSection>
 *   <PageSection title="Notifications">…fields…</PageSection>
 * </SettingsPageLayout>
 */
export function SettingsPageLayout({
  title,
  subtitle,
  actions,
  header,
  nav,
  maxWidth = layoutBreakpoints.expanded,
  children,
  ...rest
}: SettingsPageLayoutProps) {
  return (
    <Screen data-canonical="settings-page" maxWidth={maxWidth} {...rest}>
      {renderTemplateHeader({ title, subtitle, actions, header, nav })}
      {children}
    </Screen>
  );
}

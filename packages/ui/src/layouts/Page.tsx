/**
 * Page-shell primitives - the layout building blocks every screen needs.
 *
 * These exist so the example app (and any consumer app) can compose screens
 * by reaching for high-level page primitives instead of rebuilding scroll
 * containers, max-width centering, padded headers, and divider-underlined
 * section titles by hand on every screen.
 *
 * Design rules:
 * - Lean on Tamagui defaults wherever possible. We don't re-style the
 *   underlying primitives; we compose them.
 * - Spacing/padding comes from the resolved knob theme so the whole app
 *   responds to preset/knob switches uniformly.
 * - Stay minimal. PageHeader has a subtle accent rule, Section has a
 *   divider, that's it. No decorative gradients, no heavy chrome.
 */

import {
  MIN_PRESS_TARGET,
  Preset,
  Surface,
  containerCapProps,
  hairline,
  layoutBreakpoints,
  resolvePageTitleScale,
  useResolvedKnobs,
} from '@repo/theme';
import type { PageTitleScale } from '@repo/theme';
import type { ReactNode } from 'react';
import type { ScrollViewProps as TamaguiScrollViewProps, SpaceTokens, XStackProps, YStackProps } from 'tamagui';
import { H1, H2, H3, H4, H5, H6, Paragraph, Separator, XStack, YStack, isWeb } from 'tamagui';

import { componentColors, sectionHeading } from '../component-colors';
import { ScrollView } from '../ScrollView';

import { PageHeadingScope, usePageChromeInset, useRegisterPageHeading } from './PageHeadingScope';
import type { PageHeadingLevel } from './PageHeadingScope';

/** Semantic level → tamagui heading component (runtime `tag` is not honored). */
const PAGE_HEADING_TAGS = { 1: H1, 2: H2, 3: H3, 4: H4, 5: H5, 6: H6 } as const;

/** `$4` → `$-4` so PageHeader can cancel Screen's panel padding. */
const negateSpaceToken = (token: string): `$-${string}` => `$-${token.startsWith('$') ? token.slice(1) : token}`;

/** Non-empty string check for optional text props. */
const hasText = (text: string | null | undefined): text is string => text !== undefined && text !== null && text !== '';

type PageHeaderKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

/** Knob spacing values are always `$n` tokens; this narrows them for Tamagui space props. */
const isSpaceToken = (value: string): value is SpaceTokens & string => value.startsWith('$');

/** Negative horizontal margin that cancels the Screen's inset, or null when there is none. */
const bleedProps = (insetToken: string | null) => {
  if (!hasText(insetToken)) {
    return null;
  }
  const negated = negateSpaceToken(insetToken);
  return isSpaceToken(negated) ? { marginHorizontal: negated } : null;
};

/** Horizontal padding that restores the Screen's inset inside a bled header. */
const insetPaddingProps = (insetToken: string | null) =>
  hasText(insetToken) && isSpaceToken(insetToken) ? { paddingHorizontal: insetToken } : null;

/** headingFont knob on native: family only; web rethemes through the .font_heading CSS var. */
const headingFamilyProps = (knobProps: PageHeaderKnobProps) =>
  isWeb ? null : { fontFamily: knobProps.heading.fontFamily };

const knobsFor = (component: string, { compact }: { compact: boolean | undefined }) =>
  // An omitted override must leave density under the preset's control.
  compact === undefined ? { component } : { component, compact };

/** Hairline rule under PageHeader — container-owned, bleeds to the Screen column. */
const HEADER_RULE = { ...hairline.bottom, borderColor: componentColors.divider };

/** Nested surfaces step density only; hue remains inherited. */
// oxlint-disable-next-line typescript/promise-function-async -- ReactNode includes Promise but this is a sync component; `async` would break rendering
const NestedScale = ({ density, children }: { density: string; children: ReactNode }) => {
  if (density === 'compact') {
    return children;
  }
  return <Preset overrides={{ density: 'compact' }}>{children}</Preset>;
};

// ---------------------------------------------------------------------------
// Screen — page outer shell (scroll, max-width, padding, theme background)
// ---------------------------------------------------------------------------

/**
 * Default content cap for page scaffolds — the canonical `xl` breakpoint
 * (layout primitives consume breakpoint tokens, not raw pixels).
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public layout constant consumed alongside Screen; moving it would change the export path
export const CONTENT_MAX_WIDTH = layoutBreakpoints.xl;

export interface ScreenProps extends YStackProps {
  /** Wrap content in a ScrollView. Default: true. */
  scroll?: boolean;
  /** Max content width. Default: `CONTENT_MAX_WIDTH` (xl, 1280). Pass 0 to disable. */
  maxWidth?: number;
  /** Skip the centered max-width container (full-bleed content). */
  bleed?: boolean;
  /** Skip the resolved knob padding (caller controls spacing). */
  noPadding?: boolean;
  /** Props forwarded to the inner ScrollView when scroll=true. */
  scrollViewProps?: TamaguiScrollViewProps;
  /** Density override inherited by the subtree. Omitted follows the preset. */
  compact?: boolean;
}

const ScreenInner = ({
  children,
  scroll = true,
  maxWidth = CONTENT_MAX_WIDTH,
  bleed = false,
  noPadding = false,
  scrollViewProps,
  compact,
  ...rest
}: ScreenProps) => {
  const { knobProps } = useResolvedKnobs(knobsFor('Screen', { compact }));

  const inner = (
    <YStack
      data-testid="screen"
      data-density={knobProps.density}
      flex={1}
      width="100%"
      {...(maxWidth && !bleed ? { maxWidth, alignSelf: 'center' } : null)}
      {...(noPadding ? null : knobProps.panelPadding)}
      {...knobProps.gapLg}
      {...rest}>
      {/* One h1 budget per Screen — catalog headings register here.
          insetToken lets PageHeader bleed its hairline to the column edges. */}
      <PageHeadingScope insetToken={noPadding ? null : knobProps.panelPadding.padding}>{children}</PageHeadingScope>
    </YStack>
  );

  if (!scroll) {
    return (
      <YStack
        flex={1}
        backgroundColor="$background">
        {inner}
      </YStack>
    );
  }

  return (
    <ScrollView
      flex={1}
      backgroundColor="$background"
      // flexGrow lets flex:1 children (e.g. EmptyState centering) fill the
      // viewport when the content is shorter than the screen.
      contentContainerStyle={{ flexGrow: 1 }}
      {...scrollViewProps}>
      {inner}
    </ScrollView>
  );
};

/**
 * Outer page shell. Pairs with PageHeader/Section/EmptyState for thin
 * compose-only screens.
 *
 * SF-TRANSPARENT + SP-PAD/SP-GAP: panelPadding and gapLg restyle with the
 * density/space knobs. Only an explicit compact prop overrides density.
 *
 * @example
 * <Screen>
 *   <PageHeader title="Items" subtitle="A list of items" />
 *   <FrappeImageView doctype="Item" />
 * </Screen>
 */
export const Screen = ({ compact, ...props }: ScreenProps) => {
  let density: 'compact' | 'comfortable' | undefined;
  if (compact !== undefined) {
    density = compact ? 'compact' : 'comfortable';
  }
  return (
    <Surface density={density}>
      <ScreenInner
        compact={compact}
        {...props}
      />
    </Surface>
  );
};

// ---------------------------------------------------------------------------
// PageHeader — title + subtitle + optional actions
// ---------------------------------------------------------------------------

export interface PageHeaderProps extends YStackProps {
  /** Page heading text. Rendered as <H1>. */
  title?: string;
  /** Smaller supporting text below the title. */
  subtitle?: string;
  /** Override the default H1 — pass a custom heading node. */
  heading?: ReactNode;
  /** Trailing actions (buttons, switchers, etc.) shown right of the title. */
  actions?: ReactNode;
  /**
   * Underline navigation (tabs) that sits on the header hairline.
   * The header still draws the edge-to-edge rule; the nav is pulled onto it
   * so the active indicator is not a second competing line.
   */
  nav?: ReactNode;
  /** Adds a subtle divider rule under the header. Default: true. */
  divider?: boolean;
  /**
   * Semantic level of the built-in title. The page title is the
   * single h1 by default; pass 2+ when the header is nested under another
   * page's h1. The title then renders on the matching heading scale.
   */
  headingLevel?: PageHeadingLevel;
  /**
   * Per-instance eject for the page-title step (hero-H1 dial).
   * Omitted — the default — the title follows the `pageTitleScale` knob, which
   * ships `moderate` ($8 = 32px): a page title is wayfinding, not content.
   * Pass `"display"` ($10 = 64px) for a single marketing hero, or reach for
   * the `hero` preset / a `pageTitleScale` override to re-scale a whole
   * surface. Semantics (headingLevel) are unchanged either way.
   */
  titleScale?: PageTitleScale;
  /** Density override. Omitted follows the preset or parent Surface. */
  compact?: boolean;
}

/** Title/subtitle column plus trailing actions. */
const PageHeaderRow = ({
  titleNode,
  subtitle,
  actions,
  knobProps,
}: {
  titleNode: ReactNode;
  subtitle: string | undefined;
  actions: ReactNode;
  knobProps: PageHeaderKnobProps;
}) => {
  const hasTitleNode = Boolean(titleNode);
  const hasActions = Boolean(actions);
  return (
    <XStack
      justifyContent="space-between"
      alignItems={hasText(subtitle) ? 'flex-start' : 'center'}
      flexWrap="wrap"
      {...knobProps.gap}>
      {/* Frame containment: title + actions must shrink and wrap at
        narrow widths instead of painting past the frame. flexShrink:1 +
        minWidth:0 lets the H1 wrap and each action wrap below the
        title rather than clip off-canvas. */}
      {hasTitleNode || hasText(subtitle) ? (
        <YStack
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          gap="$1">
          {titleNode}
          {hasText(subtitle) ? (
            // T-HELPER on the shared body fragment — not a local size map.
            <Paragraph
              margin={0}
              {...knobProps.body}
              color={knobProps.textAccentColor}>
              {subtitle}
            </Paragraph>
          ) : null}
        </YStack>
      ) : null}
      {hasActions ? (
        <XStack
          {...knobProps.gap}
          alignItems="center"
          flexWrap="wrap"
          flexShrink={1}
          minWidth={0}>
          {actions}
        </XStack>
      ) : null}
    </XStack>
  );
};

/**
 * Standard page header (Polaris Page / Primer PageHeader / Linear).
 *
 * Title + subtitle stack as one column (lede under the title, not under the
 * actions). Type comes from the shared heading / pageTitle / body fragments —
 * no local subtitle scale. The hairline is a container-owned edge that bleeds
 * to the Screen column. `nav` (tabs) is pulled onto that edge so the active
 * indicator shares the one rule instead of stacking a second line.
 */
export const PageHeader = ({
  title,
  subtitle,
  heading,
  actions,
  nav,
  divider = true,
  headingLevel = 1,
  titleScale,
  compact,
  children,
  ...rest
}: PageHeaderProps) => {
  const { knobProps } = useResolvedKnobs(knobsFor('PageHeader', { compact }));
  const insetToken = usePageChromeInset();
  // Count the built-in title toward the Screen's h1 budget.
  // Custom `heading` nodes have an unknown level and are not registered.
  const hasCustomHeading = Boolean(heading);
  useRegisterPageHeading({
    level: headingLevel,
    component: 'PageHeader',
    label: title,
    enabled: !hasCustomHeading && hasText(title),
  });
  // headingFont knob: on web FontKnobStyles (@repo/theme)
  // rethemes all $heading text via the .font_heading --f-family CSS var, which
  // keeps the heading size scale intact. Native has no CSS vars, so the family
  // token is applied directly there (family only — weight/size stay on the
  // heading scale).
  const headingFamily = headingFamilyProps(knobProps);
  const TitleTag = PAGE_HEADING_TAGS[headingLevel];
  // The page-title step comes from the knob (`moderate` by default), so
  // one dial re-scales every composed screen; `titleScale` is the explicit
  // per-instance eject and resolves through the same table. The semantic tag
  // still follows headingLevel — the step is emphasis, not structure.
  const titleSize = titleScale === undefined ? knobProps.pageTitle : resolvePageTitleScale(titleScale);
  const titleNode =
    heading ??
    (hasText(title) ? (
      <TitleTag
        margin={0}
        {...titleSize}
        fontWeight={knobProps.heading.fontWeight}
        {...headingFamily}
        data-font-weight-knob={knobProps.heading.fontWeight === '700' ? 'bold' : 'regular'}>
        {title}
      </TitleTag>
    ) : null);

  // When nav is present the strip's active indicator sits ON this rule, so
  // there is one hairline — not a second competing line. The header then
  // paints the rule as a pinned edge under the nav instead of a border, so
  // the nav fills the frame down to its bottom edge.
  const hasNav = Boolean(nav);
  const bleed = bleedProps(insetToken);
  const contentPad = insetPaddingProps(insetToken);
  const gapToken = knobProps.gap.gap;
  const bottomPad = !hasNav && isSpaceToken(gapToken) ? gapToken : 0;

  return (
    <YStack
      data-testid="page-header"
      data-density={knobProps.density}
      overflow="visible"
      {...bleed}
      {...(divider && !hasNav ? HEADER_RULE : null)}
      {...(divider && hasNav ? { position: 'relative' as const } : null)}
      {...(hasNav ? knobProps.gap : null)}
      {...rest}>
      <YStack
        {...contentPad}
        paddingBottom={bottomPad}>
        <PageHeaderRow
          titleNode={titleNode}
          subtitle={subtitle}
          actions={actions}
          knobProps={knobProps}
        />
        {children}
      </YStack>
      {hasNav && divider ? (
        // Sit the tab indicator on the header hairline (Primer / Linear).
        <YStack
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          pointerEvents="none"
          {...HEADER_RULE}
        />
      ) : null}
      {hasNav ? (
        <YStack
          width="100%"
          data-page-header-nav="">
          {nav}
        </YStack>
      ) : null}
    </YStack>
  );
};

// ---------------------------------------------------------------------------
// PageSection — labeled content block (with optional divider/surface)
//
// Named "PageSection" rather than "Section" so it doesn't collide with
// Tamagui's `Section` HTML tag wrapper.
// ---------------------------------------------------------------------------

export interface PageSectionProps extends YStackProps {
  /** Section title. Rendered as <H2>. */
  title?: string;
  /** Smaller description below the title. */
  description?: string;
  /** Override the default H2. */
  heading?: ReactNode;
  /** Show a divider rule under the title row. Default: true. */
  divider?: boolean;
  /** Wrap content in a soft card surface. Default: false. */
  surface?: boolean;
  /**
   * Semantic level of the built-in section title. Default 2 —
   * one step below the page h1. Pass 3+ for nested sections so levels step
   * without skips. Visuals are pinned by the shared sectionHeading scale.
   */
  headingLevel?: Exclude<PageHeadingLevel, 1>;
  /** Density override. Omitted follows the preset or parent Surface. */
  compact?: boolean;
}

/**
 * Labeled content section. Cheap way to break a long page into clearly
 * separated regions without reaching for custom layout JSX.
 */
export const PageSection = ({
  title,
  description,
  heading,
  divider = true,
  surface = false,
  headingLevel = 2,
  compact,
  children,
  ...rest
}: PageSectionProps) => {
  const { knobProps } = useResolvedKnobs(knobsFor('PageSection', { compact }));
  // See PageHeader: native-only heading family from the headingFont knob.
  const headingFamily = headingFamilyProps(knobProps);
  // The sectionHeading spread pins the visual scale, so stepped levels only
  // change the semantic tag.
  const SectionTag = PAGE_HEADING_TAGS[headingLevel];
  const headingNode =
    heading ??
    (hasText(title) ? (
      <SectionTag
        margin={0}
        {...headingFamily}
        {...sectionHeading}>
        {title}
      </SectionTag>
    ) : null);

  // Soft card surface: complete surface fragment (knob border width) +
  // container-capped radius (Axiom 1) + panel padding — no fixed border.
  // SAFETY: the knob fragments are spreadable Tamagui style props; only their per-key literal types are wider than YStackProps.
  const surfaceProps: Partial<YStackProps> = surface
    ? ({
        ...knobProps.surface,
        ...knobProps.containerRadius,
        ...knobProps.panelPadding,
        ...containerCapProps('PageSection', knobProps.borderRadius.borderRadius, knobProps.space),
      } as Partial<YStackProps>)
    : {};

  const hasHeading = Boolean(headingNode);
  const headerBlock =
    hasHeading || hasText(description) ? (
      <YStack gap="$2">
        {headingNode}
        {hasText(description) ? (
          <Paragraph
            margin={0}
            {...knobProps.body}
            color={knobProps.textAccentColor}>
            {description}
          </Paragraph>
        ) : null}
        {divider ? (
          <Separator
            {...hairline.line}
            backgroundColor={componentColors.divider}
          />
        ) : null}
      </YStack>
    ) : null;

  // Page line: the heading block renders OUTSIDE
  // the painted card so same-rank section titles share one x whether or not
  // a sibling flips `surface` — only the section CONTENT earns the card's
  // panelPadding inset (the painted surface owns it).
  return (
    <YStack
      data-testid="page-section"
      data-density={knobProps.density}
      {...knobProps.gap}
      {...rest}>
      {headerBlock}
      {surface ? (
        <YStack
          {...knobProps.gap}
          {...surfaceProps}>
          <NestedScale density={knobProps.density}>{children}</NestedScale>
        </YStack>
      ) : (
        children
      )}
    </YStack>
  );
};

// EmptyState lives in ./EmptyState — re-exported so Screen/PageHeader
// consumers that import the page shell keep a stable path.
export { EmptyState, type EmptyStateProps } from './EmptyState';

// ---------------------------------------------------------------------------
// ScreenToolbar — minimal back/edit-style screen toolbar
// ---------------------------------------------------------------------------

export interface ScreenToolbarProps extends XStackProps {
  /** Leading content (typically a back button). */
  leading?: ReactNode;
  /** Trailing content (typically primary/secondary actions). */
  trailing?: ReactNode;
}

/**
 * Minimal toolbar with leading/trailing slots. For the standard "back +
 * primary action" pattern at the top of detail screens.
 *
 * For full action-array driven toolbars use the existing `Toolbar` component.
 *
 * SP-PAD + SP-GAP on the bar; child actions own size/radius/A-STATE (Button
 * contract). Nested under Screen, the bar bleeds Screen's inset then
 * re-applies panelPadding so the row shares the page line without
 * double-padding.
 */
export const ScreenToolbar = ({ leading, trailing, children, ...rest }: ScreenToolbarProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'ScreenToolbar' });
  const insetToken = usePageChromeInset();
  const bleed = bleedProps(insetToken);
  return (
    <XStack
      data-testid="screen-toolbar"
      data-density={knobProps.density}
      justifyContent="space-between"
      alignItems="center"
      flexWrap="wrap"
      minHeight={MIN_PRESS_TARGET}
      {...bleed}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      {...rest}>
      <XStack
        {...knobProps.gap}
        alignItems="center"
        flexWrap="wrap"
        flexShrink={1}
        minWidth={0}>
        {leading}
      </XStack>
      {children}
      <XStack
        {...knobProps.gap}
        alignItems="center"
        flexWrap="wrap"
        flexShrink={1}
        minWidth={0}
        justifyContent="flex-end">
        {trailing}
      </XStack>
    </XStack>
  );
};

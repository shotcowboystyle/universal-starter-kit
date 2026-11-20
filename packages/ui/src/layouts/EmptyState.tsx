/**
 * EmptyState — centered empty / error placeholder (Polaris EmptyState +
 * Primer Blankslate anatomy).
 *
 * Full-page: icon well → heading → helper copy → primary (and optional
 * secondary) actions. Compact: quieter type, no flex-fill, for tables and
 * columns. `intent="error"` is sober failure chrome — never for a
 * successful empty dataset.
 */
import { Intent, readingWidthStyle, useResolvedKnobs, warnBannedErrorWords } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { H2, Paragraph, XStack, YStack, isWeb } from 'tamagui';
import type { ColorTokens, SpaceTokens, YStackProps } from 'tamagui';

import { componentColors } from '../component-colors';

export interface EmptyStateProps extends YStackProps {
  title: string;
  description?: string;
  /** Icon or illustration shown above the title. Decorative — hidden from AT. */
  icon?: ReactNode;
  /** Action button(s) shown below the description. One primary; secondary outlined. */
  action?: ReactNode;
  /** Smaller type + no flex-fill, for inline use inside tables/columns. */
  compact?: boolean;
  /**
   * Visual intent. `error` marks sober failure chrome — use via
   * AsyncBoundary; never for a successful empty dataset.
   */
  intent?: 'neutral' | 'error';
}

type WellRadius = Omit<KnobProps['borderRadius'], 'borderColor' | 'borderWidth'>;

/** The well paints no edge: keep the radius half of the fragment only. */
const radiusOnly = (fragment: KnobProps['borderRadius']): WellRadius =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: only the borderColor/borderWidth keys are dropped, which is exactly what WellRadius omits (Object.fromEntries widens to a plain record; the filtered entries are exactly the keys WellRadius keeps)
  Object.fromEntries(
    Object.entries(fragment).filter(([key]) => key !== 'borderColor' && key !== 'borderWidth'),
  ) as WellRadius;

/**
 * One paragraph per line: a web paragraph folds a newline into a space, and
 * a multi-line server reason then reads as one run-on sentence. Keys carry the
 * occurrence count so repeated lines stay distinct without an index key.
 */
const toDescriptionLines = (description: string | undefined): { key: string; line: string }[] => {
  const seen = new Map<string, number>();
  return (description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const occurrence = seen.get(line) ?? 0;
      seen.set(line, occurrence + 1);
      return { key: `${occurrence}:${line}`, line };
    });
};

const rootA11yProps = (isError: boolean, titleId: string, title: string) => {
  if (isWeb) {
    return {
      role: isError ? 'alert' : 'status',
      'aria-labelledby': titleId,
      'aria-live': isError ? undefined : 'polite',
    } as const;
  }
  return {
    accessibilityRole: isError ? 'alert' : 'text',
    accessibilityLabel: title,
  } as const;
};

/**
 * Centered empty/error state. Use for "no data", "not configured",
 * "permission denied" placeholder screens.
 *
 * Prefer `<AsyncBoundary>` for async data views so empty chrome can never
 * render on a failed load.
 */
export const EmptyState = ({
  title,
  description,
  icon,
  action,
  compact,
  intent = 'neutral',
  children,
  ...rest
}: EmptyStateProps) => {
  // Compact is a density override (space only), not a size step.
  // Omit it so the density knob can restyle pad/gap (Alert gallery hole).
  const { knobProps } = useResolvedKnobs(
    compact === undefined ? { component: 'EmptyState' } : { component: 'EmptyState', compact },
  );
  // See PageHeader: native-only heading family from the headingFont knob.
  const headingFamily = isWeb ? null : { fontFamily: knobProps.heading.fontFamily };
  const titleId = useId();
  const isError = intent === 'error';
  // Polaris/Primer: icon | copy | actions are three bands; title+description
  // sit tighter than the bands. Compact (table/column) stays on the stepped gap.
  const frameGap = compact ? knobProps.gap : knobProps.gapLg;
  const descriptionLines = toDescriptionLines(description);

  if (isError) {
    warnBannedErrorWords(title, { component: 'EmptyState' });
    warnBannedErrorWords(description, { component: 'EmptyState' });
  }

  const wellRadius = radiusOnly(knobProps.borderRadius);

  const hasIcon = Boolean(icon);
  const titleIdProps = isWeb ? { id: titleId } : { nativeID: titleId };
  const nativeHiddenProps = isWeb ? null : { accessibilityElementsHidden: true };
  const nativeFitProps = isWeb ? null : { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.55 };
  const well = hasIcon ? (
    <YStack
      alignItems="center"
      justifyContent="center"
      backgroundColor={componentColors.interactive.background}
      // R2e: an icon well rides the radius scale (DEFAULT), the same
      // resolution KPICard's well takes. Only the radius half of the
      // fragment applies — the well paints no edge. Its inset still scales
      // with the size knob (spec: empty icon well consumes sizeToken).
      {...wellRadius}
      // SAFETY: sizeToken is a size-knob token name, which is also a valid space token key.
      padding={knobProps.sizeToken as SpaceTokens}
      aria-hidden
      {...nativeHiddenProps}>
      {icon}
    </YStack>
  ) : null;

  const titleNode = compact ? (
    <Paragraph
      {...titleIdProps}
      {...knobProps.body}
      color={componentColors.text.primary}
      textAlign="center"
      margin={0}
      width="100%"
      {...nativeFitProps}>
      {title}
    </Paragraph>
  ) : (
    <H2
      {...titleIdProps}
      {...knobProps.heading}
      {...headingFamily}
      {...knobProps.textWeight}
      textAlign="center"
      margin={0}
      width="100%"
      color={componentColors.text.primary}
      {...nativeFitProps}>
      {title}
    </H2>
  );

  const hasAction = Boolean(action);

  return (
    <YStack
      flex={compact ? undefined : 1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      data-empty-intent={intent}
      data-density={knobProps.density}
      {...rootA11yProps(isError, titleId, title)}
      {...knobProps.panelPadding}
      {...frameGap}
      {...rest}>
      {well && isError ? <Intent name="error">{well}</Intent> : well}
      <YStack
        alignItems="center"
        gap="$1"
        {...readingWidthStyle()}>
        {titleNode}
        {descriptionLines.map(({ key, line }) => (
          <Paragraph
            key={key}
            {...knobProps.body}
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: textAccentColor is a theme color token name ($colorN) emitted by the knob recipe (textAccentColor is typed `string`; the color prop only accepts the color-token union)
            color={knobProps.textAccentColor as ColorTokens}
            fontSize={knobProps.label.fontSize}
            textAlign="center"
            margin={0}
            width="100%">
            {line}
          </Paragraph>
        ))}
      </YStack>
      {hasAction ? (
        <XStack
          {...knobProps.gap}
          alignItems="center"
          justifyContent="center"
          flexWrap="wrap"
          flexShrink={1}
          minWidth={0}
          maxWidth="100%">
          {action}
        </XStack>
      ) : null}
      {children}
    </YStack>
  );
};

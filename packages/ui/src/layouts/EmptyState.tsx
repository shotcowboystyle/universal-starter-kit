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
import { useId, type ReactNode } from 'react';
import { H2, Paragraph, XStack, YStack, isWeb, type YStackProps } from 'tamagui';

import { componentColors } from '../componentColors';

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

/**
 * Centered empty/error state. Use for "no data", "not configured",
 * "permission denied" placeholder screens.
 *
 * Prefer `<AsyncBoundary>` for async data views so empty chrome can never
 * render on a failed load.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  compact,
  intent = 'neutral',
  children,
  ...rest
}: EmptyStateProps) {
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
  // One paragraph per line: a web paragraph folds a newline into a space, and
  // a multi-line server reason then reads as one run-on sentence.
  const descriptionLines = (description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (isError) {
    warnBannedErrorWords(title, { component: 'EmptyState' });
    warnBannedErrorWords(description, { component: 'EmptyState' });
  }

  const { borderColor: _wellEdgeColor, borderWidth: _wellEdgeWidth, ...wellRadius } = knobProps.borderRadius;

  const well = icon ? (
    <YStack
      alignItems="center"
      justifyContent="center"
      backgroundColor={componentColors.interactive.background}
      // R2e: an icon well rides the radius scale (DEFAULT), the same
      // resolution KPICard's well takes. Only the radius half of the
      // fragment applies — the well paints no edge. Its inset still scales
      // with the size knob (spec: empty icon well consumes sizeToken).
      {...wellRadius}
      padding={knobProps.sizeToken as any}
      aria-hidden
      {...(!isWeb ? { accessibilityElementsHidden: true } : null)}>
      {icon}
    </YStack>
  ) : null;

  const titleNode = compact ? (
    <Paragraph
      {...(isWeb ? { id: titleId } : { nativeID: titleId })}
      {...knobProps.body}
      color={componentColors.text.primary}
      textAlign="center"
      margin={0}
      width="100%"
      {...(!isWeb && { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.55 })}>
      {title}
    </Paragraph>
  ) : (
    <H2
      {...(isWeb ? { id: titleId } : { nativeID: titleId })}
      {...knobProps.heading}
      {...headingFamily}
      {...knobProps.textWeight}
      textAlign="center"
      margin={0}
      width="100%"
      color={componentColors.text.primary}
      {...(!isWeb && { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.55 })}>
      {title}
    </H2>
  );

  return (
    <YStack
      flex={compact ? undefined : 1}
      width="100%"
      alignItems="center"
      justifyContent="center"
      data-empty-intent={intent}
      data-density={knobProps.density}
      {...(isWeb
        ? {
            role: isError ? 'alert' : 'status',
            'aria-labelledby': titleId,
            ...(!isError ? { 'aria-live': 'polite' as const } : null),
          }
        : {
            accessibilityRole: isError ? 'alert' : 'text',
            accessibilityLabel: title,
          })}
      {...knobProps.panelPadding}
      {...frameGap}
      {...rest}>
      {well && isError ? <Intent name="error">{well}</Intent> : well}
      <YStack alignItems="center" gap="$1" {...readingWidthStyle()}>
        {titleNode}
        {descriptionLines.map((line, index) => (
          <Paragraph
            key={`${index}:${line}`}
            {...knobProps.body}
            color={knobProps.textAccentColor as any}
            fontSize={knobProps.label.fontSize}
            textAlign="center"
            margin={0}
            width="100%">
            {line}
          </Paragraph>
        ))}
      </YStack>
      {action ? (
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
}

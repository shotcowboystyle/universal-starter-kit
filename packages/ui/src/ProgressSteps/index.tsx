import { CheckIcon, WarningIcon } from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  pressTargetHitSlop,
  radiusClassProps,
  useAaSolidFill,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { useState, type ReactNode } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, View, XStack, YStack, isWeb, styled } from 'tamagui';

import { componentColors } from '../componentColors';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

// ── Types ─────────────────────────────────────────────────────

export interface ProgressStep {
  /** Stable id (falls back to index). */
  id?: string;
  /** Step label shown under / beside the marker. */
  label: ReactNode;
  /** Optional secondary line (Carbon helper / Material subtitle). */
  description?: ReactNode;
  /** Force completed even when index >= current. */
  completed?: boolean;
  /** Disable jump-to for this step. */
  disabled?: boolean;
  /** Carbon/Material error: invalid or incomplete step. */
  error?: boolean;
  /** Material optional: helper reads "Optional" when no description is set. */
  optional?: boolean;
}

export interface ProgressStepsProps extends Omit<GetProps<typeof StepsRoot>, 'children'> {
  /** Ordered steps. */
  steps: ProgressStep[];
  /** Current (0-based) step index. */
  current: number;
  /** Called when an interactive step is activated. */
  onStepChange?: (index: number) => void;
  /** Orientation. @default "horizontal" */
  orientation?: 'horizontal' | 'vertical';
  /** Allow clicking steps when onStepChange is set. @default true */
  allowJump?: boolean;
  /**
   * Material linear / Orbit wizard: only completed steps are jump targets.
   * Upcoming stays inert — Next on the page is the only way forward.
   * Set false for Carbon non-linear / Material non-linear.
   * @default true
   */
  linear?: boolean;
  /** Compact markers + type (density compact override). */
  compact?: boolean;
  /**
   * Rail label treatment. `"hidden"` keeps markers (and a11y names) and
   * drops the visible per-step label — the 390 wizard treatment; the
   * current step's name rides the wizard legend as "Step n of m — X".
   * @default "visible"
   */
  labels?: 'visible' | 'hidden';
}

type StepState = 'completed' | 'current' | 'upcoming';
type MarkerKind = StepState | 'error';

// ── Styled ────────────────────────────────────────────────────

const StepsRoot = styled(YStack, {
  name: 'ProgressSteps',
  width: '100%',
});

const Marker = styled(View, {
  name: 'ProgressStepMarker',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  // R-PILL: the numbered disc is a circle at every radius
  // stop — the knob moves size, never shape. Not K1 (Progress/Meter rails).
  ...radiusClassProps('R-PILL', 'ProgressSteps marker'),
  borderRadius: 1000,
});

const StepButton = styled(View, {
  name: 'ProgressStepButton',
  backgroundColor: 'transparent',
  borderWidth: 0,
  cursor: 'pointer',
  // The button is the hit target; the ring lives on the marker.
  outlineWidth: 0,
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' as any },
});

const StepMarkerTarget = styled(View, {
  name: 'ProgressStepMarkerTarget',
});

const Connector = styled(View, {
  name: 'ProgressStepConnector',
  flexShrink: 0,
});

// ── Helpers ───────────────────────────────────────────────────

function stepState(index: number, current: number, forcedCompleted?: boolean): StepState {
  if (forcedCompleted || index < current) {
    return 'completed';
  }
  if (index === current) {
    return 'current';
  }
  return 'upcoming';
}

function splitNestedControl(nested: {
  px: number;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}) {
  const { px, hitSlop, ...box } = nested;
  return { px, hitSlop, box };
}

// ── Component ─────────────────────────────────────────────────

/**
 * Multi-step wizard / progress indicator (gallery: Progress indicator /
 * Stepper / Steps). Distinct from forms Progress (continuous bar) and
 * forms Stepper (quantity nudger). Timeline covers the chronological alias.
 *
 * Carbon ProgressIndicator + Material Stepper: numbered/check markers,
 * helper text, error/optional, linear-by-default. Polaris has no wizard
 * stepper — display-only when `onStepChange` is omitted.
 */
export function ProgressSteps({
  steps,
  current,
  onStepChange,
  orientation = 'horizontal',
  allowJump = true,
  linear = true,
  compact,
  labels = 'visible',
  ...props
}: ProgressStepsProps) {
  const { t } = useTranslation();
  const { knobProps, control, disabledState } = useResolvedKnobs(
    compact === undefined ? { component: 'ProgressSteps' } : { component: 'ProgressSteps', compact },
  );
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const [kbFocusIndex, setKbFocusIndex] = useState<number | null>(null);
  // Current marker rides an accent solid; completed/error fills pick
  // paper/ink from luminance rather than an assumed white glyph. An
  // `$accentBackground` under the 4.5 text floor against both scheme anchors
  // walks to the nearest accent solid that can carry the numeral.
  const currentFill = useAaSolidFill(componentColors.indicator.selected);
  const onSelected = useReadableTextOn(currentFill);
  const onCompleted = useReadableTextOn(componentColors.indicator.completed);
  const onError = useReadableTextOn('$red9');
  const { px: markerPx, hitSlop, box: nestedBox } = splitNestedControl(knobProps.nestedControl);
  const markerIconSize = Math.max(12, Math.round(markerPx * 0.45));
  const ringWidth = knobProps.borderRadius.borderWidth ?? 0;
  const connectorThickness = 2;
  const pressOutset = Math.max(0, Math.ceil((MIN_PRESS_TARGET - markerPx) / 2));
  const interactive = !!onStepChange && allowJump;
  const horizontal = orientation === 'horizontal';
  const gapToken = knobProps.gap.gap;

  return (
    <StepsRoot role="list" aria-label={t('Progress')} data-density={knobProps.density} data-labels={labels} {...props}>
      <XStack
        flexDirection={horizontal ? 'row' : 'column'}
        alignItems={horizontal ? 'flex-start' : 'stretch'}
        width="100%"
        gap={horizontal ? 0 : gapToken}>
        {steps.map((step, index) => {
          const state = stepState(index, current, step.completed);
          const kind: MarkerKind = step.error ? 'error' : state;
          const isLast = index === steps.length - 1;
          const canActivate =
            interactive && !step.disabled && state !== 'current' && (state === 'completed' || !linear);
          const isFocusable = interactive && !step.disabled && (canActivate || state === 'current');
          const markerBg =
            kind === 'error'
              ? '$red9'
              : kind === 'completed'
                ? componentColors.indicator.completed
                : kind === 'current'
                  ? currentFill
                  : 'transparent';
          const markerBorder = kind === 'upcoming' ? componentColors.indicator.track : markerBg;
          const markerFg =
            kind === 'upcoming'
              ? knobProps.textAccentColor
              : kind === 'error'
                ? (onError ?? '$color1')
                : kind === 'completed'
                  ? (onCompleted ?? '$color1')
                  : (onSelected ?? '$color1');
          const helper = step.description ?? (step.optional && kind !== 'error' ? t('Optional') : null);
          const connectorFill = index < current ? componentColors.indicator.completed : componentColors.indicator.track;
          // Upcoming is outlined-by-state: chromeless `borderWidth:none` would
          // erase the empty disc, so it keeps the OUTLINED-HAIRLINE floor.
          const markerRing = kind === 'upcoming' ? Math.max(ringWidth, 0.5) : ringWidth;

          const marker = (
            <Marker
              {...nestedBox}
              borderRadius={1000}
              borderWidth={markerRing}
              backgroundColor={markerBg}
              borderColor={markerBorder}
              data-nested-px={markerPx}
              data-step-state={kind}
              data-marker-ring={markerRing}
              transition={knobProps.transition}
              {...(state === 'current' ? ({ 'aria-current': 'step' } as Record<string, unknown>) : undefined)}
              {...(kbFocusIndex === index ? control.focusVisibleKnobProps : { outlineWidth: 0 })}
              {...(kind === 'upcoming'
                ? {
                    hoverStyle: {
                      borderColor: componentColors.indicator.hover,
                      backgroundColor: componentColors.indicator.inactive,
                    },
                  }
                : undefined)}>
              {kind === 'error' ? (
                <WarningIcon size={markerIconSize} color={markerFg} weight="bold" />
              ) : kind === 'completed' ? (
                <CheckIcon size={markerIconSize} color={markerFg} weight="bold" />
              ) : (
                <SizableText
                  {...knobProps.label}
                  fontWeight="400"
                  color={kind === 'current' ? (onSelected ?? '$color1') : markerFg}>
                  {index + 1}
                </SizableText>
              )}
            </Marker>
          );

          const markerTarget = (
            <StepMarkerTarget
              width={MIN_PRESS_TARGET}
              height={MIN_PRESS_TARGET}
              minWidth={MIN_PRESS_TARGET}
              minHeight={MIN_PRESS_TARGET}
              marginVertical={-pressOutset}
              marginHorizontal={horizontal ? -pressOutset : 0}
              alignItems="center"
              justifyContent="center"
              data-press-min={MIN_PRESS_TARGET}
              hitSlop={hitSlop ?? pressTargetHitSlop(markerPx)}>
              {marker}
            </StepMarkerTarget>
          );

          const labelBlock = (
            <YStack
              gap="$0.5"
              flexShrink={1}
              {...(horizontal ? { alignItems: 'center', maxWidth: 160 } : { flexGrow: 1, justifyContent: 'center' })}>
              <SizableText
                {...knobProps.body}
                {...knobProps.label}
                fontWeight="400"
                color={
                  kind === 'error'
                    ? '$red11'
                    : state === 'upcoming'
                      ? knobProps.textAccentColor
                      : componentColors.text.primary
                }
                textAlign={horizontal ? 'center' : undefined}
                numberOfLines={2}>
                {step.label}
              </SizableText>
              {helper != null ? (
                <SizableText
                  {...knobProps.body}
                  fontSize="$1"
                  color={kind === 'error' ? '$red11' : knobProps.textAccentColor}
                  textAlign={horizontal ? 'center' : undefined}
                  numberOfLines={2}>
                  {helper}
                </SizableText>
              ) : null}
            </YStack>
          );

          const verticalConnector = !isLast ? (
            <Connector
              width={connectorThickness}
              flexGrow={1}
              minHeight={16}
              backgroundColor={connectorFill}
              transition={knobProps.transition}
            />
          ) : null;

          const horizontalConnector = !isLast ? (
            <XStack flexGrow={1} paddingTop={(markerPx - connectorThickness) / 2} paddingHorizontal={gapToken}>
              <Connector
                flexGrow={1}
                height={connectorThickness}
                backgroundColor={connectorFill}
                minWidth={16}
                transition={knobProps.transition}
              />
            </XStack>
          ) : null;

          const showLabels = labels !== 'hidden';
          const body = horizontal ? (
            <YStack alignItems="center" flexShrink={0} gap={gapToken}>
              {markerTarget}
              {showLabels ? labelBlock : null}
            </YStack>
          ) : (
            <XStack alignItems="stretch" gap={gapToken} minHeight={MIN_PRESS_TARGET}>
              <YStack alignItems="center" width={MIN_PRESS_TARGET} flexShrink={0} gap={2}>
                {markerTarget}
                {verticalConnector}
              </YStack>
              {showLabels ? labelBlock : null}
            </XStack>
          );

          const stepName = typeof step.label === 'string' ? step.label : index + 1;
          const goToLabel = withInterp(t('Go to step {{number}}: {{label}}'), {
            number: index + 1,
            label: stepName,
          });

          const wrapped = (
            <View
              key={step.id ?? index}
              role="listitem"
              flexGrow={horizontal ? 0 : undefined}
              flexShrink={horizontal ? 0 : undefined}
              {...(step.disabled ? disabledState.chromeKnobProps : undefined)}>
              {isFocusable ? (
                <StepButton
                  render="button"
                  tabIndex={0}
                  aria-label={canActivate ? goToLabel : String(stepName)}
                  aria-disabled={step.disabled || undefined}
                  cursor={step.disabled ? 'not-allowed' : 'pointer'}
                  onPress={() => {
                    if (canActivate) {
                      onStepChange?.(index);
                    }
                  }}
                  onFocus={() => {
                    if (wasKeyboardFocus()) {
                      setKbFocusIndex(index);
                    }
                  }}
                  onBlur={() => {
                    setKbFocusIndex((prev) => (prev === index ? null : prev));
                  }}
                  {...({
                    type: 'button',
                    onKeyDown: (e: { key?: string; preventDefault?: () => void }) => {
                      if (!canActivate) {
                        return;
                      }
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault?.();
                        onStepChange?.(index);
                      }
                    },
                  } as Record<string, unknown>)}>
                  {body}
                </StepButton>
              ) : (
                body
              )}
            </View>
          );

          return (
            <XStack
              key={`row-${step.id ?? index}`}
              flexDirection={horizontal ? 'row' : 'column'}
              alignItems={horizontal ? 'flex-start' : 'stretch'}
              flexGrow={horizontal ? 1 : undefined}
              flexBasis={horizontal ? 0 : undefined}>
              {wrapped}
              {horizontal ? horizontalConnector : null}
            </XStack>
          );
        })}
      </XStack>
    </StepsRoot>
  );
}

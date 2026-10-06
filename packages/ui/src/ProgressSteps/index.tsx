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
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GetProps } from 'tamagui';
import { SizableText, View, XStack, YStack, isWeb, styled } from 'tamagui';

import { componentColors } from '../component-colors';
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
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' },
});

const StepMarkerTarget = styled(View, {
  name: 'ProgressStepMarkerTarget',
});

const Connector = styled(View, {
  name: 'ProgressStepConnector',
  flexShrink: 0,
});

// ── Helpers ───────────────────────────────────────────────────

const stepState = (index: number, current: number, forcedCompleted = false): StepState => {
  if (forcedCompleted || index < current) {
    return 'completed';
  }
  if (index === current) {
    return 'current';
  }
  return 'upcoming';
};

const splitNestedControl = (nested: {
  px: number;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}) => {
  const { px, hitSlop, ...box } = nested;
  return { px, hitSlop, box };
};

type Knobs = ReturnType<typeof useResolvedKnobs>;
type Fill = ReturnType<typeof useAaSolidFill>;
type OnFill = ReturnType<typeof useReadableTextOn>;

interface MarkerInk {
  accent: Knobs['knobProps']['textAccentColor'];
  onError: OnFill;
  onCompleted: OnFill;
  onSelected: OnFill;
}

const markerBackground = (kind: MarkerKind, currentFill: Fill) => {
  if (kind === 'error') {
    return '$red9';
  }
  if (kind === 'completed') {
    return componentColors.indicator.completed;
  }
  if (kind === 'current') {
    return currentFill;
  }
  return 'transparent';
};

const markerForeground = (kind: MarkerKind, ink: MarkerInk) => {
  if (kind === 'upcoming') {
    return ink.accent;
  }
  if (kind === 'error') {
    return ink.onError ?? '$color1';
  }
  if (kind === 'completed') {
    return ink.onCompleted ?? '$color1';
  }
  return ink.onSelected ?? '$color1';
};

const labelColor = (kind: MarkerKind, state: StepState, accent: MarkerInk['accent']) => {
  if (kind === 'error') {
    return '$red11';
  }
  if (state === 'upcoming') {
    return accent;
  }
  return componentColors.text.primary;
};

const stepActivation = ({
  interactive,
  disabled,
  state,
  linear,
}: {
  interactive: boolean;
  disabled: boolean | undefined;
  state: StepState;
  linear: boolean;
}) => {
  const enabled = interactive && !disabled;
  const jumpable = state === 'completed' || !linear;
  const canActivate = enabled && state !== 'current' && jumpable;
  return { canActivate, isFocusable: enabled && (canActivate || state === 'current') };
};

const stepLabelName = (label: ReactNode, index: number) =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode label; only a plain string can name the step
  typeof label === 'string' ? label : index + 1;

/** Everything a step row reads from the rail-level hooks and props. */
interface RailContext {
  t: ReturnType<typeof useTranslation>['t'];
  knobProps: Knobs['knobProps'];
  control: Knobs['control'];
  disabledState: Knobs['disabledState'];
  ink: MarkerInk;
  currentFill: Fill;
  markerPx: number;
  hitSlop: ReturnType<typeof splitNestedControl>['hitSlop'];
  nestedBox: ReturnType<typeof splitNestedControl>['box'];
  markerIconSize: number;
  ringWidth: number;
  pressOutset: number;
  interactive: boolean;
  horizontal: boolean;
  linear: boolean;
  gapToken: Knobs['knobProps']['gap']['gap'];
  labels: 'visible' | 'hidden';
  current: number;
  kbFocusIndex: number | null;
  setKbFocusIndex: (updater: (prev: number | null) => number | null) => void;
  onStepChange: ((index: number) => void) | undefined;
}

const CONNECTOR_THICKNESS = 2;

const MarkerGlyph = ({
  kind,
  index,
  size,
  fg,
  rail,
}: {
  kind: MarkerKind;
  index: number;
  size: number;
  fg: ReturnType<typeof markerForeground>;
  rail: RailContext;
}) => {
  if (kind === 'error') {
    return (
      <WarningIcon
        size={size}
        color={fg}
        weight="bold"
      />
    );
  }
  if (kind === 'completed') {
    return (
      <CheckIcon
        size={size}
        color={fg}
        weight="bold"
      />
    );
  }
  return (
    <SizableText
      {...rail.knobProps.label}
      fontWeight="400"
      color={kind === 'current' ? (rail.ink.onSelected ?? '$color1') : fg}>
      {index + 1}
    </SizableText>
  );
};

const StepMarkerBlock = ({
  kind,
  state,
  index,
  rail,
}: {
  kind: MarkerKind;
  state: StepState;
  index: number;
  rail: RailContext;
}) => {
  const { knobProps, control, ink, currentFill, ringWidth, nestedBox, markerPx, markerIconSize } = rail;
  const markerBg = markerBackground(kind, currentFill);
  const markerBorder = kind === 'upcoming' ? componentColors.indicator.track : markerBg;
  const markerFg = markerForeground(kind, ink);
  // Upcoming is outlined-by-state: chromeless `borderWidth:none` would
  // erase the empty disc, so it keeps the OUTLINED-HAIRLINE floor.
  const markerRing = kind === 'upcoming' ? Math.max(ringWidth, 0.5) : ringWidth;
  const focusProps = rail.kbFocusIndex === index ? control.focusVisibleKnobProps : { outlineWidth: 0 };
  const hoverProps =
    kind === 'upcoming'
      ? {
          hoverStyle: {
            borderColor: componentColors.indicator.hover,
            backgroundColor: componentColors.indicator.inactive,
          },
        }
      : undefined;

  return (
    <StepMarkerTarget
      width={MIN_PRESS_TARGET}
      height={MIN_PRESS_TARGET}
      minWidth={MIN_PRESS_TARGET}
      minHeight={MIN_PRESS_TARGET}
      marginVertical={-rail.pressOutset}
      marginHorizontal={rail.horizontal ? -rail.pressOutset : 0}
      alignItems="center"
      justifyContent="center"
      data-press-min={MIN_PRESS_TARGET}
      hitSlop={rail.hitSlop ?? pressTargetHitSlop(markerPx)}>
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
        aria-current={state === 'current' ? 'step' : undefined}
        {...focusProps}
        {...hoverProps}>
        <MarkerGlyph
          kind={kind}
          index={index}
          size={markerIconSize}
          fg={markerFg}
          rail={rail}
        />
      </Marker>
    </StepMarkerTarget>
  );
};

const StepLabelBlock = ({
  step,
  kind,
  state,
  rail,
}: {
  step: ProgressStep;
  kind: MarkerKind;
  state: StepState;
  rail: RailContext;
}) => {
  const { knobProps, horizontal, t } = rail;
  const helper = step.description ?? (step.optional && kind !== 'error' ? t('Optional') : null);
  return (
    <YStack
      gap="$0.5"
      flexShrink={1}
      {...(horizontal ? { alignItems: 'center', maxWidth: 160 } : { flexGrow: 1, justifyContent: 'center' })}>
      <SizableText
        {...knobProps.body}
        {...knobProps.label}
        fontWeight="400"
        color={labelColor(kind, state, rail.ink.accent)}
        textAlign={horizontal ? 'center' : undefined}
        numberOfLines={2}>
        {step.label}
      </SizableText>
      {helper == null ? null : (
        <SizableText
          {...knobProps.body}
          fontSize="$1"
          color={kind === 'error' ? '$red11' : knobProps.textAccentColor}
          textAlign={horizontal ? 'center' : undefined}
          numberOfLines={2}>
          {helper}
        </SizableText>
      )}
    </YStack>
  );
};

const StepConnector = ({ filled, rail }: { filled: boolean; rail: RailContext }) => {
  const { knobProps, horizontal, markerPx, gapToken } = rail;
  const connectorFill = filled ? componentColors.indicator.completed : componentColors.indicator.track;
  if (!horizontal) {
    return (
      <Connector
        width={CONNECTOR_THICKNESS}
        flexGrow={1}
        minHeight={16}
        backgroundColor={connectorFill}
        transition={knobProps.transition}
      />
    );
  }
  return (
    <XStack
      flexGrow={1}
      paddingTop={(markerPx - CONNECTOR_THICKNESS) / 2}
      paddingHorizontal={gapToken}>
      <Connector
        flexGrow={1}
        height={CONNECTOR_THICKNESS}
        backgroundColor={connectorFill}
        minWidth={16}
        transition={knobProps.transition}
      />
    </XStack>
  );
};

const StepBody = ({
  step,
  kind,
  state,
  index,
  isLast,
  rail,
}: {
  step: ProgressStep;
  kind: MarkerKind;
  state: StepState;
  index: number;
  isLast: boolean;
  rail: RailContext;
}) => {
  const { horizontal, gapToken } = rail;
  const showLabels = rail.labels !== 'hidden';
  const markerTarget = (
    <StepMarkerBlock
      kind={kind}
      state={state}
      index={index}
      rail={rail}
    />
  );
  const labelBlock = showLabels ? (
    <StepLabelBlock
      step={step}
      kind={kind}
      state={state}
      rail={rail}
    />
  ) : null;

  if (horizontal) {
    return (
      <YStack
        alignItems="center"
        flexShrink={0}
        gap={gapToken}>
        {markerTarget}
        {labelBlock}
      </YStack>
    );
  }
  return (
    <XStack
      alignItems="stretch"
      gap={gapToken}
      minHeight={MIN_PRESS_TARGET}>
      <YStack
        alignItems="center"
        width={MIN_PRESS_TARGET}
        flexShrink={0}
        gap={2}>
        {markerTarget}
        {isLast ? null : (
          <StepConnector
            filled={index < rail.current}
            rail={rail}
          />
        )}
      </YStack>
      {labelBlock}
    </XStack>
  );
};

const StepRow = ({
  step,
  index,
  isLast,
  rail,
}: {
  step: ProgressStep;
  index: number;
  isLast: boolean;
  rail: RailContext;
}) => {
  const { t, horizontal, interactive, linear, onStepChange, setKbFocusIndex, disabledState } = rail;
  const state = stepState(index, rail.current, step.completed);
  const kind: MarkerKind = step.error ? 'error' : state;
  const { canActivate, isFocusable } = stepActivation({ interactive, disabled: step.disabled, state, linear });
  const stepName = stepLabelName(step.label, index);
  const goToLabel = withInterp(t('Go to step {{number}}: {{label}}'), {
    number: index + 1,
    label: stepName,
  });

  const body = (
    <StepBody
      step={step}
      kind={kind}
      state={state}
      index={index}
      isLast={isLast}
      rail={rail}
    />
  );

  const domButtonProps = {
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
  };

  const wrapped = (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui View has no native <li> on native; role carries the semantics
      role="listitem"
      flexGrow={horizontal ? 0 : undefined}
      flexShrink={horizontal ? 0 : undefined}
      {...(step.disabled ? disabledState.chromeKnobProps : undefined)}>
      {isFocusable ? (
        <StepButton
          render="button"
          tabIndex={0}
          aria-label={canActivate ? goToLabel : String(stepName)}
          aria-disabled={step.disabled === true ? true : undefined}
          cursor={step.disabled ? 'not-allowed' : 'pointer'}
          onPress={() => {
            if (canActivate) {
              onStepChange?.(index);
            }
          }}
          onFocus={() => {
            if (wasKeyboardFocus()) {
              setKbFocusIndex(() => index);
            }
          }}
          onBlur={() => {
            setKbFocusIndex((prev) => (prev === index ? null : prev));
          }}
          {...domButtonProps}>
          {body}
        </StepButton>
      ) : (
        body
      )}
    </View>
  );

  return (
    <XStack
      flexDirection={horizontal ? 'row' : 'column'}
      alignItems={horizontal ? 'flex-start' : 'stretch'}
      flexGrow={horizontal ? 1 : undefined}
      flexBasis={horizontal ? 0 : undefined}>
      {wrapped}
      {horizontal && !isLast ? (
        <StepConnector
          filled={index < rail.current}
          rail={rail}
        />
      ) : null}
    </XStack>
  );
};

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
export const ProgressSteps = ({
  steps,
  current,
  onStepChange,
  orientation = 'horizontal',
  allowJump = true,
  linear = true,
  compact,
  labels = 'visible',
  ...props
}: ProgressStepsProps) => {
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
  const horizontal = orientation === 'horizontal';

  const rail: RailContext = {
    t,
    knobProps,
    control,
    disabledState,
    ink: { accent: knobProps.textAccentColor, onError, onCompleted, onSelected },
    currentFill,
    markerPx,
    hitSlop,
    nestedBox,
    markerIconSize: Math.max(12, Math.round(markerPx * 0.45)),
    ringWidth: knobProps.borderRadius.borderWidth ?? 0,
    pressOutset: Math.max(0, Math.ceil((MIN_PRESS_TARGET - markerPx) / 2)),
    interactive: !!onStepChange && allowJump,
    horizontal,
    linear,
    gapToken: knobProps.gap.gap,
    labels,
    current,
    kbFocusIndex,
    setKbFocusIndex,
    onStepChange,
  };

  return (
    <StepsRoot
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui YStack renders a div on web and a View on native; switching to <ul> would change the DOM and default list styling
      role="list"
      aria-label={t('Progress')}
      data-density={knobProps.density}
      data-labels={labels}
      {...props}>
      <XStack
        flexDirection={horizontal ? 'row' : 'column'}
        alignItems={horizontal ? 'flex-start' : 'stretch'}
        width="100%"
        gap={horizontal ? 0 : rail.gapToken}>
        {steps.map((step, index) => (
          <StepRow
            // oxlint-disable-next-line react-doctor/no-array-index-as-key -- ProgressStep.id is optional by contract and documented to fall back to the index
            key={`row-${step.id ?? index}`}
            step={step}
            index={index}
            isLast={index === steps.length - 1}
            rail={rail}
          />
        ))}
      </XStack>
    </StepsRoot>
  );
};

import {
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  hairlineWidth,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  stackRadiusProps,
  useAccentTintedSurface,
  useReadableTextOn,
  wasKeyboardFocus,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { SizableText, ToggleGroup as TamaguiToggleGroup, View, isWeb, styled } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { formButtonColors, formCommonColors, formInputColors } from '../../shared/colorRamps';
import { warnBareDisabled } from '../../shared/devWarn';
import { choiceItemA11y, composeA11yName } from '../../shared/nativeA11y';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

// Headless Tamagui item: the stock ToggleFrame paints borderWidth:1 +
// margin:-1 on EVERY segment (collapsed-border ButtonGroup). Segmented
// controls (Apple / Carbon / Polaris) mark selection with FILL on
// the chosen item only; the frame owns the one border.
const ToggleItemFrame = styled(TamaguiToggleGroup.Item, {
  unstyled: true,
  cursor: 'pointer',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderWidth: 0,
  margin: 0,
  outlineWidth: 0,
  position: 'relative',
  focusStyle: { outlineWidth: 0, backgroundColor: 'transparent' },
  focusVisibleStyle: { outlineWidth: 0 },
});

/** Theme animationConfig durations — unstyled ToggleFrame drops Tamagui's transition class. */
const SEGMENT_MOTION_MS: Record<string, number> = {
  bouncy: 200,
  lazy: 600,
  slow: 500,
  medium: 250,
  quick: 100,
  tooltip: 400,
  snappy: 80,
  gentle: 450,
};

/** State recipes may carry border/outline; segments accept FILL only. */
function segmentFillState(props: { backgroundColor?: unknown } | undefined): { backgroundColor: unknown } | undefined {
  const backgroundColor = props?.backgroundColor;
  return backgroundColor != null ? { backgroundColor } : undefined;
}

function ToggleItemWithElevation({
  elevationWrapperProps,
  groupedRadius,
  ...props
}: {
  elevationWrapperProps: Record<string, any>;
  value: string;
  groupedRadius: Record<string, unknown>;
} & Record<string, any>) {
  if (elevationWrapperProps.elevation) {
    // The segment carries flexBasis 0 to share the run. A column wrapper would
    // read that as its HEIGHT and resolve the whole frame to the two 1px
    // borders, so the wrapper lays out along the row in BOTH
    // orientations and inherits the segment's place in the run.
    return (
      <View {...elevationWrapperProps} {...groupedRadius} flexDirection="row" flexGrow={1} flexShrink={0}>
        <ToggleItemFrame {...props} {...groupedRadius} />
      </View>
    );
  }
  return <ToggleItemFrame {...props} {...groupedRadius} />;
}

export interface ToggleGroupOption {
  label: string;
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
  /**
   * Explains why the item is disabled. Renders as a visible line
   * under the group wired to the item via `aria-describedby`. A bare
   * item-level `disabled` without it DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
  /**
   * Accessible name for THIS segment, overriding `label`. Use it
   * when the segment carries meaning the label text does not: an icon-only
   * segment, or a segment whose state is encoded in fill/weight/position.
   * Native reads it as `accessibilityLabel`, web as `aria-label`.
   */
  accessibilityLabel?: string;
  /** Extra spoken context for this segment (native `accessibilityHint`). */
  accessibilityHint?: string;
}

export interface ToggleGroupProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  /**
   * Explains why the whole group is disabled. Takes the helper
   * slot while disabled (mirrors error-replaces-helper). A bare `disabled`
   * without it DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string | string[]) => void;
  /** @deprecated Use `onChange` instead. Kept as an alias for the tamagui name. */
  onValueChange?: (value: string | string[]) => void;
  onBlur?: (...args: any[]) => void;
  options?: ToggleGroupOption[];
  orientation?: 'horizontal' | 'vertical';
  children?: ReactNode;
  /** When true, renders a skeleton placeholder instead of the toggle group */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
  /**
   * Accessible name for the whole group.
   *
   * tamagui does not map `aria-label` onto React Native's
   * `accessibilityLabel`, so on native the web attribute is inert; this prop
   * is the native channel and `aria-label` is accepted as an alias for it.
   *
   * iOS only speaks elements, never non-element containers, so a name set
   * here is PREFIXED onto each segment's accessible name ("Severity, warning")
   * rather than sitting on the frame where nothing would read it. Segments
   * stay individually selectable — the group is never collapsed into one
   * element, which would hide which segment is chosen.
   */
  accessibilityLabel?: string;
  /** Alias for `accessibilityLabel`; also emitted as the web attribute. */
  'aria-label'?: string;
  /** Web-only name reference. Native has no id-based equivalent. */
  'aria-labelledby'?: string;
  /** Extra spoken context for the group (native `accessibilityHint`). */
  accessibilityHint?: string;
}

export function ToggleGroup({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  disabledReason,
  readOnly,
  size,
  id: idProp,
  type = 'single',
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  options,
  orientation = 'horizontal',
  children,
  skeleton,
  compact,
  accessibilityLabel,
  accessibilityHint,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ToggleGroupProps) {
  // Canonical `onChange` and the alias `onValueChange` both fire from the
  // single emit site below (same reconciliation as Switch).
  const handleValueChange = (val: string | string[]) => {
    onChange?.(val);
    onValueChange?.(val);
  };
  // One name, two channels. tamagui drops `aria-label` on native, so
  // the prop and the attribute are reconciled here and each platform is handed
  // the spelling it actually reads.
  const groupA11yName = accessibilityLabel ?? ariaLabel;
  const { resolvedForm, knobProps, control, text, elevation, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  // Selection is ONE accent language across every choice-control
  // family. Segmented-control STRENGTH is pinned at TINTED (not the
  // solid an accent CTA takes).
  const selectedTint = useAccentTintedSurface();
  const selectedFill = selectedTint ?? formButtonColors.border.active;
  const onSelectedLabel = useReadableTextOn(selectedFill);
  // Chromium drops keyboard modality when tamagui's group redirects focus to
  // an item, so :focus-visible/focusVisibleStyle can miss — paint the ring
  // manually on keyboard-origin focus (see theme keyboardFocusRing).
  const [kbFocusValue, setKbFocusValue] = useState<string | null>(null);
  // Roving anchor: while a segment is focused it owns the group's single tab
  // stop (Shift+Tab exits instead of hopping to the selected segment).
  const [focusValue, setFocusValue] = useState<string | null>(null);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const elevationWrapperProps = getElevationWrapperProps(knobProps, elevation);
  // Height / pad / gap come from the coordinated size recipe; the
  // 44px floor is hitSlop, never a painted minHeight.
  const segmentHitSlop = pressTargetHitSlop(knobProps.control.height);
  // Tween fill on the unstyled item via CSS (Tamagui's
  // `transition` token does not emit a class here). animation=none → snap.
  const motionMs = typeof knobProps.transition === 'string' ? SEGMENT_MOTION_MS[knobProps.transition] : undefined;
  const segmentMotionStyle =
    isWeb && motionMs != null
      ? {
          className: 'mp-toggle-transition',
          style: {
            transitionProperty: 'background-color, color, border-color, outline-color',
            transitionDuration: `${motionMs}ms`,
            transitionTimingFunction: 'ease',
          },
        }
      : undefined;

  // Disabled groups/items explain themselves or DEV-warn.
  warnBareDisabled({
    component: 'ToggleGroup',
    id,
    disabled: Boolean(disabled),
    disabledReason,
    skip: Boolean(skeleton),
  });
  for (const option of options ?? []) {
    warnBareDisabled({
      component: 'ToggleGroup.Item',
      id: option.value,
      disabled: Boolean(option.disabled) && !disabled,
      disabledReason: option.disabledReason ?? disabledReason,
      skip: Boolean(skeleton),
    });
  }
  // Group reason takes the helper slot while disabled (same one-slot rule as
  // error-replaces-helper), riding FieldLayout's aria-describedby wiring.
  const resolvedHelperText = disabled && disabledReason?.trim() ? disabledReason : helperText;
  // Item reasons render once each under the group; items point at them via
  // aria-describedby (visible without hover).
  const uniqueItemReasons = [
    ...new Set(
      (options ?? []).filter((o) => o.disabled && o.disabledReason?.trim()).map((o) => o.disabledReason!.trim()),
    ),
  ];
  const itemReasonIdFor = (reason: string | undefined): string | undefined => {
    if (!reason?.trim()) {
      return undefined;
    }
    const index = uniqueItemReasons.indexOf(reason.trim());
    return index >= 0 ? `${id}-item-reason-${index}` : undefined;
  };
  const optionDisabledByValue = (val: string) => Boolean(options?.find((o) => o.value === val)?.disabled);

  // Render skeleton placeholder — fused outer-radius row, square interiors.
  if (skeleton) {
    const optionCount = options?.length ?? 3;
    const segmentH = knobProps.control.height;
    const segmentW = knobProps.control.paddingHorizontal * 2 + 40;
    return (
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <View
          flexDirection={orientation === 'vertical' ? 'column' : 'row'}
          alignSelf="flex-start"
          overflow="hidden"
          {...knobProps.borderRadius}
          {...knobProps.inputSurface}>
          {Array.from({ length: optionCount }, (_, i) => (
            <Skeleton key={i} variant="rectangular" width={segmentW} height={segmentH} data-mp-toggle-skeleton />
          ))}
        </View>
      </FieldLayout>
    );
  }

  const renderContent = (resolvedValue: string | string[] | undefined) => {
    if (children) {
      return children;
    }
    if (!options) {
      return null;
    }
    const radius = knobProps.borderRadius.borderRadius;
    const count = options.length;
    const isSelected = (val: string) =>
      type === 'multiple' ? Array.isArray(resolvedValue) && resolvedValue.includes(val) : resolvedValue === val;

    // Roving tabindex (single tab stop): tamagui's vendored roving-focus item
    // hardcodes tabIndex=0 on every segment. Keep exactly one segment in the
    // page tab order — the focused one while focus is inside the group, else
    // the first enabled selected one, else the first enabled one; arrows move
    // within the group.
    const focusedIdx = focusValue ? options.findIndex((o) => o.value === focusValue && !(disabled || o.disabled)) : -1;
    const firstSelectedEnabled = options.findIndex((o) => isSelected(o.value) && !(disabled || o.disabled));
    const tabStopIndex =
      focusedIdx >= 0
        ? focusedIdx
        : firstSelectedEnabled >= 0
          ? firstSelectedEnabled
          : options.findIndex((o) => !(disabled || o.disabled));
    return options.map((option, index) => {
      const groupedRadius = stackRadiusProps(getGroupPosition(index, count), radius, orientation);
      const selected = isSelected(option.value);
      const nextSelected = index < count - 1 && isSelected(options[index + 1].value);
      const itemDisabled = Boolean(disabled || option.disabled);
      const itemDescribedBy = option.disabled ? itemReasonIdFor(option.disabledReason) : undefined;
      const isTabStop = index === tabStopIndex;
      const showSeam = index < count - 1 && !selected && !nextSelected;
      // Selected = FILL. Border stays transparent — never a ring around the
      // chosen segment, and never a border on siblings (Apple / Carbon).
      const activeColors = {
        backgroundColor: selectedFill,
        borderColor: 'transparent',
        borderWidth: 0,
      };
      const hoverFill = segmentFillState(control.hoverKnobProps);
      const pressFill = segmentFillState(control.pressKnobProps);

      return (
        <ToggleItemWithElevation
          key={`${index}-${option.value}`}
          elevationWrapperProps={elevationWrapperProps}
          groupedRadius={groupedRadius}
          value={option.value}
          id={`${id}-${index}-${option.value}`}
          unstyled
          {...(isWeb ? { tabIndex: isTabStop ? 0 : -1 } : undefined)}
          width="auto"
          height={knobProps.control.height}
          hitSlop={segmentHitSlop}
          flexShrink={0}
          flexGrow={1}
          flexBasis={isWeb ? 0 : undefined}
          paddingHorizontal={knobProps.control.paddingHorizontal}
          gap={knobProps.control.gap}
          {...segmentMotionStyle}
          borderWidth={0}
          borderColor="transparent"
          margin={0}
          outlineWidth={0}
          transition={knobProps.transition}
          disabled={itemDisabled}
          {...(itemDescribedBy ? { 'aria-describedby': itemDescribedBy } : undefined)}
          // A disabled segment drops the live selected
          // fill so the wash owns the chrome; a SELECTED disabled segment takes
          // the recipe's stronger selected tier (Axiom 6).
          {...(selected && !itemDisabled ? activeColors : undefined)}
          {...(itemDisabled
            ? selected
              ? disabledState.selectedSurfaceKnobProps
              : disabledState.surfaceKnobProps
            : undefined)}
          {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
          hoverStyle={
            itemDisabled
              ? selected
                ? { ...disabledState.selectedSurfaceKnobProps }
                : { ...disabledState.surfaceKnobProps }
              : {
                  ...(selected
                    ? activeColors
                    : (hoverFill ?? {
                        backgroundColor: formButtonColors.background.hover,
                      })),
                }
          }
          pressStyle={
            itemDisabled
              ? selected
                ? { ...disabledState.selectedSurfaceKnobProps }
                : { ...disabledState.surfaceKnobProps }
              : {
                  ...(selected
                    ? activeColors
                    : (pressFill ?? {
                        backgroundColor: formButtonColors.background.active,
                      })),
                }
          }
          // Ring rides the keyboard-focused item (inset, clipped
          // group). Never a selection border. ToggleFrame's focus fill is
          // re-asserted so the accent chip does not grey out on choose.
          focusStyle={{
            ...(selected && !itemDisabled ? activeColors : undefined),
            ...(kbFocusValue === option.value ? keyboardFocusRingProps : { outlineWidth: 0 }),
          }}
          focusVisibleStyle={kbFocusValue === option.value ? keyboardFocusRingProps : { outlineWidth: 0 }}
          {...(isWeb
            ? {
                onFocus: () => {
                  setFocusValue(option.value);
                  if (wasKeyboardFocus()) {
                    setKbFocusValue(option.value);
                  }
                },
                onBlur: () => {
                  setFocusValue((prev) => (prev === option.value ? null : prev));
                  setKbFocusValue((prev) => (prev === option.value ? null : prev));
                },
              }
            : undefined)}
          {...(kbFocusValue === option.value ? keyboardFocusRingProps : undefined)}
          // On iOS a styled View is not an accessibility element, so
          // without this block the whole segmented control is absent from the
          // tree: correct on screen, invisible to anything reading elements.
          // The SEGMENTS carry the semantics, never the frame — an
          // `accessible` frame would collapse them into one element and lose
          // which one is chosen, which is the only thing worth announcing.
          {...(!isWeb
            ? choiceItemA11y({
                kind: type === 'multiple' ? 'checkbox' : 'radio',
                name: composeA11yName(groupA11yName, option.accessibilityLabel ?? option.label),
                selected,
                disabled: itemDisabled,
                hint: option.accessibilityHint ?? accessibilityHint,
              })
            : {
                ...(option.accessibilityLabel ? { 'aria-label': option.accessibilityLabel } : undefined),
              })}>
          {option.icon}
          <SizableText
            userSelect="none"
            {...knobProps.controlType}
            {...knobProps.body}
            {...(selected && !itemDisabled && onSelectedLabel ? { color: onSelectedLabel } : undefined)}
            {...(itemDisabled ? disabledState.textKnobProps : undefined)}
            hoverStyle={text.hoverKnobProps}
            pressStyle={text.pressKnobProps}
            focusStyle={text.focusKnobProps}>
            {option.label}
          </SizableText>
          {showSeam ? (
            <View
              pointerEvents="none"
              position="absolute"
              zIndex={1}
              data-mp-toggle-seam
              {...(orientation === 'horizontal'
                ? {
                    ...hairline.vline,
                    top: 8,
                    bottom: 8,
                    insetInlineEnd: 0,
                    flexBasis: hairlineWidth,
                  }
                : {
                    ...hairline.line,
                    insetInlineStart: 8,
                    insetInlineEnd: 8,
                    bottom: 0,
                    flexBasis: hairlineWidth,
                  })}
            />
          ) : null}
        </ToggleItemWithElevation>
      );
    });
  };

  const renderToggleGroup = (
    resolvedValue: string | string[] | undefined,
    isControlled: boolean,
    handleChange?: (val: string | string[]) => void,
    handleBlur?: (...args: any[]) => void,
    hasError?: boolean,
  ) => {
    const emptyValue = type === 'multiple' ? [] : '';

    const toggleProps: any = {
      // The ring rides the focused segment, never the group. A
      // container ring is square over the rounded frame and paints on mouse
      // via :focus-within. Segment rings are inset so they survive the clip.
      outlineWidth: 0,
      focusStyle: { outlineWidth: 0 },
      focusVisibleStyle: { outlineWidth: 0 },
      // Container clip: the group frame owns the
      // radius; clip so square interior seams stay inside the rounded
      // frame. Elevation is the one exception: per-segment shadow
      // wrappers would be cut by the clip.
      borderRadius: knobProps.borderRadius.borderRadius,
      ...(elevationWrapperProps.elevation ? undefined : { overflow: 'hidden' as const }),
      type,
      ...(type === 'single' ? { disableDeactivation: true } : {}),
      ...(isControlled ? { value: resolvedValue ?? emptyValue } : { defaultValue: resolvedValue ?? emptyValue }),
      onValueChange: (val: string | string[]) => {
        if (disabled || readOnly) {
          return;
        }
        // Guard: presses on disabled items never change the value
        // (items stay mounted + explained instead of hiding).
        if (options) {
          if (type === 'single') {
            if (typeof val === 'string' && optionDisabledByValue(val)) {
              return;
            }
          } else {
            const prevArr = Array.isArray(resolvedValue) ? resolvedValue : [];
            const nextArr = Array.isArray(val) ? val : [];
            const toggled = [
              ...nextArr.filter((v) => !prevArr.includes(v)),
              ...prevArr.filter((v) => !nextArr.includes(v)),
            ];
            if (toggled.length === 1 && optionDisabledByValue(toggled[0])) {
              return;
            }
          }
        }
        handleChange?.(val);
        handleValueChange(val);
      },
      id,
      disabled,
      orientation,
      flexDirection: orientation === 'vertical' ? 'column' : 'row',
      size: knobProps.sizeToken,
      gap: 0,
      alignSelf: 'flex-start',
      ...(handleBlur ? { onBlur: handleBlur } : undefined),
      'aria-required': required || undefined,
      'aria-invalid': hasError || undefined,
      'aria-readonly': readOnly || undefined,
      // Web reads the attribute, Android reads the RN prop off the
      // container. iOS reads neither, which is why the name is also prefixed
      // onto every segment above.
      ...(groupA11yName ? { 'aria-label': groupA11yName } : undefined),
      ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : undefined),
      ...(!isWeb && groupA11yName
        ? { accessibilityLabel: groupA11yName, accessibilityRole: 'radiogroup' as const }
        : undefined),
    };

    return (
      <>
        <TamaguiToggleGroup
          {...toggleProps}
          {...knobProps.borderRadius}
          {...knobProps.inputSurface}
          overflow="hidden"
          backgroundColor={knobProps.outlined ? 'transparent' : formInputColors.background.base}
          {...(isWeb
            ? {
                display: 'grid',
                style: {
                  gridAutoFlow: orientation === 'vertical' ? 'row' : 'column',
                  ...(orientation === 'horizontal' ? { gridAutoColumns: '1fr' } : { gridAutoRows: '1fr' }),
                },
              }
            : undefined)}>
          {renderContent(resolvedValue ?? emptyValue)}
        </TamaguiToggleGroup>
        {uniqueItemReasons.map((reason, index) => (
          <SizableText
            key={reason}
            id={`${id}-item-reason-${index}`}
            size="$1"
            color={formCommonColors.muted}
            data-mp-disabled-reason="true">
            {reason}
          </SizableText>
        ))}
      </>
    );
  };

  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        required={required}
        helperText={resolvedHelperText}
        size={size}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        {renderToggleGroup(value ?? defaultValue, value !== undefined, undefined, onBlur, !!error)}
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            required={required}
            helperText={resolvedHelperText}
            size={size}
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            {renderToggleGroup(
              value !== undefined ? value : field.state.value,
              true,
              (val) => {
                field.handleChange(val as any);
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              !!resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}

ToggleGroup.Item = TamaguiToggleGroup.Item;

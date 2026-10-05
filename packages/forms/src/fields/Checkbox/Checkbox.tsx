import { CheckIcon as CheckRegular, MinusIcon as MinusRegular } from '@phosphor-icons/react';
import { transitionProps, useReadableTextOn } from '@repo/theme';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type {
  CheckedState,
  CheckboxProps as TamaguiCheckboxProps,
  FontSizeTokens,
  LabelProps,
  SizeTokens,
} from 'tamagui';
import { Checkbox as TamaguiCheckbox, Label, View, XStack, getVariable, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { formCommonColors, formSelectedColors } from '../../shared/colorRamps';
import { useIsInTableCell } from '../../shared/tableCellContext';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import {
  CHECKBOX_TARGET_PX,
  CheckboxGlyphBox,
  checkboxKbFocusHandlers,
  checkboxTargetFrameProps,
  clampCheckboxGlyphRadius,
  getCheckboxBoxBorderWidth,
  getCheckboxGlyphSize,
  getCheckboxIconSize,
} from './CheckboxBox';
import { CheckboxFieldFrame } from './CheckboxFieldFrame';
import { useCheckboxGroupSkipsElevation } from './checkboxGroupContext';

export interface CheckboxProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  checked?: CheckedState;
  defaultValue?: boolean | 'indeterminate';
  /**
   * Canonical change handler, consistent with the rest of the field family
   * (Input/Select/Switch all use `onChange`). Prefer this.
   */
  onChange?: (checked: CheckedState) => void;
  /** @deprecated Use `onChange` instead. Kept as an alias for the tamagui/Radix name. */
  onCheckedChange?: (checked: CheckedState) => void;
  onBlur?: (...args: any[]) => void;
  checkboxProps?: Omit<TamaguiCheckboxProps, 'children' | 'checked' | 'id' | 'onCheckedChange'>;
  children?: ReactNode;
  /** Force hard-angled checkbox. Defaults to `true` when the theme knob `borderRadius` is `"none"`. */
  pointy?: boolean;
  /** When true, renders a skeleton placeholder instead of the checkbox */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
}

/**
 * Gap between the checkbox control and its label, by space knob.
 * Shared with the skeleton branches so loading geometry mirrors the
 * real anatomy.
 */
export function getCheckboxInlineGap(space: string): string {
  const inlineGapMap: Record<string, string> = {
    none: '$1',
    small: '$1.5',
    medium: '$2',
    large: '$2.5',
  };
  return inlineGapMap[space] || '$2';
}

export function Checkbox({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  checked,
  defaultValue,
  onChange,
  onCheckedChange,
  onBlur,
  checkboxProps,
  children,
  pointy,
  skeleton,
  compact,
}: CheckboxProps) {
  // Canonical `onChange` and the alias `onCheckedChange` both fire from a
  // single emit site (same reconciliation as Switch).
  const handleValueChange = (val: CheckedState) => {
    onChange?.(val);
    onCheckedChange?.(val);
  };
  const { resolvedForm, knobProps, text, elevation, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name, (v) => !v);
  const resolvedPointy = pointy ?? knobProps.pointy;

  const checkboxSizeMap: Record<string, SizeTokens> = {
    $2: '$3' as SizeTokens,
    $3: '$3' as SizeTokens,
    $4: '$true' as SizeTokens,
    $5: '$5' as SizeTokens,
  };
  const resolvedSize = size || checkboxSizeMap[knobProps.sizeToken] || (knobProps.sizeToken as SizeTokens);
  const radiusToken = knobProps.borderRadius.borderRadius;
  const cappedRadius = clampCheckboxGlyphRadius(radiusToken, { pointy: resolvedPointy });
  const resolvedRadius =
    cappedRadius === 0
      ? { borderWidth: knobProps.borderRadius.borderWidth, borderRadius: 0 }
      : { borderWidth: knobProps.borderRadius.borderWidth, borderRadius: cappedRadius };
  const inlineGap = getCheckboxInlineGap(knobProps.space);
  const baseLabelColor = error ? formCommonColors.error : knobProps.textAccentColor;
  const labelHoverStyle = { color: baseLabelColor, ...text.hoverKnobProps };
  const labelPressStyle = { color: baseLabelColor, ...text.pressKnobProps };
  const labelFocusStyle = { color: baseLabelColor, ...text.focusKnobProps };
  const labelFocusVisibleStyle = { color: baseLabelColor, ...text.focusVisibleKnobProps };
  const tamaguiTheme = useTheme();
  // E-FLAT: table cells and CheckboxGroup items ignore elevation. Skip the
  // shared helper rather than changing it.
  const inTableCell = useIsInTableCell();
  const inCheckboxGroup = useCheckboxGroupSkipsElevation();
  const skipElevation = inTableCell || inCheckboxGroup;
  const elevationWrapperProps = useMemo(
    () => (skipElevation ? {} : getElevationWrapperProps(knobProps, elevation)),
    [skipElevation, knobProps, elevation],
  );
  const accentTokenKey = (knobProps.textAccentColor ?? '$color').replace('$', '');
  const indicatorColor = getVariable(tamaguiTheme[accentTokenKey as any]?.get('web') ?? tamaguiTheme.color?.get('web'));
  // The checked box IS the
  // selection mark, so it fills with the shared accent mark — the checked
  // Switch track precedent — and the check/minus glyph takes the
  // luminance-computed anchor for that fill. It painted the LABEL ink tier
  // (`textAccentColor`) on unchanged neutral chrome — the same defect the
  // RadioGroup dot carried — so a checked box read as chrome, not as chosen.
  // When the accent ramp is absent, `onMark` is undefined and the glyph keeps
  // the previous ink resolution as the declared fallback.
  const onMark = useReadableTextOn(formSelectedColors.mark);
  const indicatorWeight =
    knobProps.textWeight.fontWeight === '700'
      ? 'bold'
      : knobProps.textWeight.fontWeight === '400'
        ? 'regular'
        : 'light';

  const renderIndicator = (currentChecked: CheckedState | undefined, iconSize: number) => {
    if (children) {
      return children;
    }
    return (
      <TamaguiCheckbox.Indicator
        // Same native-responder steal as CheckboxGlyphBox — Indicator/SVG
        // must not claim the press that belongs to the 44px frame.
        pointerEvents="none"
        {...transitionProps(knobProps.transition)}>
        {currentChecked === 'indeterminate' ? (
          <MinusRegular
            color={onMark ?? indicatorColor}
            weight={indicatorWeight}
            size={iconSize}
            pointerEvents="none"
          />
        ) : (
          <CheckRegular
            color={onMark ?? indicatorColor}
            weight={indicatorWeight}
            size={iconSize}
            pointerEvents="none"
          />
        )}
      </TamaguiCheckbox.Indicator>
    );
  };

  // Pressable-vs-glyph split (SP-FIXED / WCAG 2.5.5, same anatomy as
  // RadioGroup): the role=checkbox frame is ALWAYS a 44px transparent
  // pressable target; the visible box renders as an inner glyph at the
  // checkbox's own computed size (tamagui scaleSize 0.45), so visual density
  // is unchanged. Cells (chromeless) and plain forms share the treatment —
  // the earlier cell-only split left the plain checkbox at a 20px target.
  const targetSize = CHECKBOX_TARGET_PX;
  const glyphSize = getCheckboxGlyphSize(resolvedSize);
  const iconSize = getCheckboxIconSize(glyphSize);
  const boxBorderWidth = getCheckboxBoxBorderWidth(knobProps.borderRadius.borderWidth);
  const [uncontrolledChecked, setUncontrolledChecked] = useState<CheckedState | undefined>(
    defaultValue as CheckedState | undefined,
  );
  const [kbFocus, setKbFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  const glyphBox = (currentChecked: CheckedState | undefined) => {
    const isMarked = currentChecked === true || currentChecked === 'indeterminate';
    return (
      <CheckboxGlyphBox
        glyphSize={glyphSize}
        isMarked={isMarked}
        kbFocus={kbFocus}
        hovered={hovered}
        borderWidth={boxBorderWidth}
        borderRadius={resolvedRadius.borderRadius ?? 0}
        transition={knobProps.transition}>
        {renderIndicator(currentChecked, iconSize)}
      </CheckboxGlyphBox>
    );
  };
  // Elevation wraps the visible glyph, never the invisible target (cells
  // keep elevation suppressed as before).
  const renderControlContent = (currentChecked: CheckedState | undefined) =>
    elevationWrapperProps.elevation && !inTableCell ? (
      <View borderRadius={resolvedRadius.borderRadius ?? 0} pointerEvents="none" {...elevationWrapperProps}>
        {glyphBox(currentChecked)}
      </View>
    ) : (
      glyphBox(currentChecked)
    );

  // iOS: Tamagui's checkbox emits role="checkbox" + aria-checked but never
  // `accessible` — without it the box is not an accessibility element and
  // VoiceOver skips it entirely. htmlFor label wiring is also web-only, so
  // carry the label/error strings on the control itself.
  const nativeCheckboxA11y = (errorText?: string) =>
    isWeb
      ? undefined
      : {
          accessible: true,
          accessibilityState: { disabled: !!disabled },
          ...(typeof label === 'string' ? { accessibilityLabel: `${label}${required ? ' *' : ''}` } : undefined),
          ...(errorText || helperText ? { accessibilityHint: errorText ?? helperText } : undefined),
        };

  if (skeleton) {
    // Mirror the real anatomy: same control size, the same clamped
    // radius the real box uses, the same box↔label gap — and the 44px
    // pressable target box around the 20px glyph (same as RadioGroup).
    return (
      <FieldLayout id={id} size={size} knobProps={knobProps} compactSpacing>
        <XStack gap={inlineGap} alignItems="center">
          <View width={targetSize} height={targetSize} alignItems="center" justifyContent="center">
            <Skeleton variant="rounded" width={glyphSize} height={glyphSize} borderRadius={cappedRadius} />
          </View>
          {label && <Skeleton variant="text" width={96} height={14} />}
        </XStack>
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
    const isControlled = checked !== undefined;
    const needsFieldLayout = !!(error || helperText);

    const checkboxEl = (
      <CheckboxFieldFrame
        size={resolvedSize}
        transition={knobProps.transition}
        {...checkboxProps}
        {...checkboxTargetFrameProps}
        {...checkboxKbFocusHandlers(setKbFocus, setHovered, {
          onFocus: (checkboxProps as { onFocus?: (...args: any[]) => void } | undefined)?.onFocus,
          onBlur: onBlur ?? (checkboxProps as { onBlur?: (...args: any[]) => void } | undefined)?.onBlur,
          onHoverIn: (checkboxProps as { onHoverIn?: (...args: any[]) => void } | undefined)?.onHoverIn,
          onHoverOut: (checkboxProps as { onHoverOut?: (...args: any[]) => void } | undefined)?.onHoverOut,
        })}
        disabled={disabled}
        // The box is text-free chrome — dim it while
        // the sibling label stays readable (keepLabel); dimWhole dims the
        // whole assembly via FieldLayout instead.
        {...(disabled ? disabledState.chromeKnobProps : undefined)}
        id={id}
        {...(isControlled
          ? { checked }
          : defaultValue !== undefined
            ? { defaultChecked: defaultValue as CheckedState }
            : undefined)}
        {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
        {...(readOnly ? { 'aria-readonly': true } : undefined)}
        aria-required={required || undefined}
        aria-invalid={!!error || undefined}
        {...nativeCheckboxA11y(typeof error === 'string' && error ? error : undefined)}
        onCheckedChange={(val) => {
          if (disabled || readOnly) {
            return;
          }
          setUncontrolledChecked(val);
          handleValueChange(val);
        }}>
        {renderControlContent(checked ?? uncontrolledChecked)}
      </CheckboxFieldFrame>
    );

    const hasElevation = !!elevationWrapperProps.elevation;
    const checkboxRow = (
      <XStack
        gap={inlineGap}
        alignItems="center"
        {...(hasElevation && { overflow: 'visible' as const })}
        // When no FieldLayout wraps this row (no error/helper), the row
        // IS the disabled assembly — carry the dimWhole assembly fragment here
        // (empty under keepLabel) so the disabled control stays visible.
        {...(disabled && !needsFieldLayout ? disabledState.assemblyKnobProps : undefined)}
        {...(disabled && !needsFieldLayout
          ? { 'data-disabled-dimmed': disabledState.style === 'dimWhole' ? 'true' : 'false' }
          : undefined)}>
        {checkboxEl}
        {label && (
          <Label
            htmlFor={id}
            size={(size || '$true') as FontSizeTokens}
            {...knobProps.textWeight}
            color={baseLabelColor}
            hoverStyle={labelHoverStyle}
            pressStyle={labelPressStyle}
            focusStyle={labelFocusStyle}
            focusVisibleStyle={labelFocusVisibleStyle}
            paddingInlineEnd="$1"
            {...labelProps}>
            {label}
            {required && ' *'}
          </Label>
        )}
      </XStack>
    );

    if (!needsFieldLayout) {
      return checkboxRow;
    }

    return (
      <FieldLayout
        id={id}
        error={error}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        {checkboxRow}
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const resolvedChecked = checked !== undefined ? checked : (field.state.value as CheckedState);
        const resolvedLabelColor = resolvedError ? formCommonColors.error : knobProps.textAccentColor;
        const resolvedLabelHoverStyle = {
          color: resolvedLabelColor,
          ...text.hoverKnobProps,
        };
        const resolvedLabelPressStyle = {
          color: resolvedLabelColor,
          ...text.pressKnobProps,
        };
        const resolvedLabelFocusStyle = {
          color: resolvedLabelColor,
          ...text.focusKnobProps,
        };
        const resolvedLabelFocusVisibleStyle = {
          color: resolvedLabelColor,
          ...text.focusVisibleKnobProps,
        };

        return (
          <FieldLayout
            id={id}
            error={resolvedError}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}>
            <XStack
              gap={inlineGap}
              alignItems="center"
              {...(elevationWrapperProps.elevation && { overflow: 'visible' as const })}>
              {(() => {
                const checkboxElement = (
                  <CheckboxFieldFrame
                    size={resolvedSize}
                    transition={knobProps.transition}
                    {...checkboxProps}
                    {...checkboxTargetFrameProps}
                    {...checkboxKbFocusHandlers(setKbFocus, setHovered, {
                      onFocus: (checkboxProps as { onFocus?: (...args: any[]) => void } | undefined)?.onFocus,
                      onBlur: mergeFieldHandler(field, 'handleBlur', onBlur),
                      onHoverIn: (checkboxProps as { onHoverIn?: (...args: any[]) => void } | undefined)?.onHoverIn,
                      onHoverOut: (checkboxProps as { onHoverOut?: (...args: any[]) => void } | undefined)?.onHoverOut,
                    })}
                    disabled={disabled}
                    // Dim the box chrome; label/helper stay readable.
                    {...(disabled ? disabledState.chromeKnobProps : undefined)}
                    id={id}
                    checked={resolvedChecked}
                    {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
                    {...(readOnly ? { 'aria-readonly': true } : undefined)}
                    aria-required={required || undefined}
                    aria-invalid={!!resolvedError || undefined}
                    {...nativeCheckboxA11y(
                      typeof resolvedError === 'string' && resolvedError ? resolvedError : undefined,
                    )}
                    onCheckedChange={(newChecked) => {
                      if (disabled || readOnly) {
                        return;
                      }
                      const fieldValue = newChecked === 'indeterminate' ? false : newChecked;
                      field.handleChange(fieldValue as any);
                      handleValueChange(newChecked);
                    }}>
                    {renderControlContent(resolvedChecked)}
                  </CheckboxFieldFrame>
                );
                return checkboxElement;
              })()}
              {label && (
                <Label
                  htmlFor={id}
                  size={(size || '$true') as FontSizeTokens}
                  {...knobProps.textWeight}
                  color={resolvedLabelColor}
                  hoverStyle={resolvedLabelHoverStyle}
                  pressStyle={resolvedLabelPressStyle}
                  focusStyle={resolvedLabelFocusStyle}
                  focusVisibleStyle={resolvedLabelFocusVisibleStyle}
                  paddingInlineEnd="$1"
                  {...labelProps}>
                  {label}
                  {required && ' *'}
                </Label>
              )}
            </XStack>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

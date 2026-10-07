import { CheckIcon as CheckRegular, MinusIcon as MinusRegular } from '@phosphor-icons/react';
import { transitionProps, useReadableTextOn } from '@repo/theme';
import type { ResolvedKnobs } from '@repo/theme';
import type { ComponentProps, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { CheckedState, CheckboxProps as TamaguiCheckboxProps, LabelProps, SizeTokens } from 'tamagui';
import { Checkbox as TamaguiCheckbox, Label, View, XStack, getVariable, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { formCommonColors, formSelectedColors } from '../../shared/color-ramps';
import { useIsInTableCell } from '../../shared/table-cell-context';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import type { ElevationWrapperProps, FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import { useCheckboxGroupSkipsElevation } from './checkbox-group-context';
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
import type { CheckboxHoverHandlers } from './CheckboxBox';
import { CheckboxFieldFrame } from './CheckboxFieldFrame';

type FrameProps = ComponentProps<typeof CheckboxFieldFrame>;
type KnobProps = ResolvedKnobs['knobProps'];

export interface CheckboxProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
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
  onBlur?: FrameProps['onBlur'];
  checkboxProps?: Omit<TamaguiCheckboxProps, 'children' | 'checked' | 'id' | 'onCheckedChange'> & CheckboxHoverHandlers;
  children?: ReactNode;
  /** Force hard-angled checkbox. Defaults to `true` when the theme knob `borderRadius` is `"none"`. */
  pointy?: boolean;
  /** When true, renders a skeleton placeholder instead of the checkbox */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
}

const INLINE_GAP_BY_SPACE = new Map<string, string>([
  ['none', '$1'],
  ['small', '$1.5'],
  ['medium', '$2'],
  ['large', '$2.5'],
]);

/**
 * Gap between the checkbox control and its label, by space knob.
 * Shared with the skeleton branches so loading geometry mirrors the
 * real anatomy.
 */
// oxlint-disable-next-line react-doctor/only-export-components -- public helper consumed by sibling checkbox surfaces alongside the component
export const getCheckboxInlineGap = (space: string): string => INLINE_GAP_BY_SPACE.get(space) ?? '$2';

const CHECKBOX_SIZE_BY_TOKEN = new Map<string, SizeTokens>([
  ['$2', '$3'],
  ['$3', '$3'],
  ['$4', '$true'],
  ['$5', '$5'],
]);

const resolveCheckboxSize = (size: SizeTokens | undefined, sizeToken: SizeTokens): SizeTokens =>
  size ?? CHECKBOX_SIZE_BY_TOKEN.get(String(sizeToken)) ?? sizeToken;

const resolveIndicatorWeight = (fontWeight: string | number | undefined): 'bold' | 'regular' | 'light' => {
  if (fontWeight === '700') {
    return 'bold';
  }
  return fontWeight === '400' ? 'regular' : 'light';
};

const resolveCheckboxRadius = (knobProps: KnobProps, pointy: boolean) => {
  const cappedRadius = clampCheckboxGlyphRadius(knobProps.borderRadius.borderRadius, { pointy });
  const radius = cappedRadius === 0 ? 0 : cappedRadius;
  return { cappedRadius, radius };
};

/** `defaultChecked` only when a default exists; otherwise the frame is left to its own state. */
const uncontrolledProps = (defaultValue: CheckboxProps['defaultValue']) =>
  defaultValue === undefined ? undefined : { defaultChecked: defaultValue };

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const nativeCheckboxA11y = (
  { disabled, label, required, helperText }: Pick<CheckboxProps, 'disabled' | 'label' | 'required' | 'helperText'>,
  errorText: string | undefined,
) => {
  const hint = errorText ?? helperText;
  return isWeb
    ? undefined
    : {
        accessible: true,
        accessibilityState: { disabled: Boolean(disabled) },
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label can name the control
        ...(typeof label === 'string' ? { accessibilityLabel: `${label}${required === true ? ' *' : ''}` } : undefined),
        ...(hasText(hint) ? { accessibilityHint: hint } : undefined),
      };
};

const isString = (value: unknown): value is string => typeof value === 'string';

const firstText = (value: string | boolean | undefined): string | undefined =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `error` is string | boolean | undefined with no discriminant; only a non-empty string is a message
  typeof value === 'string' && value !== '' ? value : undefined;

interface CheckboxIndicatorProps {
  checked: CheckedState | undefined;
  iconSize: number;
  knobProps: KnobProps;
}

/** The selection mark: check, or minus when indeterminate. Custom `children` replace it entirely. */
const CheckboxMark = ({ checked, iconSize, knobProps }: CheckboxIndicatorProps) => {
  const tamaguiTheme = useTheme();
  const accentTokenKey = (knobProps.textAccentColor ?? '$color').replace('$', '');
  const accentVariable: unknown = getVariable(
    tamaguiTheme[accentTokenKey]?.get('web') ?? tamaguiTheme.color?.get('web'),
  );
  const indicatorColor = isString(accentVariable) ? accentVariable : undefined;
  // The checked box IS the
  // selection mark, so it fills with the shared accent mark — the checked
  // Switch track precedent — and the check/minus glyph takes the
  // luminance-computed anchor for that fill. It painted the LABEL ink tier
  // (`textAccentColor`) on unchanged neutral chrome — the same defect the
  // RadioGroup dot carried — so a checked box read as chrome, not as chosen.
  // When the accent ramp is absent, `onMark` is undefined and the glyph keeps
  // the previous ink resolution as the declared fallback.
  const onMark = useReadableTextOn(formSelectedColors.mark);
  const indicatorWeight = resolveIndicatorWeight(knobProps.textWeight.fontWeight);
  const Glyph = checked === 'indeterminate' ? MinusRegular : CheckRegular;
  return (
    <TamaguiCheckbox.Indicator
      // Same native-responder steal as CheckboxGlyphBox — Indicator/SVG
      // must not claim the press that belongs to the 44px frame.
      pointerEvents="none"
      {...transitionProps(knobProps.transition)}>
      <Glyph
        color={onMark ?? indicatorColor}
        weight={indicatorWeight}
        size={iconSize}
        pointerEvents="none"
      />
    </TamaguiCheckbox.Indicator>
  );
};

interface CheckboxLabelProps {
  id: string;
  label: ReactNode;
  required: boolean | undefined;
  size: SizeTokens | undefined;
  color: string;
  text: ResolvedKnobs['text'];
  knobProps: KnobProps;
  labelProps: CheckboxProps['labelProps'];
}

const CheckboxLabel = ({ id, label, required, size, color, text, knobProps, labelProps }: CheckboxLabelProps) => (
  <Label
    htmlFor={id}
    size={size ?? '$true'}
    {...knobProps.textWeight}
    color={color}
    hoverStyle={{ color, ...text.hoverKnobProps }}
    pressStyle={{ color, ...text.pressKnobProps }}
    focusStyle={{ color, ...text.focusKnobProps }}
    focusVisibleStyle={{ color, ...text.focusVisibleKnobProps }}
    paddingInlineEnd="$1"
    {...labelProps}>
    {label}
    {required === true ? ' *' : null}
  </Label>
);

interface CheckboxFrameProps {
  id: string;
  size: SizeTokens;
  pointy: boolean;
  knobProps: KnobProps;
  disabledState: ResolvedKnobs['disabledState'];
  elevationWrapperProps: ElevationWrapperProps;
  checkboxProps: CheckboxProps['checkboxProps'];
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  required: boolean | undefined;
  hasError: boolean;
  nativeA11y: ReturnType<typeof nativeCheckboxA11y>;
  /** Frame state: `{ checked }` when controlled, `{ defaultChecked }` or nothing otherwise. */
  checkedProps: Pick<FrameProps, 'checked' | 'defaultChecked'> | undefined;
  /** What the glyph shows; the caller owns where it comes from. */
  displayChecked: CheckedState | undefined;
  onBlur: FrameProps['onBlur'];
  onCheckedChange: (checked: CheckedState) => void;
  markChildren: ReactNode;
}

/** The 44px role=checkbox target plus the painted glyph inside it. */
const CheckboxFrame = ({
  id,
  size,
  pointy,
  knobProps,
  disabledState,
  elevationWrapperProps,
  checkboxProps,
  disabled,
  readOnly,
  required,
  hasError,
  nativeA11y,
  checkedProps,
  displayChecked,
  onBlur,
  onCheckedChange,
  markChildren,
}: CheckboxFrameProps) => {
  const inTableCell = useIsInTableCell();
  const [kbFocus, setKbFocus] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Pressable-vs-glyph split (SP-FIXED / WCAG 2.5.5, same anatomy as
  // RadioGroup): the role=checkbox frame is ALWAYS a 44px transparent
  // pressable target; the visible box renders as an inner glyph at the
  // checkbox's own computed size (tamagui scaleSize 0.45), so visual density
  // is unchanged. Cells (chromeless) and plain forms share the treatment —
  // the earlier cell-only split left the plain checkbox at a 20px target.
  const glyphSize = getCheckboxGlyphSize(size);
  const iconSize = getCheckboxIconSize(glyphSize);
  const boxBorderWidth = getCheckboxBoxBorderWidth(knobProps.borderRadius.borderWidth);
  const { radius } = resolveCheckboxRadius(knobProps, pointy);
  const isMarked = displayChecked === true || displayChecked === 'indeterminate';
  const hasCustomMark = Boolean(markChildren);
  const glyph = (
    <CheckboxGlyphBox
      glyphSize={glyphSize}
      isMarked={isMarked}
      kbFocus={kbFocus}
      hovered={hovered}
      borderWidth={boxBorderWidth}
      borderRadius={radius}
      transition={knobProps.transition}>
      {hasCustomMark ? (
        markChildren
      ) : (
        <CheckboxMark
          checked={displayChecked}
          iconSize={iconSize}
          knobProps={knobProps}
        />
      )}
    </CheckboxGlyphBox>
  );
  // Elevation wraps the visible glyph, never the invisible target (cells
  // keep elevation suppressed as before).
  const content =
    (elevationWrapperProps.elevation ?? 0) !== 0 && !inTableCell ? (
      <View
        borderRadius={radius}
        pointerEvents="none"
        {...elevationWrapperProps}>
        {glyph}
      </View>
    ) : (
      glyph
    );
  return (
    <CheckboxFieldFrame
      size={size}
      transition={knobProps.transition}
      {...checkboxProps}
      {...checkboxTargetFrameProps}
      {...checkboxKbFocusHandlers(setKbFocus, setHovered, {
        onFocus: checkboxProps?.onFocus,
        onBlur,
        onHoverIn: checkboxProps?.onHoverIn,
        onHoverOut: checkboxProps?.onHoverOut,
      })}
      disabled={disabled}
      // The box is text-free chrome — dim it while
      // the sibling label stays readable (keepLabel); dimWhole dims the
      // whole assembly via FieldLayout instead.
      {...(disabled ? disabledState.chromeKnobProps : undefined)}
      id={id}
      {...checkedProps}
      {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}
      {...(readOnly ? { 'aria-readonly': true } : undefined)}
      aria-required={required === true ? true : undefined}
      aria-invalid={hasError ? true : undefined}
      {...nativeA11y}
      onCheckedChange={(val) => {
        if (disabled || readOnly) {
          return;
        }
        onCheckedChange(val);
      }}>
      {content}
    </CheckboxFieldFrame>
  );
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- emptiness predicate over any field value, by design (same contract as useResolvedValidators)
const isUncheckedValue = (value: unknown): boolean => value === false || value == null || value === '';

export const Checkbox = ({
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
  // oxlint-disable-next-line typescript/no-deprecated -- the documented alias for the Radix name stays wired until it is removed from the API
  onCheckedChange,
  onBlur,
  checkboxProps,
  children,
  pointy,
  skeleton,
  compact,
}: CheckboxProps) => {
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
  const resolvedValidators = useResolvedValidators(required, validators, label, name, isUncheckedValue);
  const resolvedPointy = pointy ?? knobProps.pointy;
  const resolvedSize = resolveCheckboxSize(size, knobProps.sizeToken);
  const inlineGap = getCheckboxInlineGap(knobProps.space);
  const hasLabel = Boolean(label);
  // E-FLAT: table cells and CheckboxGroup items ignore elevation. Skip the
  // shared helper rather than changing it.
  const inTableCell = useIsInTableCell();
  const inCheckboxGroup = useCheckboxGroupSkipsElevation();
  const skipElevation = inTableCell || inCheckboxGroup;
  const elevationWrapperProps = useMemo(
    () => (skipElevation ? {} : getElevationWrapperProps(knobProps, elevation)),
    [skipElevation, knobProps, elevation],
  );
  const hasElevation = (elevationWrapperProps.elevation ?? 0) !== 0;
  const [uncontrolledChecked, setUncontrolledChecked] = useState<CheckedState | undefined>(defaultValue);

  const frameShared = {
    id,
    size: resolvedSize,
    pointy: resolvedPointy,
    knobProps,
    disabledState,
    elevationWrapperProps,
    checkboxProps,
    disabled,
    readOnly,
    required,
    markChildren: children,
  };

  const renderLabel = (hasError: boolean) =>
    hasLabel ? (
      <CheckboxLabel
        id={id}
        label={label}
        required={required}
        size={size}
        color={hasError ? formCommonColors.error : knobProps.textAccentColor}
        text={text}
        knobProps={knobProps}
        labelProps={labelProps}
      />
    ) : null;

  if (skeleton) {
    // Mirror the real anatomy: same control size, the same clamped
    // radius the real box uses, the same box↔label gap — and the 44px
    // pressable target box around the 20px glyph (same as RadioGroup).
    const glyphSize = getCheckboxGlyphSize(resolvedSize);
    return (
      <FieldLayout
        id={id}
        size={size}
        knobProps={knobProps}
        compactSpacing>
        <XStack
          gap={inlineGap}
          alignItems="center">
          <View
            width={CHECKBOX_TARGET_PX}
            height={CHECKBOX_TARGET_PX}
            alignItems="center"
            justifyContent="center">
            <Skeleton
              variant="rounded"
              width={glyphSize}
              height={glyphSize}
              borderRadius={resolveCheckboxRadius(knobProps, resolvedPointy).cappedRadius}
            />
          </View>
          {hasLabel ? (
            <Skeleton
              variant="text"
              width={96}
              height={14}
            />
          ) : null}
        </XStack>
      </FieldLayout>
    );
  }

  if (resolvedForm == null || !hasText(name)) {
    const hasError = Boolean(error);
    const needsFieldLayout = hasError || hasText(helperText);
    const rowIsAssembly = disabled === true && !needsFieldLayout;
    const checkedProps = checked === undefined ? uncontrolledProps(defaultValue) : { checked };

    const checkboxRow = (
      <XStack
        gap={inlineGap}
        alignItems="center"
        {...(hasElevation ? { overflow: 'visible' as const } : undefined)}
        // When no FieldLayout wraps this row (no error/helper), the row
        // IS the disabled assembly — carry the dimWhole assembly fragment here
        // (empty under keepLabel) so the disabled control stays visible.
        {...(rowIsAssembly ? disabledState.assemblyKnobProps : undefined)}
        {...(rowIsAssembly
          ? { 'data-disabled-dimmed': disabledState.style === 'dimWhole' ? 'true' : 'false' }
          : undefined)}>
        <CheckboxFrame
          {...frameShared}
          hasError={hasError}
          nativeA11y={nativeCheckboxA11y({ disabled, label, required, helperText }, firstText(error))}
          checkedProps={checkedProps}
          displayChecked={checked ?? uncontrolledChecked}
          onBlur={onBlur ?? checkboxProps?.onBlur}
          onCheckedChange={(val) => {
            setUncontrolledChecked(val);
            handleValueChange(val);
          }}
        />
        {renderLabel(hasError)}
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
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const hasError = Boolean(resolvedError);
        const resolvedChecked = checked ?? field.state.value;

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
              {...(hasElevation ? { overflow: 'visible' as const } : undefined)}>
              <CheckboxFrame
                {...frameShared}
                hasError={hasError}
                nativeA11y={nativeCheckboxA11y({ disabled, label, required, helperText }, firstText(resolvedError))}
                checkedProps={{ checked: resolvedChecked }}
                displayChecked={resolvedChecked}
                onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
                onCheckedChange={(newChecked) => {
                  field.handleChange(newChecked === 'indeterminate' ? false : newChecked);
                  handleValueChange(newChecked);
                }}
              />
              {renderLabel(hasError)}
            </XStack>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

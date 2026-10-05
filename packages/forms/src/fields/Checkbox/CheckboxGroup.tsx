import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import type {
  CheckedState,
  CheckboxProps as TamaguiCheckboxProps,
  FontSizeTokens,
  LabelProps,
  SizeTokens,
} from 'tamagui';
import { View, XStack, YStack } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import { Checkbox, getCheckboxInlineGap } from './Checkbox';
import { CHECKBOX_TARGET_PX, clampCheckboxGlyphRadius, getCheckboxGlyphSize } from './CheckboxBox';
import {
  CheckboxCardContent,
  CheckboxCardDescription,
  CheckboxCardFrame,
  CheckboxCardLabel,
  getCardDescriptionSize,
  getCheckboxCardLayout,
} from './CheckboxCard';
import { CheckboxGroupFlatContext } from './checkboxGroupContext';

export interface CheckboxGroupOption {
  label: string;
  value: string;
  disabled?: boolean;
  /** Muted secondary line under the label; rendered in `card` mode. */
  description?: string;
}

export interface CheckboxGroupProps {
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
  value?: string[];
  defaultValue?: string[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string[]) => void;
  /** @deprecated Use `onChange` instead. */
  onValueChange?: (value: string[]) => void;
  onBlur?: (...args: any[]) => void;
  options?: CheckboxGroupOption[];
  orientation?: 'horizontal' | 'vertical';
  checkboxProps?: Omit<TamaguiCheckboxProps, 'checked' | 'id' | 'onCheckedChange' | 'children'>;
  children?: ReactNode;
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /**
   * When true, renders each option as a selection card: checkbox in a
   * leading slot, bold label to its right, muted `option.description` under
   * the label; the whole card toggles.
   */
  card?: boolean;
}

export function CheckboxGroup({
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
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  options,
  orientation = 'vertical',
  checkboxProps,
  children,
  skeleton,
  compact,
  card,
}: CheckboxGroupProps) {
  // Canonical `onChange` and the alias `onValueChange` both fire from the
  // single emit site below (same reconciliation as Switch).
  const handleValueChange = (newValues: string[]) => {
    onChange?.(newValues);
    onValueChange?.(newValues);
  };
  const { resolvedForm, knobProps, disabledState, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  // Uncontrolled state for standalone use (no form, no value prop) — without
  // this, defaultValue-only groups are inert because currentValues is
  // recomputed from props on every render.
  const [internalValues, setInternalValues] = useState<string[]>(defaultValue ?? []);

  if (skeleton) {
    // Mirror the real anatomy: each row is a
    // 20px control square at the same clamped radius the real Checkbox uses,
    // then a label bar separated by the real box↔label gap. Label widths are
    // DETERMINISTIC per index (never %, never random): a percentage width
    // inside an auto-width horizontal row resolves against a width computed
    // without it, so the bar paints past the row's edge and fuses with the
    // next item's square.
    const optionCount = options?.length ?? 3;
    const Container = orientation === 'horizontal' ? XStack : YStack;
    const inlineGap = getCheckboxInlineGap(knobProps.space);
    const controlRadius = clampCheckboxGlyphRadius(knobProps.borderRadius.borderRadius, {
      pointy: knobProps.pointy,
    });
    const glyphSize = getCheckboxGlyphSize((size || knobProps.sizeToken) as SizeTokens);
    const labelWidths = [88, 64, 76];
    return (
      <CheckboxGroupFlatContext.Provider value={true}>
        <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
          <Container gap="$2">
            {Array.from({ length: optionCount }, (_, i) => (
              <XStack key={i} gap={inlineGap} alignItems="center">
                {/* Mirror the 44px pressable target box around the glyph */}
                <View
                  width={CHECKBOX_TARGET_PX}
                  height={CHECKBOX_TARGET_PX}
                  alignItems="center"
                  justifyContent="center">
                  <Skeleton variant="rounded" width={glyphSize} height={glyphSize} borderRadius={controlRadius} />
                </View>
                <Skeleton variant="text" width={labelWidths[i % labelWidths.length]} height={14} />
              </XStack>
            ))}
          </Container>
        </FieldLayout>
      </CheckboxGroupFlatContext.Provider>
    );
  }

  const toggleValue = useCallback((currentValues: string[], optionValue: string, checked: CheckedState) => {
    if (checked === true) {
      return [...currentValues, optionValue];
    }
    return currentValues.filter((v) => v !== optionValue);
  }, []);

  const renderItems = (currentValues: string[], handleChange?: (newValues: string[]) => void) => {
    if (children) {
      return children;
    }
    if (!options) {
      return null;
    }

    const Container = orientation === 'horizontal' ? XStack : YStack;

    if (card) {
      const layout = getCheckboxCardLayout(knobProps.space);
      const descriptionSize = getCardDescriptionSize(size || knobProps.sizeToken);
      return (
        <Container gap="$2">
          {options.map((option, index) => {
            // Include the index so duplicate option values don't produce
            // duplicate React keys / DOM ids.
            const itemId = `${id}-${index}-${option.value}`;
            const labelId = `${itemId}-label`;
            const descriptionId = option.description ? `${itemId}-description` : undefined;
            const isChecked = currentValues.includes(option.value);
            const isDisabled = disabled || option.disabled;
            const emit = (newValues: string[]) => {
              handleChange?.(newValues);
              handleValueChange(newValues);
            };
            return (
              <CheckboxCardFrame
                key={`${index}-${option.value}`}
                active={isChecked}
                {...layout}
                borderRadius={knobProps.borderRadius.borderRadius}
                // Selection cards dim as chrome (label rides the card).
                {...(isDisabled ? disabledState.chromeKnobProps : undefined)}
                // Whole card toggles. Clicking the checkbox itself fires both
                // this and the checkbox's own handler; both compute the same
                // next value from the same render, so the double emit is
                // idempotent (same pattern as the compound FocusGroup.Item).
                onPress={() => {
                  if (isDisabled || readOnly) {
                    return;
                  }
                  emit(toggleValue(currentValues, option.value, !isChecked));
                }}>
                <Checkbox
                  id={itemId}
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    if (isDisabled || readOnly) {
                      return;
                    }
                    emit(toggleValue(currentValues, option.value, checked));
                  }}
                  disabled={isDisabled}
                  readOnly={readOnly}
                  size={size}
                  checkboxProps={{
                    ...checkboxProps,
                    'aria-labelledby': labelId,
                    ...(descriptionId && { 'aria-describedby': descriptionId }),
                  }}
                />
                <CheckboxCardContent>
                  {/* fontWeight after size: the size variant's font weight
                      would otherwise override the styled bold default */}
                  <CheckboxCardLabel
                    id={labelId}
                    size={(size || knobProps.sizeToken) as FontSizeTokens}
                    fontWeight="600">
                    {option.label}
                  </CheckboxCardLabel>
                  {option.description ? (
                    <CheckboxCardDescription id={descriptionId} size={descriptionSize}>
                      {option.description}
                    </CheckboxCardDescription>
                  ) : null}
                </CheckboxCardContent>
              </CheckboxCardFrame>
            );
          })}
        </Container>
      );
    }

    return (
      <Container gap="$2">
        {options.map((option, index) => {
          // Include the index so duplicate option values don't produce
          // duplicate React keys / DOM ids.
          const itemId = `${id}-${index}-${option.value}`;
          const isChecked = currentValues.includes(option.value);
          const isDisabled = disabled || option.disabled;

          return (
            <Checkbox
              key={`${index}-${option.value}`}
              label={option.label}
              id={itemId}
              checked={isChecked}
              onCheckedChange={(checked) => {
                if (isDisabled || readOnly) {
                  return;
                }
                const newValues = toggleValue(currentValues, option.value, checked);
                handleChange?.(newValues);
                handleValueChange(newValues);
              }}
              disabled={isDisabled}
              readOnly={readOnly}
              size={size}
              checkboxProps={checkboxProps}
            />
          );
        })}
      </Container>
    );
  };

  if (!resolvedForm || !name) {
    const currentValues = value ?? internalValues;
    return (
      <CheckboxGroupFlatContext.Provider value={true}>
        <FieldLayout
          id={id}
          label={label}
          labelProps={labelProps}
          error={error}
          required={required}
          helperText={helperText}
          size={size}
          knobProps={knobProps}
          onBlur={onBlur}
          // FieldLayout owns the dimWhole assembly dim (keepLabel pins
          // the sibling label/helper readable) — it needs the disabled state.
          disabled={disabled}>
          {renderItems(currentValues, setInternalValues)}
        </FieldLayout>
      </CheckboxGroupFlatContext.Provider>
    );
  }

  return (
    <CheckboxGroupFlatContext.Provider value={true}>
      <Field form={resolvedForm} name={name} defaultValue={defaultValue ?? []} validators={resolvedValidators}>
        {(field) => {
          const resolvedError = getFieldError(field, error);
          const fieldValues = field.state.value ?? [];
          const currentValues = value !== undefined ? value : fieldValues;

          return (
            <FieldLayout
              id={id}
              label={label}
              labelProps={labelProps}
              error={resolvedError}
              required={required}
              helperText={helperText}
              size={size}
              knobProps={knobProps}
              onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
              // See standalone branch — FieldLayout carries dimWhole.
              disabled={disabled}>
              {renderItems(currentValues, (newValues) => {
                field.handleChange(newValues as any);
              })}
            </FieldLayout>
          );
        }}
      </Field>
    </CheckboxGroupFlatContext.Provider>
  );
}

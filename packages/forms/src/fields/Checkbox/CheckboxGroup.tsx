import type { ResolvedKnobs } from '@repo/theme';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';
import type {
  CheckedState,
  CheckboxProps as TamaguiCheckboxProps,
  FontSizeTokens,
  LabelProps,
  SizeTokens,
} from 'tamagui';
import { View, XStack, YStack } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import { Checkbox, getCheckboxInlineGap } from './Checkbox';
import { CheckboxGroupFlatContext } from './checkbox-group-context';
import { CHECKBOX_TARGET_PX, clampCheckboxGlyphRadius, getCheckboxGlyphSize } from './CheckboxBox';
import {
  CheckboxCardContent,
  CheckboxCardDescription,
  CheckboxCardFrame,
  CheckboxCardLabel,
  getCardDescriptionSize,
  getCheckboxCardLayout,
} from './CheckboxCard';

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
  value?: string[];
  defaultValue?: string[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string[]) => void;
  /** @deprecated Use `onChange` instead. */
  onValueChange?: (value: string[]) => void;
  onBlur?: ComponentProps<typeof FieldLayout>['onBlur'];
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

type KnobProps = ResolvedKnobs['knobProps'];

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const toggleValue = (currentValues: string[], optionValue: string, checked: CheckedState): string[] =>
  checked === true ? [...currentValues, optionValue] : currentValues.filter((v) => v !== optionValue);

const SKELETON_LABEL_WIDTHS = [88, 64, 76];

interface CheckboxGroupSkeletonProps {
  id: string;
  label: ReactNode;
  size: SizeTokens | undefined;
  knobProps: KnobProps;
  optionCount: number;
  orientation: 'horizontal' | 'vertical';
}

const CheckboxGroupSkeleton = ({
  id,
  label,
  size,
  knobProps,
  optionCount,
  orientation,
}: CheckboxGroupSkeletonProps) => {
  // Mirror the real anatomy: each row is a
  // 20px control square at the same clamped radius the real Checkbox uses,
  // then a label bar separated by the real box↔label gap. Label widths are
  // DETERMINISTIC per index (never %, never random): a percentage width
  // inside an auto-width horizontal row resolves against a width computed
  // without it, so the bar paints past the row's edge and fuses with the
  // next item's square.
  const Container = orientation === 'horizontal' ? XStack : YStack;
  const inlineGap = getCheckboxInlineGap(knobProps.space);
  const controlRadius = clampCheckboxGlyphRadius(knobProps.borderRadius.borderRadius, {
    pointy: knobProps.pointy,
  });
  const glyphSize = getCheckboxGlyphSize(size ?? knobProps.sizeToken);
  const rows = Array.from({ length: optionCount }, (_, position) => ({
    position,
    labelWidth: SKELETON_LABEL_WIDTHS[position % SKELETON_LABEL_WIDTHS.length],
  }));
  return (
    <CheckboxGroupFlatContext.Provider value>
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Container gap="$2">
          {rows.map((row) => (
            <XStack
              key={`skeleton-row-${row.position}`}
              gap={inlineGap}
              alignItems="center">
              {/* Mirror the 44px pressable target box around the glyph */}
              <View
                width={CHECKBOX_TARGET_PX}
                height={CHECKBOX_TARGET_PX}
                alignItems="center"
                justifyContent="center">
                <Skeleton
                  variant="rounded"
                  width={glyphSize}
                  height={glyphSize}
                  borderRadius={controlRadius}
                />
              </View>
              <Skeleton
                variant="text"
                width={row.labelWidth}
                height={14}
              />
            </XStack>
          ))}
        </Container>
      </FieldLayout>
    </CheckboxGroupFlatContext.Provider>
  );
};

interface GroupItemProps {
  option: CheckboxGroupOption;
  itemId: string;
  currentValues: string[];
  emit: (newValues: string[]) => void;
  size: SizeTokens | undefined;
  knobProps: KnobProps;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  checkboxProps: CheckboxGroupProps['checkboxProps'];
  disabledState: ResolvedKnobs['disabledState'];
}

const CheckboxGroupCardItem = ({
  option,
  itemId,
  currentValues,
  emit,
  size,
  knobProps,
  disabled,
  readOnly,
  checkboxProps,
  disabledState,
}: GroupItemProps) => {
  const layout = getCheckboxCardLayout(knobProps.space);
  const descriptionSize = getCardDescriptionSize(size ?? knobProps.sizeToken);
  // SAFETY: `knobProps.sizeToken` is a `$N` scale token, a scale SizeTokens and FontSizeTokens share.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same token scale, wider static type
  const labelSize = (size ?? knobProps.sizeToken) as FontSizeTokens;
  const labelId = `${itemId}-label`;
  const descriptionId = hasText(option.description) ? `${itemId}-description` : undefined;
  const isChecked = currentValues.includes(option.value);
  const isDisabled = disabled === true || option.disabled === true;
  return (
    <CheckboxCardFrame
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
        onChange={(checked) => {
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
          ...(descriptionId === undefined ? undefined : { 'aria-describedby': descriptionId }),
        }}
      />
      <CheckboxCardContent>
        {/* fontWeight after size: the size variant's font weight
            would otherwise override the styled bold default */}
        <CheckboxCardLabel
          id={labelId}
          size={labelSize}
          fontWeight="600">
          {option.label}
        </CheckboxCardLabel>
        {hasText(option.description) ? (
          <CheckboxCardDescription
            id={descriptionId}
            size={descriptionSize}>
            {option.description}
          </CheckboxCardDescription>
        ) : null}
      </CheckboxCardContent>
    </CheckboxCardFrame>
  );
};

const CheckboxGroupRowItem = ({
  option,
  itemId,
  currentValues,
  emit,
  size,
  disabled,
  readOnly,
  checkboxProps,
}: GroupItemProps) => {
  const isDisabled = disabled === true || option.disabled === true;
  return (
    <Checkbox
      label={option.label}
      id={itemId}
      checked={currentValues.includes(option.value)}
      onChange={(checked) => {
        if (isDisabled || readOnly) {
          return;
        }
        emit(toggleValue(currentValues, option.value, checked));
      }}
      disabled={isDisabled}
      readOnly={readOnly}
      size={size}
      checkboxProps={checkboxProps}
    />
  );
};

interface CheckboxGroupItemsProps extends Omit<GroupItemProps, 'option' | 'itemId'> {
  id: string;
  options: CheckboxGroupOption[] | undefined;
  orientation: 'horizontal' | 'vertical';
  card: boolean | undefined;
}

const CheckboxGroupItems = ({ id, options, orientation, card, ...itemProps }: CheckboxGroupItemsProps) => {
  if (!options) {
    return null;
  }
  const Container = orientation === 'horizontal' ? XStack : YStack;
  const Item = card ? CheckboxGroupCardItem : CheckboxGroupRowItem;
  // Include the index so duplicate option values don't produce
  // duplicate React keys / DOM ids.
  const items = options.map((option, index) => ({ option, itemId: `${id}-${index}-${option.value}` }));
  return (
    <Container gap="$2">
      {items.map(({ option, itemId }) => (
        <Item
          key={itemId}
          {...itemProps}
          option={option}
          itemId={itemId}
        />
      ))}
    </Container>
  );
};

export const CheckboxGroup = ({
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
  // oxlint-disable-next-line typescript/no-deprecated -- the documented alias for `onChange` stays wired until it is removed from the API
  onValueChange,
  onBlur,
  options,
  orientation = 'vertical',
  checkboxProps,
  children,
  skeleton,
  compact,
  card,
}: CheckboxGroupProps) => {
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
    return (
      <CheckboxGroupSkeleton
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}
        optionCount={options?.length ?? 3}
        orientation={orientation}
      />
    );
  }

  const hasChildren = Boolean(children);
  const itemsFor = (currentValues: string[], handleChange?: (newValues: string[]) => void) => (
    <CheckboxGroupItems
      id={id}
      options={options}
      orientation={orientation}
      card={card}
      currentValues={currentValues}
      emit={(newValues) => {
        handleChange?.(newValues);
        handleValueChange(newValues);
      }}
      size={size}
      knobProps={knobProps}
      disabled={disabled}
      readOnly={readOnly}
      checkboxProps={checkboxProps}
      disabledState={disabledState}
    />
  );

  if (resolvedForm == null || name === undefined || name === '') {
    const currentValues = value ?? internalValues;
    return (
      <CheckboxGroupFlatContext.Provider value>
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
          {hasChildren ? children : itemsFor(currentValues, setInternalValues)}
        </FieldLayout>
      </CheckboxGroupFlatContext.Provider>
    );
  }

  return (
    <CheckboxGroupFlatContext.Provider value>
      <Field
        form={resolvedForm}
        name={name}
        defaultValue={defaultValue ?? []}
        validators={resolvedValidators}>
        {(field) => {
          const resolvedError = getFieldError(field, error);
          const fieldValues = field.state.value ?? [];
          const currentValues = value ?? fieldValues;

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
              {hasChildren
                ? children
                : itemsFor(currentValues, (newValues) => {
                    field.handleChange(newValues);
                  })}
            </FieldLayout>
          );
        }}
      </Field>
    </CheckboxGroupFlatContext.Provider>
  );
};

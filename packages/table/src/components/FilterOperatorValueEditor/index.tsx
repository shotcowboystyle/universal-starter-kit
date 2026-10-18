/**
 * FilterOperatorValueEditor — the ONE fieldtype-aware operator/value editor
 * (LC-16). Both filter surfaces render it:
 *   - ColumnHeaderFilter (funnel popover, Apply/Clear commit)
 *   - DataTableFilterButton (toolbar surface, live commit LC-21)
 * The surface owns commit semantics; this component only edits operator+value.
 */

import { Input, Select } from '@repo/forms';
import { useMemo } from 'react';
import { YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableColumnType, FilterOperator } from '../../types';
import { filterOperatorLabel, operatorNeedsNoValue, operatorsForFilterType } from '../../utils/filter-fields';

export interface FilterOperatorValueEditorProps {
  /** Filter editor type of the field being filtered. */
  fieldType: DataTableColumnType;
  operator: FilterOperator;
  value: string;
  onOperatorChange: (operator: FilterOperator) => void;
  onValueChange: (value: string) => void;
  /** Options for select-type fields. */
  options?: { label: string; value: unknown }[];
}

// Labels are translated per render so a locale switch applies.
const getBooleanOptions = () => [
  { value: 'true', label: t('True') },
  { value: 'false', label: t('False') },
];

const valuePlaceholder = (fieldType: DataTableColumnType): string => {
  if (fieldType === 'date') {
    return t('YYYY-MM-DD');
  }
  if (fieldType === 'money') {
    return t('0.00');
  }
  return t('Enter value...');
};

export const FilterOperatorValueEditor = ({
  fieldType,
  operator,
  value,
  onOperatorChange,
  onValueChange,
  options,
}: FilterOperatorValueEditorProps) => {
  const operatorOptions = useMemo(
    () =>
      operatorsForFilterType(fieldType).map((op) => ({
        value: op,
        label: filterOperatorLabel(op),
      })),
    [fieldType],
  );

  const needsValueInput = !operatorNeedsNoValue(operator);

  const selectOptions = useMemo(
    () =>
      options?.map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      })) ?? [],
    [options],
  );

  let pickOptions: { value: string; label: string }[] | undefined;
  if (fieldType === 'boolean') {
    pickOptions = getBooleanOptions();
  } else if (fieldType === 'select' && options) {
    pickOptions = selectOptions;
  }

  return (
    <>
      <Select
        label={t('Condition')}
        value={operator}
        onChange={(v) => {
          if (!Array.isArray(v)) {
            // SAFETY: the single-select's options are exactly operatorOptions, whose values are FilterOperators.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Select reports option values as plain strings
            onOperatorChange(v as FilterOperator);
          }
        }}
        options={operatorOptions}
      />

      {needsValueInput && (
        <YStack gap="$1">
          {pickOptions ? (
            <Select
              label={t('Value')}
              value={value}
              onChange={(v) => {
                if (!Array.isArray(v)) {
                  onValueChange(v);
                }
              }}
              options={pickOptions}
              placeholder={t('Select...')}
            />
          ) : (
            <Input
              label={t('Value')}
              value={value}
              onChangeText={onValueChange}
              placeholder={valuePlaceholder(fieldType)}
              {...((fieldType === 'number' || fieldType === 'money') && {
                keyboardType: 'numeric',
              })}
            />
          )}
        </YStack>
      )}
    </>
  );
};

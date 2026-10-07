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
import { filterOperatorLabel, operatorNeedsNoValue, operatorsForFilterType } from '../../utils/filterFields';

export interface FilterOperatorValueEditorProps {
  /** Filter editor type of the field being filtered. */
  fieldType: DataTableColumnType;
  operator: FilterOperator;
  value: string;
  onOperatorChange: (operator: FilterOperator) => void;
  onValueChange: (value: string) => void;
  /** Options for select-type fields. */
  options?: { label: string; value: any }[];
}

export function FilterOperatorValueEditor({
  fieldType,
  operator,
  value,
  onOperatorChange,
  onValueChange,
  options,
}: FilterOperatorValueEditorProps) {
  const operatorOptions = useMemo(
    () =>
      operatorsForFilterType(fieldType).map((op) => ({
        value: op,
        label: filterOperatorLabel(op),
      })),
    [fieldType],
  );

  const needsValueInput = !operatorNeedsNoValue(operator);

  const booleanOptions = [
    { value: 'true', label: t('True') },
    { value: 'false', label: t('False') },
  ];

  const selectOptions = useMemo(
    () =>
      options?.map((opt) => ({
        value: String(opt.value),
        label: opt.label,
      })) ?? [],
    [options],
  );

  return (
    <>
      <Select
        label={t('Condition')}
        value={operator}
        onValueChange={(v) => {
          if (typeof v === 'string') {
            onOperatorChange(v as FilterOperator);
          }
        }}
        options={operatorOptions}
      />

      {needsValueInput && (
        <YStack gap="$1">
          {fieldType === 'boolean' ? (
            <Select
              label={t('Value')}
              value={value}
              onValueChange={(v) => {
                if (typeof v === 'string') {
                  onValueChange(v);
                }
              }}
              options={booleanOptions}
              placeholder={t('Select...')}
            />
          ) : fieldType === 'select' && options ? (
            <Select
              label={t('Value')}
              value={value}
              onValueChange={(v) => {
                if (typeof v === 'string') {
                  onValueChange(v);
                }
              }}
              options={selectOptions}
              placeholder={t('Select...')}
            />
          ) : (
            <Input
              label={t('Value')}
              value={value}
              onChangeText={onValueChange}
              placeholder={
                fieldType === 'date' ? t('YYYY-MM-DD') : fieldType === 'money' ? t('0.00') : t('Enter value...')
              }
              {...((fieldType === 'number' || fieldType === 'money') && {
                keyboardType: 'numeric',
              })}
            />
          )}
        </YStack>
      )}
    </>
  );
}

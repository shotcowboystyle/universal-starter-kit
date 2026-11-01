import { Combobox } from '@repo/forms';
import type { ComboboxOption } from '@repo/forms';
/**
 * Frappe Table MultiSelect: multi-value picker over a target DocType.
 *
 * Thin adapter over the house forms Combobox (`multiple` + `dismissible`).
 * Design-law lives here: this file owns the Frappe collection/live-query
 * wiring only — it must not fork Input / Select / ColorPicker chrome.
 * Unknown selections stay in `options` so Combobox can show and dismiss them
 * (DG-A11Y-06 chip names come from forms Chip).
 */
import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { FrappeConfig } from '../FrappeProvider';
import { useFrappeConfig } from '../FrappeProvider';

export interface TableMultiSelectOption {
  name: string;
  doctype: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the doc carries whichever displayField the caller names
  [key: string]: unknown;
}

export interface TableMultiSelectProps {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  doctype: string;
  displayField?: string;
  disabled?: boolean;
  required?: boolean;
  maxSelections?: number;
  baseURL?: string;
  auth?: FrappeConfig['auth'];
  error?: string;
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  placeholder?: string;
}

/** Every falsy value: a display field holding one falls back to the doc name. */
const EMPTY_LABELS = new Set<unknown>([undefined, null, '', 0, false, Number.NaN]);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- displayField picks an arbitrary doc field
const toDisplayLabel = (raw: unknown): string | undefined => {
  if (EMPTY_LABELS.has(raw)) {
    return undefined;
  }
  return String(raw);
};

const toSelection = (next: string | string[]): string[] => {
  if (Array.isArray(next)) {
    return next;
  }
  return next === '' ? [] : [next];
};

/** The provider's connection, with this field's baseURL/auth overrides; undefined without a base URL. */
const useCollectionConfig = (baseURL?: string, auth?: FrappeConfig['auth']) => {
  const config = useFrappeConfig();
  const finalBaseURL = baseURL ?? config?.baseURL ?? '';
  return finalBaseURL
    ? {
        baseURL: finalBaseURL,
        socketPort: config?.socketPort,
        siteName: config?.siteName,
        socketBaseURL: config?.socketBaseURL,
        auth: auth ?? config?.auth,
        syncOptions: config?.syncOptions,
        realtime: config?.realtime,
        fixtures: config?.fixtures,
      }
    : undefined;
};

export const TableMultiSelect = ({
  label,
  value,
  onChange,
  doctype,
  displayField = 'name',
  disabled = false,
  required = false,
  maxSelections,
  baseURL,
  auth,
  error,
  helperText,
  readOnly = false,
  skeleton = false,
  compact = false,
  placeholder,
}: TableMultiSelectProps) => {
  const { t } = useTranslation();
  const isLocked = disabled || readOnly;
  const finalConfig = useCollectionConfig(baseURL, auth);

  const optionsCollection = useFrappeCollection<TableMultiSelectOption>(finalConfig, doctype, {
    fields: ['name', displayField],
  });
  const { data: rawOptions } = useLiveQuery(
    (q) => (optionsCollection ? q.from({ _list: optionsCollection }) : null),
    [optionsCollection],
  );
  // SAFETY: the live query reads the TableMultiSelectOption collection above
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const docs = useMemo(() => (rawOptions as TableMultiSelectOption[]) ?? [], [rawOptions]);

  const options = useMemo<ComboboxOption[]>(() => {
    const fromDocs = docs.map((option) => {
      const displayLabel = (displayField === 'name' ? undefined : toDisplayLabel(option[displayField])) ?? option.name;
      return { value: option.name || '', label: displayLabel || option.name || '' };
    });
    const known = new Set(fromDocs.map((option) => option.value));
    const unknown: ComboboxOption[] = [];
    for (const name of value) {
      if (name !== '' && !known.has(name)) {
        unknown.push({ value: name, label: name });
      }
    }
    return [...fromDocs, ...unknown];
  }, [docs, displayField, value]);

  const handleChange = useCallback(
    (next: string | string[]) => {
      if (isLocked) {
        return;
      }
      const arr = toSelection(next);
      if (maxSelections !== undefined && arr.length > maxSelections) {
        return;
      }
      onChange(arr);
    },
    [isLocked, maxSelections, onChange],
  );

  return (
    <Combobox
      multiple
      dismissible
      options={options}
      value={value}
      onChange={handleChange}
      label={label}
      placeholder={placeholder ?? t('Select options')}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      error={error}
      helperText={helperText}
      skeleton={skeleton}
      compact={compact}
    />
  );
};

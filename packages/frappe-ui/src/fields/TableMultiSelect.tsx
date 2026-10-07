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

import { useFrappeConfig } from '../FrappeProvider';

export interface TableMultiSelectOption {
  name: string;
  doctype: string;
  [key: string]: any;
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
  auth?: any;
  error?: string;
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
  placeholder?: string;
}

export function TableMultiSelect({
  label,
  value = [],
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
}: TableMultiSelectProps) {
  const { t } = useTranslation();
  const config = useFrappeConfig();
  const isLocked = disabled || readOnly;

  const finalBaseURL = baseURL ?? config?.baseURL ?? '';
  const finalConfig = finalBaseURL
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

  const optionsCollection = useFrappeCollection<TableMultiSelectOption>(finalConfig, doctype, {
    fields: ['name', displayField],
  });
  const { data: rawOptions } = useLiveQuery(
    (q) => (optionsCollection ? q.from({ _list: optionsCollection }) : null),
    [optionsCollection],
  );
  const docs = useMemo(() => (rawOptions as TableMultiSelectOption[]) ?? [], [rawOptions]);

  const options = useMemo<ComboboxOption[]>(() => {
    const fromDocs = docs.map((option) => {
      const displayLabel = displayField !== 'name' && option[displayField] ? String(option[displayField]) : option.name;
      return { value: option.name || '', label: displayLabel || option.name || '' };
    });
    const known = new Set(fromDocs.map((option) => option.value));
    const unknown = value.filter((name) => name && !known.has(name)).map((name) => ({ value: name, label: name }));
    return [...fromDocs, ...unknown];
  }, [docs, displayField, value]);

  const handleChange = useCallback(
    (next: string | string[]) => {
      if (isLocked) {
        return;
      }
      const arr = Array.isArray(next) ? next : next ? [next] : [];
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
}

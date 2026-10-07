/**
 * Quick standard filters — the inline controls desk renders in the list
 * header for fields flagged `in_standard_filter`: Select → dropdown,
 * Link → search_link autocomplete (frappe-ui Link field), Check → toggle,
 * Data/other → debounced text. Each control owns exactly its fieldname in
 * the filter list: setting emits ["field", "=", value] (text kinds emit
 * ["field", "like", "%v%"]), clearing removes the tuple. Chips (and the
 * filter editor) are the removal surface for the dropdown kinds.
 */
import { XStack, YStack } from '@repo/ui';
import { Checkbox, Input, Select } from '@repo/forms';
import {
  Link as LinkField,
  quickFilterValue,
  selectOptionsFromField,
  setFieldFilter,
  standardFiltersFromMeta,
} from '@repo/frappe-ui';
import type { FilterFieldDescriptor } from '@repo/frappe-ui';
import { useEffect, useRef, useState } from 'react';

import type { FrappeFilter, FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

export interface StandardFiltersProps {
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  /** Stack full-width controls (compact list-tools sheet) instead of the inline wrap row. */
  vertical?: boolean;
}

export function StandardFilters({ meta, filters, onFiltersChange, vertical }: StandardFiltersProps) {
  const fields = standardFiltersFromMeta(meta);
  if (!fields.length) {
    return null;
  }
  const controls = fields.map((field) => (
    <StandardFilterControl
      key={field.fieldname}
      field={field}
      filters={filters}
      onFiltersChange={onFiltersChange}
      vertical={vertical}
    />
  ));
  if (vertical) {
    return <YStack gap="$2">{controls}</YStack>;
  }
  return (
    <XStack
      gap="$1.5"
      flexWrap="wrap"
      alignItems="center">
      {controls}
    </XStack>
  );
}

interface StandardFilterControlProps {
  field: FilterFieldDescriptor;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  vertical?: boolean;
}

function StandardFilterControl({ field, filters, onFiltersChange, vertical }: StandardFilterControlProps) {
  const value = quickFilterValue(filters, field.fieldname);
  const commit = (tuple?: FrappeFilter) => {
    onFiltersChange(setFieldFilter(filters, field.fieldname, tuple));
  };

  // Vertical wrappers are COLUMN stacks: only the column cross-axis
  // stretches the field to full width on native (a row wrapper leaves the
  // field at intrinsic width — it collapsed to a sliver in the sheet).
  switch (field.kind) {
    case 'select': {
      const select = (
        <Select
          value={value}
          onChange={(next) => {
            if (typeof next !== 'string') {
              return;
            }
            commit(next ? [field.fieldname, '=', next] : undefined);
          }}
          options={selectOptionsFromField(field.options)}
          placeholder={field.label}
          size="$3"
          compact
          aria-label={field.label}
        />
      );
      // Horizontal band: no fixed-width wrapper — the house field owns its
      // width dial; a narrower hardcoded wrapper made adjacent controls
      // overlap (the web input's intrinsic width exceeds it, LC-10).
      return vertical ? <YStack width="100%">{select}</YStack> : select;
    }
    case 'link': {
      const link = (
        <LinkField
          value={value}
          onChange={(next) => {
            commit(next ? [field.fieldname, '=', next] : undefined);
          }}
          doctype={field.options ?? ''}
          placeholder={field.label}
          compact
        />
      );
      return vertical ? <YStack width="100%">{link}</YStack> : link;
    }
    case 'check': {
      return (
        <Checkbox
          label={field.label}
          checked={value === '1' || value === 'true'}
          onCheckedChange={(checked) => {
            commit(checked === true ? [field.fieldname, '=', 1] : undefined);
          }}
        />
      );
    }
    default: {
      return (
        <DebouncedTextFilter
          field={field}
          externalValue={value}
          commit={commit}
          vertical={vertical}
        />
      );
    }
  }
}

interface DebouncedTextFilterProps {
  field: FilterFieldDescriptor;
  externalValue: string;
  commit: (tuple?: FrappeFilter) => void;
  vertical?: boolean;
}

/**
 * Text-ish quick filter (Data / date / number kinds). Local draft commits
 * after a 400ms pause (desk debounces its standard filter inputs too);
 * external changes (chip removal, editor apply) reset the draft.
 */
function DebouncedTextFilter({ field, externalValue, commit, vertical }: DebouncedTextFilterProps) {
  const [draft, setDraft] = useState(externalValue);
  const committedRef = useRef(externalValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (externalValue !== committedRef.current) {
      committedRef.current = externalValue;
      setDraft(externalValue);
    }
  }, [externalValue]);

  useEffect(() => {
    if (draft === committedRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      committedRef.current = draft;
      const text = draft.trim();
      if (!text) {
        commitRef.current();
      } else if (field.kind === 'text') {
        commitRef.current([field.fieldname, 'like', `%${text}%`]);
      } else {
        commitRef.current([field.fieldname, '=', text]);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, field.fieldname, field.kind]);

  const input = (
    <Input
      value={draft}
      onChangeText={setDraft}
      placeholder={field.kind === 'date' ? `${field.label} (YYYY-MM-DD)` : field.label}
      size="$3"
      compact
      aria-label={field.label}
      {...(field.kind === 'number' ? { keyboardType: 'numeric' as const } : {})}
    />
  );
  // Column wrapper stretches the field on native (see StandardFilterControl);
  // the horizontal band lets the field's own width dial size it (no fixed
  // pixel wrapper — see StandardFilterControl).
  return vertical ? <YStack width="100%">{input}</YStack> : input;
}

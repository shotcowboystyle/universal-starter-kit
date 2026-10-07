/**
 * Filter editor — desk's "Filter" button + popover: the current filter
 * tuples as editable rows (field picker / operator select / fieldtype-aware
 * value editor) plus Add-filter, Clear-all, and Apply. Apply owns the whole
 * tuple list (standard-filter tuples included — same as desk, where the
 * filter area shows every applied filter).
 */
import { Popover, PopoverContent, ScrollView, Text, XStack, YStack } from '@repo/ui';
// House Button: the raw tamagui Button (components re-export) never gets the
// house 44px press floor (LC-54) — filter chrome takes the forms Button.
import { Button, Input, Select } from '@repo/forms';
import {
  DESK_OPERATOR_LABELS,
  defaultOperatorForKind,
  draftToTuple,
  filterableFieldsFromMeta,
  Link as LinkField,
  operatorsForKind,
  selectOptionsFromField,
  tupleToDraft,
} from '@repo/frappe-ui';
import type { DeskOperator, FilterFieldDescriptor, FilterRowDraft } from '@repo/frappe-ui';
import { sizeRecipeEscape } from '@repo/theme';
import { FunnelIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { overlayListMaxHeight } from '../shared/measures';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

export interface FilterEditorButtonProps {
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
}

interface DraftRow extends FilterRowDraft {
  id: number;
}

export interface FilterEditorPanelProps {
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  /** Fires after Apply / Clear commits (popover/sheet hosts close on it). */
  onDone?: () => void;
  /**
   * Scroll the row list internally past this height (popover host). Sheet
   * hosts pass `false` — the sheet's own scroll container owns overflow
   * (nested same-direction scrolling is unreliable on native).
   */
  scrollRows?: boolean;
}

/**
 * The editor body (draft rows + Add / Clear / Apply) — shared between the
 * desktop popover (FilterEditorButton) and the compact list-tools sheet.
 * Draft rows seed from the applied filters at MOUNT: hosts remount the panel
 * (key) whenever the applied filters change outside it.
 */
export function FilterEditorPanel({
  meta,
  filters,
  onFiltersChange,
  onDone,
  scrollRows = true,
}: FilterEditorPanelProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const fields = useMemo(() => filterableFieldsFromMeta(meta), [meta]);
  const nextIdRef = useRef(1);
  // Seed the draft from the applied filters once per mount (see doc above).
  const [rows, setRows] = useState<DraftRow[]>(() =>
    filters.map((tuple) => ({ ...tupleToDraft(tuple), id: nextIdRef.current++ })),
  );

  const addRow = () => {
    const first = fields[0];
    if (!first) {
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: nextIdRef.current++,
        fieldname: first.fieldname,
        operator: defaultOperatorForKind(first.kind),
        value: '',
        values: [],
      },
    ]);
  };

  const updateRow = (id: number, patch: Partial<FilterRowDraft>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const kindOf = (fieldname: string) => fields.find((field) => field.fieldname === fieldname)?.kind ?? 'text';

  const apply = () => {
    const tuples: FrappeFilters = [];
    for (const row of rows) {
      const tuple = draftToTuple(row, kindOf(row.fieldname));
      if (tuple) {
        tuples.push(tuple);
      }
    }
    onFiltersChange(tuples);
    onDone?.();
  };

  const clearAll = () => {
    setRows([]);
    onFiltersChange([]);
    onDone?.();
  };

  const rowList = (
    <YStack gap="$2">
      {rows.map((row) => (
        <FilterEditorRow
          key={row.id}
          row={row}
          fields={fields}
          onChange={(patch) => {
            updateRow(row.id, patch);
          }}
          onRemove={() => {
            removeRow(row.id);
          }}
        />
      ))}
    </YStack>
  );

  return (
    <YStack gap="$3">
      {rows.length === 0 ? (
        <Text
          color="$color10"
          fontSize="$3">
          {t('list.filters.empty', 'No filters applied')}
        </Text>
      ) : scrollRows ? (
        <ScrollView maxHeight={overlayListMaxHeight}>{rowList}</ScrollView>
      ) : (
        rowList
      )}
      <XStack
        gap="$2"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap">
        <Button
          size="$3"
          chromeless
          icon={PlusIcon}
          onPress={addRow}>
          {t('list.filters.addFilter', 'Add filter')}
        </Button>
        <XStack
          gap="$2"
          alignItems="center">
          {/* Hidden (not bare-disabled) when there is nothing to clear —
              DG-ST-03's hide branch; the empty state line already says
              "No filters applied". */}
          {rows.length === 0 && filters.length === 0 ? null : (
            <Button
              size="$3"
              chromeless
              onPress={clearAll}>
              {t('list.clearFilters', 'Clear filters')}
            </Button>
          )}
          {/* `accent` — the house one-primary expression (LC-05). */}
          <Button
            size="$3"
            accent
            onPress={apply}>
            {t('list.filters.apply', 'Apply')}
          </Button>
        </XStack>
      </XStack>
    </YStack>
  );
}

export function FilterEditorButton({ meta, filters, onFiltersChange }: FilterEditorButtonProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const [open, setOpen] = useState(false);
  // Remount the panel per open so drafts reseed from the applied filters.
  const [openGen, setOpenGen] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpenGen((generation) => generation + 1);
    }
    setOpen(nextOpen);
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottom-start">
      <Popover.Trigger asChild>
        <Button
          size="$3"
          icon={FunnelIcon}>
          {filters.length > 0
            ? t('list.filters.filterCount', 'Filter ({{count}})', {
                count: filters.length,
              })
            : t('list.filters.filter', 'Filter')}
        </Button>
      </Popover.Trigger>
      <PopoverContent padding="$3">
        <Popover.Arrow
          borderWidth={1}
          borderColor="$borderColor"
        />
        <YStack
          width={sizeRecipeEscape(
            620,
            'filter editor: fixed panel and column widths so field, condition and value line up across rows',
          )}
          maxWidth="100%">
          <FilterEditorPanel
            key={openGen}
            meta={meta}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onDone={() => {
              setOpen(false);
            }}
          />
        </YStack>
      </PopoverContent>
    </Popover>
  );
}

// ── Row ───────────────────────────────────────────────────────

interface FilterEditorRowProps {
  row: DraftRow;
  fields: FilterFieldDescriptor[];
  onChange: (patch: Partial<FilterRowDraft>) => void;
  onRemove: () => void;
}

function FilterEditorRow({ row, fields, onChange, onRemove }: FilterEditorRowProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const field = fields.find((candidate) => candidate.fieldname === row.fieldname);
  const kind = field?.kind ?? 'text';

  const fieldOptions = useMemo(
    () => fields.map((candidate) => ({ value: candidate.fieldname, label: candidate.label })),
    [fields],
  );
  const operatorOptions = useMemo(
    () =>
      operatorsForKind(kind).map((operator) => ({
        value: operator,
        label: t(`list.filters.op.${operator}`, DESK_OPERATOR_LABELS[operator]),
      })),
    [kind, t],
  );

  return (
    <XStack
      gap="$2"
      alignItems="center"
      flexWrap="wrap">
      {/* Column wrappers: fields only stretch to the wrapper width through
          a column cross-axis on native (row wrappers leave them at
          intrinsic width — sliver bug in the list-tools sheet). */}
      <YStack
        width={sizeRecipeEscape(
          170,
          'filter editor: fixed panel and column widths so field, condition and value line up across rows',
        )}>
        <Select
          value={row.fieldname}
          onChange={(next) => {
            if (typeof next !== 'string') {
              return;
            }
            const nextField = fields.find((candidate) => candidate.fieldname === next);
            onChange({
              fieldname: next,
              operator: defaultOperatorForKind(nextField?.kind ?? 'text'),
              value: '',
              values: [],
            });
          }}
          options={fieldOptions}
          size="$3"
          compact
          aria-label={t('list.filters.field', 'Filter field')}
        />
      </YStack>
      <YStack
        width={sizeRecipeEscape(
          150,
          'filter editor: fixed panel and column widths so field, condition and value line up across rows',
        )}>
        <Select
          value={row.operator}
          onChange={(next) => {
            if (typeof next !== 'string') {
              return;
            }
            onChange({ operator: next as DeskOperator });
          }}
          options={operatorOptions}
          size="$3"
          compact
          aria-label={t('list.filters.condition', 'Condition')}
        />
      </YStack>
      <YStack
        flex={1}
        minWidth={sizeRecipeEscape(
          170,
          'filter editor: fixed panel and column widths so field, condition and value line up across rows',
        )}>
        <FilterValueEditor
          row={row}
          field={field}
          onChange={onChange}
        />
      </YStack>
      <Button
        size="$2"
        circular
        chromeless
        icon={XIcon}
        onPress={onRemove}
        aria-label={t('list.filters.removeFilter', 'Remove filter')}
      />
    </XStack>
  );
}

// ── Value editor ──────────────────────────────────────────────

interface FilterValueEditorProps {
  row: DraftRow;
  field?: FilterFieldDescriptor;
  onChange: (patch: Partial<FilterRowDraft>) => void;
}

/**
 * Fieldtype- and operator-aware value editor: no input for is set / is not
 * set, from–to inputs for between, multi-select (Select fields) or a comma
 * list for in / not in, and kind-specific single editors otherwise (Select
 * dropdown, Link autocomplete, Check yes/no, numeric/date/text input).
 * `like` always edits as free text — it is a pattern match.
 */
function FilterValueEditor({ row, field, onChange }: FilterValueEditorProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const kind = field?.kind ?? 'text';
  const { operator } = row;
  const valueLabel = t('list.filters.value', 'Value');

  if (operator === 'is set' || operator === 'is not set') {
    return null;
  }

  if (operator === 'between') {
    const placeholder = kind === 'date' ? 'YYYY-MM-DD' : undefined;
    return (
      <XStack
        gap="$2"
        flex={1}>
        {/* Column wrappers — see FilterEditorRow (native field stretch). */}
        <YStack
          flex={1}
          minWidth={0}>
          <Input
            value={row.values[0] ?? ''}
            onChangeText={(next) => {
              onChange({ values: [next, row.values[1] ?? ''] });
            }}
            placeholder={placeholder ?? t('list.filters.from', 'From')}
            size="$3"
            compact
            aria-label={t('list.filters.from', 'From')}
          />
        </YStack>
        <YStack
          flex={1}
          minWidth={0}>
          <Input
            value={row.values[1] ?? ''}
            onChangeText={(next) => {
              onChange({ values: [row.values[0] ?? '', next] });
            }}
            placeholder={placeholder ?? t('list.filters.to', 'To')}
            size="$3"
            compact
            aria-label={t('list.filters.to', 'To')}
          />
        </YStack>
      </XStack>
    );
  }

  if (operator === 'in' || operator === 'not in') {
    if (kind === 'select') {
      return (
        <Select
          multiple
          dismissible
          value={row.values}
          onChange={(next) => {
            onChange({ values: Array.isArray(next) ? next : [next] });
          }}
          options={selectOptionsFromField(field?.options)}
          placeholder={t('list.filters.selectValues', 'Select values...')}
          size="$3"
          compact
          aria-label={valueLabel}
        />
      );
    }
    return (
      <Input
        value={row.value}
        onChangeText={(next) => {
          onChange({ value: next });
        }}
        placeholder={t('list.filters.commaValues', 'Comma separated values')}
        size="$3"
        compact
        aria-label={valueLabel}
      />
    );
  }

  // `like` / `not like` are pattern matches — free text for every kind.
  if (operator !== 'like' && operator !== 'not like') {
    if (kind === 'select') {
      return (
        <Select
          value={row.value}
          onChange={(next) => {
            if (typeof next === 'string') {
              onChange({ value: next });
            }
          }}
          options={selectOptionsFromField(field?.options)}
          placeholder={t('list.filters.selectValue', 'Select...')}
          size="$3"
          compact
          aria-label={valueLabel}
        />
      );
    }
    if (kind === 'link') {
      return (
        <LinkField
          value={row.value}
          onChange={(next) => {
            onChange({ value: next });
          }}
          doctype={field?.options ?? ''}
          placeholder={t('list.filters.searchValue', 'Search...')}
          compact
        />
      );
    }
    if (kind === 'check') {
      return (
        <Select
          value={row.value}
          onChange={(next) => {
            if (typeof next === 'string') {
              onChange({ value: next });
            }
          }}
          options={[
            { value: '1', label: t('list.filters.yes', 'Yes') },
            { value: '0', label: t('list.filters.no', 'No') },
          ]}
          placeholder={t('list.filters.selectValue', 'Select...')}
          size="$3"
          compact
          aria-label={valueLabel}
        />
      );
    }
  }

  return (
    <Input
      value={row.value}
      onChangeText={(next) => {
        onChange({ value: next });
      }}
      placeholder={kind === 'date' ? 'YYYY-MM-DD' : t('list.filters.enterValue', 'Enter value...')}
      size="$3"
      compact
      aria-label={valueLabel}
      {...(kind === 'number' ? { keyboardType: 'numeric' as const } : {})}
    />
  );
}

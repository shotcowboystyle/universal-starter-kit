/**
 * DataTableFilters — standalone filter bar (Polaris Index Filters + Linear).
 *
 * Empty: a Filter trigger. Active: the same trigger (count on the button as
 * fill, LC-71) plus wrapping dismissible chips. Add/edit opens a FloatingPanel
 * (LC-06) with the shared FilterOperatorValueEditor (LC-16). Compose stays
 * open after Add (LC-21); Cancel / outside / Escape close.
 *
 * Compact (card chrome beside DataTableFilterButton / FilterChips) is Add
 * Filter + Clear — not a second Filter trigger or chip row.
 */

import { FunnelIcon, PlusIcon } from '@phosphor-icons/react';
import { Button, FloatingPanel, Select } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableColumnType, FacetedFilterOption, FilterOperator, FilterValue, TableFilter } from '../../types';
import { defaultOperatorForFilterType, getFilterChipLabel, operatorNeedsNoValue } from '../../utils/filter-fields';
import { useDataTableState } from '../DataTable/data-table-state-context';
import { FilterChip } from '../DataTableFilterChips';
import { FilterOperatorValueEditor } from '../FilterOperatorValueEditor';

export interface DataTableFiltersProps {
  filters?: TableFilter[];
  onFiltersChange?: (filters: TableFilter[]) => void;
  onAddFilter?: (filter: Omit<TableFilter, 'id'>) => void;
  onRemoveFilter?: (filterId: string) => void;
  onClearFilters?: () => void;
  availableColumns?: {
    id: string;
    label: string;
    type: DataTableColumnType;
    options?: FacetedFilterOption[];
  }[];
  maxFilters?: number;
  showFilterCount?: boolean;
  compact?: boolean;
}

type ColumnOption = NonNullable<DataTableFiltersProps['availableColumns']>[number];

interface FilterBuilderProps {
  availableColumns: ColumnOption[];
  editingFilter: TableFilter | null;
  onCommit: (filter: Omit<TableFilter, 'id'>) => void;
  onCancel: () => void;
  canAdd: boolean;
}

const FilterBuilder = ({ availableColumns, editingFilter, onCommit, onCancel, canAdd }: FilterBuilderProps) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>('contains');
  const [filterValue, setFilterValue] = useState('');

  const selectedColumn = availableColumns.find((col) => col.id === selectedColumnId);

  // The draft re-seeds whenever the edited filter changes — including an
  // external update to the same filter while the panel is open.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- see the re-seed note above; a key reset would miss same-id updates
    setSelectedColumnId(editingFilter?.columnId ?? '');
    setSelectedOperator(editingFilter?.value.operator ?? 'contains');
    setFilterValue(editingFilter ? String(editingFilter.value.value ?? '') : '');
  }, [editingFilter]);

  const columnOptions = availableColumns.map((col) => ({
    value: col.id,
    label: col.label,
  }));

  const handleCommit = () => {
    if (!selectedColumnId || !selectedOperator) {
      return;
    }
    const value: FilterValue = {
      operator: selectedOperator,
      value: operatorNeedsNoValue(selectedOperator) ? null : filterValue,
    };
    onCommit({
      columnId: selectedColumnId,
      value,
      label: selectedColumn?.label,
    });
    setSelectedColumnId('');
    setSelectedOperator('contains');
    setFilterValue('');
  };

  return (
    <YStack
      {...knobProps.panelPadding}
      gap="$3"
      minWidth={280}
      maxWidth={360}>
      <Text
        fontSize="$3"
        fontWeight="400"
        color="$color12">
        {editingFilter ? t('Edit filter') : t('Add filter')}
      </Text>

      <Select
        label={t('Column')}
        value={selectedColumnId}
        onChange={(v) => {
          if (Array.isArray(v)) {
            return;
          }
          setSelectedColumnId(v);
          const col = availableColumns.find((c) => c.id === v);
          setSelectedOperator(defaultOperatorForFilterType(col?.type ?? 'text'));
          setFilterValue('');
        }}
        options={columnOptions}
        placeholder={t('Select column')}
        size="$3"
        compact
      />

      {selectedColumn ? (
        <FilterOperatorValueEditor
          fieldType={selectedColumn.type}
          operator={selectedOperator}
          value={filterValue}
          onOperatorChange={setSelectedOperator}
          onValueChange={setFilterValue}
          options={selectedColumn.options}
        />
      ) : null}

      <XStack
        gap="$2"
        justifyContent="flex-end">
        <Button
          size="$3"
          compact
          onPress={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          size="$3"
          compact
          accent
          onPress={handleCommit}
          disabled={!selectedColumnId || !selectedOperator || !canAdd}>
          {editingFilter ? t('Update') : t('Add filter')}
        </Button>
      </XStack>
    </YStack>
  );
};

const noop = (): void => undefined;

// oxlint-disable-next-line eslint/complexity -- the branches are prop/context fallbacks and compact vs full chrome
export const DataTableFilters = (props: DataTableFiltersProps) => {
  const ctx = useDataTableState();

  const filters = props.filters ?? ctx?.state.filters ?? [];
  const onAddFilter = props.onAddFilter ?? ctx?.actions.addFilter ?? noop;
  const onRemoveFilter = props.onRemoveFilter ?? ctx?.actions.removeFilter ?? noop;
  const onClearFilters = props.onClearFilters ?? ctx?.actions.clearFilters ?? noop;
  const availableColumns = props.availableColumns ?? [];

  const { maxFilters = 10, showFilterCount = true, compact } = props;

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { knobProps } = useResolvedKnobs(compact === undefined ? undefined : { compact });

  const canAddMoreFilters = filters.length < maxFilters;
  const isEditing = editingId !== null && editingId !== '';
  const editingFilter = isEditing ? (filters.find((f) => f.id === editingId) ?? null) : null;
  const triggerName = compact ? t('Add Filter') : t('Filter');
  const triggerLabel = showFilterCount && filters.length > 0 ? `${triggerName} (${filters.length})` : triggerName;

  const handleCommit = (filter: Omit<TableFilter, 'id'>) => {
    if (isEditing) {
      const updated = filters.map((row) => (row.id === editingId ? { ...row, ...filter } : row));
      (props.onFiltersChange ?? ctx?.actions.setFilters ?? noop)(updated);
      setEditingId(null);
      return;
    }
    onAddFilter(filter);
  };

  const openBuilder = (filterId?: string) => {
    setEditingId(filterId ?? null);
    setBuilderOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    setBuilderOpen(next);
    if (!next) {
      setEditingId(null);
    }
  };

  const trigger = (
    <Button
      size="$3"
      compact
      {...(filters.length > 0 ? { accent: true } : { variant: 'outlined' as const })}
      icon={
        compact ? (
          <PlusIcon size={14} />
        ) : (
          <FunnelIcon
            size={14}
            weight={filters.length > 0 ? 'fill' : 'regular'}
          />
        )
      }
      aria-label={triggerName}
      aria-expanded={builderOpen}
      aria-haspopup="dialog">
      {triggerLabel}
    </Button>
  );

  return (
    <YStack
      data-testid="data-table-filters"
      aria-label={t('Table filters')}
      aria-live="polite">
      <XStack
        flexWrap="wrap"
        alignItems="center"
        {...knobProps.gap}>
        <View
          alignSelf="flex-start"
          flexShrink={0}>
          <FloatingPanel
            open={builderOpen}
            onOpenChange={handleOpenChange}
            trigger={trigger}
            widthMode="fit-content"
            scrollable={false}>
            <FilterBuilder
              availableColumns={availableColumns}
              editingFilter={editingFilter}
              onCommit={handleCommit}
              onCancel={() => {
                handleOpenChange(false);
              }}
              canAdd={canAddMoreFilters || !!editingFilter}
            />
          </FloatingPanel>
        </View>

        {!compact &&
          filters.map((filter) => {
            const column = availableColumns.find((col) => col.id === filter.columnId);
            const label = getFilterChipLabel(
              column?.label ?? filter.label ?? filter.columnId,
              filter.value,
              column?.options,
            );
            return (
              <FilterChip
                key={filter.id}
                label={label}
                onRemove={() => {
                  onRemoveFilter(filter.id);
                }}
                onPress={() => {
                  openBuilder(filter.id);
                }}
              />
            );
          })}

        {compact && filters.length > 0 && (
          <Button
            size="$2"
            chromeless
            compact
            onPress={onClearFilters}
            aria-label={t('Clear')}>
            {t('Clear')}
          </Button>
        )}
        {!compact && filters.length >= 2 && (
          <Button
            size="$2"
            chromeless
            compact
            onPress={onClearFilters}
            aria-label={t('Clear all')}>
            {t('Clear all')}
          </Button>
        )}
      </XStack>
    </YStack>
  );
};

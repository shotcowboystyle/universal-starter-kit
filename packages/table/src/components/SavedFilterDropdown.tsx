import { Select } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';

import type { ParsedFilter } from '../hooks/use-saved-filters';

export interface SavedFilterDropdownProps {
  filters: ParsedFilter[];
  selectedFilter?: ParsedFilter | null;
  onSelectFilter: (filter: ParsedFilter | null) => void;
  onDeleteFilter?: (filterName: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const SavedFilterDropdown = ({
  filters,
  selectedFilter,
  onSelectFilter,
  onDeleteFilter: _onDeleteFilter,
  placeholder = 'Saved Filters',
  disabled = false,
}: SavedFilterDropdownProps) => {
  const { knobProps } = useResolvedKnobs();

  // Convert filters to forms Select options. Hooks must run before the
  // empty-state return: the first saved filter flipping 0 → 1 otherwise
  // changes the hook count between renders and crashes the tree.
  const options = useMemo(
    () =>
      filters.map((filter) => ({
        value: filter.name,
        label: filter.filter_name + (filter.isGlobal ? ' (Global)' : ''),
      })),
    [filters],
  );

  if (filters.length === 0) {
    return null;
  }

  return (
    <Select
      value={selectedFilter?.name ?? ''}
      onChange={(value) => {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- single-select emits a string; the string[] arm of the Select callback is the multi-select case
        if (typeof value === 'string') {
          const filter = filters.find((f) => f.name === value);
          onSelectFilter(filter ?? null);
        }
      }}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      size={knobProps.sizeToken}
      compact
      aria-label="Saved filters"
    />
  );
};

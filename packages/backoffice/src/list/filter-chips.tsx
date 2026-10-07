/**
 * Active filter chips — desk shows every applied filter as a removable
 * chip under the list header (HONEST STATE: the chip is how the user sees
 * a filter acting on the data). Per-chip dismiss removes that tuple;
 * "Clear filters" drops them all.
 */
import { Button, Chip, XStack } from '@repo/ui';
import { filterTupleLabel, filterableFieldsFromMeta } from '@repo/frappe-ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

export interface FilterChipsProps {
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
}

export function FilterChips({ meta, filters, onFiltersChange }: FilterChipsProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const fields = useMemo(() => filterableFieldsFromMeta(meta), [meta]);
  if (!filters.length) {
    return null;
  }
  return (
    <XStack
      gap="$2"
      flexWrap="wrap"
      alignItems="center">
      {filters.map((tuple, index) => (
        <Chip
          key={`${tuple[0]}-${tuple[1]}-${index}`}
          color="blue"
          onDismiss={() => {
            onFiltersChange(filters.filter((_, i) => i !== index));
          }}>
          {filterTupleLabel(fields, tuple)}
        </Chip>
      ))}
      {filters.length > 1 && (
        <Button
          size="$2"
          chromeless
          onPress={() => {
            onFiltersChange([]);
          }}>
          {t('list.clearFilters', 'Clear filters')}
        </Button>
      )}
    </XStack>
  );
}

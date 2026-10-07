/**
 * Saved filters — desk parity via the `List Filter` doctype
 * (frappe.client.get_list / insert / delete — the same records desk's
 * sidebar "Saved Filters" reads), bridged into the table package's
 * storage-agnostic primitives: useSavedFilters (state), SavedFilterDropdown
 * (picker) and FilterManager (save dialog with name + global toggle).
 * Fixture mode (stories / no bench) runs in-memory.
 */
import { XStack, YStack } from '@repo/ui';
// Catalog Button: the inline save affordance disables while there is nothing
// to save — the catalog `disabledReason` explains it (DG-ST-03) instead of a
// bare dangle.
import { Button, Input } from '@repo/forms';
import { useFrappeConfig } from '@repo/frappe-ui';
import { FilterManager, SavedFilterDropdown, useSavedFilters } from '@repo/table';
import type { ParsedFilter, SavedFilter, SavedFiltersStorage } from '@repo/table';
import { sizeRecipeEscape } from '@repo/theme';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { FrappeFilters } from '../shared/types';
import { useFrappeApp } from '../shared/useFrappeApp';
import { useSessionUserId as useSessionUser } from '../shared/useSessionUserId';

export interface SavedFiltersControlProps {
  doctype: string;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  /**
   * Sheet-safe presentation for the compact list-tools sheet: the save
   * affordance renders as an inline name + button row instead of the
   * FilterManager dialog (tamagui dialogs portal behind the RN-Modal sheet
   * on native).
   */
  inline?: boolean;
  /** Fired after a filter set was saved (host hook — analytics, toasts). */
  onFilterSaved?: (saved: { name: string; isGlobal: boolean; filters: FrappeFilters }) => void;
}

/**
 * SavedFiltersStorage adapter over the `List Filter` doctype. Undefined in
 * fixture mode / before the app is ready — useSavedFilters then keeps
 * filters in memory only.
 */
function useListFilterStorage(doctype: string): SavedFiltersStorage | undefined {
  const config = useFrappeConfig();
  const app = useFrappeApp();
  const fixtureMode = Boolean(config?.fixtures);
  return useMemo(() => {
    if (!app || fixtureMode) {
      return;
    }
    const storage: SavedFiltersStorage = {
      load: async () => {
        const res = await app.call().get<{ message?: SavedFilter[] }>('frappe.client.get_list', {
          doctype: 'List Filter',
          filters: JSON.stringify([['reference_doctype', '=', doctype]]),
          fields: JSON.stringify(['name', 'filter_name', 'for_user', 'filters']),
          limit_page_length: 0,
        });
        return res.payload?.message ?? [];
      },
      save: async (filter) => {
        await app.call().post('frappe.client.insert', {
          doc: {
            doctype: 'List Filter',
            reference_doctype: doctype,
            filter_name: filter.filter_name ?? '',
            for_user: filter.for_user ?? '',
            filters: filter.filters ?? '[]',
          },
        });
      },
      remove: async (name) => {
        await app.call().post('frappe.client.delete', { doctype: 'List Filter', name });
      },
    };
    return storage;
  }, [app, fixtureMode, doctype]);
}

export function SavedFiltersControl({
  doctype,
  filters,
  onFiltersChange,
  inline,
  onFilterSaved,
}: SavedFiltersControlProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const storage = useListFilterStorage(doctype);
  const user = useSessionUser();
  const { filters: savedFilters, saveFilter, deleteFilter } = useSavedFilters({ storage, userId: user });
  const [selected, setSelected] = useState<ParsedFilter | null>(null);
  const [draftName, setDraftName] = useState('');

  const dropdown = (
    <SavedFilterDropdown
      filters={savedFilters}
      selectedFilter={selected}
      onSelectFilter={(filter) => {
        setSelected(filter);
        if (filter) {
          onFiltersChange(filter.filters as FrappeFilters);
        }
      }}
      onDeleteFilter={(name) => void deleteFilter(name)}
      placeholder={t('list.filters.savedFilters', 'Saved Filters')}
    />
  );

  if (inline) {
    const handleInlineSave = () => {
      const name = draftName.trim();
      if (!name || filters.length === 0) {
        return;
      }
      void Promise.resolve(saveFilter(name, filters, false)).then(() => {
        setDraftName('');
        onFilterSaved?.({ name, isGlobal: false, filters });
      });
    };
    return (
      <YStack gap="$2">
        {/* Column wrappers stretch the fields to full width on native (a
            row wrapper leaves them at intrinsic width — sliver bug). */}
        {savedFilters.length > 0 ? <YStack width="100%">{dropdown}</YStack> : null}
        <XStack
          gap="$2"
          alignItems="center">
          <YStack
            flex={1}
            minWidth={0}>
            <Input
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('list.filters.filterName', 'Filter name')}
              size="$3"
              compact
              aria-label={t('list.filters.filterName', 'Filter name')}
            />
          </YStack>
          <Button
            size="$3"
            disabled={filters.length === 0 || !draftName.trim()}
            disabledReason={
              filters.length === 0
                ? t('list.filters.saveNeedsFilters', 'Apply filters to save them')
                : draftName.trim()
                  ? undefined
                  : t('list.filters.saveNeedsName', 'Name the filter to save it')
            }
            onPress={handleInlineSave}>
            {t('list.filters.saveFilter', 'Save Filter')}
          </Button>
        </XStack>
      </YStack>
    );
  }

  if (savedFilters.length === 0 && filters.length === 0) {
    return null;
  }

  return (
    <XStack
      gap="$2"
      alignItems="center">
      {savedFilters.length > 0 ? (
        <XStack maxWidth={sizeRecipeEscape(220, 'saved-filter picker: caps the trigger beside the filter chips')}>
          {dropdown}
        </XStack>
      ) : null}
      {filters.length > 0 ? (
        <FilterManager
          currentFilters={filters}
          canCreateGlobal
          onSaveFilter={async (filterName, isGlobal) => {
            const result = saveFilter(filterName, filters, isGlobal);
            void Promise.resolve(result).then(() => {
              onFilterSaved?.({ name: filterName, isGlobal, filters });
            });
            return await result;
          }}
        />
      ) : null}
    </XStack>
  );
}

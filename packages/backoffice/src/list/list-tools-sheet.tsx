/**
 * Compact list tools — the single "Filter" affordance the list header shows
 * on compact viewports (< 640, `useLayoutSizeClass() === "compact"`).
 * Collapses the whole ListFilterBar surface (quick standard filters, the
 * tuple filter editor, saved filters, sort) behind one badge-counted button
 * opening a catalog SheetModal (LC-06: sheet on native and narrow web).
 *
 * Sheet content is INLINE and sheet-safe by construction: forms
 * Select/Input/Checkbox and the shared FilterEditorPanel only — no nested
 * tamagui Popover/Dialog triggers, which portal behind the RN-Modal sheet on
 * native (SortControl/SavedFiltersControl grow inline variants for this).
 */
import { Button, SheetModal, SizableText, YStack, isWeb } from '@repo/ui';
import { standardFiltersFromMeta } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { FunnelIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

import { FilterEditorPanel } from './filter-editor';
import { SavedFiltersControl } from './filter-saved';
import { SortControl } from './filter-sort';
import { StandardFilters } from './filter-standard';

export interface ListToolsButtonProps {
  doctype: string;
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <SizableText
      size="$1"
      fontWeight="400"
      color="$color10"
      textTransform="uppercase">
      {children}
    </SizableText>
  );
}

export function ListToolsButton({
  doctype,
  meta,
  filters,
  onFiltersChange,
  sortField,
  sortOrder,
  onSortChange,
}: ListToolsButtonProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = Number(knobProps.controlIcon?.width) || 16;
  const [open, setOpen] = useState(false);
  // Bumped per open so per-open drafts (filter editor rows) reseed.
  const [openGen, setOpenGen] = useState(0);
  const quickFields = useMemo(() => standardFiltersFromMeta(meta), [meta]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpenGen((generation) => generation + 1);
    }
    setOpen(nextOpen);
  };

  // SheetModal leaves Escape dismissal to the consumer (LC-21 dismissal
  // intent) — web-only document listener, BackofficeShell drawer precedent.
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined' || !open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button
        size={knobProps.sizeToken}
        icon={
          <FunnelIcon
            size={iconSize}
            weight={filters.length > 0 ? 'fill' : 'regular'}
          />
        }
        onPress={() => {
          handleOpenChange(true);
        }}
        aria-label={t('list.filters.filter', 'Filter')}>
        {filters.length > 0
          ? t('list.filters.filterCount', 'Filter ({{count}})', {
              count: filters.length,
            })
          : t('list.filters.filter', 'Filter')}
      </Button>
      <SheetModal
        open={open}
        onOpenChange={handleOpenChange}
        snapPoint={85}
        scrollable
        header={
          <SizableText
            {...knobProps.heading}
            size="$6">
            {t('list.tools.title', 'Filter & sort')}
          </SizableText>
        }>
        <YStack
          key={openGen}
          gap="$4"
          paddingBottom="$4">
          {onSortChange ? (
            <YStack gap="$2">
              <SectionLabel>{t('list.sortBy', 'Sort')}</SectionLabel>
              <SortControl
                inline
                meta={meta}
                sortField={sortField}
                sortOrder={sortOrder}
                onSortChange={onSortChange}
              />
            </YStack>
          ) : null}
          {quickFields.length > 0 ? (
            <YStack gap="$2">
              <SectionLabel>{t('list.tools.quickFilters', 'Quick filters')}</SectionLabel>
              <StandardFilters
                vertical
                meta={meta}
                filters={filters}
                onFiltersChange={onFiltersChange}
              />
            </YStack>
          ) : null}
          <YStack gap="$2">
            <SectionLabel>{t('list.filters.filters', 'Filters')}</SectionLabel>
            {/* Reseed the draft rows whenever the APPLIED filters change
                outside the panel (quick filter / saved filter / sort commits
                are live while the sheet stays open) — a stale draft Apply
                would silently drop those commits. */}
            <FilterEditorPanel
              key={`${openGen}|${JSON.stringify(filters)}`}
              meta={meta}
              filters={filters}
              onFiltersChange={onFiltersChange}
              onDone={() => {
                setOpen(false);
              }}
              scrollRows={false}
            />
          </YStack>
          <YStack gap="$2">
            <SectionLabel>{t('list.filters.savedFilters', 'Saved Filters')}</SectionLabel>
            <SavedFiltersControl
              inline
              doctype={doctype}
              filters={filters}
              onFiltersChange={onFiltersChange}
            />
          </YStack>
        </YStack>
      </SheetModal>
    </>
  );
}

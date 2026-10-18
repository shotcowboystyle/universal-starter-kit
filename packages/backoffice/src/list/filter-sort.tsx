import { CaretDownIcon, SortAscendingIcon, SortDescendingIcon } from '@phosphor-icons/react';
// House Button: the raw tamagui Button (components re-export) never gets the
// house 44px press floor (LC-54 origin failure mode) — sort chrome takes the
// forms Button so the floor and the icon slot (LC-53) apply.
import { Button, Select } from '@repo/forms';
/**
 * Sort control — desk's sort selector: a dropdown of sortable fields
 * (standard doc fields + the doctype's value-type fields) and an asc/desc
 * toggle. Uncontrolled default comes from meta.sort_field / sort_order
 * ("modified DESC" when absent — desk's default).
 */
import { DropdownMenu, XStack, YStack } from '@repo/ui';
import type { DropdownMenuEntry } from '@repo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { overlayListMaxHeight } from '../shared/measures';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

export interface SortControlProps {
  meta?: DoctypeMeta;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  /**
   * Sheet-safe presentation for the compact list-tools sheet: a full-width
   * forms Select + order toggle instead of the DropdownMenu (tamagui
   * popovers portal behind the RN-Modal sheet on native).
   */
  inline?: boolean;
}

/** Value-type fieldtypes that sort meaningfully server-side. */
const SORTABLE_FIELDTYPES = new Set([
  'Data',
  'Select',
  'Link',
  'Date',
  'Datetime',
  'Time',
  'Int',
  'Float',
  'Currency',
  'Percent',
  'Check',
  'Duration',
  'Rating',
  'Small Text',
]);

interface SortOption {
  fieldname: string;
  label: string;
}

const isSingleValue = (next: string | string[]): next is string => typeof next === 'string';

/** Standard sortable doc fields + the doctype's sortable value fields. */
export const sortableFieldsFromMeta = (meta?: DoctypeMeta): SortOption[] => {
  const out: SortOption[] = [
    { fieldname: 'modified', label: 'Last Updated On' },
    { fieldname: 'creation', label: 'Created On' },
    { fieldname: 'name', label: 'ID' },
  ];
  const seen = new Set(out.map((option) => option.fieldname));
  for (const field of meta?.fields ?? []) {
    const sortable =
      Boolean(field.fieldname) &&
      !seen.has(field.fieldname) &&
      field.hidden !== 1 &&
      SORTABLE_FIELDTYPES.has(field.fieldtype);
    if (!sortable) {
      continue;
    }
    seen.add(field.fieldname);
    out.push({ fieldname: field.fieldname, label: field.label ?? field.fieldname });
  }
  return out;
};

/** First fieldname of meta.sort_field ("modified desc" / "a, b desc" forms). */
const metaDefaultSortField = (meta?: DoctypeMeta): string => {
  const raw = (meta?.sort_field ?? 'modified').split(',')[0]?.trim() ?? 'modified';
  return raw.split(' ')[0] || 'modified';
};

type Translate = (key: string, fallback: string) => string;

/**
 * Display label for ANY sort fieldname — the same label channel the list
 * columns ride (meta DocField labels), extended with the standard doc
 * fields and desk's `_` facet columns (`_liked_by` arrives via heart-column
 * header sorts and deep links). User-visible controls NEVER echo a raw
 * fieldname (no-raw-fieldname rule candidate, parity audit pair 04/16):
 * unknown fieldnames degrade to a title-cased form, not the identifier.
 */
export const sortFieldLabel = (meta: DoctypeMeta | undefined, fieldname: string, t: Translate): string => {
  const standardLabels = new Map<string, string>([
    ['modified', t('list.lastUpdated', 'Last Updated On')],
    ['creation', t('list.createdOn', 'Created On')],
    ['name', t('list.idColumn', 'ID')],
    ['owner', t('list.createdBy', 'Created By')],
    ['modified_by', t('list.lastUpdatedBy', 'Last Updated By')],
    ['_liked_by', t('list.likedBy', 'Liked By')],
    ['_assign', t('list.assignedTo', 'Assigned To')],
    ['_user_tags', t('list.tags', 'Tags')],
    ['_comments', t('list.comments', 'Comments')],
  ]);
  const standard = standardLabels.get(fieldname);
  if (standard !== undefined && standard !== '') {
    return standard;
  }
  const metaLabel = meta?.fields?.find((field) => field.fieldname === fieldname)?.label;
  if (metaLabel !== undefined && metaLabel !== '') {
    return metaLabel;
  }
  const pretty = fieldname
    .replace(/^_+/u, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return pretty || fieldname;
};

const metaDefaultSortOrder = (meta?: DoctypeMeta): 'asc' | 'desc' =>
  (meta?.sort_order ?? 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc';

export const SortControl = ({ meta, sortField, sortOrder, onSortChange, inline }: SortControlProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  // One label channel for every fieldname the control can display
  // (sortFieldLabel: t()-standard fields → meta labels → title-case).
  const options = useMemo(
    () =>
      sortableFieldsFromMeta(meta).map((option) => ({
        ...option,
        label: sortFieldLabel(meta, option.fieldname, t),
      })),
    [meta, t],
  );
  const field = sortField ?? metaDefaultSortField(meta);
  const order = sortOrder ?? metaDefaultSortOrder(meta);
  if (!onSortChange) {
    return null;
  }

  const orderLabel = order === 'asc' ? t('list.sort.ascending', 'Ascending') : t('list.sort.descending', 'Descending');

  // The active field can sit outside the sortable option set (heart-column
  // header sort → `_liked_by`, or a `?sort=` deep link) — surface it as a
  // labeled entry instead of leaking the fieldname (or dropping the value).
  const currentInOptions = options.some((option) => option.fieldname === field);
  const displayOptions = currentInOptions
    ? options
    : [{ fieldname: field, label: sortFieldLabel(meta, field, t) }, ...options];

  if (inline) {
    return (
      <XStack
        gap="$2"
        alignItems="center">
        {/* Column wrapper: the field only stretches to the row's flexed
            slot through a column cross-axis on native. */}
        <YStack
          flex={1}
          minWidth={0}>
          <Select
            value={field}
            onChange={(next) => {
              if (isSingleValue(next) && next) {
                onSortChange(next, order);
              }
            }}
            options={displayOptions.map((option) => ({
              value: option.fieldname,
              label: option.label,
            }))}
            size="$3"
            compact
            aria-label={t('list.sortBy', 'Sort')}
          />
        </YStack>
        <Button
          size="$3"
          circular
          chromeless
          icon={order === 'asc' ? SortAscendingIcon : SortDescendingIcon}
          onPress={() => {
            onSortChange(field, order === 'asc' ? 'desc' : 'asc');
          }}
          aria-label={t('list.sort.toggleOrder', 'Toggle sort order ({{order}})', {
            order: orderLabel,
          })}
        />
      </XStack>
    );
  }

  // Single-select radio-style menu: the checked entry marks the active sort
  // field, picking one applies it (onSelect) and the menu-level
  // closeOnSelect commits-and-closes (LC-21 COMMIT).
  const items: DropdownMenuEntry[] = displayOptions.map((option) => ({
    key: option.fieldname,
    label: option.label,
    checked: option.fieldname === field,
    onSelect: () => {
      onSortChange(option.fieldname, order);
    },
  }));

  return (
    <XStack
      gap="$1"
      alignItems="center">
      <DropdownMenu
        items={items}
        closeOnSelect
        placement="bottom-end"
        maxHeight={overlayListMaxHeight}>
        <Button
          size="$3"
          chromeless
          iconAfter={CaretDownIcon}
          aria-label={t('list.sortBy', 'Sort')}>
          {/* Label channel, never the raw fieldname (parity audit pair 04). */}
          {sortFieldLabel(meta, field, t)}
        </Button>
      </DropdownMenu>
      <Button
        size="$3"
        circular
        chromeless
        icon={order === 'asc' ? SortAscendingIcon : SortDescendingIcon}
        onPress={() => {
          onSortChange(field, order === 'asc' ? 'desc' : 'asc');
        }}
        aria-label={t('list.sort.toggleOrder', 'Toggle sort order ({{order}})', {
          order: orderLabel,
        })}
      />
    </XStack>
  );
};

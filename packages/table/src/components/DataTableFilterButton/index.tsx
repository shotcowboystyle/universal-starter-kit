/**
 * DataTableFilterButton — toolbar "Filter" affordance for filtering on ANY
 * field, including hidden / non-column fields (the anti-Frappe-desk surface).
 *
 * Opens a FloatingPanel (anchored popover on desktop, sheet below 640 / native —
 * LC-06) with two stages:
 *   1. a SEARCHABLE field list, visible columns grouped first, then
 *      "More fields" (hidden/non-column) — scales to 50+ doctype fields
 *   2. the SAME operator/value editor the column funnel uses (LC-16)
 *
 * Commit is LIVE (LC-21, no Apply button): picking field + operator + value
 * applies immediately; outside click / Escape just closes. Chip presses
 * reopen this editor pre-filled via the context filterUi channel.
 */

import { useDirection } from '@repo/ui';
import { Button, FloatingPanel, SearchInput } from '@repo/forms';
import { keyboardFocusRingProps, useResolvedKnobs, wasKeyboardFocus } from '@repo/theme';
import { CaretLeftIcon, CaretRightIcon, FunnelIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { FilterOperator, FilterValue, ResolvedFilterField } from '../../types';
import { defaultOperatorForFilterType, isFilterValueShape, operatorNeedsNoValue } from '../../utils/filterFields';
import type { FilterEditTarget } from '../DataTable/DataTableStateContext';
import { useDataTableState } from '../DataTable/DataTableStateContext';
import { FilterOperatorValueEditor } from '../FilterOperatorValueEditor';

interface FieldRowProps {
  field: ResolvedFilterField;
  highlighted: boolean;
  /** LC-71: inset ring on the active option only while the listbox has keyboard focus. */
  keyboardHighlight: boolean;
  onSelect: (field: ResolvedFilterField) => void;
}

function FieldRow({ field, highlighted, keyboardHighlight, onSelect }: FieldRowProps) {
  const { knobProps } = useResolvedKnobs();
  return (
    <View
      role="option"
      id={`filter-field-${field.id}`}
      aria-selected={highlighted}
      // LC-49 / LC-71: the listbox is the tab stop; options are not.
      tabIndex={-1}
      cursor="pointer"
      paddingHorizontal="$2.5"
      paddingVertical="$2"
      // LC-55 FRAGMENT-LICENSE (D-03, G-08 arm): a hoverable option row is
      // wayfinding, not chrome-earning — the full borderRadius fragment
      // carries borderWidth and drew a permanent ring under the hover fill.
      {...knobProps.containerRadius}
      backgroundColor={highlighted ? '$color4' : 'transparent'}
      hoverStyle={{ backgroundColor: '$color4' }}
      pressStyle={{ backgroundColor: '$color5' }}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      {...(keyboardHighlight ? keyboardFocusRingProps : null)}
      onPress={() => {
        onSelect(field);
      }}>
      <Text
        fontSize="$3"
        color="$color12"
        numberOfLines={1}>
        {field.label}
      </Text>
    </View>
  );
}

function GroupHeader({ children }: { children: string }) {
  return (
    <Text
      fontSize="$1"
      fontWeight="600"
      color="$color10"
      textTransform="uppercase"
      letterSpacing={0.5}
      paddingHorizontal="$2.5"
      paddingTop="$2"
      paddingBottom="$1">
      {children}
    </Text>
  );
}

export function DataTableFilterButton() {
  return <FilterButton />;
}

export function DataTableCardFilterButton() {
  return <FilterButton contentTrigger />;
}

function FilterButton({ contentTrigger = false }: { contentTrigger?: boolean }) {
  const ctx = useDataTableState();
  const { knobProps } = useResolvedKnobs();
  // "Back to field list" points toward the panel's start edge — directional,
  // so the caret pair swaps under RTL (useDirection glyph-swap pattern).
  const BackCaretIcon = useDirection() === 'rtl' ? CaretRightIcon : CaretLeftIcon;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [listboxFocused, setListboxFocused] = useState(false);
  const [activeField, setActiveField] = useState<ResolvedFilterField | null>(null);
  const [operator, setOperator] = useState<FilterOperator>('contains');
  const [value, setValue] = useState('');
  // Existing filter being edited: column funnel target or advanced filter id.
  const [columnTarget, setColumnTarget] = useState<string | null>(null);
  const advancedIdRef = useRef<string | null>(null);
  const [editingExisting, setEditingExisting] = useState(false);

  const fields: ResolvedFilterField[] = ctx?.computed?.filterFields ?? [];
  const table = ctx?.table;

  const visibleColumnIds = useMemo(() => {
    if (!table) {
      return new Set<string>();
    }
    return new Set(table.getVisibleLeafColumns().map((c: any) => c.id as string));
  }, [table, open]);

  const query = search.trim().toLowerCase();
  const matching = useMemo(
    () =>
      query
        ? fields.filter((f) => f.label.toLowerCase().includes(query) || f.id.toLowerCase().includes(query))
        : fields,
    [fields, query],
  );
  const columnFields = useMemo(() => matching.filter((f) => visibleColumnIds.has(f.id)), [matching, visibleColumnIds]);
  const moreFields = useMemo(() => matching.filter((f) => !visibleColumnIds.has(f.id)), [matching, visibleColumnIds]);
  const flatList = useMemo(() => [...columnFields, ...moreFields], [columnFields, moreFields]);

  const resetEditor = useCallback(() => {
    setActiveField(null);
    setColumnTarget(null);
    setEditingExisting(false);
    advancedIdRef.current = null;
    setSearch('');
    setHighlightedIndex(0);
  }, []);

  // LIVE commit (LC-21): every operator/value change applies immediately.
  const commit = useCallback(
    (field: ResolvedFilterField, op: FilterOperator, val: string) => {
      if (!ctx) {
        return;
      }
      const noValue = operatorNeedsNoValue(op);
      const filterValue: FilterValue = { operator: op, value: noValue ? null : val };
      if (columnTarget) {
        table?.getColumn(columnTarget)?.setFilterValue(filterValue);
        return;
      }
      const meaningful = noValue || val !== '';
      if (advancedIdRef.current) {
        ctx.actions.updateFilter?.(advancedIdRef.current, {
          columnId: field.id,
          value: filterValue,
          label: field.label,
        });
      } else if (meaningful) {
        advancedIdRef.current =
          ctx.actions.addFilter({
            columnId: field.id,
            value: filterValue,
            label: field.label,
          }) ?? null;
      }
    },
    [ctx, columnTarget, table],
  );

  const handleSelectField = useCallback((field: ResolvedFilterField) => {
    setActiveField(field);
    setOperator(defaultOperatorForFilterType(field.type));
    setValue('');
    setEditingExisting(false);
    advancedIdRef.current = null;
    setColumnTarget(null);
  }, []);

  const handleOperatorChange = useCallback(
    (op: FilterOperator) => {
      setOperator(op);
      if (activeField) {
        commit(activeField, op, value);
      }
    },
    [activeField, commit, value],
  );

  const handleValueChange = useCallback(
    (val: string) => {
      setValue(val);
      if (activeField) {
        commit(activeField, operator, val);
      }
    },
    [activeField, commit, operator],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        return;
      }
      // Closing: drop a committed filter whose value ended up empty — an
      // empty-valued filter matches everything and would leave a junk chip.
      const id = advancedIdRef.current;
      if (id && !operatorNeedsNoValue(operator) && value === '') {
        ctx?.actions.removeFilter(id);
      }
      resetEditor();
    },
    [ctx, operator, value, resetEditor],
  );

  // LC-21 (owner adjudication 2026-08-12): removing the filter edits filter
  // state, it is not dismissal intent — the panel returns to the field list
  // (stage 1) so the user can compose the next filter; outside click / Escape
  // close.
  const handleRemoveCurrent = useCallback(() => {
    if (columnTarget) {
      table?.getColumn(columnTarget)?.setFilterValue(undefined);
    } else if (advancedIdRef.current) {
      ctx?.actions.removeFilter(advancedIdRef.current);
    }
    advancedIdRef.current = null;
    resetEditor();
  }, [ctx, columnTarget, table, resetEditor]);

  // Chip press → reopen the editor pre-filled (filterUi channel).
  const editTarget = ctx?.filterUi?.editTarget ?? null;
  useEffect(() => {
    if (!editTarget || !ctx) {
      return;
    }
    ctx.filterUi?.requestEdit(null); // consume the request
    const openWith = (field: ResolvedFilterField, filterValue: FilterValue, target: FilterEditTarget) => {
      setActiveField(field);
      setOperator(filterValue.operator);
      setValue(String(filterValue.value ?? ''));
      setEditingExisting(true);
      setColumnTarget(target.kind === 'column' ? target.columnId : null);
      advancedIdRef.current = target.kind === 'advanced' ? target.filterId : null;
      setOpen(true);
    };
    if (editTarget.kind === 'advanced') {
      const filter = ctx.state.filters.find((f) => f.id === editTarget.filterId);
      const field = filter && fields.find((f) => f.id === filter.columnId);
      if (filter && field) {
        openWith(field, filter.value, editTarget);
      }
    } else if (editTarget.kind === 'column') {
      const columnFilter = ctx.state.columnFilters.find((cf) => cf.id === editTarget.columnId);
      const field = fields.find((f) => f.id === editTarget.columnId);
      if (field && columnFilter && isFilterValueShape(columnFilter.value)) {
        openWith(field, columnFilter.value, editTarget);
      }
    } else {
      resetEditor();
      setOpen(true);
    }
  }, [editTarget, ctx, fields, resetEditor]);

  // Keyboard navigation over the field list (web).
  const handleListKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const field = flatList[highlightedIndex];
        if (field) {
          handleSelectField(field);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleOpenChange(false);
      }
    },
    [flatList, highlightedIndex, handleSelectField, handleOpenChange],
  );

  if (!ctx || fields.length === 0) {
    return null;
  }

  const activeChipCount =
    (ctx.state.filters?.length ?? 0) +
    (ctx.state.columnFilters?.filter((cf) => isFilterValueShape(cf.value)).length ?? 0);

  // FloatingPanel owns the trigger press in every mode. This Button used to
  // toggle `open` itself in sheet mode, because the deepest pressable swallows
  // the click before the sheet's wrapper View sees it — that swallow is fixed
  // at the source now (FloatingPanel opens on the capture phase), so a second
  // opener here would only be a place for the two to disagree.
  const highlightedId = flatList[highlightedIndex]?.id;
  const keyboardHighlight = listboxFocused && wasKeyboardFocus() ? highlightedId : undefined;

  const trigger = (
    <Button
      size="$3"
      compact
      {...(activeChipCount > 0 ? { accent: true } : { variant: 'outlined' as const })}
      aria-label={t('Filter')}
      icon={
        <FunnelIcon
          size={14}
          weight={activeChipCount > 0 ? 'fill' : 'regular'}
        />
      }>
      {activeChipCount > 0 ? `${t('Filter')} (${activeChipCount})` : t('Filter')}
    </Button>
  );

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      {...(contentTrigger ? { triggerSizing: 'content' as const } : {})}
      fitContent
      scrollable={false}>
      <YStack
        minWidth={280}
        maxWidth={360}
        {...knobProps.gap}>
        {activeField ? (
          // Stage 2 — operator/value editor (live commit, no Apply)
          <YStack {...knobProps.gap}>
            <XStack
              alignItems="center"
              gap="$2">
              <Button
                size="$2"
                chromeless
                aria-label={t('Back to field list')}
                onPress={() => {
                  resetEditor();
                }}
                icon={<BackCaretIcon size={14} />}
              />
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$color11"
                flex={1}>
                {t('Filter: {{column}}', { column: activeField.label })}
              </Text>
            </XStack>

            <FilterOperatorValueEditor
              fieldType={activeField.type}
              operator={operator}
              value={value}
              onOperatorChange={handleOperatorChange}
              onValueChange={handleValueChange}
              options={activeField.options}
            />

            {editingExisting && (
              <XStack justifyContent="flex-end">
                <Button
                  size="$2"
                  onPress={handleRemoveCurrent}>
                  {t('Remove filter')}
                </Button>
              </XStack>
            )}
          </YStack>
        ) : (
          // Stage 1 — searchable field list, visible columns first
          <YStack
            {...knobProps.gap}
            onKeyDown={handleListKeyDown as unknown as () => void}>
            <SearchInput
              value={search}
              onChange={(text) => {
                setSearch(text);
                setHighlightedIndex(0);
              }}
              debounceMs={0}
              placeholder={t('Search fields...')}
              size="$3"
              compact
              aria-label={t('Search fields')}
            />
            <YStack
              // role="listbox" is a valid ARIA role but outside RN's `Role`
              // union; this web-only bag forwards it to the DOM node (house
              // Record cast).
              {...({ role: 'listbox' } as Record<string, unknown>)}
              aria-label={t('Filterable fields')}
              aria-activedescendant={highlightedId ? `filter-field-${highlightedId}` : undefined}
              tabIndex={0}
              maxHeight={320}
              overflow="scroll"
              outlineWidth={0}
              focusStyle={{ outlineWidth: 0 }}
              onFocus={() => {
                setListboxFocused(true);
              }}
              onBlur={() => {
                setListboxFocused(false);
              }}>
              {columnFields.length > 0 && (
                <YStack
                  role="group"
                  aria-label={t('Columns')}>
                  <GroupHeader>{t('Columns')}</GroupHeader>
                  {columnFields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      highlighted={highlightedId === field.id}
                      keyboardHighlight={keyboardHighlight === field.id}
                      onSelect={handleSelectField}
                    />
                  ))}
                </YStack>
              )}
              {moreFields.length > 0 && (
                <YStack
                  role="group"
                  aria-label={t('More fields')}>
                  <GroupHeader>{t('More fields')}</GroupHeader>
                  {moreFields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      highlighted={highlightedId === field.id}
                      keyboardHighlight={keyboardHighlight === field.id}
                      onSelect={handleSelectField}
                    />
                  ))}
                </YStack>
              )}
              {flatList.length === 0 && (
                <Text
                  fontSize="$2"
                  color="$color10"
                  padding="$2.5">
                  {t('No fields match')}
                </Text>
              )}
            </YStack>
          </YStack>
        )}
      </YStack>
    </FloatingPanel>
  );
}

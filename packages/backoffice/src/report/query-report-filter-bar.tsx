// Query-report filter bar — declared filters as a sticky compact widget
// band (Metabase dashboard filters, Looker Studio controls, Frappe Desk
// page-form, Linear insights chips), not a bolted-on admin-table row.
//
// Placement: sticky under the report header so the grid scrolls beneath
// it. Every declared filter stays visible even when empty (empty-filter
// honesty); required empties keep the run gated upstream.
//
// Commit: select / link / date / check apply on change (Desk
// `trigger_refresh` + Metabase auto-apply). Text/number wait for Enter,
// blur, or Apply so typing does not thrash `query_report.run`. Applied
// values round-trip through `?filters=` (the screen owns the URL write).
//
// Keyboard (LC-49 / LC-50 / LC-71): each filter is one tab stop (the house
// field). Text-filter × lives INSIDE the Input.Box so the ring wraps the
// whole control (never a sibling that splits the boundary) and is mouse/
// touch only (`tabIndex={-1}`). Select clears via an All option (Desk
// empty-select). Apply and Clear-all are their own stops. Disabled /
// read_only filters pass `disabled` through so pickers open nothing.
import { XIcon } from '@phosphor-icons/react';
import { Button, Checkbox, Input, Select, zIndex } from '@repo/forms';
import {
  compactQueryReportFilters,
  Date as DateField,
  fieldKind,
  fieldLabelFor,
  isEmptyFilterValue,
  Link as LinkField,
  selectOptionsFromField,
} from '@repo/frappe-ui';
import type { QueryReportFilterMeta, QueryReportFilters } from '@repo/frappe-ui';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { View, XStack, YStack, isWeb } from '@repo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

export const queryReportFilterLabel = (filter: QueryReportFilterMeta): string =>
  filter.label ?? fieldLabelFor([], filter.fieldname);

/** Discrete kinds commit the run as soon as the value lands (Desk/Metabase). */
export const queryReportFilterAppliesOnChange = (filter: QueryReportFilterMeta): boolean => {
  const kind = fieldKind(filter.fieldtype ?? 'Data');
  return kind === 'select' || kind === 'link' || kind === 'date' || kind === 'check';
};

/** Desk empty-select / FrappeReportView "All": optional Select clears without a sibling ×. */
export const queryReportSelectOptions = (
  options: string | undefined,
  allLabel: string,
): { label: string; value: string }[] => {
  const choices = selectOptionsFromField(options);
  if (choices.some((choice) => choice.value === '')) {
    return choices;
  }
  return [{ label: allLabel, value: '' }, ...choices];
};

const draftFromFilters = (
  filterMeta: readonly QueryReportFilterMeta[],
  filters: QueryReportFilters,
): QueryReportFilters => {
  const draft: QueryReportFilters = {};
  for (const filter of filterMeta) {
    // Applied state only — defaults are seeded into it by the hook, so a
    // deliberately cleared control stays visibly empty (gate consistency).
    const value = filters[filter.fieldname];
    draft[filter.fieldname] = value ?? '';
  }
  return draft;
};

/** Filter value a control emits: text/select/link/date strings, check 1 | ''. */
type FilterControlValue = string | number;

const dateInputType = (fieldtype: string) => {
  if (fieldtype === 'Datetime') {
    return 'datetime';
  }
  if (fieldtype === 'Time') {
    return 'time';
  }
  return 'date';
};

const ReportFilterControl = ({
  filter,
  value,
  onValueChange,
  onCommit,
  disabled,
}: {
  filter: QueryReportFilterMeta;
  value: unknown;
  onValueChange: (value: FilterControlValue) => void;
  onCommit: () => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const label = queryReportFilterLabel(filter);
  const required = filter.mandatory === 1;
  const fieldtype = filter.fieldtype ?? 'Data';
  const kind = fieldKind(fieldtype);
  // oxlint-disable-next-line typescript/no-base-to-string -- filter values are scalars (the `?filters=` parser and controls only produce scalars)
  const text = value === undefined || value === null ? '' : String(value);

  // Locked filters stay visible (honest value) but must not open a picker.
  // House Select/Link/Date still mount an overlay node when `disabled`; a
  // disabled Input is a value display with no popup (LC-21 family).
  if (disabled && (kind === 'select' || kind === 'link' || kind === 'date')) {
    return (
      <Input
        label={label}
        required={required}
        disabled
        value={text}
        compact
        inputProps={{ 'aria-label': label }}
      />
    );
  }

  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- text and number share the default Input
  switch (kind) {
    case 'select': {
      return (
        <Select
          label={label}
          required={required}
          value={text}
          disabled={disabled}
          onChange={(next) => {
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a single-value Select emits a string; anything else is ignored
            if (typeof next === 'string') {
              onValueChange(next);
            }
          }}
          options={queryReportSelectOptions(filter.options, t('queryReport.allValues', 'All'))}
          placeholder={t('queryReport.selectValue', 'Select...')}
          compact
        />
      );
    }
    case 'link': {
      return (
        <LinkField
          label={label}
          required={required}
          value={text}
          disabled={disabled}
          onChange={(next) => {
            onValueChange(next);
          }}
          doctype={filter.options ?? ''}
          placeholder={label}
          compact
        />
      );
    }
    case 'date': {
      return (
        <DateField
          label={label}
          required={required}
          value={text}
          disabled={disabled}
          onChange={(next: string) => {
            onValueChange(next);
          }}
          type={dateInputType(fieldtype)}
          compact
        />
      );
    }
    case 'check': {
      return (
        <Checkbox
          label={label}
          disabled={disabled}
          checked={value === 1 || value === '1' || value === true}
          onChange={(checked) => {
            onValueChange(checked === true ? 1 : '');
          }}
        />
      );
    }
    default: {
      const showClear = !disabled && !isEmptyFilterValue(value);
      const clearName = t('queryReport.clearFilter', {
        label,
        defaultValue: `Clear ${label}`,
      });
      return (
        <Input
          label={label}
          required={required}
          disabled={disabled}
          value={text}
          onChangeText={(next) => {
            onValueChange(next);
          }}
          compact
          rightIconInteractive={showClear}
          rightIcon={
            showClear ? (
              <View
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui view: `role` also sets the native accessibility role, a tag is web-only
                role="button"
                tabIndex={-1}
                padding="$1"
                cursor="pointer"
                hoverStyle={{ backgroundColor: '$color4' }}
                onPress={() => {
                  onValueChange('');
                  onCommit();
                }}
                aria-label={clearName}
                data-testid={`query-report-clear-${filter.fieldname}`}>
                <XIcon size={14} />
              </View>
            ) : undefined
          }
          inputProps={{
            onBlur: onCommit,
            onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
              if (event.key === 'Enter') {
                event.preventDefault?.();
                onCommit();
              }
            },
          }}
          {...(kind === 'number' ? { keyboardType: 'numeric' as const } : {})}
        />
      );
    }
  }
};

export interface QueryReportFilterBarProps {
  filterMeta: readonly QueryReportFilterMeta[];
  filters: QueryReportFilters;
  onApply: (next: QueryReportFilters) => void;
}

/**
 * The declared-filter band: one compact widget per filter (hidden ones
 * excluded, desk parity — their defaults still apply), a mouse-only
 * per-filter clear, Apply (flushes text drafts), and Clear-all when any
 * visible filter is set.
 */
export const QueryReportFilterBar = ({ filterMeta, filters, onApply }: QueryReportFilterBarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [draft, setDraft] = useState<QueryReportFilters>(() => draftFromFilters(filterMeta, filters));
  const draftRef = useRef(draft);
  // oxlint-disable-next-line react/refs -- latest-value ref synced during render; read only from event handlers
  draftRef.current = draft;

  useEffect(() => {
    const next = draftFromFilters(filterMeta, filters);
    draftRef.current = next;
    // oxlint-disable-next-line react/set-state-in-effect -- re-seeds the draft when the applied filters change upstream
    setDraft(next);
  }, [filterMeta, filters]);

  const applyValues = useCallback(
    (values: QueryReportFilters) => {
      onApply(compactQueryReportFilters(filterMeta, values));
    },
    [filterMeta, onApply],
  );

  const setFieldValue = useCallback(
    (fieldname: string, value: FilterControlValue, commit: boolean) => {
      const next = { ...draftRef.current, [fieldname]: value };
      draftRef.current = next;
      setDraft(next);
      if (commit) {
        applyValues(next);
      }
    },
    [applyValues],
  );

  const apply = useCallback(() => {
    applyValues(draftRef.current);
  }, [applyValues]);

  const visible = filterMeta.filter((filter) => filter.hidden !== 1);
  const hasVisibleValue = visible.some((filter) => !isEmptyFilterValue(draft[filter.fieldname]));

  const clearAll = useCallback(() => {
    const next = { ...draftRef.current };
    for (const filter of visible) {
      next[filter.fieldname] = '';
    }
    draftRef.current = next;
    setDraft(next);
    applyValues(next);
  }, [visible, applyValues]);

  return (
    <XStack
      role="toolbar"
      aria-label={t('queryReport.filters', 'Filters')}
      data-testid="query-report-filter-bar"
      flexWrap="wrap"
      alignItems="flex-end"
      overflow="visible"
      {...knobProps.gap}
      {...knobProps.panelPadding}
      paddingVertical="$2"
      backgroundColor="$color2"
      borderBottomWidth={1}
      borderColor="$borderColor"
      {...(isWeb ? { position: 'sticky' as const, top: 0, zIndex: zIndex.stickyHeader } : {})}>
      {visible.map((filter) => {
        const value = draft[filter.fieldname];
        const readOnly = filter.read_only === 1;
        return (
          <YStack
            key={filter.fieldname}
            minWidth={sizeRecipeEscape(180, 'report filter bar: each filter flexes between a readable floor and a cap')}
            maxWidth={sizeRecipeEscape(280, 'report filter bar: each filter flexes between a readable floor and a cap')}
            flex={1}
            overflow="visible"
            data-query-report-filter={filter.fieldname}>
            <ReportFilterControl
              filter={filter}
              value={value}
              disabled={readOnly}
              onValueChange={(next) => {
                setFieldValue(filter.fieldname, next, queryReportFilterAppliesOnChange(filter));
              }}
              onCommit={apply}
            />
          </YStack>
        );
      })}
      {hasVisibleValue ? (
        <Button
          size="$3"
          chromeless
          onPress={clearAll}>
          {t('queryReport.clearAllFilters', 'Clear all')}
        </Button>
      ) : null}
      <Button
        theme="accent"
        onPress={apply}>
        {t('queryReport.apply', 'Apply')}
      </Button>
    </XStack>
  );
};

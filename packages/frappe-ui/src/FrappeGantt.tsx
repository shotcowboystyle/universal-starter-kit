import type { UseFrappeCollectionConfig } from '@repo/frappe';
import { formatCalendarDate, parseCalendarDate, useChartPalette, useResolvedKnobs } from '@repo/theme';
import type { DateInput } from '@repo/theme';
import { Alert, GanttView } from '@repo/ui';
import type { GanttItemMoveRange, GanttTask, GanttZoom } from '@repo/ui';
import React, { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { resolveFrappeEventColor } from './frappe-event-color';
import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import { useFrappeConfig } from './FrappeProvider';
import { describeSyncError } from './sync-error';
import { useFrappeRows } from './use-frappe-rows';

export interface FrappeGanttProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: UseFrappeCollectionConfig['syncOptions'];
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
  /** Task start-date field (default: `exp_start_date` — Frappe Gantt settings) */
  startField?: keyof TDoc & string;
  /** Task end-date field (default: `exp_end_date`) */
  endField?: keyof TDoc & string;
  /** Task title field (default: `subject`) */
  titleField?: keyof TDoc & string;
  /** Optional doc color field (named Frappe palette refs resolve to sanctioned ramps; literals pass through) */
  colorField?: keyof TDoc & string;
  /** Initial zoom level (default: 'week') */
  zoom?: GanttZoom;
  onItemPress?: (doc: Partial<TDoc>) => void;
  /**
   * Called after a bar reschedule persists (or when no collection is
   * available) — drag-moves, keyboard arrow moves, and edge resizes all
   * arrive here. Changes are first written to the live collection via
   * `collection.update` on the start/end date fields.
   */
  onItemMove?: (docName: string, start: Date, end: Date) => void | Promise<void>;
  /** Enable rescheduling on task bars — drag, keyboard, resize (default: true) */
  enableItemDrag?: boolean;
  /** Custom loading node (default: the GanttView skeleton) */
  loading?: ReactNode;
  /** Custom error renderer (default: the GanttView error state) */
  error?: (error: Error) => ReactNode;
  height?: number;
  showToday?: boolean;
  showNavigation?: boolean;
  showZoomSwitcher?: boolean;
  firstDayOfWeek?: 0 | 1;
  initialDate?: Date;
}

/**
 * Format a moved date back into the same shape the document field used:
 * Date stays Date, "YYYY-MM-DD HH:MM:SS" keeps its time part, plain
 * "YYYY-MM-DD" stays date-only (same contract as FrappeCalendar).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the value is whatever the doctype stores in the date field; only its shape is mirrored back
const toFrappeFieldValue = (original: unknown, next: Date): Date | string => {
  if (original instanceof Date) {
    return next;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- distinguishes a "YYYY-MM-DD HH:MM:SS" string from the other shapes a date field can hold
  const carriesTime = typeof original === 'string' && original.includes(':');
  return formatCalendarDate(next, carriesTime ? 'datetime' : 'date');
};

/**
 * Thin Frappe wrapper around the generic GanttView component.
 *
 * Fetches data via `useFrappeCollection` / `useLiveQuery` (live mutations
 * re-position bars without a reload), maps Frappe documents to `GanttTask`
 * objects using the doctype's Gantt field settings
 * (`exp_start_date` / `exp_end_date` / `subject` by default), and persists
 * bar reschedules (drag-move, keyboard arrows, edge resize) back to the
 * doc's date fields via `collection.update` (optimistic, journal-backed
 * revert on failure) before notifying `onItemMove(name, start, end)`.
 */
// oxlint-disable-next-line eslint/complexity -- the count comes from prop defaults in the destructuring; the body itself is linear
export const FrappeGantt = <TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  fields,
  filters,
  // SAFETY: Frappe's default Gantt field name; a doctype without it just yields no tasks (parseCalendarDate gets undefined)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  startField = 'exp_start_date' as keyof TDoc & string,
  // SAFETY: Frappe's default Gantt field name; a doctype without it just yields no tasks (parseCalendarDate gets undefined)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  endField = 'exp_end_date' as keyof TDoc & string,
  // SAFETY: Frappe's default Gantt field name; a doctype without it just yields no tasks (parseCalendarDate gets undefined)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  titleField = 'subject' as keyof TDoc & string,
  colorField,
  zoom = 'week',
  onItemPress,
  onItemMove,
  enableItemDrag,
  loading,
  error: renderError,
  height,
  showToday = true,
  showNavigation = true,
  showZoomSwitcher = true,
  firstDayOfWeek = 0,
  initialDate,
  ...stackProps
}: FrappeGanttProps<TDoc>) => {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<Error | null>(null);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeGantt requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // Ensure required fields are fetched
  const effectiveFields = useMemo(() => {
    if (fields === undefined) {
      return fields;
    }
    const fieldSet = new Set<keyof TDoc & string>(fields);
    fieldSet.add('name');
    fieldSet.add(startField);
    fieldSet.add(endField);
    fieldSet.add(titleField);
    if (colorField !== undefined && colorField !== '') {
      fieldSet.add(colorField);
    }
    return [...fieldSet];
  }, [fields, startField, endField, titleField, colorField]);

  const connectionConfig = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      socketOptions: config?.socketOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.socketOptions,
      config?.fixtures,
    ],
  );

  // The shared doctype read (MPO-251). `mapError` keeps this chart's own
  // error copy (describeSyncError); real subscription failures still win over
  // the generic isError flag inside the hook, because they carry an
  // actionable message. `limit: null` keeps the bench's own page length.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- mapError receives whatever the sync layer threw; describeSyncError does the narrowing
  const mapSyncError = useCallback((err: unknown) => new Error(describeSyncError(err, doctype, t)), [doctype, t]);
  const {
    rows: docs,
    isQueryLoading: isLoading,
    error: queryError,
    collection,
  } = useFrappeRows<TDoc>(connectionConfig, doctype, {
    fields: effectiveFields,
    filters,
    limit: null,
    mapError: mapSyncError,
    messages: {
      permission: t('You do not have permission to view {{doctype}}', { doctype }),
      generic: t('Failed to load {{doctype}} tasks', { doctype }),
    },
  });

  // Scheme-aware palette for resolving NAMED doc colors (P-15 / LC-27):
  // Frappe's palette references ("blue", "Red") map to sanctioned solids per
  // scheme; literal hex/rgb doc values pass through untouched (Axiom 11).
  const chartPalette = useChartPalette();

  // Map Frappe documents to generic GanttTask objects. Docs without a start
  // date are skipped (nothing to position); a missing end collapses to a
  // one-day bar on the start date.
  const tasks = useMemo((): GanttTask[] => {
    // SAFETY: Gantt date fields hold Frappe date/datetime strings (or null/Date); parseCalendarDate returns null for anything else
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const dateOf = (doc: TDoc, field: keyof TDoc & string): DateInput => doc[field] as DateInput;
    const result: GanttTask[] = [];
    for (const doc of docs) {
      const start = parseCalendarDate(dateOf(doc, startField));
      if (!start) {
        continue;
      }
      const end = parseCalendarDate(dateOf(doc, endField)) ?? start;
      const title = String(doc[titleField] ?? doc.name);
      const color =
        colorField === undefined || colorField === ''
          ? undefined
          : resolveFrappeEventColor(doc[colorField], chartPalette);
      result.push({
        id: doc.name,
        title,
        start,
        end,
        color,
        // Attach original doc for callbacks
        _doc: doc,
      });
    }
    return result;
  }, [docs, startField, endField, titleField, colorField, chartPalette]);

  // Bridge onItemPress from generic GanttTask to Frappe doc
  const handleItemPress = useCallback(
    (task: GanttTask) => {
      if (onItemPress) {
        const doc = docs.find((d) => d.name === task.id);
        if (doc) {
          onItemPress(doc);
        }
      }
    },
    [onItemPress, docs],
  );

  // Persist drag moves via the live collection (FrappeCalendar pattern),
  // then notify the consumer callback with (name, start, end).
  const handleItemMove = useCallback(
    async (task: GanttTask, range: GanttItemMoveRange) => {
      setActionError(null);
      try {
        if (collection) {
          const tx = collection.update(task.id, (draft) => {
            // SAFETY: the draft is the live doc object; date fields are read and written by name
            // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- doc fields are doctype-defined
            const rec = draft as Record<string, unknown>;
            rec[startField] = toFrappeFieldValue(rec[startField], range.start);
            const endValue = rec[endField];
            if (endValue !== null && endValue !== undefined && endValue !== '') {
              rec[endField] = toFrappeFieldValue(endValue, range.end);
            }
          });
          await tx.isPersisted.promise;
        }
        await onItemMove?.(task.id, range.start, range.end);
      } catch (error) {
        setActionError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [collection, onItemMove, startField, endField],
  );

  if (isLoading && Boolean(loading)) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- returning the bare ReactNode would widen the component's return type to include Promise
    return <>{loading}</>;
  }
  if (queryError && renderError) {
    return <>{renderError(queryError)}</>;
  }

  return (
    <YStack {...knobProps.gap}>
      <FrappeConnectionIndicator config={connectionConfig} />
      {actionError ? (
        <Alert
          intent="error"
          title={t('Action failed')}>
          {actionError.message}
        </Alert>
      ) : null}
      <GanttView
        {...knobProps.containerRadius}
        tasks={tasks}
        zoom={zoom}
        isLoading={isLoading}
        error={queryError}
        emptyTitle={t('No {{doctype}} tasks', { doctype })}
        onItemPress={handleItemPress}
        // oxlint-disable-next-line typescript/no-misused-promises, typescript/strict-void-return -- awaitable handler, never rejects (errors land in actionError)
        onItemMove={handleItemMove}
        enableItemDrag={enableItemDrag}
        height={height}
        showToday={showToday}
        showNavigation={showNavigation}
        showZoomSwitcher={showZoomSwitcher}
        firstDayOfWeek={firstDayOfWeek}
        initialDate={initialDate}
        {...stackProps}
      />
    </YStack>
  );
};

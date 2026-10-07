import { Alert, GanttView } from '@repo/ui';
import type { GanttItemMoveRange, GanttTask, GanttZoom } from '@repo/ui';
import { formatCalendarDate, parseCalendarDate, useChartPalette, useResolvedKnobs } from '@repo/theme';
import React, { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import { resolveFrappeEventColor } from './frappeEventColor';
import { useFrappeConfig } from './FrappeProvider';
import { describeSyncError } from './syncError';
import { useFrappeRows } from './useFrappeRows';

export interface FrappeGanttProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: any;
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
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
function toFrappeFieldValue(original: unknown, next: Date): unknown {
  if (original instanceof Date) {
    return next;
  }
  const carriesTime = typeof original === 'string' && original.includes(':');
  return formatCalendarDate(next, carriesTime ? 'datetime' : 'date');
}

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
export function FrappeGantt<TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  fields,
  filters,
  startField = 'exp_start_date' as keyof TDoc & string,
  endField = 'exp_end_date' as keyof TDoc & string,
  titleField = 'subject' as keyof TDoc & string,
  colorField,
  zoom = 'week',
  onItemPress,
  onItemMove,
  enableItemDrag,
  loading,
  error,
  height,
  showToday = true,
  showNavigation = true,
  showZoomSwitcher = true,
  firstDayOfWeek = 0,
  initialDate,
  ...stackProps
}: FrappeGanttProps<TDoc>) {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<Error | null>(null);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (!finalBaseURL && !config?.fixtures) {
    throw new Error('FrappeGantt requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // Ensure required fields are fetched
  const effectiveFields = useMemo(() => {
    if (!fields) {
      return;
    }
    const fieldSet = new Set(fields);
    fieldSet.add('name' as keyof TDoc & string);
    fieldSet.add(startField);
    fieldSet.add(endField);
    fieldSet.add(titleField);
    if (colorField) {
      fieldSet.add(colorField);
    }
    return [...fieldSet] as (keyof TDoc & string)[];
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
  const tasks = useMemo(
    (): GanttTask[] =>
      docs
        .map((doc) => {
          const start = parseCalendarDate((doc as any)[startField]);
          if (!start) {
            return null;
          }
          const end = parseCalendarDate((doc as any)[endField]) ?? start;
          const title = String((doc as any)[titleField] ?? doc.name);
          const color = colorField ? resolveFrappeEventColor((doc as any)[colorField], chartPalette) : undefined;
          return {
            id: doc.name,
            title,
            start,
            end,
            color,
            _doc: doc, // Attach original doc for callbacks
          } as GanttTask;
        })
        .filter(Boolean) as GanttTask[],
    [docs, startField, endField, titleField, colorField, chartPalette],
  );

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

  if (isLoading && loading) {
    return <>{loading}</>;
  }
  if (queryError && error) {
    return <>{error(queryError)}</>;
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
}

import { Spinner, formCommonColors } from '@repo/forms';
import {
  formatCalendarDate,
  parseCalendarDate,
  useChartPalette,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import { Calendar, eventChipTextColor } from '@repo/ui';
import type { CalendarEvent, CalendarEventMoveRange } from '@repo/ui';
import React, { useMemo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import { resolveFrappeEventColor } from './frappeEventColor';
import { useFrappeConfig } from './FrappeProvider';
import { describeSyncError } from './syncError';
import { useFrappeRows } from './useFrappeRows';

export type CalendarViewType = 'month' | 'week' | 'day';

export type CalendarEventRenderer<TDoc> = (event: Partial<TDoc>, defaultContent: React.ReactNode) => React.ReactNode;

export interface FrappeCalendarProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: any;
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
  dateField: keyof TDoc & string;
  endDateField?: keyof TDoc & string;
  titleField?: keyof TDoc & string;
  descriptionField?: keyof TDoc & string;
  colorField?: keyof TDoc & string;
  defaultView?: CalendarViewType;
  initialDate?: Date;
  renderEvent?: CalendarEventRenderer<TDoc>;
  onEventClick?: (event: Partial<TDoc>) => void;
  /**
   * Called after a drag-move persists (or when no collection is available).
   * Moves are first written to the live collection via `collection.update`.
   */
  onEventMove?: (eventName: string, fromDate: Date, toDate: Date) => void | Promise<void>;
  /** Enable drag-to-reschedule on the calendar grid (web only; default: true) */
  enableEventDrag?: boolean;
  onDateClick?: (date: Date) => void;
  loading?: React.ReactNode;
  error?: (error: Error) => React.ReactNode;
  height?: number;
  showNavigation?: boolean;
  showViewSwitcher?: boolean;
  firstDayOfWeek?: 0 | 1;
}

/**
 * Format a moved date back into the same shape the document field used:
 * Date stays Date, "YYYY-MM-DD HH:MM:SS" keeps its time part, plain
 * "YYYY-MM-DD" stays date-only.
 */
function toFrappeFieldValue(original: unknown, next: Date): unknown {
  if (original instanceof Date) {
    return next;
  }
  const carriesTime = typeof original === 'string' && original.includes(':');
  return formatCalendarDate(next, carriesTime ? 'datetime' : 'date');
}

/**
 * Thin Frappe wrapper around the generic Calendar component.
 *
 * Fetches data via `useFrappeCollection` / `useLiveQuery`, maps Frappe
 * documents to `CalendarEvent` objects, and passes them to the generic
 * `Calendar` from `@repo/ui`.
 */
export function FrappeCalendar<TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  fields,
  filters,
  dateField,
  endDateField,
  titleField,
  descriptionField,
  colorField,
  defaultView = 'month',
  initialDate,
  renderEvent: renderEventProp,
  onEventClick,
  onEventMove,
  enableEventDrag,
  onDateClick,
  loading,
  error,
  height: heightProp,
  showNavigation = true,
  showViewSwitcher = true,
  firstDayOfWeek = 0,
  ...stackProps
}: FrappeCalendarProps<TDoc>) {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<Error | null>(null);
  const height = heightProp ?? (knobProps.sizeToken === '$3' ? 480 : knobProps.sizeToken === '$5' ? 720 : 600);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (!finalBaseURL && !config?.fixtures) {
    throw new Error('FrappeCalendar requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // Ensure required fields are fetched
  const effectiveFields = useMemo(() => {
    if (!fields) {
      return;
    }
    const fieldSet = new Set(fields);
    fieldSet.add(dateField);
    fieldSet.add('name' as keyof TDoc & string);
    if (endDateField) {
      fieldSet.add(endDateField);
    }
    if (titleField) {
      fieldSet.add(titleField);
    }
    if (descriptionField) {
      fieldSet.add(descriptionField);
    }
    if (colorField) {
      fieldSet.add(colorField);
    }
    return [...fieldSet] as (keyof TDoc & string)[];
  }, [fields, dateField, endDateField, titleField, descriptionField, colorField]);

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

  // The shared doctype read (MPO-251). `mapError` keeps this calendar's own
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
      generic: t('Failed to load {{doctype}} events', { doctype }),
    },
  });

  // Scheme-aware palette for resolving NAMED doc colors (P-15): Frappe's
  // palette references ("blue", "Red") map to sanctioned solids per scheme;
  // literal hex/rgb doc values pass through resolveFrappeEventColor untouched.
  const chartPalette = useChartPalette();

  // Map Frappe documents to generic CalendarEvent objects
  const events = useMemo(
    (): CalendarEvent[] =>
      docs
        .map((doc) => {
          const startDate = parseCalendarDate((doc as any)[dateField]);
          if (!startDate) {
            return null;
          }
          const endDate = endDateField ? parseCalendarDate((doc as any)[endDateField]) : undefined;
          const title = titleField ? String((doc as any)[titleField] ?? doc.name) : doc.name;
          const color = colorField ? resolveFrappeEventColor((doc as any)[colorField], chartPalette) : undefined;
          return {
            id: doc.name,
            title,
            start: startDate,
            end: endDate ?? undefined,
            color,
            _doc: doc, // Attach original doc for callbacks
          } as CalendarEvent;
        })
        .filter(Boolean) as CalendarEvent[],
    [docs, dateField, endDateField, titleField, colorField, chartPalette],
  );

  const onAccent = useReadableTextOn('$accentBackground');
  // Default chip content custom renderers can compose (SB-M-715). Text color
  // is luminance-computed against the event fill (Axiom 15) — hardcoded white
  // was invisible on light fills and failed AA on mid-tone doc colors.
  const defaultEventContent = useCallback(
    (calEvent: CalendarEvent): ReactNode => (
      <Text
        numberOfLines={2}
        color={eventChipTextColor(calEvent.color, onAccent)}
        {...knobProps.label}>
        {calEvent.title}
      </Text>
    ),
    [knobProps.label, onAccent],
  );

  // Bridge renderEvent from Frappe doc to generic CalendarEvent
  const renderEventBridge = useMemo(() => {
    if (!renderEventProp) {
      return;
    }
    return (calEvent: CalendarEvent): ReactNode => {
      const doc = (calEvent as any)._doc as TDoc;
      return renderEventProp(doc, defaultEventContent(calEvent));
    };
  }, [renderEventProp, defaultEventContent]);

  // Bridge onEventClick from generic CalendarEvent to Frappe doc
  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (onEventClick) {
        const doc = docs.find((d) => d.name === event.id);
        if (doc) {
          onEventClick(doc);
        }
      }
    },
    [onEventClick, docs],
  );

  // Persist drag moves via the live collection (FrappeKanban pattern), then
  // notify the consumer callback with (name, fromDate, toDate).
  const handleEventMove = useCallback(
    async (calEvent: CalendarEvent, range: CalendarEventMoveRange) => {
      const fromDate = calEvent.start;
      setActionError(null);
      try {
        if (collection) {
          const tx = collection.update(calEvent.id, (draft) => {
            const rec = draft as Record<string, unknown>;
            rec[dateField] = toFrappeFieldValue(rec[dateField], range.start);
            if (endDateField && rec[endDateField] != null && rec[endDateField] !== '') {
              rec[endDateField] = toFrappeFieldValue(rec[endDateField], range.end);
            }
          });
          await tx.isPersisted.promise;
        }
        await onEventMove?.(calEvent.id, fromDate, range.start);
      } catch (error) {
        setActionError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [collection, onEventMove, dateField, endDateField],
  );

  if (isLoading) {
    if (loading) {
      return <>{loading}</>;
    }
    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        gap="$2"
        {...stackProps}>
        <Spinner size="large" />
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {t('Loading {{doctype}}...', { doctype })}
        </Text>
      </YStack>
    );
  }

  if (queryError) {
    if (error) {
      return <>{error(queryError)}</>;
    }
    return (
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        {...stackProps}
        {...knobProps.gap}>
        <Text color={formCommonColors.error}>{t('Error loading {{doctype}}', { doctype })}</Text>
        <Text
          color={formCommonColors.muted}
          {...knobProps.body}>
          {queryError.message}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack {...knobProps.gap}>
      <FrappeConnectionIndicator config={connectionConfig} />
      {actionError && (
        <YStack
          {...knobProps.panelPadding}
          {...knobProps.containerRadius}
          backgroundColor="$red2"
          borderColor="$red7"
          borderWidth={1}>
          <Text color={formCommonColors.error}>{t('Action failed')}</Text>
          <Text
            color={formCommonColors.muted}
            {...knobProps.body}>
            {actionError.message}
          </Text>
        </YStack>
      )}
      <Calendar
        {...knobProps.borderRadius}
        {...knobProps.containerRadius}
        events={events}
        onDateSelect={onDateClick}
        onEventClick={handleEventClick}
        onEventMove={handleEventMove}
        enableEventDrag={enableEventDrag}
        renderEvent={renderEventBridge}
        viewType={defaultView}
        initialDate={initialDate}
        height={height}
        showNavigation={showNavigation}
        showViewSwitcher={showViewSwitcher}
        firstDayOfWeek={firstDayOfWeek}
        {...stackProps}
      />
    </YStack>
  );
}

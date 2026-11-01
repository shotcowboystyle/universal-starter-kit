import { Spinner, formCommonColors } from '@repo/forms';
import {
  formatCalendarDate,
  parseCalendarDate,
  useChartPalette,
  useReadableTextOn,
  useResolvedKnobs,
} from '@repo/theme';
import type { DateInput } from '@repo/theme';
import { Calendar, eventChipTextColor } from '@repo/ui';
import type { CalendarEvent, CalendarEventMoveRange } from '@repo/ui';
import React, { useMemo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { resolveFrappeEventColor } from './frappe-event-color';
import { FrappeConnectionIndicator } from './FrappeConnectionIndicator';
import { useFrappeConfig } from './FrappeProvider';
import type { FrappeConfig } from './FrappeProvider';
import { describeSyncError } from './sync-error';
import { useFrappeRows } from './use-frappe-rows';

export type CalendarViewType = 'month' | 'week' | 'day';

export type CalendarEventRenderer<TDoc> = (event: Partial<TDoc>, defaultContent: React.ReactNode) => React.ReactNode;

export interface FrappeCalendarProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  syncOptions?: FrappeConfig['syncOptions'];
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
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
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- draft document cells are untyped Frappe field values
const toFrappeFieldValue = (original: unknown, next: Date): Date | string => {
  if (original instanceof Date) {
    return next;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the stored cell's own representation decides the written shape
  const carriesTime = typeof original === 'string' && original.includes(':');
  return formatCalendarDate(next, carriesTime ? 'datetime' : 'date');
};

const SMALL_CALENDAR_HEIGHT = 480;
const DEFAULT_CALENDAR_HEIGHT = 600;
const LARGE_CALENDAR_HEIGHT = 720;

const heightForSizeToken = (sizeToken: string): number => {
  if (sizeToken === '$3') {
    return SMALL_CALENDAR_HEIGHT;
  }
  if (sizeToken === '$5') {
    return LARGE_CALENDAR_HEIGHT;
  }
  return DEFAULT_CALENDAR_HEIGHT;
};

/** The caller's fields plus every field the calendar reads, in first-seen order. */
const withCalendarFields = <F extends string>(
  fields: readonly F[],
  always: readonly F[],
  optional: readonly (F | undefined)[],
): F[] => {
  const fieldSet = new Set<F>([...fields, ...always]);
  for (const field of optional) {
    if (field !== undefined && field !== '') {
      fieldSet.add(field);
    }
  }
  return [...fieldSet];
};

interface CalendarFieldMap<TDoc> {
  dateField: keyof TDoc & string;
  endDateField?: keyof TDoc & string;
  titleField?: keyof TDoc & string;
  colorField?: keyof TDoc & string;
}

const readDate = <TDoc,>(doc: TDoc, field: keyof TDoc & string): Date | null =>
  // SAFETY: calendar date fields hold Frappe date/datetime cells (Date, string, number or null), i.e. DateInput
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  parseCalendarDate(doc[field] as DateInput);

/** Frappe documents → generic CalendarEvent objects; docs without a parseable start are skipped. */
const docsToEvents = <TDoc extends { name: string; doctype: string }>(
  docs: readonly TDoc[],
  { dateField, endDateField, titleField, colorField }: CalendarFieldMap<TDoc>,
  chartPalette: Parameters<typeof resolveFrappeEventColor>[1],
): CalendarEvent[] => {
  const events: CalendarEvent[] = [];
  for (const doc of docs) {
    const startDate = readDate(doc, dateField);
    if (!startDate) {
      continue;
    }
    const hasEnd = endDateField !== undefined && endDateField !== '';
    const hasTitle = titleField !== undefined && titleField !== '';
    const hasColor = colorField !== undefined && colorField !== '';
    events.push({
      id: doc.name,
      title: hasTitle ? String(doc[titleField] ?? doc.name) : doc.name,
      start: startDate,
      end: (hasEnd ? readDate(doc, endDateField) : undefined) ?? undefined,
      color: hasColor ? resolveFrappeEventColor(doc[colorField], chartPalette) : undefined,
      // Attach original doc for callbacks
      _doc: doc,
    });
  }
  return events;
};

/**
 * Thin Frappe wrapper around the generic Calendar component.
 *
 * Fetches data via `useFrappeCollection` / `useLiveQuery`, maps Frappe
 * documents to `CalendarEvent` objects, and passes them to the generic
 * `Calendar` from `@repo/ui`.
 */
// oxlint-disable-next-line eslint/complexity -- each prop default and config fallback counts as a branch; the logic itself lives in the helpers above
export const FrappeCalendar = <TDoc extends { name: string; doctype: string }>({
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
}: FrappeCalendarProps<TDoc>) => {
  const config = useFrappeConfig();
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<Error | null>(null);
  const height = heightProp ?? heightForSizeToken(knobProps.sizeToken);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeCalendar requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // Ensure required fields are fetched
  const effectiveFields = useMemo(
    () =>
      fields === undefined
        ? undefined
        : withCalendarFields<keyof TDoc & string>(
            fields,
            [dateField, 'name'],
            [endDateField, titleField, descriptionField, colorField],
          ),
    [fields, dateField, endDateField, titleField, descriptionField, colorField],
  );

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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- forwards a caught sync error, which is untyped by nature
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
    () => docsToEvents(docs, { dateField, endDateField, titleField, colorField }, chartPalette),
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
  const renderEventBridge = useMemo(
    () =>
      renderEventProp === undefined
        ? undefined
        : (calEvent: CalendarEvent): ReactNode => {
            // SAFETY: every event comes from docsToEvents, which attaches the source TDoc as `_doc`
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            const doc = calEvent._doc as TDoc;
            return renderEventProp(doc, defaultEventContent(calEvent));
          },
    [renderEventProp, defaultEventContent],
  );

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
  const persistEventMove = useCallback(
    async (calEvent: CalendarEvent, range: CalendarEventMoveRange) => {
      const fromDate = calEvent.start;
      setActionError(null);
      try {
        if (collection) {
          const tx = collection.update(calEvent.id, (draft) => {
            // SAFETY: the draft is a Frappe document row, a plain field-name → cell-value object
            // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
            const rec = draft as Record<string, unknown>;
            rec[dateField] = toFrappeFieldValue(rec[dateField], range.start);
            if (
              endDateField !== undefined &&
              endDateField !== '' &&
              rec[endDateField] != null &&
              rec[endDateField] !== ''
            ) {
              rec[endDateField] = toFrappeFieldValue(rec[endDateField], range.end);
            }
          });
          await tx.isPersisted.promise;
        }
        await onEventMove?.(calEvent.id, fromDate, range.start);
      } catch (moveError) {
        setActionError(moveError instanceof Error ? moveError : new Error(String(moveError)));
      }
    },
    [collection, onEventMove, dateField, endDateField],
  );
  const handleEventMove = useCallback(
    (calEvent: CalendarEvent, range: CalendarEventMoveRange) => {
      void persistEventMove(calEvent, range);
    },
    [persistEventMove],
  );

  if (isLoading) {
    // oxlint-disable-next-line typescript/strict-boolean-expressions -- ReactNode truthiness is the intended test: null, false, '' and 0 fall back to the spinner
    if (loading) {
      // oxlint-disable-next-line react/jsx-no-useless-fragment -- keeps the return a JSX element; a bare ReactNode fallback widens the return type to include a Promise
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
};

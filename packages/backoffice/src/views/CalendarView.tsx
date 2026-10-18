// Desk "calendar" view parity: date-field resolution follows desk order —
// a `?field=` override, then the doctype's Calendar View settings doc
// (subject/start/end fields), then start/end fieldname conventions, then
// the first Date/Datetime field. A toolbar selector switches the date
// field interactively (writes `?field=` so the choice is shareable).
// Month/week/day switching, prev/today/next navigation, and drag-to-
// reschedule come from FrappeCalendar, which rides a live collection —
// external creates/updates/deletes re-slot events without a reload.
// Event click opens the form; day/slot click starts a new document
// prefilled with the clicked date (`?d=` param on the /new route).

import { FrappeCalendar, useDocRights, useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeCalendarProps } from '@repo/frappe-ui';
import { formatCalendarDate, useResolvedKnobs } from '@repo/theme';
import { XStack, YStack } from '@repo/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { CalendarFieldSelector, calendarDateFieldCandidates } from './calendar-field-selector';
import { useViewConnection } from './connection';
import { useCalendarViewSettings } from './desk-view-configs';
import { detectDateFields, isHiddenField, useViewMeta } from './view-meta';
import type { AnyDoc } from './view-meta';
import { ViewError, ViewLoading, ViewUnsupported } from './ViewStates';

// The `one` compiler breaks explicit JSX generics — instantiate once.
// SAFETY: FrappeCalendar is generic over its doc type; this pins that parameter to AnyDoc.
const CalendarOfDoc = FrappeCalendar as (props: FrappeCalendarProps<AnyDoc>) => ReactElement;

/**
 * Serialize a clicked calendar date the way frappe stores the target field:
 * Datetime → "YYYY-MM-DD HH:mm:ss", Date → "YYYY-MM-DD" — local time, the
 * same convention FrappeCalendar uses when persisting drag-moves.
 */
const toFrappeDateValue = (date: Date, fieldtype: string | undefined): string =>
  formatCalendarDate(date, fieldtype === 'Datetime' ? 'datetime' : 'date');

export interface CalendarViewProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
  /** Date field override (`?field=` search param). */
  dateField?: string;
  /**
   * Called when the user picks a date field in the selector. Defaults to
   * writing the `?field=` search param (replace navigation), which
   * round-trips through the view dispatcher (DoctypeViewScreen) back into
   * the `dateField` prop.
   */
  onDateFieldChange?: (fieldname: string) => void;
  /**
   * Day/slot-click override. Default: start a new document prefilled with
   * the clicked date (`?d=` param on the /new route) — gated by the
   * `newDoc` capability.
   */
  onSlotCreate?: (date: Date) => void;
}

// oxlint-disable-next-line eslint/complexity -- view orchestration: one early return per load state, then field resolution
export const CalendarView = ({
  doctype,
  dateField: fieldOverride,
  onDateFieldChange,
  onSlotCreate,
}: CalendarViewProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const deskScope = useDeskScope();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { newDoc } = useBackofficeCapabilities();
  const { knobProps } = useResolvedKnobs();
  const connection = useViewConnection();
  const { meta, isLoading: isMetaLoading, error: metaError } = useViewMeta(doctype);
  const settings = useCalendarViewSettings(connection, doctype);
  const { rights } = useDocRights(useFrappeConfig(), meta);

  if (isMetaLoading || settings.isLoading) {
    return <ViewLoading />;
  }
  if (metaError && !meta) {
    return (
      <ViewError
        doctype={doctype}
        error={metaError}
      />
    );
  }
  if (!meta) {
    return <ViewLoading />;
  }

  // Resolution order: override → Calendar View doc → conventions/first.
  // Every candidate is validated against the meta's Date/Datetime fields
  // via detectDateFields (an invalid candidate falls through).
  const candidates = calendarDateFieldCandidates(meta);
  const candidateNames = new Set(candidates.map((field) => field.fieldname));
  const settingsDoc = settings.doc;
  const detected = detectDateFields(meta, fieldOverride ?? settingsDoc?.start_date_field);
  const { dateField } = detected;
  // The settings' end field only pairs with the settings' start field — an
  // overridden start keeps convention pairing (starts_on → ends_on, …)
  // instead of mixing a range across two different field pairs.
  const endDateField =
    dateField === settingsDoc?.start_date_field &&
    settingsDoc?.end_date_field !== undefined &&
    candidateNames.has(settingsDoc.end_date_field)
      ? settingsDoc.end_date_field
      : detected.endDateField;

  if (dateField === undefined || dateField === '') {
    return (
      <ViewUnsupported
        doctype={doctype}
        title={t('views.calendarUnsupported', 'Calendar not available')}
        description={t('views.calendarUnsupportedDetail', '{{doctype}} has no date field to place on a calendar.', {
          doctype,
        })}
      />
    );
  }

  // Settings' subject field must exist on the doctype — a stale settings doc
  // must not leak an unknown column into the fields list (the list endpoint
  // rejects the whole query on unknown fields).
  const subjectField =
    settingsDoc?.subject_field !== undefined && meta.fields.some((f) => f.fieldname === settingsDoc.subject_field)
      ? settingsDoc.subject_field
      : undefined;
  const titleField = subjectField ?? meta.title_field ?? undefined;
  // Desk colors event chips by the doc's Color field when one exists
  // (e.g. Event.color); FrappeCalendar computes readable chip text per fill.
  const colorField = meta.fields.find((f) => f.fieldtype === 'Color' && !isHiddenField(f))?.fieldname;
  // Date vs Datetime decides the prefill serialization on day/slot clicks.
  const dateFieldType = meta.fields.find((f) => f.fieldname === dateField)?.fieldtype;
  const optionalFields = [endDateField, titleField, colorField].filter(
    (field): field is string => field !== undefined && field !== '',
  );
  // SAFETY: every entry is a fieldname of this doctype, and AnyDoc keys are its fieldnames.
  const fields = [...new Set(['name', dateField, ...optionalFields])] as readonly (keyof AnyDoc)[];

  return (
    <YStack
      flex={1}
      {...knobProps.gap}>
      {candidates.length > 1 && (
        <XStack
          {...knobProps.panelPadding}
          paddingBottom={0}
          justifyContent="flex-end">
          <CalendarFieldSelector
            candidates={candidates}
            value={dateField}
            onChange={(fieldname) => {
              if (onDateFieldChange) {
                onDateFieldChange(fieldname);
              } else {
                // Router-free `setParams` equivalent: replace to the same
                // view with `?field=` so the choice stays shareable without
                // growing history.
                navigator.replace(`${paths.view(doctype, 'calendar')}?field=${encodeURIComponent(fieldname)}`);
              }
            }}
          />
        </XStack>
      )}
      <CalendarOfDoc
        // Remount on axis change: a fresh collection subscribes with the new
        // date field in its field list (no stale rows missing the column).
        key={dateField}
        doctype={doctype}
        {...(deskScope.length > 0 && { filters: deskScope })}
        dateField={dateField}
        endDateField={endDateField}
        titleField={titleField}
        colorField={colorField}
        fields={fields}
        defaultView="month"
        showNavigation
        showViewSwitcher
        enableEventDrag={rights.write}
        onEventClick={(doc) => {
          const { name } = doc;
          if (name != null && name !== '') {
            navigator.navigate(paths.form(doctype, name));
          }
        }}
        // Desk parity: desk seeds its new-event form with the clicked day
        // (and slot time in week/day grids) — the date rides the `?d=`
        // prefill param into the create form, shaped to the field's type.
        // `onSlotCreate` overrides; the default is gated by `newDoc` and the
        // session's create right.
        onDateClick={
          onSlotCreate ??
          (newDoc.enabled && rights.create
            ? (date) => {
                navigator.navigate(paths.newDoc(doctype, { [dateField]: toFrappeDateValue(date, dateFieldType) }));
              }
            : undefined)
        }
        // oxlint-disable-next-line react/no-unstable-nested-components -- render callback FrappeCalendar calls with the error, not a component type
        error={(err) => (
          <ViewError
            doctype={doctype}
            error={err}
          />
        )}
      />
    </YStack>
  );
};

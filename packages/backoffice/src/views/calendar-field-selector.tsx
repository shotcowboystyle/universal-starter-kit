// Date-field selector for the calendar view. Desk picks the calendar axis
// from a Calendar View settings doc; this selector exposes the same choice
// interactively — candidates are the doctype's visible Date/Datetime
// fields, and picking one round-trips through the `?field=` search param
// (see CalendarView) so the choice is shareable.
import { Button, DropdownMenu } from '@repo/ui';
import type { DropdownMenuEntry } from '@repo/ui';
import { CalendarBlankIcon, CaretDownIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DocFieldMeta, DoctypeMeta } from '../shared/useDoctypeMeta';

const CALENDAR_DATE_FIELD_TYPES = new Set(['Date', 'Datetime']);

/** Visible Date/Datetime fields a calendar can be laid out on. */
export function calendarDateFieldCandidates(meta: DoctypeMeta): DocFieldMeta[] {
  return meta.fields.filter((field) => CALENDAR_DATE_FIELD_TYPES.has(field.fieldtype) && !field.hidden);
}

export interface CalendarFieldSelectorProps {
  candidates: DocFieldMeta[];
  /** Fieldname of the date field currently laying out the calendar. */
  value: string;
  onChange: (fieldname: string) => void;
}

/**
 * Dropdown to switch which date field the calendar is laid out on
 * (ViewHeader switcher pattern: the active field is disabled with a reason).
 */
export function CalendarFieldSelector({ candidates, value, onChange }: CalendarFieldSelectorProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const current = candidates.find((field) => field.fieldname === value);
  const items: DropdownMenuEntry[] = candidates.map((field) => ({
    key: field.fieldname,
    label: field.label ?? field.fieldname,
    disabled: field.fieldname === value,
    disabledReason: field.fieldname === value ? t('views.calendarFieldCurrent', 'Current date field') : undefined,
    onSelect: () => {
      onChange(field.fieldname);
    },
  }));

  return (
    <DropdownMenu
      items={items}
      placement="bottom-end">
      <Button
        size="$3"
        icon={CalendarBlankIcon}
        iconAfter={CaretDownIcon}
        aria-label={t('views.calendarFieldSelect', 'Choose calendar date field')}>
        {current?.label ?? value}
      </Button>
    </DropdownMenu>
  );
}

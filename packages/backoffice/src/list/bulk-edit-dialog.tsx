import type { FrappeApp } from '@repo/frappe';
import { Check, Data, Date as DateInput, Link, LongText, Numeric, Select } from '@repo/frappe-ui';
import type { NumericType } from '@repo/frappe-ui';
import { ConfirmDialog, Text, YStack, notify } from '@repo/ui';
// Bulk edit dialog (desk "Bulk Edit"): pick an editable field, enter the new
// value (the control follows the fieldtype), then frappe.client.set_value per
// selected document. Per-row failures surface in the result toast — desk's
// bulk_update endpoint hides per-row outcomes and backgrounds ≥20 docs, so
// the per-doc loop keeps reporting honest (same trade-off as bulkDelete).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';
import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';
import { useFrappeApp } from '../shared/use-frappe-app';

import type { BulkResult } from './bulk-actions';

/**
 * Fieldtypes with no stored value (layout / display / child rows) plus
 * surfaces a one-line bulk control cannot sensibly set (attachments,
 * signatures, geolocation). Mirrors desk's `frappe.model.no_value_type`.
 */
export const BULK_EDIT_EXCLUDED_FIELDTYPES = new Set([
  'Section Break',
  'Column Break',
  'Tab Break',
  'HTML',
  'Heading',
  'Button',
  'Image',
  'Fold',
  'Table',
  'Table MultiSelect',
  'Attach',
  'Attach Image',
  'Signature',
  'Geolocation',
  'Read Only',
]);

const isBulkEditable = (field: DocFieldMeta): boolean => {
  if (field.fieldname === '' || BULK_EDIT_EXCLUDED_FIELDTYPES.has(field.fieldtype)) {
    return false;
  }
  return !(field.read_only ?? 0) && !(field.hidden ?? 0);
};

/** Editable (writable, visible, value-bearing) fields for bulk edit. */
export const bulkEditableFields = (meta?: DoctypeMeta): DocFieldMeta[] => meta?.fields?.filter(isBulkEditable) ?? [];

export type BulkEditValue = string | number | boolean | undefined;

/**
 * Set one field on every document via frappe.client.set_value
 * (POST {doctype, name, fieldname, value}); failures collected per row.
 * Empty string clears the field (desk sends `value || null`).
 */
export const bulkSetValue = async (
  app: FrappeApp,
  doctype: string,
  names: string[],
  fieldname: string,
  value: BulkEditValue,
): Promise<BulkResult> => {
  const payloadValue = value === '' || value === undefined ? null : value;
  const settled = await Promise.allSettled(
    names.map(
      async (name) =>
        await app.call().post('frappe.client.set_value', { doctype, name, fieldname, value: payloadValue }),
    ),
  );
  const result: BulkResult = { succeeded: [], failed: [] };
  for (const [index, outcome] of settled.entries()) {
    const name = names[index];
    if (outcome.status === 'fulfilled') {
      result.succeeded.push(name);
    } else {
      const reason: unknown = outcome.reason;
      result.failed.push({
        name,
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }
  return result;
};

const NUMERIC_FIELDTYPES = new Map<string, NumericType>([
  ['Int', 'Int'],
  ['Float', 'Float'],
  ['Currency', 'Currency'],
  ['Percent', 'Percent'],
]);

const DATE_FIELDTYPES = new Map<string, 'date' | 'datetime' | 'time'>([
  ['Date', 'date'],
  ['Datetime', 'datetime'],
  ['Time', 'time'],
]);

const isText = (value: BulkEditValue): value is string => typeof value === 'string';
const isNumber = (value: BulkEditValue): value is number => typeof value === 'number';

const MULTILINE_FIELDTYPES = new Set([
  'Long Text',
  'Text',
  'Small Text',
  'Text Editor',
  'Markdown Editor',
  'Code',
  'HTML Editor',
]);

export interface BulkEditDialogProps {
  doctype: string;
  meta?: DoctypeMeta;
  /** Documents to update. */
  names: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after the update ran (even with partial failures). */
  onDone?: () => void;
}

export const BulkEditDialog = ({ doctype, meta, names, open, onOpenChange, onDone }: BulkEditDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const [fieldname, setFieldname] = useState('');
  const [value, setValue] = useState<BulkEditValue>();
  const [busy, setBusy] = useState(false);

  const fields = useMemo(() => bulkEditableFields(meta), [meta]);
  const field = fields.find((candidate) => candidate.fieldname === fieldname);

  const handleConfirm = async () => {
    if (!app || !field || names.length === 0) {
      return;
    }
    setBusy(true);
    try {
      // Check fields store 0/1 ints server-side.
      const outgoing = field.fieldtype === 'Check' ? Number(Boolean(value)) : value;
      const result = await bulkSetValue(app, doctype, names, field.fieldname, outgoing);
      if (result.failed.length > 0) {
        notify({
          severity: 'warning',
          scope: 'page',
          // i18next plural forms — `count` (succeeded docs) picks the form;
          // "{{failed}} failed" reads correctly for any failure count.
          body: t('list.editPartial', {
            count: result.succeeded.length,
            failed: result.failed.length,
            names: result.failed.map((failure) => failure.name).join(', '),
            defaultValue_one: 'Updated {{count}} document; {{failed}} failed ({{names}})',
            defaultValue_other: 'Updated {{count}} documents; {{failed}} failed ({{names}})',
          }),
        });
      } else {
        notify({
          severity: 'success',
          scope: 'page',
          body: t('list.editDone', {
            count: result.succeeded.length,
            field: field.label ?? field.fieldname,
            defaultValue_one: 'Updated {{field}} on {{count}} document',
            defaultValue_other: 'Updated {{field}} on {{count}} documents',
          }),
        });
      }
      setFieldname('');
      setValue(undefined);
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('list.editFailed', 'Bulk edit failed'),
      });
    }
    // Not a `finally`: the catch above never rethrows, and the React Compiler skips try/finally.
    setBusy(false);
  };

  const valueLabel = t('list.editValue', 'Value');
  const renderValueControl = () => {
    if (!field) {
      return null;
    }
    if (field.fieldtype === 'Check') {
      return (
        <Check
          label={valueLabel}
          value={Boolean(value)}
          onChange={(next) => {
            setValue(next);
          }}
        />
      );
    }
    if (field.fieldtype === 'Select') {
      const options = (field.options ?? '').split('\n').filter(Boolean);
      return (
        <Select
          label={valueLabel}
          options={options}
          value={isText(value) ? value : undefined}
          onChange={(next) => {
            // oxlint-disable-next-line typescript/no-unsafe-argument -- Select's onChange intersects a DOM ChangeEventHandler, so `next` infers as any; it is the option string
            setValue(next);
          }}
          placeholder={t('list.editSelectPlaceholder', 'Select a value')}
        />
      );
    }
    const linkTarget = field.options ?? '';
    if (field.fieldtype === 'Link' && linkTarget !== '') {
      return (
        <Link
          label={valueLabel}
          doctype={linkTarget}
          value={isText(value) ? value : ''}
          onChange={(next) => {
            setValue(next);
          }}
        />
      );
    }
    const numericType = NUMERIC_FIELDTYPES.get(field.fieldtype);
    if (numericType !== undefined) {
      return (
        <Numeric
          label={valueLabel}
          type={numericType}
          value={isNumber(value) ? value : undefined}
          onChange={(next) => {
            setValue(next);
          }}
        />
      );
    }
    const dateType = DATE_FIELDTYPES.get(field.fieldtype);
    if (dateType !== undefined) {
      return (
        <DateInput
          label={valueLabel}
          type={dateType}
          value={isText(value) ? value : ''}
          onChange={(next) => {
            setValue(next);
          }}
        />
      );
    }
    if (MULTILINE_FIELDTYPES.has(field.fieldtype)) {
      return (
        <LongText
          label={valueLabel}
          value={isText(value) ? value : ''}
          onChange={(next) => {
            // oxlint-disable-next-line typescript/no-unsafe-argument -- LongText's onChange intersects a DOM ChangeEventHandler, so `next` infers as any; it is the text
            setValue(next);
          }}
        />
      );
    }
    return (
      <Data
        label={valueLabel}
        value={isText(value) ? value : ''}
        onChange={(next) => {
          setValue(next);
        }}
      />
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('list.editTitle', 'Bulk Edit')}
      confirmLabel={busy ? t('list.editing', 'Updating…') : t('list.editConfirm', 'Update')}
      confirmDisabled={!field || busy}
      confirmDisabledReason={field ? undefined : t('list.editPickField', 'Pick a field to update')}
      onConfirm={() => {
        void handleConfirm();
      }}>
      <YStack
        gap="$3"
        minWidth={dialogBodyMinWidth}>
        <Text
          color="$color11"
          fontSize="$3">
          {t('list.editBody', {
            count: names.length,
            defaultValue_one: 'Set one field on {{count}} selected document',
            defaultValue_other: 'Set one field on {{count}} selected documents',
          })}
        </Text>
        <Select
          label={t('list.editField', 'Field')}
          options={fields.map((candidate) => ({
            label: candidate.label ?? candidate.fieldname,
            value: candidate.fieldname,
          }))}
          value={fieldname || undefined}
          onChange={(next) => {
            // oxlint-disable-next-line typescript/no-unsafe-argument -- Select's onChange intersects a DOM ChangeEventHandler, so `next` infers as any; it is the option string
            setFieldname(next);
            setValue(undefined);
          }}
          placeholder={t('list.editFieldPlaceholder', 'Select a field')}
        />
        {renderValueControl()}
      </YStack>
    </ConfirmDialog>
  );
};

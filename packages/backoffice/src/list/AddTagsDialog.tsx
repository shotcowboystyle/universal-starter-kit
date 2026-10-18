import { Data } from '@repo/frappe-ui';
import { ConfirmDialog, Text, YStack, notify } from '@repo/ui';
// Add-tag dialog (desk bulk "Add Tags"): pick or type a tag, then
// frappe.desk.doctype.tag.tag.add_tag per selected document (the server
// creates unknown tags). Per-row failures surface in the result toast.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';
import { useFrappeApp } from '../shared/use-frappe-app';

import { bulkAddTag } from './bulk-actions';

export interface AddTagsDialogProps {
  doctype: string;
  /** Documents to tag. */
  names: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after tags were applied (even with partial failures). */
  onDone?: () => void;
}

export const AddTagsDialog = ({ doctype, names, open, onOpenChange, onDone }: AddTagsDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!app || !tag || names.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const result = await bulkAddTag(app, doctype, names, tag);
      if (result.failed.length > 0) {
        notify({
          severity: 'warning',
          scope: 'page',
          // i18next plural forms — `count` (succeeded docs) picks the form;
          // "{{failed}} failed" reads correctly for any failure count.
          body: t('list.tagPartial', {
            count: result.succeeded.length,
            failed: result.failed.length,
            names: result.failed.map((failure) => failure.name).join(', '),
            defaultValue_one: 'Tagged {{count}} document; {{failed}} failed ({{names}})',
            defaultValue_other: 'Tagged {{count}} documents; {{failed}} failed ({{names}})',
          }),
        });
      } else {
        notify({
          severity: 'success',
          scope: 'page',
          body: t('list.tagDone', {
            count: result.succeeded.length,
            tag,
            defaultValue_one: 'Added tag "{{tag}}" to {{count}} document',
            defaultValue_other: 'Added tag "{{tag}}" to {{count}} documents',
          }),
        });
      }
      setTag('');
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('list.tagFailed', 'Tagging failed'),
      });
    }
    // Not a `finally`: the catch above never rethrows, and the React Compiler skips try/finally.
    setBusy(false);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('list.tagTitle', 'Add Tags')}
      confirmLabel={busy ? t('list.tagging', 'Tagging…') : t('list.tagConfirm', 'Add Tag')}
      confirmDisabled={!tag || busy}
      onConfirm={() => {
        void handleConfirm();
      }}>
      <YStack
        gap="$3"
        minWidth={dialogBodyMinWidth}>
        <Text
          color="$color11"
          fontSize="$3">
          {t('list.tagBody', {
            count: names.length,
            defaultValue_one: 'Tag {{count}} selected document',
            defaultValue_other: 'Tag {{count}} selected documents',
          })}
        </Text>
        <Data
          label={t('list.tagField', 'Tag')}
          placeholder={t('list.tagPlaceholder', 'New or existing tag name')}
          value={tag}
          onChange={(value) => {
            setTag(value);
          }}
          required
        />
      </YStack>
    </ConfirmDialog>
  );
};

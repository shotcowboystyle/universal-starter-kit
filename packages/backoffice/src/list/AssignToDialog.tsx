import { ConfirmDialog, Text, YStack, notify } from '@repo/ui';
import { Link, LongText } from '@repo/frappe-ui';
// Assign-to dialog (desk bulk "Assign To"): pick a user, optional note,
// then frappe.desk.form.assign_to.add_multiple across the selection.
import React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';
import { useFrappeApp } from '../shared/useFrappeApp';

import { bulkAssign } from './bulkActions';

export interface AssignToDialogProps {
  doctype: string;
  /** Documents to assign. */
  names: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful assignment. */
  onDone?: () => void;
}

export function AssignToDialog({ doctype, names, open, onOpenChange, onDone }: AssignToDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const app = useFrappeApp();
  const [user, setUser] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!app || !user || names.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await bulkAssign(app, doctype, names, [user], description || undefined);
      notify({
        severity: 'success',
        scope: 'page',
        // i18next plural forms — the count picks the grammatical form.
        body: t('list.assignDone', {
          count: names.length,
          user,
          defaultValue_one: 'Assigned {{count}} document to {{user}}',
          defaultValue_other: 'Assigned {{count}} documents to {{user}}',
        }),
      });
      setUser('');
      setDescription('');
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('list.assignFailed', 'Assignment failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('list.assignTitle', 'Assign To')}
      confirmLabel={busy ? t('list.assigning', 'Assigning…') : t('list.assignConfirm', 'Assign')}
      confirmDisabled={!user || busy}
      onConfirm={() => {
        void handleConfirm();
      }}>
      <YStack
        gap="$3"
        minWidth={dialogBodyMinWidth}>
        <Text
          color="$color11"
          fontSize="$3">
          {t('list.assignBody', {
            count: names.length,
            defaultValue_one: 'Assign {{count}} selected document',
            defaultValue_other: 'Assign {{count}} selected documents',
          })}
        </Text>
        <Link
          label={t('list.assignUser', 'Assign to user')}
          doctype="User"
          value={user}
          onChange={setUser}
          required
        />
        <LongText
          label={t('list.assignComment', 'Comment')}
          value={description}
          onChange={(value) => {
            setDescription(value);
          }}
        />
      </YStack>
    </ConfirmDialog>
  );
}

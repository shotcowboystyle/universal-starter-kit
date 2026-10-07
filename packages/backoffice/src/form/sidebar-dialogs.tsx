/**
 * Sidebar add dialogs: assign-to (user autocomplete + optional comment) and
 * share-with (user autocomplete + can-edit toggle). User autocomplete rides
 * the frappe-ui Link field, which searches `frappe.desk.search.search_link`
 * (doctype=User) through the ambient FrappeProvider.
 */

import { ConfirmDialog, Text, XStack, YStack } from '@repo/ui';
import { Input, Switch } from '@repo/forms';
import { Link } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';

export interface SidebarAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (user: string, description?: string) => void;
}

export function SidebarAssignDialog({ open, onOpenChange, onAssign }: SidebarAssignDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [user, setUser] = useState('');
  const [description, setDescription] = useState('');

  // Reset on close (QuickEntryDialog pattern): the dialog content remounts on
  // open, so the uncontrolled forms Input must see the fresh draft at mount.
  useEffect(() => {
    if (!open) {
      setUser('');
      setDescription('');
    }
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('assignTitle', 'Add assignment')}
      confirmLabel={t('assign', 'Assign')}
      confirmDisabled={!user}
      confirmDisabledReason={t('assignDisabled', 'Pick a user first')}
      onConfirm={() => {
        onAssign(user, description.trim() || undefined);
      }}>
      <YStack
        {...knobProps.gap}
        minWidth={dialogBodyMinWidth}>
        <Link
          label={t('assignTo', 'Assign to')}
          doctype="User"
          value={user}
          onChange={(value) => {
            setUser(value ?? '');
          }}
        />
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder={t('assignComment', 'Comment (optional)')}
          inputProps={{
            'aria-label': t('assignComment', 'Comment (optional)'),
          }}
        />
      </YStack>
    </ConfirmDialog>
  );
}

export interface SidebarShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (user: string, canWrite: boolean) => void;
}

export function SidebarShareDialog({ open, onOpenChange, onShare }: SidebarShareDialogProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [user, setUser] = useState('');
  const [canWrite, setCanWrite] = useState(false);

  // Reset on close — see SidebarAssignDialog.
  useEffect(() => {
    if (!open) {
      setUser('');
      setCanWrite(false);
    }
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('shareTitle', 'Share document')}
      confirmLabel={t('share', 'Share')}
      confirmDisabled={!user}
      confirmDisabledReason={t('shareDisabled', 'Pick a user first')}
      onConfirm={() => {
        onShare(user, canWrite);
      }}>
      <YStack
        {...knobProps.gap}
        minWidth={dialogBodyMinWidth}>
        <Link
          label={t('shareWith', 'Share with')}
          doctype="User"
          value={user}
          onChange={(value) => {
            setUser(value ?? '');
          }}
        />
        <XStack
          alignItems="center"
          justifyContent="space-between">
          <Text
            fontSize="$3"
            color="$color11">
            {t('canEdit', 'Can edit')}
          </Text>
          <Switch
            size="$2"
            checked={canWrite}
            onChange={(value) => {
              setCanWrite(Boolean(value));
            }}
            switchProps={{ 'aria-label': t('canEdit', 'Can edit') }}
          />
        </XStack>
      </YStack>
    </ConfirmDialog>
  );
}

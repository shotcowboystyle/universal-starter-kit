import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { Chip } from '@repo/ui';
import type { ChipColor } from '@repo/ui';
import { useTranslation } from 'react-i18next';
import { XStack } from 'tamagui';

import type { DocAction, DocStatusIndicator } from './formEngine/docLifecycle';

const indicatorColors: Record<DocStatusIndicator, ChipColor> = {
  notSaved: 'orange',
  draft: 'red',
  submitted: 'blue',
  cancelled: 'red',
};

export interface FrappeFormActionsProps {
  /** Desk's state pill: Not Saved, Draft, Submitted or Cancelled. */
  indicator?: DocStatusIndicator;
  /** The one lifecycle action the document's state offers (resolveDocAction). */
  action?: DocAction;
  /** A save or a docstatus transition is in flight. */
  busy: boolean;
  /** The form is read-only: actions render, disabled with the reason. */
  disabled: boolean;
  onSave: () => void;
  onSubmit: () => void;
  /** Cancels the submitted document (docstatus 1 → 2). */
  onCancelDocument: () => void;
  /** Absent, a cancelled document offers no Amend: the host has nowhere to open the draft. */
  onAmend?: () => void;
  /** The live amendment of this cancelled document; Amend stays disabled while it exists. */
  amendedAs?: string;
  onDelete?: () => void;
  /**
   * Given, the form is a read-only view and this opens its editor. The
   * caller leaves it out when the document has nothing left to edit.
   */
  onEdit?: () => void;
  /** The host's leave action (discards unsaved edits first). */
  onClose?: () => void;
  closeDisabled?: boolean;
}

/**
 * FrappeForm's action bar with desk's docstatus lifecycle: one primary
 * action at a time (Save, Submit, Update or Amend), Cancel Document as the
 * secondary destructive action on a submitted document, and the state pill.
 * A read-only view trades Save and the leave button for Edit.
 */
export function FrappeFormActions({
  indicator,
  action,
  busy,
  disabled,
  onSave,
  onSubmit,
  onCancelDocument,
  onAmend,
  amendedAs,
  onDelete,
  onEdit,
  onClose,
  closeDisabled,
}: FrappeFormActionsProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const readOnlyReason = t('Form is read-only');

  const indicatorLabels: Record<DocStatusIndicator, string> = {
    notSaved: t('Not Saved'),
    draft: t('Draft'),
    submitted: t('Submitted'),
    cancelled: t('Cancelled'),
  };

  return (
    <XStack
      {...knobProps.gap}
      justifyContent="flex-end"
      alignItems="center"
      paddingTop="$3"
      testID="frappe-form-actions">
      {indicator && (
        <XStack
          flex={1}
          alignItems="center"
          testID={`frappe-form-status-${indicator}`}>
          <Chip
            size="$2"
            variant="subtle"
            color={indicatorColors[indicator]}>
            {indicatorLabels[indicator]}
          </Chip>
        </XStack>
      )}

      {onDelete && (
        <Button
          outlined
          error
          icon={TrashIcon}
          loading={busy}
          disabled={disabled}
          disabledReason={disabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onDelete}>
          {t('Delete')}
        </Button>
      )}

      {onClose && (
        <Button
          outlined
          icon={XIcon}
          disabled={closeDisabled}
          disabledReason={closeDisabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onClose}
          testID="frappe-form-close">
          {/* A submitted document's own Cancel sits beside this button. */}
          {action === 'cancel' ? t('Close') : t('Cancel')}
        </Button>
      )}

      {action === 'cancel' && (
        <Button
          outlined
          error
          actionRole="secondary"
          icon={ProhibitIcon}
          loading={busy}
          disabled={disabled}
          disabledReason={disabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onCancelDocument}
          testID="frappe-form-cancel-document">
          {t('Cancel Document')}
        </Button>
      )}

      {onEdit && (
        <Button
          accent={action !== 'submit'}
          outlined={action === 'submit'}
          icon={PencilSimpleIcon}
          disabled={disabled}
          disabledReason={disabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onEdit}
          testID="frappe-form-edit">
          {t('Edit')}
        </Button>
      )}

      {action === 'amend' && onAmend && (
        <Button
          // Desk demotes Amend to a secondary action once the document is amended.
          accent={!amendedAs}
          outlined={Boolean(amendedAs)}
          icon={ArrowCounterClockwiseIcon}
          loading={busy}
          disabled={disabled || Boolean(amendedAs)}
          disabledReason={
            amendedAs ? t('Already amended as {{name}}', { name: amendedAs }) : disabled ? readOnlyReason : undefined
          }
          disabledReasonPlacement="inline"
          onPress={onAmend}
          testID="frappe-form-amend">
          {t('Amend')}
        </Button>
      )}

      {action === 'submit' && (
        <Button
          accent
          icon={CheckCircleIcon}
          loading={busy}
          disabled={disabled}
          disabledReason={disabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onSubmit}
          testID="frappe-form-submit">
          {t('Submit')}
        </Button>
      )}

      {(action === 'save' || action === 'update') && (
        <Button
          accent
          icon={FloppyDiskIcon}
          loading={busy}
          disabled={disabled}
          disabledReason={disabled ? readOnlyReason : undefined}
          disabledReasonPlacement="inline"
          onPress={onSave}
          testID="frappe-form-save">
          {busy ? t('Saving...') : action === 'update' ? t('Update') : t('Save')}
        </Button>
      )}
    </XStack>
  );
}

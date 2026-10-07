import { ConfirmDialog, Text, XStack, notify } from '@repo/ui';
// Catalog action Button — `error` renders the destructive intent from the
// semantic ramp instead of a hardcoded named hue (LC-05 ONE-EMPHASIS).
import { Button } from '@repo/forms';
import { sessionDocRights, useFrappeConfig } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
// Contract: appears when rows are selected — bulk edit / export CSV / assign /
// tag / submit / cancel / delete actions (desk parity). Keep props stable —
// list-core imports this.
//
// Note: DoctypeListScreen currently surfaces the same actions through the
// DataTable's built-in selection toolbar (house DG-TBL-02 pattern) using
// the shared dialogs/helpers below; this standalone bar exists for surfaces
// that manage selection themselves (report/kanban streams).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { actionsForDoctype, useBackofficeCapabilities, useBackofficeConfig } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';
import { useFrappeApp } from '../shared/useFrappeApp';
import { useUserRoles } from '../shared/useUserRoles';

import { AddTagsDialog } from './AddTagsDialog';
import { AssignToDialog } from './AssignToDialog';
import { BulkEditDialog } from './bulk-edit-dialog';
import { bulkExportCsv } from './bulk-export';
import { bulkSubmitCancel } from './bulk-submit-cancel';
import type { BulkDocstatusAction } from './bulk-submit-cancel';
import { bulkDelete } from './bulkActions';

export interface ListBulkActionsBarProps {
  doctype: string;
  meta?: DoctypeMeta;
  /** Selected document names */
  selectedNames: string[];
  onClearSelection: () => void;
  /** Called after any bulk action completes so the list refreshes */
  onActionComplete: () => void;
}

export function ListBulkActionsBar({
  doctype,
  meta,
  selectedNames,
  onClearSelection,
  onActionComplete,
}: ListBulkActionsBarProps) {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const app = useFrappeApp();
  const capabilities = useBackofficeCapabilities();
  const { actions } = useBackofficeConfig();
  const config = useFrappeConfig();
  const fixtureMode = Boolean(config?.fixtures);
  // Session roles × meta.permissions: write/submit/cancel/delete bulk actions
  // follow the doctype's DocPerm rows (DoctypeListScreen / MPO-390). Fixture
  // mode has no session and withholds nothing.
  const { roles, user: rolesUser } = useUserRoles();
  const rights = useMemo(
    () => sessionDocRights({ fixtures: fixtureMode, meta, roles, user: rolesUser }),
    [fixtureMode, meta, roles, rolesUser],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [docstatusAction, setDocstatusAction] = useState<BulkDocstatusAction | undefined>();
  const [docstatusBusy, setDocstatusBusy] = useState(false);

  // Capability gates: the whole bar rides `bulkActions`; the assignment and
  // tag actions additionally ride their own flags.
  if (!capabilities.bulkActions.enabled) {
    return null;
  }
  if (selectedNames.length === 0) {
    return null;
  }
  const isSubmittable = meta?.is_submittable === 1;
  const showAssign = capabilities.assignments.enabled;
  const showTags = capabilities.tags.enabled;
  const hostActions = actionsForDoctype(actions.list, doctype);

  const handleDelete = async () => {
    if (!app) {
      return;
    }
    setDeleting(true);
    try {
      const result = await bulkDelete(app, doctype, selectedNames);
      if (result.failed.length > 0) {
        notify({
          severity: 'warning',
          scope: 'page',
          body: t('list.deletePartial', {
            defaultValue: 'Deleted {{ok}} document(s); {{failed}} failed ({{names}})',
            ok: result.succeeded.length,
            failed: result.failed.length,
            names: result.failed.map((failure) => failure.name).join(', '),
          }),
        });
      } else {
        notify({
          severity: 'success',
          scope: 'page',
          body: t('list.deleteDone', {
            defaultValue: 'Deleted {{count}} document(s)',
            count: result.succeeded.length,
          }),
        });
      }
      onClearSelection();
      onActionComplete();
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    if (!app) {
      return;
    }
    setExporting(true);
    try {
      const result = await bulkExportCsv(app, doctype, selectedNames, meta);
      if (result.cancelled) {
        return;
      }
      if (!result.downloaded) {
        // KNOWN GAP: no save path on GTK yet.
        notify({
          severity: 'warning',
          scope: 'page',
          body: t('list.exportUnsupported', 'CSV export needs a browser download — not available on this platform yet'),
        });
      } else if (result.rowCount < selectedNames.length) {
        notify({
          severity: 'warning',
          scope: 'page',
          body: t('list.exportPartial', {
            defaultValue: 'Exported {{count}} of {{total}} selected row(s)',
            count: result.rowCount,
            total: selectedNames.length,
          }),
        });
      } else {
        notify({
          severity: 'success',
          scope: 'page',
          body: t('list.exportDone', {
            defaultValue: 'Exported {{count}} row(s) to CSV',
            count: result.rowCount,
          }),
        });
      }
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('list.exportFailed', 'CSV export failed'),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDocstatusAction = async (action: BulkDocstatusAction) => {
    if (!app) {
      return;
    }
    setDocstatusBusy(true);
    try {
      const result = await bulkSubmitCancel(app, doctype, selectedNames, action);
      if (result.queued) {
        notify({
          severity: 'info',
          scope: 'page',
          body: t('list.docstatusQueued', {
            defaultValue: '{{action}} of {{count}} document(s) queued in the background',
            action: action === 'submit' ? t('list.submit', 'Submit') : t('list.cancel', 'Cancel'),
            count: result.attempted,
          }),
        });
      } else if (result.failed.length > 0) {
        notify({
          severity: 'warning',
          scope: 'page',
          body: t('list.docstatusPartial', {
            defaultValue: '{{ok}} document(s) processed; {{failed}} failed ({{names}})',
            ok: result.attempted - result.failed.length,
            failed: result.failed.length,
            names: result.failed.join(', '),
          }),
        });
      } else {
        notify({
          severity: 'success',
          scope: 'page',
          body:
            action === 'submit'
              ? t('list.submitDone', {
                  defaultValue: 'Submitted {{count}} document(s)',
                  count: result.attempted,
                })
              : t('list.cancelDone', {
                  defaultValue: 'Cancelled {{count}} document(s)',
                  count: result.attempted,
                }),
        });
      }
      onClearSelection();
      onActionComplete();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('list.docstatusFailed', 'Bulk action failed'),
      });
    } finally {
      setDocstatusBusy(false);
    }
  };

  return (
    <XStack
      alignItems="center"
      flexWrap="wrap"
      {...knobProps.surface}
      {...knobProps.borderRadius}
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <Text
        {...knobProps.label}
        fontWeight="400"
        color="$color12">
        {t('list.selectedCount', {
          defaultValue: '{{count}} selected',
          count: selectedNames.length,
        })}
      </Text>
      {rights.write && (
        <Button
          size={knobProps.sizeToken}
          onPress={() => {
            setEditOpen(true);
          }}>
          {t('list.editTitle', 'Bulk Edit')}
        </Button>
      )}
      <Button
        size={knobProps.sizeToken}
        disabled={exporting}
        onPress={() => {
          void handleExport();
        }}>
        {exporting ? t('list.exporting', 'Exporting…') : t('list.export', 'Export CSV')}
      </Button>
      {showAssign && (
        <Button
          size={knobProps.sizeToken}
          onPress={() => {
            setAssignOpen(true);
          }}>
          {t('list.assignTitle', 'Assign To')}
        </Button>
      )}
      {showTags && (
        <Button
          size={knobProps.sizeToken}
          onPress={() => {
            setTagOpen(true);
          }}>
          {t('list.tagTitle', 'Add Tags')}
        </Button>
      )}
      {hostActions.map((action) => (
        <Button
          key={action.id}
          size={knobProps.sizeToken}
          onPress={() => {
            action.onPress({ doctype, selection: selectedNames });
          }}>
          {action.label}
        </Button>
      ))}
      {isSubmittable && rights.submit && (
        <Button
          size={knobProps.sizeToken}
          disabled={docstatusBusy}
          onPress={() => {
            setDocstatusAction('submit');
          }}>
          {t('list.submit', 'Submit')}
        </Button>
      )}
      {isSubmittable && rights.cancel && (
        <Button
          size={knobProps.sizeToken}
          disabled={docstatusBusy}
          onPress={() => {
            setDocstatusAction('cancel');
          }}>
          {t('list.cancel', 'Cancel')}
        </Button>
      )}
      {/* Busy is derived state — `loading` shows the spinner and skips the
          DG-ST-03 bare-disabled guardrail (catalog Toolbar precedent). */}
      {rights.delete && (
        <Button
          size={knobProps.sizeToken}
          error
          loading={deleting}
          onPress={() => {
            setConfirmDelete(true);
          }}>
          {t('list.delete', 'Delete')}
        </Button>
      )}
      <Button
        size={knobProps.sizeToken}
        chromeless
        onPress={onClearSelection}>
        {t('list.clearSelection', 'Clear selection')}
      </Button>

      {rights.delete && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          destructive
          title={t('list.deleteTitle', 'Delete documents')}
          body={t('list.deleteBody', {
            defaultValue: 'Permanently delete {{count}} {{doctype}} document(s)?',
            count: selectedNames.length,
            doctype,
          })}
          confirmLabel={t('list.delete', 'Delete')}
          onConfirm={() => {
            void handleDelete();
          }}
        />
      )}
      {showAssign && (
        <AssignToDialog
          doctype={doctype}
          names={selectedNames}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onDone={() => {
            onClearSelection();
            onActionComplete();
          }}
        />
      )}
      {showTags && (
        <AddTagsDialog
          doctype={doctype}
          names={selectedNames}
          open={tagOpen}
          onOpenChange={setTagOpen}
          onDone={() => {
            onClearSelection();
            onActionComplete();
          }}
        />
      )}
      {rights.write && (
        <BulkEditDialog
          doctype={doctype}
          meta={meta}
          names={selectedNames}
          open={editOpen}
          onOpenChange={setEditOpen}
          onDone={() => {
            onClearSelection();
            onActionComplete();
          }}
        />
      )}
      {isSubmittable && (rights.submit || rights.cancel) && (
        <ConfirmDialog
          open={docstatusAction !== undefined}
          onOpenChange={(open) => {
            if (!open) {
              setDocstatusAction(undefined);
            }
          }}
          warning={docstatusAction === 'cancel'}
          title={
            docstatusAction === 'cancel'
              ? t('list.cancelTitle', 'Cancel documents')
              : t('list.submitTitle', 'Submit documents')
          }
          body={
            docstatusAction === 'cancel'
              ? t('list.cancelBody', {
                  defaultValue: 'Cancel {{count}} submitted {{doctype}} document(s)?',
                  count: selectedNames.length,
                  doctype,
                })
              : t('list.submitBody', {
                  defaultValue: 'Submit {{count}} {{doctype}} document(s)?',
                  count: selectedNames.length,
                  doctype,
                })
          }
          confirmLabel={docstatusAction === 'cancel' ? t('list.cancel', 'Cancel') : t('list.submit', 'Submit')}
          onConfirm={() => {
            const action = docstatusAction;
            setDocstatusAction(undefined);
            if (action) {
              void handleDocstatusAction(action);
            }
          }}
        />
      )}
    </XStack>
  );
}

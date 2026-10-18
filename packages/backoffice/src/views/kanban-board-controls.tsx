// Board-doc controls for the kanban view (desk parity):
//   - KanbanBoardPicker — the "Select Kanban" switcher (saved Kanban Board
//     docs for the doctype) with a "New board…" entry
//   - CreateBoardDialog — name + grouping-field prompt for the REST insert
//   - KanbanColumnMenu — per-column "…" menu (archive; rename is omitted on
//     purpose: a column IS a Select option value, desk offers no rename)
//   - KanbanBoardEnd — the board-end "Add column" affordance (anchored after
//     the last column, where desk puts it) + restore menu for archived
//     columns

import { CaretDownIcon, DotsThreeIcon, PlusIcon } from '@phosphor-icons/react';
import { Data } from '@repo/frappe-ui';
import { sizeRecipeEscape, useResolvedKnobs } from '@repo/theme';
import { Button, ConfirmDialog, DropdownMenu, Text, XStack, YStack } from '@repo/ui';
import type { DropdownMenuEntry } from '@repo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isPresent } from '../desk/resolve-desk-path';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { dialogBodyMinWidth } from '../shared/measures';

import type { KanbanBoardColumnConfig } from './desk-view-configs';
import type { KanbanFieldOption } from './kanban-field-picker';

// ── Board picker ──────────────────────────────────────────────

export interface KanbanBoardPickerProps {
  /** Saved Kanban Board doc names for the doctype. */
  names: readonly string[];
  /** Name of the currently rendered board. */
  active?: string;
  onSelect: (name: string) => void;
  /** Offered as a trailing "New board…" entry when set. */
  onCreateNew?: () => void;
}

/**
 * Desk "Select Kanban" switcher: a labeled DropdownMenu listing the saved
 * boards (current one check-marked) plus a "New board…" entry. Selecting a
 * board navigates AND closes via the menu-level closeOnSelect (LC-21
 * COMMIT; ViewHeader switcher pattern).
 */
export const KanbanBoardPicker = ({ names, active, onSelect, onCreateNew }: KanbanBoardPickerProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width || 16;

  const items: DropdownMenuEntry[] = names.map((name) => ({
    key: name,
    label: name,
    checked: name === active,
    onSelect: () => {
      if (name !== active) {
        onSelect(name);
      }
    },
  }));
  if (onCreateNew) {
    if (items.length > 0) {
      items.push({ separator: true });
    }
    items.push({
      key: '__new-board__',
      label: t('views.kanbanBoardNew', 'New board…'),
      icon: <PlusIcon size={iconSize} />,
      onSelect: onCreateNew,
    });
  }

  return (
    <XStack
      {...knobProps.gap}
      alignItems="center">
      <Text
        color="$color10"
        {...knobProps.label}>
        {t('views.kanbanBoard', 'Board')}
      </Text>
      <DropdownMenu
        items={items}
        closeOnSelect
        placement="bottom-start">
        <Button
          size={knobProps.sizeToken}
          iconAfter={CaretDownIcon}
          aria-label={t('views.kanbanBoardSwitch', 'Switch board')}>
          {active ?? t('views.kanbanBoardNone', 'No board')}
        </Button>
      </DropdownMenu>
    </XStack>
  );
};

// ── Create-board dialog ───────────────────────────────────────

export interface CreateBoardDialogProps {
  doctype: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Select fields on offer as the board's grouping axis. */
  fieldOptions: readonly KanbanFieldOption[];
  /** Preselected grouping field (the view's current axis). */
  defaultField?: string;
  /** Persist the board; resolve on success (failures notify upstream). */
  onCreate: (boardName: string, fieldName: string) => Promise<void>;
}

/**
 * Desk "New Kanban Board" prompt: board name + the Select field its columns
 * map onto (columns are seeded from that field's options).
 */
export const CreateBoardDialog = ({
  doctype,
  open,
  onOpenChange,
  fieldOptions,
  defaultField,
  onCreate,
}: CreateBoardDialogProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const [name, setName] = useState('');
  const [fieldname, setFieldname] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const isOffered = (candidate: string | undefined): candidate is string =>
    isPresent(candidate) && fieldOptions.some((option) => option.fieldname === candidate);
  const effectiveField = [fieldname, defaultField].find(isOffered) ?? fieldOptions[0]?.fieldname;
  const fieldLabel = fieldOptions.find((option) => option.fieldname === effectiveField)?.label ?? effectiveField;

  const fieldItems: DropdownMenuEntry[] = fieldOptions.map((option) => ({
    key: option.fieldname,
    label: option.label,
    checked: option.fieldname === effectiveField,
    onCheckedChange: () => {
      setFieldname(option.fieldname);
    },
  }));

  const handleConfirm = async () => {
    const boardName = name.trim();
    if (!boardName || !effectiveField || busy) {
      return;
    }
    setBusy(true);
    // oxlint-disable-next-line react/todo -- the compiler can't lower try/finally yet; it skips this handler
    try {
      await onCreate(boardName, effectiveField);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  let confirmDisabledReason: string | undefined;
  if (!name.trim()) {
    confirmDisabledReason = t('views.kanbanBoardCreateMissingName', 'Enter a board name');
  } else if (!isPresent(effectiveField)) {
    confirmDisabledReason = t('views.kanbanBoardCreateMissingField', 'No Select field to group by');
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('views.kanbanBoardCreateTitle', 'New kanban board')}
      confirmLabel={
        busy ? t('views.kanbanBoardCreateBusy', 'Creating…') : t('views.kanbanBoardCreateConfirm', 'Create board')
      }
      confirmDisabled={!name.trim() || !effectiveField || busy}
      confirmDisabledReason={confirmDisabledReason}
      onConfirm={() => {
        void handleConfirm();
      }}>
      <YStack
        gap="$3"
        minWidth={dialogBodyMinWidth}>
        <Text
          color="$color11"
          fontSize="$3">
          {t('views.kanbanBoardCreateBody', {
            defaultValue: "Columns come from the chosen field's options ({{doctype}}).",
            doctype,
          })}
        </Text>
        <Data
          label={t('views.kanbanBoardCreateName', 'Board name')}
          placeholder={t('views.kanbanBoardCreateNamePlaceholder', 'e.g. Test Board')}
          value={name}
          onChange={(value) => {
            setName(value);
          }}
          required
        />
        <XStack
          gap="$2"
          alignItems="center">
          <Text
            color="$color10"
            fontSize="$2">
            {t('views.kanbanBoardCreateField', 'Group by')}
          </Text>
          {/* LC-21 COMMIT: single-select radio-style picker — the pick
              completes the contract, so the menu closes on select. */}
          <DropdownMenu
            items={fieldItems}
            closeOnSelect
            placement="bottom-start">
            <Button
              size="$3"
              iconAfter={CaretDownIcon}
              aria-label={t('views.kanbanBoardCreateFieldSwitch', 'Choose grouping field')}>
              {fieldLabel ?? t('views.kanbanBoardCreateMissingField', 'No Select field to group by')}
            </Button>
          </DropdownMenu>
        </XStack>
      </YStack>
    </ConfirmDialog>
  );
};

// ── Per-column menu ───────────────────────────────────────────

export interface KanbanColumnMenuProps {
  /** Column value (= the Select option / board column_name). */
  column: string;
  onArchive: () => void;
}

/**
 * Per-column "…" menu. Archive is the only entry on purpose: board columns
 * support Active/Archived (Kanban Board Column.status); rename would orphan
 * the cards (a column IS a field option value — desk offers no rename
 * either).
 */
export const KanbanColumnMenu = ({ column, onArchive }: KanbanColumnMenuProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width || 16;
  const items: DropdownMenuEntry[] = [
    {
      key: 'archive',
      label: t('views.kanbanColumnArchive', 'Archive column'),
      onSelect: onArchive,
    },
  ];
  return (
    <DropdownMenu
      items={items}
      placement="bottom-end">
      <Button
        size={knobProps.sizeToken}
        circular
        chromeless
        icon={<DotsThreeIcon size={iconSize} />}
        aria-label={t('views.kanbanColumnMenu', {
          defaultValue: 'Column options: {{column}}',
          column,
        })}
      />
    </DropdownMenu>
  );
};

// ── Board-end: add column + archived restore ──────────────────

export interface KanbanBoardEndProps {
  /** Archived board columns, restorable from the menu here. */
  archivedColumns: readonly KanbanBoardColumnConfig[];
  /** All existing column names (any status) for the duplicate guard. */
  existingColumns: readonly string[];
  onAddColumn: (columnName: string) => Promise<void>;
  onRestoreColumn: (columnName: string) => void;
}

/**
 * Anchored board-end affordances (desk puts "Add Column" after the last
 * column, never in detached chrome): an add-column prompt plus a restore
 * menu when archived columns exist.
 */
export const KanbanBoardEnd = ({
  archivedColumns,
  existingColumns,
  onAddColumn,
  onRestoreColumn,
}: KanbanBoardEndProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const [addOpen, setAddOpen] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [busy, setBusy] = useState(false);

  const trimmed = columnName.trim();
  const duplicate = trimmed.length > 0 && existingColumns.includes(trimmed);

  const restoreItems: DropdownMenuEntry[] = [];
  for (const { column_name: archivedName } of archivedColumns) {
    if (isPresent(archivedName)) {
      restoreItems.push({
        key: archivedName,
        label: archivedName,
        onSelect: () => {
          onRestoreColumn(archivedName);
        },
      });
    }
  }

  const handleConfirm = async () => {
    if (!trimmed || duplicate || busy) {
      return;
    }
    setBusy(true);
    // oxlint-disable-next-line react/todo -- the compiler can't lower try/finally yet; it skips this handler
    try {
      await onAddColumn(trimmed);
      setColumnName('');
    } finally {
      setBusy(false);
    }
  };

  let addDisabledReason: string | undefined;
  if (duplicate) {
    addDisabledReason = t('views.kanbanAddColumnDuplicate', {
      defaultValue: 'Column "{{name}}" already exists',
      name: trimmed,
    });
  } else if (!trimmed) {
    addDisabledReason = t('views.kanbanAddColumnMissingName', 'Enter a column name');
  }

  return (
    <YStack
      {...knobProps.gap}
      minWidth={sizeRecipeEscape(160, 'kanban controls: a floor so the add-column button keeps its label')}
      alignItems="stretch">
      <Button
        size={knobProps.sizeToken}
        icon={PlusIcon}
        onPress={() => {
          setAddOpen(true);
        }}>
        {
          // oxlint-disable-next-line sonarjs/no-duplicate-string -- i18n default values stay literal beside their keys
          t('views.kanbanAddColumn', 'Add column')
        }
      </Button>
      {restoreItems.length > 0 && (
        <DropdownMenu
          items={restoreItems}
          placement="bottom-end">
          <Button
            size={knobProps.sizeToken}
            chromeless
            iconAfter={CaretDownIcon}
            aria-label={t('views.kanbanArchivedRestore', 'Restore an archived column')}>
            {t('views.kanbanArchivedColumns', {
              defaultValue: 'Archived ({{count}})',
              count: archivedColumns.length,
            })}
          </Button>
        </DropdownMenu>
      )}
      <ConfirmDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t('views.kanbanAddColumnTitle', 'Add column')}
        confirmLabel={
          busy ? t('views.kanbanAddColumnBusy', 'Adding…') : t('views.kanbanAddColumnConfirm', 'Add column')
        }
        confirmDisabled={!trimmed || duplicate || busy}
        confirmDisabledReason={addDisabledReason}
        onConfirm={() => {
          void handleConfirm();
        }}>
        <YStack
          gap="$3"
          minWidth={dialogBodyMinWidth}>
          <Data
            label={t('views.kanbanAddColumnName', 'Column name')}
            placeholder={t('views.kanbanAddColumnPlaceholder', 'e.g. In Review')}
            value={columnName}
            onChange={(value) => {
              setColumnName(value);
            }}
            required
          />
        </YStack>
      </ConfirmDialog>
    </YStack>
  );
};

// Desk "kanban" view parity: driven by Kanban Board docs when they exist —
// a board picker (desk "Select Kanban") chooses among saved boards via the
// `?board=` search param, the selected board's columns render in ITS saved
// child-table order (indicator colors, archived columns hidden) and its
// saved filters scope the card query. Board management is desk-shaped:
// create a board (REST insert, columns seeded from the field's options),
// add a column (anchored after the last column), archive/restore columns
// (per-column "…" menu + board-end restore list). Doctypes with no boards
// fall back to a Select field (info banner + create-board CTA) — a
// "status"-named Select wins, else the first Select with options. A
// board-field picker switches the grouping axis at runtime. Card drag
// persists the axis field via FrappeKanban's live collection (optimistic;
// drag = pointer/keyboard on web, long-press on native); card click opens
// the form; the per-column "+" (anchored in each column header) opens the
// new-doc form prefilled with the clicked column (`?d=`).

import { PlusIcon } from '@phosphor-icons/react';
import { FrappeKanban, useDocRights, useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeKanbanProps, KanbanColumn } from '@repo/frappe-ui';
import { useResolvedKnobs } from '@repo/theme';
import { Alert, Button, Text, XStack, YStack, notify } from '@repo/ui';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities, useBackofficeNavigator, useBackofficePaths } from '../config/BackofficeProvider';
import { isPresent } from '../desk/resolve-desk-path';
import { useDeskScope } from '../desk/scope';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import { useViewConnection } from './connection';
import { useKanbanBoard } from './desk-view-configs';
import type { KanbanBoardDoc } from './desk-view-configs';
import { CreateBoardDialog, KanbanBoardEnd, KanbanBoardPicker, KanbanColumnMenu } from './kanban-board-controls';
import { addKanbanColumn, createKanbanBoard, parseBoardFilters, setKanbanColumnStatus } from './kanban-board-ops';
import { KanbanFieldPicker, kanbanFieldCandidates, preferredKanbanField } from './kanban-field-picker';
import type { KanbanFieldOption } from './kanban-field-picker';
import { detectCardFields, selectFieldOptions, useViewMeta } from './view-meta';
import type { AnyDoc, DetectedCardFields } from './view-meta';
import { ViewError, ViewLoading, ViewUnsupported } from './ViewStates';

// The `one` compiler breaks explicit JSX generics (it injects
// data-one-source attributes), so instantiate the generic wrapper once.
// SAFETY: FrappeKanban is generic over its doc type; this pins that parameter to AnyDoc.
const KanbanOfDoc = FrappeKanban as (props: FrappeKanbanProps<AnyDoc>) => ReactElement;

/**
 * Desk indicator color names (Kanban Board Column.indicator Select options)
 * mapped to theme tokens — hex literals are banned in features/**.
 */
const INDICATOR_TOKENS = new Map([
  ['Blue', '$blue9'],
  ['Cyan', '$blue8'],
  ['Gray', '$gray9'],
  ['Green', '$green9'],
  ['Light Blue', '$blue7'],
  ['Orange', '$orange9'],
  ['Pink', '$pink9'],
  ['Purple', '$purple9'],
  ['Red', '$red9'],
  ['Yellow', '$yellow9'],
]);

const indicatorToken = (indicator: string | undefined): string | undefined =>
  indicator === undefined ? undefined : INDICATOR_TOKENS.get(indicator);

/** Active (non-archived) board columns in board order, indicator → token. */
const boardDrivenColumns = (board: KanbanBoardDoc | undefined): KanbanColumn[] => {
  if (!isPresent(board?.field_name)) {
    return [];
  }
  const columns: KanbanColumn[] = [];
  for (const column of board?.columns ?? []) {
    const name = column.column_name;
    if (column.status !== 'Archived' && isPresent(name)) {
      columns.push({ value: name, title: name, color: indicatorToken(column.indicator) });
    }
  }
  return columns;
};

export interface KanbanViewProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
  /** Kanban Board doc name override (`?board=` search param). */
  board?: string;
  /** Card-open override. Default: navigate to the document form. */
  onCardOpen?: (doctype: string, name: string) => void;
  /** Disable card dragging and board management (read-only visualization). */
  readOnly?: boolean;
}

// oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity, react-doctor/no-giant-component -- board/axis resolution plus board-management handlers; splitting it is a separate refactor
export const KanbanView = ({ doctype, board: boardOverride, onCardOpen, readOnly }: KanbanViewProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const { newDoc } = useBackofficeCapabilities();
  const { knobProps } = useResolvedKnobs();
  const deskScope = useDeskScope();
  const connection = useViewConnection();
  const { meta, isLoading: isMetaLoading, error: metaError } = useViewMeta(doctype);
  const boards = useKanbanBoard(connection, doctype, boardOverride);
  const { rights } = useDocRights(useFrappeConfig(), meta);
  // Session-scoped grouping-axis override from the picker, keyed by doctype
  // so navigating to another doctype never inherits a stale field.
  const [axisChoice, setAxisChoice] = useState<{ doctype: string; fieldname: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (isMetaLoading || boards.isLoading) {
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

  const board = boards.doc;
  const boardFieldName = board?.field_name;
  const boardColumns = boardDrivenColumns(board);
  const hasBoard = Boolean(board?.field_name) && boardColumns.length > 0;
  const candidates = meta ? kanbanFieldCandidates(meta) : [];

  // Grouping axes on offer: the board's field first (desk behavior), then
  // every visible Select field with options, deduped by fieldname.
  const axisOptions: KanbanFieldOption[] = [];
  if (hasBoard && isPresent(boardFieldName)) {
    const boardField = meta?.fields.find((field) => field.fieldname === boardFieldName);
    axisOptions.push({
      fieldname: boardFieldName,
      label: boardField?.label ?? boardFieldName,
    });
  }
  for (const field of candidates) {
    if (!axisOptions.some((option) => option.fieldname === field.fieldname)) {
      axisOptions.push({ fieldname: field.fieldname, label: field.label ?? field.fieldname });
    }
  }

  // Effective axis: user override → board field_name → Select field named
  // "status" → first Select field with options.
  const override =
    axisChoice &&
    axisChoice.doctype === doctype &&
    axisOptions.some((option) => option.fieldname === axisChoice.fieldname)
      ? axisChoice.fieldname
      : undefined;
  const statusField = override ?? (hasBoard ? board?.field_name : preferredKanbanField(candidates)?.fieldname);

  // The saved board governs (its column order, filters, and column ops)
  // only while its own field is the active grouping axis.
  const boardGoverns = hasBoard && Boolean(board) && statusField === board?.field_name;

  // Columns: the board's child table when the board governs (custom order +
  // indicator colors), else the Select options newline list in declaration
  // order.
  let columns: KanbanColumn[] = [];
  if (isPresent(statusField)) {
    if (boardGoverns) {
      columns = boardColumns;
    } else {
      const field = candidates.find((candidate) => candidate.fieldname === statusField);
      if (field) {
        columns = selectFieldOptions(field).map((option) => ({ value: option, title: option }));
      }
    }
  }

  const goToBoard = (name: string) => {
    navigator.navigate(`${paths.view(doctype, 'kanban')}?board=${encodeURIComponent(name)}`);
  };

  const handleCreateBoard = async (boardName: string, fieldName: string) => {
    if (!connection) {
      return;
    }
    const field = candidates.find((candidate) => candidate.fieldname === fieldName);
    try {
      const created = await createKanbanBoard(connection, {
        doctype,
        boardName,
        fieldName,
        columns: field ? selectFieldOptions(field) : [],
      });
      notify({
        severity: 'success',
        scope: 'page',
        body: t('views.kanbanBoardCreated', {
          defaultValue: 'Board "{{name}}" created',
          name: created,
        }),
      });
      setCreateOpen(false);
      setAxisChoice(null);
      goToBoard(created);
      boards.reload();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('views.kanbanBoardCreateFailed', "Couldn't create the board"),
      });
    }
  };

  const handleAddColumn = async (columnName: string) => {
    if (!connection || !board) {
      return;
    }
    try {
      await addKanbanColumn(connection, board, columnName);
      notify({
        severity: 'success',
        scope: 'page',
        body: t('views.kanbanColumnAdded', {
          defaultValue: 'Column "{{name}}" added',
          name: columnName,
        }),
      });
      boards.reload();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body: error instanceof Error ? error.message : t('views.kanbanAddColumnFailed', "Couldn't add the column"),
      });
    }
  };

  const handleColumnStatus = async (columnName: string, status: 'Active' | 'Archived') => {
    if (!connection || !board) {
      return;
    }
    try {
      await setKanbanColumnStatus(connection, board, columnName, status);
      notify({
        severity: 'success',
        scope: 'page',
        body:
          status === 'Archived'
            ? t('views.kanbanColumnArchived', {
                defaultValue: 'Column "{{name}}" archived',
                name: columnName,
              })
            : t('views.kanbanColumnRestored', {
                defaultValue: 'Column "{{name}}" restored',
                name: columnName,
              }),
      });
      boards.reload();
    } catch (error) {
      notify({
        severity: 'error',
        scope: 'page',
        body:
          error instanceof Error ? error.message : t('views.kanbanColumnStatusFailed', "Couldn't update the column"),
      });
    }
  };

  if (!isPresent(statusField) || columns.length === 0) {
    return (
      <ViewUnsupported
        doctype={doctype}
        title={t('views.kanbanUnsupported', 'No Select field to board by')}
        description={t(
          'views.kanbanUnsupportedDetail',
          '{{doctype}} has no kanban board and no Select field with options to group cards by.',
          { doctype },
        )}
      />
    );
  }

  const { titleField, extraFields }: DetectedCardFields = meta
    ? detectCardFields(meta, [statusField])
    : { titleField: 'name', extraFields: [] };
  // SAFETY: every entry is a fieldname of this doctype, and AnyDoc keys are its fieldnames.
  const fields = [...new Set(['name', statusField, titleField, ...extraFields])] as readonly (keyof AnyDoc)[];

  const boardFilters = boardGoverns ? parseBoardFilters(board?.filters) : [];
  // Desk scope (GL-5) ANDs into the card query alongside board filters.
  const cardFilters = [...deskScope, ...boardFilters];
  const manageBoard = boardGoverns && !readOnly && Boolean(board);
  const archivedColumns = (board?.columns ?? []).filter(
    (column) => column.status === 'Archived' && isPresent(column.column_name),
  );
  const existingColumns = (board?.columns ?? [])
    .map((column) => column.column_name)
    .filter((name): name is string => Boolean(name));
  const canCreateBoard = !readOnly && candidates.length > 0 && Boolean(connection);

  return (
    <YStack
      flex={1}
      {...knobProps.gap}>
      {!hasBoard && (
        <Alert
          intent="info"
          title={t('views.kanbanFallback', 'No kanban board configured')}>
          <YStack
            {...knobProps.gap}
            alignItems="flex-start">
            <Text fontSize="$3">
              {t(
                'views.kanbanFallbackDetail',
                'Grouping by the "{{field}}" select field instead. Create a Kanban Board for {{doctype}} to customize columns.',
                { field: statusField, doctype },
              )}
            </Text>
            {canCreateBoard && (
              <Button
                size="$3"
                icon={PlusIcon}
                onPress={() => {
                  setCreateOpen(true);
                }}>
                {t('views.kanbanBoardCreateConfirm', 'Create board')}
              </Button>
            )}
          </YStack>
        </Alert>
      )}
      {(boards.names.length > 0 || axisOptions.length > 1) && (
        <XStack
          {...knobProps.gap}
          {...knobProps.panelPadding}
          paddingTop={0}
          alignItems="center"
          flexWrap="wrap">
          {boards.names.length > 0 && (
            <KanbanBoardPicker
              names={boards.names}
              active={board?.name}
              onSelect={(name) => {
                setAxisChoice(null);
                goToBoard(name);
              }}
              onCreateNew={
                canCreateBoard
                  ? () => {
                      setCreateOpen(true);
                    }
                  : undefined
              }
            />
          )}
          {axisOptions.length > 1 && (
            <KanbanFieldPicker
              options={axisOptions}
              active={statusField}
              onSelect={(fieldname) => {
                setAxisChoice({ doctype, fieldname });
              }}
            />
          )}
        </XStack>
      )}
      <KanbanOfDoc
        doctype={doctype}
        columns={columns}
        statusField={statusField}
        titleField={titleField}
        fields={fields}
        filters={cardFilters}
        renderCard={(item) => (
          <YStack
            {...knobProps.panelPadding}
            gap="$1">
            <Text
              {...knobProps.label}
              fontWeight="400"
              numberOfLines={3}>
              {
                // oxlint-disable-next-line typescript/no-base-to-string -- card cells are scalar doc values; String() is the display coercion
                String(item[titleField] ?? item.name ?? '')
              }
            </Text>
            {extraFields.map((fieldname) => {
              const value = item[fieldname];
              if (value === null || value === undefined || value === '') {
                return null;
              }
              return (
                <Text
                  key={fieldname}
                  {...knobProps.label}
                  fontWeight="400"
                  color="$color10"
                  numberOfLines={1}>
                  {
                    // oxlint-disable-next-line typescript/no-base-to-string -- card cells are scalar doc values; String() is the display coercion
                    String(value)
                  }
                </Text>
              );
            })}
          </YStack>
        )}
        onCardClick={(card) => {
          const { name } = card;
          if (!isPresent(name)) {
            return;
          }
          if (onCardOpen) {
            onCardOpen(doctype, name);
          } else {
            navigator.navigate(paths.form(doctype, name));
          }
        }}
        readOnly={readOnly ?? !rights.write}
        // Desk parity: the per-column "+" (anchored in the column header by
        // FrappeKanban) carries the clicked column into the create form —
        // the active grouping axis is prefilled via the `?d=` param on the
        // /new route (consumed by NewDocRouteScreen → createPrefill). The
        // newDoc capability and the session's create right gate the
        // affordance.
        enableCardCreation={newDoc.enabled && rights.create}
        onCreateCard={(columnValue) => {
          navigator.navigate(paths.newDoc(doctype, { [statusField]: columnValue }));
        }}
        {...(manageBoard && {
          renderColumnActions: (column: { id: string }) =>
            column.id === '__unassigned__' ? null : (
              <KanbanColumnMenu
                column={column.id}
                onArchive={() => {
                  void handleColumnStatus(column.id, 'Archived');
                }}
              />
            ),
          boardEnd: (
            <KanbanBoardEnd
              archivedColumns={archivedColumns}
              existingColumns={existingColumns}
              onAddColumn={handleAddColumn}
              onRestoreColumn={(name) => {
                void handleColumnStatus(name, 'Active');
              }}
            />
          ),
        })}
        // oxlint-disable-next-line react/no-unstable-nested-components -- render callback FrappeKanban calls with the error, not a component type
        error={(err) => (
          <ViewError
            doctype={doctype}
            error={err}
          />
        )}
        minColumnHeight={420}
        flex={1}
      />
      <CreateBoardDialog
        doctype={doctype}
        open={createOpen}
        onOpenChange={setCreateOpen}
        fieldOptions={axisOptions}
        {...(statusField && { defaultField: statusField })}
        onCreate={handleCreateBoard}
      />
    </YStack>
  );
};

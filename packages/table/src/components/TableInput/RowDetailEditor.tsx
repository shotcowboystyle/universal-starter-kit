/**
 * RowDetailEditor — the child-table row opened as a form (the grid
 * row's "Edit" form). The grid shows the list-view columns; the detail editor
 * shows every `columns` entry for one row, full-size, in a dialog.
 *
 * Same staging contract as CellModalEditor (UX-023): the fields edit a draft
 * copy of the row seeded on open. "Done" and an outside click commit the
 * draft once; "Cancel" and Escape discard it. A read-only row opens for
 * viewing with a single "Close".
 *
 * The pencil is the dialog's `Dialog.Trigger`: tamagui's modal close returns
 * focus to the trigger ref and nowhere else, so without it every close
 * dropped focus on <body> (MPO-471).
 */

import { PencilSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { TableCellContext } from '@repo/table-primitives';
import { useResolvedKnobs } from '@repo/theme';
import { DialogContent, DialogOverlay, ScrollView } from '@repo/ui';
import { useCallback, useRef, useState } from 'react';
import { Dialog, Text, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableColumn, DataTableData } from '../../types';
import { withInterp } from '../../utils/with-interp';
import { DataTableCell } from '../DataTableCell';

import { changedColumns, columnKey } from './shared';
import type { ChildCellHidden } from './shared';

/** The detail form renders full-size editors, not in-cell ones. */
const OUTSIDE_TABLE_CELL = { inTableCell: false };

export interface RowDetailEditorProps<TData extends DataTableData> {
  row: TData;
  rowIndex: number;
  columns: DataTableColumn<TData>[];
  readOnly: boolean;
  compact: boolean;
  isCellHidden?: ChildCellHidden<TData>;
  /** Receives the edited row once per session, only when a value changed. */
  onCommit: (row: TData, changed: string[]) => void;
}

export const RowDetailEditor = <TData extends DataTableData>({
  row,
  rowIndex,
  columns,
  readOnly,
  compact,
  isCellHidden,
  onCommit,
}: RowDetailEditorProps<TData>) => {
  const { knobProps } = useResolvedKnobs({ compact });
  const [draft, setDraft] = useState<TData | null>(null);
  const draftRef = useRef(draft);
  // Latest-value refs: the dialog's open/close callbacks read these after commit, never during render.
  // oxlint-disable-next-line react/refs -- latest-value ref sync; read only from event handlers
  draftRef.current = draft;
  const rowRef = useRef(row);
  // oxlint-disable-next-line react/refs -- latest-value ref sync; read only from event handlers
  rowRef.current = row;
  const onCommitRef = useRef(onCommit);
  // oxlint-disable-next-line react/refs -- latest-value ref sync; read only from event handlers
  onCommitRef.current = onCommit;
  const discardRef = useRef(false);
  const rowNumber = rowIndex + 1;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        discardRef.current = false;
        const seeded = { ...rowRef.current };
        draftRef.current = seeded;
        setDraft(seeded);
        return;
      }
      const active = draftRef.current;
      if (!discardRef.current && !readOnly && active) {
        const changed = changedColumns(rowRef.current, active, columns);
        if (changed.length > 0) {
          onCommitRef.current(active, changed);
        }
      }
      discardRef.current = false;
      draftRef.current = null;
      setDraft(null);
    },
    [columns, readOnly],
  );

  const handleCancel = useCallback(() => {
    discardRef.current = true;
    handleOpenChange(false);
  }, [handleOpenChange]);

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cell editors emit the raw field value of whatever type the column holds
  const setDraftValue = useCallback((columnId: string, value: unknown) => {
    const { current } = draftRef;
    if (!current) {
      return;
    }
    // SAFETY: columnId is a key of the row's own columns and value comes from that column's editor
    const next = { ...current, [columnId]: value } as TData;
    draftRef.current = next;
    setDraft(next);
  }, []);

  const triggerLabel = withInterp(t(readOnly ? 'View row {{row}}' : 'Edit row {{row}}', { row: rowNumber }), {
    row: rowNumber,
  });
  const current = draft ?? row;

  return (
    <Dialog
      open={draft !== null}
      onOpenChange={handleOpenChange}
      modal>
      <Dialog.Trigger asChild>
        <Button
          chromeless
          compact={compact}
          hitSlop={knobProps.nestedControl.hitSlop}
          aria-label={triggerLabel}>
          <PencilSimpleIcon size={16} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <DialogOverlay opacity={0.5} />
        <DialogContent
          maxWidth={720}
          maxHeight="80vh"
          width="90vw"
          onEscapeKeyDown={() => {
            discardRef.current = true;
          }}>
          <Dialog.Title {...knobProps.heading}>
            {withInterp(t('Row {{row}}', { row: rowNumber }), { row: rowNumber })}
          </Dialog.Title>
          <ScrollView
            flexShrink={1}
            minHeight={0}>
            <TableCellContext.Provider value={OUTSIDE_TABLE_CELL}>
              <YStack {...knobProps.gapLg}>
                {columns.map((col) => {
                  const columnId = columnKey(col);
                  if (isCellHidden?.(current, columnId, rowIndex)) {
                    return null;
                  }
                  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ColumnDef header is a string or a render function; only a string is a label
                  const label = typeof col.header === 'string' ? col.header : columnId;
                  return (
                    <YStack
                      key={columnId}
                      {...knobProps.gap}>
                      <Text {...knobProps.label}>{label}</Text>
                      <DataTableCell
                        // SAFETY: columnId comes from columnKey(col), a key of this row's own columns
                        value={current[columnId as keyof TData]}
                        onChange={(value) => {
                          setDraftValue(columnId, value);
                        }}
                        field={col.field ?? 'input'}
                        fieldProps={col.fieldProps}
                        readOnly={readOnly}
                        compact={false}
                        columnId={columnId}
                        columnLabel={label}
                        rowIndex={rowIndex}
                        rowData={current}
                      />
                    </YStack>
                  );
                })}
              </YStack>
            </TableCellContext.Provider>
          </ScrollView>
          <XStack
            {...knobProps.gap}
            justifyContent="flex-end">
            {readOnly ? (
              <Button onPress={handleCancel}>{t('Close')}</Button>
            ) : (
              <>
                <Button onPress={handleCancel}>{t('Cancel')}</Button>
                <Button
                  theme="accent"
                  onPress={() => {
                    handleOpenChange(false);
                  }}>
                  {t('Done')}
                </Button>
              </>
            )}
          </XStack>
        </DialogContent>
      </Dialog.Portal>
    </Dialog>
  );
};

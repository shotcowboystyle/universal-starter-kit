/**
 * RowDetailEditor (native) — the row form as a FloatingPanel bottom sheet,
 * the same dialog/sheet split CellModalEditor.native makes. Props, staging
 * and footer match ./RowDetailEditor.tsx; backdrop tap and Android back
 * commit like "Done".
 */

import { Button, FloatingPanel } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { useCallback, useRef, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';
import type { DataTableData, DataTableField, DataTableFieldProps } from '../../types';
import { withInterp } from '../../utils/withInterp';
import { DataTableCell } from '../DataTableCell';

import type { RowDetailEditorProps } from './RowDetailEditor';
import { changedColumns, columnKey } from './shared';

export type { RowDetailEditorProps } from './RowDetailEditor';

export function RowDetailEditor<TData extends DataTableData>({
  row,
  rowIndex,
  columns,
  readOnly,
  compact,
  isCellHidden,
  onCommit,
}: RowDetailEditorProps<TData>) {
  const { knobProps } = useResolvedKnobs({ compact });
  const [draft, setDraft] = useState<TData | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const rowRef = useRef(row);
  rowRef.current = row;
  const onCommitRef = useRef(onCommit);
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

  const setDraftValue = useCallback((columnId: string, value: unknown) => {
    const { current } = draftRef;
    if (!current) {
      return;
    }
    const next = { ...current, [columnId]: value } as TData;
    draftRef.current = next;
    setDraft(next);
  }, []);

  const triggerLabel = withInterp(t(readOnly ? 'View row {{row}}' : 'Edit row {{row}}', { row: rowNumber }), {
    row: rowNumber,
  });
  const current = draft ?? row;

  return (
    <FloatingPanel
      open={draft !== null}
      onOpenChange={handleOpenChange}
      scrollable
      triggerSizing="content"
      triggerA11y={{ label: triggerLabel }}
      trigger={
        <View
          alignItems="center"
          justifyContent="center">
          <PencilSimpleIcon size={16} />
        </View>
      }>
      <YStack {...knobProps.gapLg}>
        <Text {...knobProps.heading}>{withInterp(t('Row {{row}}', { row: rowNumber }), { row: rowNumber })}</Text>
        {columns.map((col) => {
          const columnId = columnKey(col);
          if (isCellHidden?.(current, columnId, rowIndex)) {
            return null;
          }
          const label = typeof col.header === 'string' ? col.header : columnId;
          return (
            <YStack
              key={columnId}
              {...knobProps.gap}>
              <Text {...knobProps.label}>{label}</Text>
              <DataTableCell
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
        <XStack
          {...knobProps.gap}
          justifyContent="flex-end">
          {readOnly ? (
            <Button onPress={handleCancel}>{t('Close')}</Button>
          ) : (
            <>
              <Button onPress={handleCancel}>{t('Cancel')}</Button>
              <Button
                onPress={() => {
                  handleOpenChange(false);
                }}>
                {t('Done')}
              </Button>
            </>
          )}
        </XStack>
      </YStack>
    </FloatingPanel>
  );
}

/**
 * CellModalEditor — wraps tall field types (FileUpload, Signature, RichText,
 * etc.) in a forms FloatingPanel that opens on cell click. The cell shows a
 * compact `FieldDisplay` summary; a click opens the full editor in a panel
 * that attaches to the cell it was opened from (MPO-38 cover contract), the
 * same FloatingPanel the native variant uses (a sheet there and at 640 and
 * below). It never grows the row (LC-06).
 *
 * The panel is a staging buffer (UX-023 / Axiom 7 AGENCY): the inner editor
 * is wired to a local draft seeded from the committed value on open — nothing
 * reaches the row while the panel is open. "Done" commits the draft once via
 * `onCommit`; an outside click also commits (LC-21: a cell editor's draft
 * still commits on the outside-click close); "Cancel" and Escape discard the
 * draft and leave the row untouched. Cancel is never disabled (LC-30) and the
 * footer stays within the two-action budget (LC-31).
 */

import { Button, FieldDisplay, FloatingPanel } from '@repo/forms';
import type { FieldDisplayType } from '@repo/forms';
import { TableCellContext } from '@repo/table-primitives';
import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View, XStack, YStack, isWeb } from 'tamagui';

import { t } from '../../shared/t';

export interface CellModalEditorProps {
  field: FieldDisplayType;
  value: any;
  fieldProps?: Record<string, any>;
  disabled?: boolean;
  readOnly?: boolean;
  /** Commits the staged draft to the row. Fires at most once per session. */
  onCommit: (value: any) => void;
  /**
   * Full editor mounted inside the panel, wired to the staged draft: render
   * with `draftValue` and report edits through `onDraftChange` — never
   * straight to the row.
   */
  children: (draftValue: any, onDraftChange: (value: any) => void) => ReactNode;
  /** Title shown in the panel header. */
  title?: string;
  /**
   * Accessible name for the chromeless cell trigger (column header).
   * Chromeless faces have no field label, so the trigger announces this.
   */
  label?: string;
}

export function CellModalEditor({
  field,
  value,
  fieldProps,
  disabled,
  readOnly,
  onCommit,
  children,
  title,
  label,
}: CellModalEditorProps) {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  // Draft session: exists only while the panel is open, seeded from the
  // committed value so the editor starts at the cell's current value
  // (Axiom 11 VALUE IS DATA).
  const [draft, setDraft] = useState<{ value: any } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // Escape / Cancel flag the close as a discard before onOpenChange(false)
  // lands; every other close path (Done, outside click) commits.
  const discardRef = useRef(false);

  const handleOpen = useCallback(() => {
    if (disabled || readOnly) {
      return;
    }
    discardRef.current = false;
    const seeded = { value: valueRef.current };
    draftRef.current = seeded;
    setDraft(seeded);
    setOpen(true);
  }, [disabled, readOnly]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        handleOpen();
        return;
      }
      const active = draftRef.current;
      if (!discardRef.current && active && !Object.is(active.value, valueRef.current)) {
        onCommitRef.current(active.value);
      }
      discardRef.current = false;
      draftRef.current = null;
      setDraft(null);
      setOpen(false);
    },
    [handleOpen],
  );

  // FloatingPanel reports every close as onOpenChange(false). Escape is a
  // dismissal, not a confirm, so it is flagged in the capture phase, before
  // the panel's own Escape listener closes it.
  useEffect(() => {
    if (!open || !isWeb || typeof document === 'undefined') {
      return;
    }
    const flagEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        discardRef.current = true;
      }
    };
    document.addEventListener('keydown', flagEscape, true);
    return () => {
      document.removeEventListener('keydown', flagEscape, true);
    };
  }, [open]);

  const handleCancel = useCallback(() => {
    discardRef.current = true;
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleDraftChange = useCallback((next: any) => {
    draftRef.current = { value: next };
    setDraft(draftRef.current);
  }, []);

  const triggerLocked = disabled ?? readOnly;
  const handleTriggerKeyDown = (event: { key?: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
    if (triggerLocked) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault?.();
      event.stopPropagation?.();
      handleOpen();
    }
  };

  const trigger = (
    <View
      cursor={triggerLocked ? 'default' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      flexDirection="row"
      alignItems="center"
      width="100%"
      paddingHorizontal="$1"
      paddingVertical="$1"
      hoverStyle={triggerLocked ? undefined : { backgroundColor: '$backgroundHover' }}
      // LC-71: parent CellWrapper paints the one ring on the cell boundary.
      outlineWidth={0}
      focusVisibleStyle={{ outlineWidth: 0 }}
      {...(isWeb && !triggerLocked
        ? {
            role: 'button' as const,
            tabIndex: 0,
            'aria-label': label,
            'aria-haspopup': 'dialog' as const,
            'aria-expanded': open,
            onKeyDown: handleTriggerKeyDown,
          }
        : undefined)}>
      <FieldDisplay
        field={field}
        value={value}
        fieldProps={fieldProps}
      />
    </View>
  );

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      disabled={triggerLocked}
      trigger={trigger}>
      <YStack
        {...knobProps.gap}
        width={720}
        maxWidth="90vw"
        data-testid="cell-modal-editor-panel"
        data-dismiss-class="compose">
        <Text {...knobProps.heading}>{title ?? t('Edit')}</Text>
        {/* The panel is not a table cell: restore full field chrome. React
            context flows in because the panel renders inline (no portal). */}
        <YStack
          flexShrink={1}
          minHeight={0}>
          <TableCellContext.Provider value={{ inTableCell: false }}>
            {children(draft ? draft.value : value, handleDraftChange)}
          </TableCellContext.Provider>
        </YStack>
        <XStack
          {...knobProps.gap}
          justifyContent="flex-end">
          {/* LC-30 CANCEL-ALWAYS-LIVE: the discard exit never disables. */}
          <Button onPress={handleCancel}>{t('Cancel')}</Button>
          <Button
            theme="accent"
            onPress={() => {
              handleOpenChange(false);
            }}>
            {t('Done')}
          </Button>
        </XStack>
      </YStack>
    </FloatingPanel>
  );
}

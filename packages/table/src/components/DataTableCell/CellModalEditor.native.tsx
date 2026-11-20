/**
 * CellModalEditor (native) — bottom-sheet editor for tall field types.
 *
 * The web implementation (./CellModalEditor.tsx) opens a centered Tamagui
 * Dialog sized with vh/vw units — neither the Dialog portal presentation nor
 * those units work on device. On native the owner's contract for oversized
 * cell edits is a bottom sheet, so this variant reuses the forms
 * FloatingPanel, whose native implementation is a React Native Modal bottom
 * sheet (same adaptive dialog/sheet split AdaptivePopup implements).
 *
 * Same props/API as ./CellModalEditor.tsx, same staging semantics (UX-023 /
 * Axiom 7 AGENCY): the inner editor edits a local draft seeded on open;
 * "Done" and backdrop-tap / Android-back commit the draft once through
 * `onCommit` (LC-21: the cell editor's draft commits on the outside close);
 * "Cancel" discards it. Cancel is never disabled (LC-30).
 */

import { FieldDisplay, FloatingPanel, Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useRef, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { t } from '../../shared/t';

import type { CellModalEditorProps } from './CellModalEditor';

export type { CellModalEditorProps } from './CellModalEditor';

export const CellModalEditor = <T,>({
  field,
  value,
  fieldProps,
  disabled,
  readOnly,
  onCommit,
  children,
  title,
  label,
}: CellModalEditorProps<T>) => {
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  // Draft session seeded from the committed value on open (Axiom 11).
  const [draft, setDraft] = useState<{ value: T } | null>(null);
  const draftRef = useRef(draft);
  // oxlint-disable-next-line react/refs -- latest-value ref: close handlers read the current draft synchronously
  draftRef.current = draft;
  const valueRef = useRef(value);
  // oxlint-disable-next-line react/refs -- latest-value ref: open/close handlers read the current committed value synchronously
  valueRef.current = value;
  const onCommitRef = useRef(onCommit);
  // oxlint-disable-next-line react/refs -- latest-callback ref: keeps handleOpenChange stable while calling the current onCommit
  onCommitRef.current = onCommit;
  // Cancel flags the close as a discard; Done and backdrop/back commit.
  const discardRef = useRef(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (disabled || readOnly) {
          return;
        }
        discardRef.current = false;
        const seeded = { value: valueRef.current };
        draftRef.current = seeded;
        setDraft(seeded);
        setOpen(true);
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
    [disabled, readOnly],
  );

  const handleCancel = useCallback(() => {
    discardRef.current = true;
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleDraftChange = useCallback((next: T) => {
    draftRef.current = { value: next };
    setDraft(draftRef.current);
  }, []);

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      disabled={disabled ?? readOnly}
      scrollable
      trigger={
        <View
          opacity={disabled ? 0.5 : 1}
          flexDirection="row"
          alignItems="center"
          width="100%"
          paddingHorizontal="$1"
          paddingVertical="$1"
          {...(label !== undefined && label !== ''
            ? { accessibilityLabel: label, accessibilityRole: 'button' as const }
            : undefined)}>
          <FieldDisplay
            field={field}
            value={value}
            fieldProps={fieldProps}
          />
        </View>
      }>
      <YStack {...knobProps.gap}>
        <Text {...knobProps.heading}>{title ?? t('Edit')}</Text>
        <YStack minHeight={0}>
          {/* oxlint-disable-next-line react/refs -- handleDraftChange writes refs only when the editor emits, never during render */}
          {children(draft ? draft.value : value, handleDraftChange)}
        </YStack>
        <XStack
          {...knobProps.gap}
          justifyContent="flex-end">
          {/* LC-30 CANCEL-ALWAYS-LIVE: the discard exit never disables. */}
          <Button onPress={handleCancel}>{t('Cancel')}</Button>
          <Button
            onPress={() => {
              handleOpenChange(false);
            }}>
            {t('Done')}
          </Button>
        </XStack>
      </YStack>
    </FloatingPanel>
  );
};

/**
 * CellOptionsEditor — popover/sheet host for option-group cell editors whose
 * full option list cannot fit the cell anchor (UX-022 / LC-06 OVERSIZED-EDIT:
 * a radio group's options are unreachable at narrow column widths when
 * rendered inline, clipped by the cell's overflow guard).
 *
 * The cell face is a compact FieldDisplay trigger showing the current option
 * label; pressing it opens a forms FloatingPanel — an anchored popover with
 * collision handling on desktop web, a bottom sheet on native and small
 * viewports — with the full option list, seeded at the cell's current value
 * (Axiom 11). COMMIT-class groups (`dismissOnPick`, default) close on a pick,
 * including re-picking the current value; COMPOSE-class groups (multi-select
 * toggles) stay open until Escape / outside click. The face is a keyboard
 * stop; the ring lives on the parent cell chrome (LC-71), not this node.
 */

import { FieldDisplay, FloatingPanel } from '@repo/forms';
import type { FieldDisplayType } from '@repo/forms';
import { TableCellContext } from '@repo/table-primitives';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View, isWeb } from 'tamagui';

export interface CellOptionsEditorProps {
  field: FieldDisplayType;
  value: any;
  fieldProps?: Record<string, any>;
  disabled?: boolean;
  /** Accessible name for the chromeless cell trigger (column header). */
  label?: string;
  /**
   * LC-21 COMMIT class (default): a pick — including re-picking the current
   * value — dismisses the panel. Set false for COMPOSE class (multi-select
   * toggles stay open so several options can be composed).
   */
  dismissOnPick?: boolean;
  /**
   * Option-group editor rendered inside the panel. `close` dismisses the
   * panel — call it after committing a pick (COMMIT-class dismissal).
   */
  children: (close: () => void) => ReactNode;
}

export function CellOptionsEditor({
  field,
  value,
  fieldProps,
  disabled,
  label,
  dismissOnPick = true,
  children,
}: CellOptionsEditorProps) {
  const [open, setOpen] = useState(false);

  const face = (
    <View
      flexDirection="row"
      alignItems="center"
      width="100%"
      paddingHorizontal="$1"
      paddingVertical="$1"
      opacity={disabled ? 0.5 : 1}
      // LC-71: the parent CellWrapper paints the one ring; this face must
      // not add a second outline on keyboard focus.
      outlineWidth={0}
      focusVisibleStyle={{ outlineWidth: 0 }}
      {...(disabled
        ? undefined
        : {
            role: 'button' as any,
            tabIndex: 0,
            'aria-label': label,
            'aria-expanded': open,
            cursor: 'pointer',
            hoverStyle: { backgroundColor: '$backgroundHover' },
          })}>
      <FieldDisplay
        field={field}
        value={value}
        fieldProps={fieldProps}
      />
    </View>
  );

  if (disabled) {
    return face;
  }

  // LC-21 COMMIT class: picking IS the exit — including re-picking the
  // already-selected option, which fires no onValueChange (Tamagui radio /
  // single ToggleGroup emit only on change), so the changed-pick close()
  // alone would strand the panel open. Deferred so the option's own
  // press/commit runs first. COMPOSE class skips this (panel stays open).
  const handlePanelPointerUp =
    isWeb && dismissOnPick
      ? (event: { target?: unknown }) => {
          const target = event?.target as { closest?: (sel: string) => unknown } | null;
          if (!target?.closest?.('[role="radio"], [role="checkbox"], [aria-pressed], label')) {
            return;
          }
          setTimeout(() => {
            setOpen(false);
          }, 0);
        }
      : undefined;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={setOpen}
      fitContent
      trigger={face}>
      {/* The panel is not a table cell — restore full option chrome. React
          context flows into the panel because it renders inline (no portal). */}
      <TableCellContext.Provider value={{ inTableCell: false }}>
        <View onPointerUp={handlePanelPointerUp}>
          {children(() => {
            setOpen(false);
          })}
        </View>
      </TableCellContext.Provider>
    </FloatingPanel>
  );
}

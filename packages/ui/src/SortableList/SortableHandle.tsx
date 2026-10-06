import { DotsSixVerticalIcon } from '@phosphor-icons/react';
import {
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { useState } from 'react';
import { View } from 'tamagui';

import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

import { useSortableDragging } from './use-sortable-rows';

const GRIP_PX = 16;

export interface SortableHandleProps {
  label: string;
  itemId: string;
  dragging?: boolean;
  compact?: boolean;
  onPointerDown?: (e: { pointerType?: string; clientY: number; preventDefault?: () => void }) => void;
  onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
}

/**
 * Leading grab handle: nested well, 16px 6-dot grip, opacity .6 → 1.
 * Focusable (W1-focus-ring): 2px ring, offset 0. Keyboard path can also
 * live on the row — this control is tabIndex 0 so tables have a target
 * that is not an in-cell editor.
 */
export const SortableHandle = ({ label, itemId, dragging, compact, onPointerDown, onKeyDown }: SortableHandleProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact });
  const well = knobProps.nestedControl.px;
  const [kb, setKb] = useState(false);
  const sourceDragging = useSortableDragging(itemId);
  const isDragging = dragging ?? sourceDragging;
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  const focusRing = kb ? keyboardFocusRingProps : undefined;
  const hostProps = {
    tag: 'button' as const,
    cursor: isDragging ? ('grabbing' as const) : ('grab' as const),
    hitSlop: knobProps.nestedControl.hitSlop,
    ...focusRing,
    'data-sortable-handle': itemId,
    'data-focus-ring': '2/0',
    onPointerDown: (e: { pointerType?: string; clientY: number; preventDefault?: () => void }) => onPointerDown?.(e),
    onKeyDown: (e: { key: string; preventDefault: () => void }) => onKeyDown?.(e),
    onFocus: () => {
      setKb(wasKeyboardFocus());
    },
    onBlur: () => {
      setKb(false);
    },
  };

  return (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders as a native <button> through hostProps.tag; the JSX element itself cannot be <button>
      role="button"
      tabIndex={0}
      aria-label={withInterp(t('Reorder {{label}}', { label }), { label })}
      width={well}
      height={well}
      minWidth={well}
      minHeight={well}
      alignItems="center"
      justifyContent="center"
      opacity={isDragging ? 1 : 0.6}
      hoverStyle={{ opacity: 1 }}
      {...hostProps}>
      <DotsSixVerticalIcon
        size={GRIP_PX}
        weight="bold"
      />
    </View>
  );
};

export const SortableHandleWell = ({ itemId, compact }: { itemId: string; compact?: boolean }) => {
  const { knobProps } = useResolvedKnobs({ compact });
  const well = knobProps.nestedControl.px;
  const wellProps = { 'data-sortable-well': itemId };
  return (
    <View
      width={well}
      height={well}
      minWidth={well}
      minHeight={well}
      {...wellProps}
    />
  );
};

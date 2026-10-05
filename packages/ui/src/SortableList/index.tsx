import {
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Text, View, XStack, YStack, type YStackProps } from 'tamagui';

import { useTranslation } from '../shared/i18n';
import { LIFT_SCALE } from '../views/kanbanDnd';

import { SortableHandle, SortableHandleWell } from './SortableHandle';
import { useSortableRows } from './useSortableRows';

export { SortableHandle, SortableHandleWell } from './SortableHandle';
export { SortableSessionProvider, useSortableRows } from './useSortableRows';
export type { SortableSession, UseSortableRowsOptions } from './useSortableRows';

export type SortableDisabledStyle = 'keepLabel' | 'dimWhole';

export type SortableListProps<T> = Omit<YStackProps, 'children' | 'onChange' | 'disabled' | 'aria-label'> & {
  items: T[];
  getId: (item: T, index: number) => string;
  getLabel: (item: T, index: number) => string;
  renderItem?: (item: T, index: number) => ReactNode;
  /** Canonical change: the reordered array. */
  onChange?: (next: T[]) => void;
  canReorder?: (item: T, index: number) => boolean;
  disabled?: boolean;
  readOnly?: boolean;
  disabledStyle?: SortableDisabledStyle;
  compact?: boolean;
  emptyMessage?: string;
  'aria-label'?: string;
};

const LIFT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
} as const;

export function SortableList<T>({
  items,
  getId,
  getLabel,
  renderItem,
  onChange,
  canReorder,
  disabled,
  readOnly,
  disabledStyle = 'keepLabel',
  compact,
  emptyMessage: emptyMessageProp,
  'aria-label': ariaLabel,
  ...stackProps
}: SortableListProps<T>) {
  const { t } = useTranslation();
  const emptyMessage = emptyMessageProp ?? t('No rows yet');
  const { knobProps } = useResolvedKnobs({ compact });
  const listId = useId();
  const containerRef = useRef<HTMLElement | null>(null);
  const enabled = !disabled && !readOnly && !!onChange;
  const [rowKb, setRowKb] = useState<string | null>(null);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  const sortable = useSortableRows({
    items,
    getId,
    getLabel,
    canReorder,
    onChange,
    enabled,
    containerRef,
  });

  const onRowFocus = useCallback(
    (id: string, index: number) => {
      sortable.setFocusedIndex(index);
      if (wasKeyboardFocus()) {
        setRowKb(id);
      }
    },
    [sortable],
  );

  return (
    <YStack
      ref={containerRef as never}
      {...knobProps.surface}
      {...knobProps.borderRadius}
      overflow="hidden"
      role="list"
      aria-label={ariaLabel}
      id={listId}
      {...stackProps}>
      {items.length === 0 ? (
        <YStack minHeight={88} alignItems="center" justifyContent="center" opacity={0.5}>
          <Text {...knobProps.body} color="$color11">
            {emptyMessage}
          </Text>
        </YStack>
      ) : (
        items.map((item, index) => {
          const id = sortable.ids[index];
          const label = sortable.labels[index];
          const canDrag = sortable.rowEnabled(index);
          const isSource = sortable.session?.id === id;
          const isKbFocus = rowKb === id && !sortable.session;
          const y = sortable.translateForIndex(index);
          const dimWhole = !canDrag && disabledStyle === 'dimWhole';
          return (
            <XStack
              key={id}
              role="listitem"
              tabIndex={canDrag || !enabled ? 0 : -1}
              minHeight={MIN_PRESS_TARGET}
              alignItems="center"
              gap="$2"
              paddingLeft="$2"
              paddingRight="$3"
              opacity={isSource && sortable.session?.mode === 'pointer' ? 0.4 : dimWhole ? 0.5 : 1}
              backgroundColor={isSource && sortable.session?.mode === 'pointer' ? '$color1' : 'transparent'}
              borderWidth={isSource && sortable.session?.mode === 'pointer' ? 1 : 0}
              borderStyle={isSource && sortable.session?.mode === 'pointer' ? 'dashed' : 'solid'}
              borderColor="$color7"
              y={y}
              hoverStyle={{ backgroundColor: '$color3' }}
              {...({
                ...(isKbFocus ? keyboardFocusRingProps : { outlineWidth: 0 }),
                'data-sortable-row': id,
                'aria-disabled': canDrag ? undefined : true,
                onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                  sortable.onRowKeyDown(index, e);
                },
                onFocus: () => {
                  onRowFocus(id, index);
                },
                onBlur: () => {
                  setRowKb((cur) => (cur === id ? null : cur));
                },
              } as Record<string, unknown>)}>
              {canDrag ? (
                <SortableHandle
                  label={label}
                  itemId={id}
                  compact={compact}
                  dragging={isSource}
                  onPointerDown={(e) => {
                    sortable.onHandlePointerDown(index, e);
                  }}
                  onKeyDown={(e) => {
                    sortable.onHandleKeyDown(index, e);
                  }}
                />
              ) : enabled ? (
                <SortableHandleWell itemId={id} compact={compact} />
              ) : null}
              <XStack flex={1} minWidth={0} alignItems="center" opacity={dimWhole ? 1 : undefined}>
                {renderItem ? (
                  renderItem(item, index)
                ) : (
                  <Text {...knobProps.body} color="$color12" numberOfLines={1} flex={1}>
                    {label}
                  </Text>
                )}
              </XStack>
            </XStack>
          );
        })
      )}

      {sortable.session?.mode === 'keyboard' ? (
        <View
          position="absolute"
          left={0}
          right={0}
          y={sortable.session.targetIndex * (sortable.session.size || MIN_PRESS_TARGET)}
          minHeight={MIN_PRESS_TARGET}
          alignItems="center"
          paddingLeft="$2"
          paddingRight="$3"
          backgroundColor="$color2"
          {...knobProps.borderRadius}
          borderWidth={1}
          borderColor="$borderColor"
          scale={LIFT_SCALE}
          {...LIFT_SHADOW}
          pointerEvents="none"
          zIndex={5}
          {...({ 'data-sortable-fly': sortable.session.id } as Record<string, unknown>)}>
          <XStack alignItems="center" gap="$2" minHeight={MIN_PRESS_TARGET}>
            <SortableHandle label={sortable.session.label} itemId={sortable.session.id} dragging />
            <Text {...knobProps.body}>{sortable.session.label}</Text>
          </XStack>
        </View>
      ) : null}

      {enabled ? (
        <View
          position="absolute"
          width={1}
          height={1}
          overflow="hidden"
          opacity={0}
          pointerEvents="none"
          {...sortable.liveProps}>
          <Text>{sortable.announcement}</Text>
        </View>
      ) : null}
    </YStack>
  );
}

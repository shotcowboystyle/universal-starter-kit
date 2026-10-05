import { Spinner } from '@repo/forms';
import {
  MIN_PRESS_TARGET,
  containerCapProps,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  hairlineWidth,
  keyboardFocusRingProps,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useHotkey } from '@tanstack/react-hotkeys';
import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import React, { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { Text, View, XStack, YStack, type YStackProps } from 'tamagui';

import { componentColors } from '../componentColors';
import { AsyncBoundary } from '../layouts/AsyncBoundary';
import { useTranslation } from '../shared/i18n';

/**
 * Configurable hotkey bindings for the List component.
 */
export interface ListHotkeys {
  /** Move focus to next item (default: ArrowDown) */
  next?: RegisterableHotkey;
  /** Move focus to previous item (default: ArrowUp) */
  prev?: RegisterableHotkey;
  /** Select the focused item (default: Enter) */
  select?: RegisterableHotkey;
  /** Move focus to first item (default: Home) */
  first?: RegisterableHotkey;
  /** Move focus to last item (default: End) */
  last?: RegisterableHotkey;
  /** Move focus down by a page (default: PageDown) */
  pageDown?: RegisterableHotkey;
  /** Move focus up by a page (default: PageUp) */
  pageUp?: RegisterableHotkey;
}

/** Per-row interaction state passed to `renderItem` and `ListRow`. */
export interface ListItemState {
  selected: boolean;
  focused: boolean;
  /** Readable ink when the row paints `$accentBackground`. */
  onAccent?: string;
}

const ListItemStateContext = createContext<ListItemState>({
  selected: false,
  focused: false,
});

/** Read the current row's selection/focus. Defaults to idle outside a List. */
export function useListItemState(): ListItemState {
  return useContext(ListItemStateContext);
}

/**
 * Subject-led document row (Desk list / Linear / Finder): leading glyph,
 * title (+ optional subtitle), trailing muted meta. Sits inside List's
 * stacked-group chrome — does not paint its own radius, fill, or ring.
 */
export interface ListRowProps {
  /** Leading media slot — fixed box so titles share one x. */
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing Finder/Desk columns (dates, size, kind, status). */
  meta?: ReactNode;
}

function RowText({ children, ...props }: { children: ReactNode } & React.ComponentProps<typeof Text>) {
  if (children == null || children === false) {
    return null;
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return <Text {...props}>{children}</Text>;
  }
  return <>{children}</>;
}

/** Trailing Finder/Desk column. Inherits selected fill ink. */
export function ListRowMeta({ children, width, color }: { children: ReactNode; width?: number; color?: string }) {
  const { knobProps } = useResolvedKnobs();
  const { selected, onAccent } = useListItemState();
  const resolved = selected && onAccent ? onAccent : (color ?? knobProps.textAccentColor);
  return (
    <Text {...knobProps.label} color={resolved} numberOfLines={1} minWidth={width} textAlign="right" userSelect="none">
      {children}
    </Text>
  );
}

export function ListRow({ icon, title, subtitle, meta }: ListRowProps) {
  const { knobProps } = useResolvedKnobs();
  const { selected, onAccent } = useListItemState();
  // data-chrome family: textAccent = honour (F11). Same channel as house Text —
  // componentColors.text.primary/muted pin $color/$color11 and ignore the knob.
  const ink = selected && onAccent ? onAccent : knobProps.textAccentColor;
  const iconSize = knobProps.controlIcon.width;
  const leading = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ size?: number; color?: string }>, {
        size: iconSize,
        color: 'currentColor',
      })
    : icon;

  return (
    <XStack alignItems="center" {...knobProps.gap} flex={1} minWidth={0} width="100%">
      {leading ? (
        <View
          {...knobProps.controlIcon}
          flexShrink={0}
          alignItems="center"
          justifyContent="center"
          {...({ 'data-list-slot': 'icon', color: ink } as Record<string, unknown>)}>
          {leading}
        </View>
      ) : null}
      <YStack flex={1} minWidth={0} {...({ 'data-list-slot': 'title' } as Record<string, unknown>)}>
        <RowText {...knobProps.body} {...knobProps.textWeight} color={ink} numberOfLines={1} userSelect="none">
          {title}
        </RowText>
        {subtitle != null && subtitle !== false ? (
          <RowText {...knobProps.label} color={ink} opacity={selected ? 0.85 : 1} numberOfLines={1} userSelect="none">
            {subtitle}
          </RowText>
        ) : null}
      </YStack>
      {meta != null && meta !== false ? (
        <XStack
          alignItems="center"
          {...knobProps.gap}
          flexShrink={0}
          {...({ 'data-list-slot': 'meta' } as Record<string, unknown>)}>
          {typeof meta === 'string' || typeof meta === 'number' ? <ListRowMeta>{meta}</ListRowMeta> : meta}
        </XStack>
      ) : null}
    </XStack>
  );
}

/**
 * Props for the generic List component.
 *
 * @typeParam T - The item type rendered in the list
 */
export interface ListProps<T> extends Omit<YStackProps, 'children'> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number, state?: ListItemState) => React.ReactNode;
  /** Called when an item is clicked */
  onItemClick?: (item: T) => void;
  /** Called when user scrolls near the bottom (infinite scroll) */
  onLoadMore?: () => void;
  /** Whether more items are available */
  hasMore?: boolean;
  /** Whether data is loading */
  isLoading?: boolean;
  /**
   * Failed load. Wins over empty — never shows empty chrome.
   * Pass a string, Error, custom node, or `true` for the default error UI.
   */
  error?: boolean | string | Error | ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Estimated size of each item in pixels (default: 56) */
  estimateSize?: number;
  /** Number of items to render outside visible area (default: 5) */
  overscan?: number;
  /** Message shown when items array is empty */
  emptyMessage?: string;
  /** Height of the scrollable container in pixels (default: 400) */
  height?: number;
  /**
   * Filled row. Finder/Linear list: arrows move this with keyboard
   * focus. Controlled when passed; otherwise internal.
   */
  selectedIndex?: number;
  /** Uncontrolled initial filled row. */
  defaultSelectedIndex?: number;
  /** Fires when the filled row changes (click or arrow keys). */
  onSelectionChange?: (index: number, item: T) => void;
  /** Accessible label for the list */
  'aria-label'?: string;
  /** Configurable keyboard shortcut overrides */
  hotkeys?: ListHotkeys;
}

/**
 * Generic virtualized list component with keyboard navigation.
 *
 * Uses `@shopify/flash-list` for cross-platform virtualization and
 * `@tanstack/react-hotkeys` for keyboard navigation. Rows form one stacked
 * group: outer corners follow the radius knob, interiors stay square,
 * hairlines sit only BETWEEN rows. Selected = accent fill; keyboard focus =
 * inset ring on that same row. Accepts data purely through props.
 *
 * @typeParam T - The item type rendered in the list
 *
 * @example
 * ```tsx
 * <List
 *   items={items}
 *   renderItem={(item) => <ListRow title={item.name} meta={item.modified} />}
 *   onItemClick={(item) => console.log(item)}
 *   estimateSize={56}
 * />
 * ```
 */
export function List<T>({
  items,
  renderItem,
  onItemClick,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  error = null,
  onRetry,
  estimateSize: estimateSizeProp,
  overscan = 5,
  emptyMessage: emptyMessageProp,
  height: heightProp,
  selectedIndex: selectedIndexProp,
  defaultSelectedIndex,
  onSelectionChange,
  'aria-label': ariaLabel,
  hotkeys: hotkeyOverrides,
  ...stackProps
}: ListProps<T>) {
  const { t } = useTranslation();
  const emptyMessage = emptyMessageProp ?? t('No items found');
  const { knobProps } = useResolvedKnobs();
  const estimateSize = estimateSizeProp ?? Math.max(MIN_PRESS_TARGET, knobProps.control.height);
  const rowPad = knobProps.panelPadding.padding;
  const onAccent = useReadableTextOn('$accentBackground');
  const cornersRadius = knobProps.containerRadius.borderRadius;
  // No explicit height: hug content when the list is complete (page scrolls,
  // no dead space / nested scrollbar); cap + scroll internally only while
  // more pages can stream in (FlashList needs a bounded viewport to
  // virtualize + fire onEndReached). The cap is a content-derived dial —
  // ten estimated rows at the active size — not a raw pixel constant.
  const STREAMING_VIEWPORT_ROWS = 10;
  const scrollCap = estimateSize * STREAMING_VIEWPORT_ROWS;
  // The hug height tracks the MEASURED content size once FlashList reports
  // it: an estimate-derived hug slices the last rows mid-row whenever rows
  // render taller than the estimate (measured overB 122/148 on
  // FrappeList/FrappeListView). The estimate is only the
  // pre-measure first paint.
  const [measuredContentHeight, setMeasuredContentHeight] = useState<number | null>(null);
  const height =
    heightProp ??
    (hasMore
      ? scrollCap
      : (measuredContentHeight ??
        Math.max(items.length, 1) * estimateSize + Math.max(items.length - 1, 0) * hairlineWidth));
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const flashListRef = useRef<FlashListRef<T>>(null);
  const isControlled = selectedIndexProp !== undefined;
  const [uncontrolledSelected, setUncontrolledSelected] = useState(defaultSelectedIndex ?? -1);
  const selectedIndex = isControlled ? selectedIndexProp : uncontrolledSelected;
  const selectedRef = useRef(selectedIndex);
  selectedRef.current = selectedIndex;
  const [containerKeyboardFocused, setContainerKeyboardFocused] = useState(false);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  const commitSelection = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) {
        return;
      }
      if (!isControlled) {
        setUncontrolledSelected(index);
      }
      onSelectionChange?.(index, items[index]);
    },
    [isControlled, items, onSelectionChange],
  );

  const handleContainerFocus = useCallback(() => {
    if (!wasKeyboardFocus()) {
      return;
    }
    setContainerKeyboardFocused(true);
    if (selectedRef.current < 0 && items.length > 0) {
      commitSelection(0);
    }
  }, [commitSelection, items.length]);

  const handleContainerBlur = useCallback(() => {
    setContainerKeyboardFocused(false);
  }, []);

  // Scroll to focused item when focusedIndex changes
  const scrollToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        flashListRef.current?.scrollToIndex({ index, animated: true });
      }
    },
    [items.length],
  );

  const moveSelection = useCallback(
    (next: number) => {
      setContainerKeyboardFocused(true);
      const clamped = Math.max(0, Math.min(next, items.length - 1));
      commitSelection(clamped);
      scrollToIndex(clamped);
      return clamped;
    },
    [commitSelection, items.length, scrollToIndex],
  );

  // Keyboard navigation via @tanstack/react-hotkeys
  const hotkeyOpts = {
    target: containerRef as React.RefObject<HTMLElement | null>,
  };

  useHotkey(
    hotkeyOverrides?.next ?? 'ArrowDown',
    () => {
      const current = selectedRef.current;
      moveSelection(current < 0 ? 0 : current + 1);
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.prev ?? 'ArrowUp',
    () => {
      const current = selectedRef.current;
      moveSelection(current < 0 ? items.length - 1 : current - 1);
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.select ?? 'Enter',
    () => {
      const current = selectedRef.current;
      if (current >= 0 && current < items.length) {
        onItemClick?.(items[current]);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.first ?? 'Home',
    () => {
      if (items.length > 0) {
        moveSelection(0);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.last ?? 'End',
    () => {
      if (items.length > 0) {
        moveSelection(items.length - 1);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.pageDown ?? 'PageDown',
    () => {
      const current = selectedRef.current < 0 ? 0 : selectedRef.current;
      moveSelection(current + 10);
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.pageUp ?? 'PageUp',
    () => {
      const current = selectedRef.current < 0 ? 0 : selectedRef.current;
      moveSelection(current - 10);
    },
    hotkeyOpts,
  );

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (onLoadMore && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, isLoading]);

  // Clamp selected index if items shrunk
  const effectiveSelected = selectedIndex >= items.length ? -1 : selectedIndex;
  const showKeyboardRing = containerKeyboardFocused && wasKeyboardFocus();

  const listBody =
    items.length === 0 ? null : (
      <View
        ref={containerRef as any}
        role="list"
        aria-label={ariaLabel}
        aria-activedescendant={effectiveSelected >= 0 ? `${listId}-item-${effectiveSelected}` : undefined}
        tabIndex={0}
        outlineWidth={0}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
        style={{
          height,
        }}>
        <FlashList
          keyboardShouldPersistTaps="handled"
          ref={flashListRef}
          data={items}
          extraData={{ selected: effectiveSelected, ring: showKeyboardRing }}
          drawDistance={overscan * estimateSize}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          onContentSizeChange={(_w, contentHeight) => {
            if (contentHeight > 0) {
              setMeasuredContentHeight((prev) => (prev === contentHeight ? prev : contentHeight));
            }
          }}
          keyExtractor={(_, index) => `${listId}-item-${index}`}
          renderItem={({ item, index }) => {
            const isSelected = effectiveSelected === index;
            const position = getGroupPosition(index, items.length);
            const corners = stackRadiusProps(position, cornersRadius);
            const state: ListItemState = {
              selected: isSelected,
              focused: isSelected && showKeyboardRing,
              onAccent,
            };
            return (
              <YStack>
                {index > 0 ? <View {...hairline.line} /> : null}
                <XStack
                  id={`${listId}-item-${index}`}
                  data-stack-position={position}
                  {...containerCapProps('StackedRow', knobProps.borderRadius.borderRadius, knobProps.space)}
                  {...({
                    'data-list-row': true,
                    ...(isSelected ? { 'data-selected': true } : {}),
                    ...(isSelected && containerKeyboardFocused ? { 'data-focused': true } : {}),
                  } as Record<string, unknown>)}
                  minHeight={MIN_PRESS_TARGET}
                  paddingHorizontal={rowPad}
                  paddingVertical={rowPad}
                  alignItems="center"
                  overflow="hidden"
                  // Rows form ONE stacked group: the hover/focus/selection
                  // surface rounds only at the group's outer corners, capped
                  // at the row padding; interiors stay square.
                  // Hairlines sit BETWEEN rows only, never after the last.
                  {...corners}
                  role="listitem"
                  aria-selected={isSelected}
                  backgroundColor={isSelected ? '$accentBackground' : 'transparent'}
                  {...(isSelected && onAccent ? { color: onAccent } : {})}
                  {...(isSelected && showKeyboardRing
                    ? {
                        ...keyboardFocusRingProps,
                        ...(onAccent ? { outlineColor: onAccent } : {}),
                      }
                    : { outlineWidth: 0 })}
                  hoverStyle={{
                    backgroundColor: isSelected ? '$accentBackground' : componentColors.interactive.background,
                    ...corners,
                  }}
                  pressStyle={{
                    backgroundColor: isSelected ? '$accentBackground' : componentColors.interactive.hover,
                    ...corners,
                  }}
                  cursor="pointer"
                  {...transitionProps(knobProps.transition)}
                  onPress={() => {
                    commitSelection(index);
                    onItemClick?.(item);
                  }}>
                  <ListItemStateContext.Provider value={state}>
                    {renderItem(item, index, state)}
                  </ListItemStateContext.Provider>
                </XStack>
              </YStack>
            );
          }}
          ListFooterComponent={
            isLoading && items.length > 0 ? (
              <YStack {...knobProps.panelPadding} alignItems="center">
                <Spinner size="small" />
              </YStack>
            ) : null
          }
        />
      </View>
    );

  return (
    <AsyncBoundary
      loading={!error && isLoading && items.length === 0}
      empty={!error && items.length === 0}
      error={error}
      onRetry={onRetry}
      layout="list"
      compact
      emptyTitle={emptyMessage}
      {...stackProps}>
      {listBody}
    </AsyncBoundary>
  );
}

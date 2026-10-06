import { Spinner } from '@repo/forms';
import { animationConfig, hairlineWidth, MIN_PRESS_TARGET, radiusClassProps, useResolvedKnobs } from '@repo/theme';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView as RNScrollView,
} from 'react-native';
import { ListItem, Text, View, XStack, YStack } from 'tamagui';
import type { TamaguiElement, TransitionProp, YStackProps } from 'tamagui';

import { componentColors } from '../component-colors';
import { AsyncBoundary, useAsyncCount } from '../layouts/AsyncBoundary';
import { EmptyState } from '../layouts/Page';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { Card } from '../surfaces';

import { isNonEmpty, isString } from './guards';
import {
  autoScrollVelocity,
  describeCancel,
  describeDragState,
  gapPosition,
  resolveDrop,
  siblingOffset,
  uniformInsertionIndex,
} from './kanban-dnd';
import type { KanbanAnnouncement, KanbanBoardColumnSnapshot, KanbanDragPhase, KanbanDropTarget } from './kanban-dnd';

/**
 * A column definition for the Kanban board.
 *
 * @template T - The card item type
 */
export interface KanbanColumn<T> {
  /** Unique column identifier */
  id: string;
  /** Display title for the column header */
  title: string;
  /** Cards in this column */
  items: T[];
  /** Optional color for the column header */
  color?: string;
}

/**
 * Configurable hotkey bindings for the Kanban component.
 * Note: Hotkeys are only supported on web platform.
 */
export interface KanbanHotkeys {
  /** Move focus to next column (default: ArrowRight) */
  nextColumn?: string;
  /** Move focus to previous column (default: ArrowLeft) */
  prevColumn?: string;
  /** Move focus to next card within column (default: ArrowDown) */
  nextCard?: string;
  /** Move focus to previous card within column (default: ArrowUp) */
  prevCard?: string;
  /** Select the focused card (default: Enter) */
  select?: string;
  /** Lift / drop the focused card (web only, default: Space) */
  lift?: string;
  /** Cancel an active keyboard drag (web only, default: Escape) */
  cancel?: string;
}

/**
 * Props for the generic Kanban component.
 *
 * @template T - The card item type
 */
export interface KanbanProps<T> extends Omit<YStackProps, 'children'> {
  /** Column definitions with their items */
  columns: KanbanColumn<T>[];
  /** Render function for each card */
  renderCard: (item: T) => React.ReactNode;
  /**
   * Called when a card is moved between columns. `toIndex` is the insertion
   * position inside the destination column (0-based).
   */
  onCardMove?: (item: T, fromColumn: string, toColumn: string, toIndex?: number) => void;
  /**
   * Called when a card is reordered inside its own column. Without this
   * handler, same-column drops settle back to their origin.
   */
  onCardReorder?: (item: T, columnId: string, fromIndex: number, toIndex: number) => void;
  /** Called when a card is selected via keyboard or click */
  onCardSelect?: (item: T, columnId: string) => void;
  /**
   * Per-column actions (quick-add, column menu…) anchored in the column
   * header after the count. Icon-only actions must carry their own
   * accessible names — the board renders the slot as-is.
   */
  renderColumnActions?: (column: KanbanColumn<T>) => ReactNode;
  /**
   * Rendered after the last column inside the horizontal scroller — the
   * anchored home for board-level affordances like "Add column".
   */
  boardEnd?: ReactNode;
  /** Called when user scrolls near the bottom (infinite scroll) */
  onLoadMore?: () => void;
  /** Stable key extractor for virtualized cards (defaults to the item index) */
  getItemKey?: (item: T, index: number) => string | number;
  /** Human label for a card, used in screen-reader drag announcements */
  getItemLabel?: (item: T) => string;
  /** Whether more items are available */
  hasMore?: boolean;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Failed board load. Wins over empty; hides count badges. */
  error?: Error | ReactNode;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Column width in pixels (default: 280) */
  columnWidth?: number;
  /** Minimum column height in pixels (default: 400) */
  minColumnHeight?: number;
  /** Estimated size of each card in pixels for virtualization (default: 80) */
  estimateSize?: number;
  /** Number of items to render outside visible area (default: 5) */
  overscan?: number;
  /** Message shown when a column has no items */
  emptyColumnMessage?: string;
  /** Configurable keyboard shortcut overrides (web only) */
  hotkeys?: KanbanHotkeys;
}

// ── Interaction constants (gesture recognition, not animation timing) ──

/** Pixels of finger travel before a hold is treated as a scroll. */
const DRAG_THRESHOLD_PX = 4;
/** Hold duration before lift so vertical swipes still scroll the column. */
const TOUCH_LONG_PRESS_MS = 200;
/** Distance from a scroll edge where auto-scroll engages. */
const AUTO_SCROLL_EDGE_PX = 48;
/** Auto-scroll speed cap in px per frame; ramps with edge proximity. */
const AUTO_SCROLL_MAX_SPEED = 16;

// Raised drag shadow — house $4 elevation tier (blur = 2 x y-offset, Axiom 14).
const LIFT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.15,
  shadowRadius: 20,
  elevation: 8,
} as const;

interface NativeColumnHandle<T> {
  /** List container node for measureInWindow hit testing. */
  node: TamaguiElement | null;
  list: FlashListRef<T> | null;
  scrollOffset: number;
  layout: { x: number; y: number; width: number; height: number } | null;
}

interface NativeDragSession<T> {
  item: T;
  itemLabel: string;
  sourceColumnId: string;
  sourceIndex: number;
  /** Uniform slot size (estimateSize) — FlashList has no per-item measurements. */
  size: number;
  target: KanbanDropTarget;
  settling?: boolean;
}

/** Pass the responder handlers through a JSX spread: Tamagui's View prop type omits them, the host view accepts them. */
const cardDragSpread = (props: CardDragProps): object => props;

/** Responder-system handlers a draggable card spreads onto its wrapper. */
interface CardDragProps {
  onStartShouldSetResponder?: () => boolean;
  onMoveShouldSetResponder?: () => boolean;
  onResponderTerminationRequest?: () => boolean;
  onResponderGrant?: (event: GestureResponderEvent) => void;
  onResponderMove?: (event: GestureResponderEvent) => void;
  onResponderRelease?: () => void;
  onResponderTerminate?: () => void;
}

type NativeDragPhase = KanbanDragPhase | 'cancel';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

const announcementText = (t: TranslateFn, a: KanbanAnnouncement): string => {
  if (a.type === 'cancel') {
    return t('Movement cancelled. {{card}} returned to {{column}}.', a);
  }
  if (a.type === 'lift') {
    return t('Lifted {{card}} in {{column}}, position {{position}} of {{count}}.', a);
  }
  if (a.type === 'move') {
    return t('Moved {{card}} to {{column}}, position {{position}} of {{count}}.', a);
  }
  return t('Dropped {{card}} in {{column}}, position {{position}} of {{count}}.', a);
};

/** Geometry per size-knob step: `$3` compact, `$5` roomy, anything else default. */
const SIZE_STEPS = {
  $3: { columnWidth: 240, minColumnHeight: 320, estimateSize: 64 },
  $5: { columnWidth: 320, minColumnHeight: 480, estimateSize: 96 },
  default: { columnWidth: 280, minColumnHeight: 400, estimateSize: 80 },
} as const;

const GHOST_OPACITY = 0.4;
const COLUMN_HIT_HEADER_PX = 40;

const cardOpacity = (hidden: boolean, ghost: boolean): number => {
  if (hidden) {
    return 0;
  }
  return ghost ? GHOST_OPACITY : 1;
};

/** The drag session when its insertion gap is open in a column other than the source's. */
const openGapDrag = <T,>(
  drag: NativeDragSession<T> | null,
  gapIndex: number | null,
  isSource: boolean,
): NativeDragSession<T> | null => {
  if (drag === null || drag.settling === true || gapIndex === null) {
    return null;
  }
  return isSource ? null : drag;
};

interface HasMeasureInWindow {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

/** Native host nodes expose `measureInWindow`; DOM nodes and null do not. */
const canMeasureInWindow = (node: unknown): node is HasMeasureInWindow =>
  node != null && typeof node === 'object' && 'measureInWindow' in node;

type SpringToken = keyof typeof animationConfig;

const isSpringToken = <V,>(value: V): value is V & SpringToken => isString(value) && value in animationConfig;

/** The spring vocabulary entry for a transition knob; `null` when animation is off. */
const resolveSpringToken = (transition: TransitionProp | undefined) => {
  if (isSpringToken(transition)) {
    return transition;
  }
  return transition !== undefined && transition !== '' ? ('quick' satisfies SpringToken) : null;
};

const withTarget = <T,>(prev: NativeDragSession<T> | null, target: KanbanDropTarget): NativeDragSession<T> | null => {
  if (prev === null || prev.settling === true) {
    return prev;
  }
  const unchanged = prev.target.columnId === target.columnId && prev.target.index === target.index;
  return unchanged ? prev : { ...prev, target };
};

/** Whether a window-space point falls in a column (with a small allowance above it for the header). */
const withinColumnBounds = (layout: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
  x >= layout.x &&
  x <= layout.x + layout.width &&
  y >= layout.y - COLUMN_HIT_HEADER_PX &&
  y <= layout.y + layout.height;

const KanbanColumnView = <T,>({
  kanbanId,
  column,
  columnIndex,
  renderCard,
  columnWidth,
  minColumnHeight,
  estimateSize,
  overscan,
  emptyColumnMessage,
  onLoadMore,
  getItemKey,
  hasMore,
  isLoading,
  onCardSelect,
  renderColumnActions,
  getCardDragProps,
  handle,
  drag,
  scrollEnabled,
}: KanbanColumnViewProps<T>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const itemCount = useAsyncCount(column.items.length);

  const isSource = drag?.sourceColumnId === column.id;
  const gapIndex = drag && !drag.settling && drag.target.columnId === column.id ? drag.target.index : null;
  const isDropTarget = gapIndex != null;
  const slotDrag = openGapDrag(drag, gapIndex, isSource);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (onLoadMore && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, isLoading]);

  const gapY =
    gapIndex != null && drag
      ? gapPosition({
          gapIndex,
          sourceIndex: isSource ? drag.sourceIndex : null,
          count: column.items.length,
          size: drag.size,
          totalSize: column.items.length * drag.size,
          getStart: (index) => index * drag.size,
        })
      : null;

  return (
    <YStack
      width={columnWidth}
      minHeight={minColumnHeight}
      flexShrink={0}
      overflow="hidden"
      transition={knobProps.transition}
      {...knobProps.borderRadius}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      backgroundColor={isDropTarget ? componentColors.interactive.background : 'transparent'}
      data-kanban-column={column.id}>
      <ListItem
        title={column.title}
        icon={
          isNonEmpty(column.color) ? (
            <YStack
              {...radiusClassProps('R-PILL', 'Kanban column dot')}
              width={8}
              height={8}
              borderRadius={4}
              backgroundColor={column.color}
              data-kanban-column-dot
            />
          ) : undefined
        }
        iconAfter={
          itemCount !== undefined || renderColumnActions ? (
            <XStack
              alignItems="center"
              {...knobProps.gap}>
              {itemCount !== undefined && (
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}
                  {...knobProps.textWeight}
                  data-async-count>
                  {itemCount}
                </Text>
              )}
              {renderColumnActions?.(column)}
            </XStack>
          ) : undefined
        }
        size={knobProps.sizeToken}
        borderBottomWidth={hairlineWidth}
        borderBottomColor="$borderColor"
      />

      {/* Cards container — always rendered so empty columns stay drop targets. */}
      <View
        style={{ flex: 1, minHeight: minColumnHeight - 60 }}
        position="relative"
        ref={(node: TamaguiElement | null) => {
          // oxlint-disable-next-line react/immutability -- the handle is the board's per-column geometry registry; the ref callback records the mounted node on it
          handle.node = node;
        }}>
        {column.items.length === 0 ? (
          !isDropTarget && (
            <EmptyState
              compact
              title={emptyColumnMessage}
              opacity={0.5}
              flex={1}
            />
          )
        ) : (
          <FlashList
            keyboardShouldPersistTaps="handled"
            ref={(list: FlashListRef<T> | null) => {
              // oxlint-disable-next-line react/immutability -- the handle is the board's per-column geometry registry; the ref callback records the mounted list on it
              handle.list = list;
            }}
            data={column.items}
            extraData={drag}
            drawDistance={estimateSize * overscan}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            scrollEnabled={scrollEnabled}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              // oxlint-disable-next-line react/immutability -- the handle is the board's per-column geometry registry; scroll events keep its offset current
              handle.scrollOffset = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={64}
            keyExtractor={(item, index) =>
              getItemKey ? String(getItemKey(item, index)) : `${kanbanId}-col-${columnIndex}-card-${index}`
            }
            // oxlint-disable-next-line sonarjs/cognitive-complexity -- one card slot: drag displacement, ghost/hidden states and press routing derive from the same per-card values
            renderItem={({ item, index }) => {
              const isDragged = isSource && drag != null && index === drag.sourceIndex;
              let offset = 0;
              let ghost = false;
              let hidden = false;
              if (drag && !drag.settling) {
                if (isDragged) {
                  if (gapIndex != null && gapY != null) {
                    offset = gapY - index * drag.size;
                    ghost = true;
                  } else {
                    hidden = true;
                  }
                } else {
                  offset = siblingOffset({
                    index,
                    sourceIndex: isSource && drag != null ? drag.sourceIndex : null,
                    gapIndex,
                    size: drag.size,
                  });
                }
              } else if (drag?.settling && isDragged) {
                // The ghost overlay is this card's visual while it settles.
                hidden = true;
              }
              const dragProps = getCardDragProps?.(item, column.id, index) ?? {};
              return (
                <View
                  padding="$1"
                  y={offset}
                  transition={drag && !drag.settling ? knobProps.transition : undefined}
                  opacity={cardOpacity(hidden, ghost)}
                  {...cardDragSpread(dragProps)}>
                  <Card
                    id={`${kanbanId}-col-${columnIndex}-card-${index}`}
                    elevation={knobProps.elevation}
                    minHeight={MIN_PRESS_TARGET}
                    {...(ghost
                      ? {
                          borderWidth: hairlineWidth,
                          borderColor: componentColors.interactive.border,
                          borderStyle: 'dashed' as const,
                        }
                      : undefined)}
                    hoverStyle={{ backgroundColor: componentColors.interactive.background }}
                    pressStyle={{ scale: 0.98 }}
                    overflow="hidden"
                    data-kanban-card={String(getItemKey ? getItemKey(item, index) : `${column.id}-${index}`)}
                    // With drag enabled the responders own the tap (handled on release).
                    onPress={getCardDragProps ? undefined : () => onCardSelect?.(item, column.id)}>
                    {renderCard(item)}
                  </Card>
                </View>
              );
            }}
            ListFooterComponent={
              isLoading ? (
                <YStack
                  {...knobProps.panelPadding}
                  alignItems="center">
                  <Spinner size="small" />
                </YStack>
              ) : null
            }
          />
        )}

        {/* Insertion slot outline for cross-column targets and empty columns. */}
        {slotDrag && (
          <View
            position="absolute"
            top={0}
            left={0}
            right={0}
            y={(gapY ?? 0) - handle.scrollOffset}
            height={slotDrag.size}
            padding="$1"
            pointerEvents="none"
            transition={knobProps.transition}>
            <View
              flex={1}
              {...knobProps.borderRadius}
              borderStyle="dashed"
              borderColor={componentColors.interactive.border}
              backgroundColor={componentColors.interactive.background}
              opacity={0.8}
              alignItems="center"
              justifyContent="center">
              {column.items.length === 0 && (
                <Text
                  color={knobProps.textAccentColor}
                  {...knobProps.label}>
                  {t('Drop here')}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    </YStack>
  );
};

/**
 * Generic Kanban board component with column-level virtualization.
 * Native implementation using FlashList plus responder-system drag-and-drop.
 *
 * Drag anatomy mirrors the web contract with transforms only (the RN driver
 * cannot animate layout props — Axiom 4): long-press lifts (scale/rotate/
 * shadow), the ghost tracks the finger 1:1 via `Animated.ValueXY.setValue`,
 * siblings displace with translate offsets from the shared `kanbanDnd` math,
 * and drops/cancels settle with `Animated.spring` using the canonical
 * animation vocabulary. `animation=none` lands everything instantly while
 * 1:1 tracking keeps working (A-GESTURE).
 *
 * @template T - The card item type
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- one board: layout measurement, responder drag, auto-scroll and settle springs share the column handle registry
export const Kanban = <T,>({
  columns,
  renderCard,
  onCardMove,
  onCardReorder,
  onCardSelect,
  renderColumnActions,
  boardEnd,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  error = null,
  onRetry,
  columnWidth: columnWidthProp,
  minColumnHeight: minColumnHeightProp,
  estimateSize: estimateSizeProp,
  overscan = 5,
  emptyColumnMessage: emptyColumnMessageProp,
  getItemKey,
  getItemLabel,
  hotkeys: _hotkeyOverrides,
  ...stackProps
}: KanbanProps<T>) => {
  const { t } = useTranslation();
  const emptyColumnMessage = emptyColumnMessageProp ?? t('No items');
  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const steps = SIZE_STEPS[sz === '$3' || sz === '$5' ? sz : 'default'];
  const columnWidth = columnWidthProp ?? steps.columnWidth;
  const minColumnHeight = minColumnHeightProp ?? steps.minColumnHeight;
  const estimateSize = estimateSizeProp ?? steps.estimateSize;
  const kanbanId = useId();
  const hasError = Boolean(error);
  const boardLoading = !hasError && isLoading && columns.every((c) => c.items.length === 0);
  const boardEmpty = !hasError && columns.length === 0;

  const canDrag = onCardMove !== undefined || onCardReorder !== undefined;

  // ── Drag state ──────────────────────────────────────────────
  const [drag, setDrag] = useState<NativeDragSession<T> | null>(null);
  const dragStateRef = useRef<NativeDragSession<T> | null>(null);
  // oxlint-disable-next-line react/refs -- latest-value ref: responders must see the committed drag state in the same render pass, never one commit behind
  dragStateRef.current = drag;

  const columnHandles = useRef(new Map<string, NativeColumnHandle<T>>());
  const containerNodeRef = useRef<TamaguiElement | null>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  const boardScrollRef = useRef<RNScrollView>(null);
  const boardScrollXRef = useRef(0);
  const boardLayoutRef = useRef<{ x: number; y: number; width: number } | null>(null);
  const fingerRef = useRef({ x: 0, y: 0 });
  const suppressTapRef = useRef(false);
  const autoScrollRafRef = useRef<number | null>(null);

  // Ghost transforms (translate/scale/rotate only — native-driver safe).
  // oxlint-disable-next-line react/hook-use-state -- the Animated value is created once and never replaced, so there is deliberately no setter
  const [ghostPos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  // oxlint-disable-next-line react/hook-use-state -- the Animated value is created once and never replaced, so there is deliberately no setter
  const [liftValue] = useState(() => new Animated.Value(0));

  const gestureRef = useRef<{
    item: T;
    columnId: string;
    index: number;
    startX: number;
    startY: number;
    lifted: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const board = useMemo(
    (): KanbanBoardColumnSnapshot[] => columns.map((c) => ({ id: c.id, title: c.title, count: c.items.length })),
    [columns],
  );

  const springToken = resolveSpringToken(knobProps.transition);

  const getHandle = useCallback((columnId: string): NativeColumnHandle<T> => {
    let handle = columnHandles.current.get(columnId);
    if (!handle) {
      handle = { node: null, list: null, scrollOffset: 0, layout: null };
      columnHandles.current.set(columnId, handle);
    }
    return handle;
  }, []);

  const announce = useCallback(
    (
      type: NativeDragPhase,
      session: Pick<NativeDragSession<T>, 'sourceColumnId' | 'sourceIndex' | 'target'>,
      label: string,
    ) => {
      const a =
        type === 'cancel' ? describeCancel(session, board, label) : describeDragState(type, session, board, label);
      AccessibilityInfo.announceForAccessibility?.(announcementText(t, a));
    },
    [board, t],
  );

  // ── Geometry ────────────────────────────────────────────────

  const measureLayouts = useCallback(() => {
    if (canMeasureInWindow(containerNodeRef.current)) {
      containerNodeRef.current.measureInWindow((x, y) => {
        containerOffsetRef.current = { x, y };
      });
    }
    for (const [, handle] of columnHandles.current) {
      if (canMeasureInWindow(handle.node)) {
        handle.node.measureInWindow((x, y, width, height) => {
          handle.layout = { x, y, width, height };
        });
      }
    }
    if (canMeasureInWindow(boardScrollRef.current)) {
      boardScrollRef.current.measureInWindow((x, y, width) => {
        boardLayoutRef.current = { x, y, width };
      });
    }
  }, []);

  const columnsById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const hitTest = useCallback(
    (pageX: number, pageY: number, session: NativeDragSession<T>): KanbanDropTarget => {
      for (const [columnId, handle] of columnHandles.current) {
        const { layout } = handle;
        const column =
          layout !== null && withinColumnBounds(layout, pageX, pageY) ? columnsById.get(columnId) : undefined;
        if (layout !== null && column !== undefined) {
          const localY = pageY - layout.y + handle.scrollOffset;
          const wdCount = column.items.length - (columnId === session.sourceColumnId ? 1 : 0);
          const index = uniformInsertionIndex(localY, session.size, Math.max(wdCount, 0));
          return { columnId, index };
        }
      }
      return { columnId: session.sourceColumnId, index: session.sourceIndex };
    },
    [columnsById],
  );

  /** Container-relative position of the gap slot for settle destinations. */
  const gapPositionInContainer = useCallback(
    (session: NativeDragSession<T>): { x: number; y: number } | null => {
      const handle = columnHandles.current.get(session.target.columnId);
      const layout = handle?.layout;
      const column = columns.find((c) => c.id === session.target.columnId);
      if (!handle || !layout || !column) {
        return null;
      }
      const gapY = gapPosition({
        gapIndex: session.target.index,
        sourceIndex: session.target.columnId === session.sourceColumnId ? session.sourceIndex : null,
        count: column.items.length,
        size: session.size,
        totalSize: column.items.length * session.size,
        getStart: (index) => index * session.size,
      });
      return {
        x: layout.x - containerOffsetRef.current.x,
        y: layout.y - containerOffsetRef.current.y + gapY - handle.scrollOffset,
      };
    },
    [columns],
  );

  // ── Auto-scroll ─────────────────────────────────────────────

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = null;
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();
    const tick = () => {
      const session = dragStateRef.current;
      if (!session || session.settling) {
        autoScrollRafRef.current = null;
        return;
      }
      const { x, y } = fingerRef.current;
      const handle = columnHandles.current.get(session.target.columnId);
      const layout = handle?.layout;
      let scrolled = false;
      if (handle && layout) {
        const vy = autoScrollVelocity({
          pos: y,
          start: layout.y,
          end: layout.y + layout.height,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vy !== 0 && handle.list) {
          handle.scrollOffset = Math.max(handle.scrollOffset + vy, 0);
          handle.list.scrollToOffset({ offset: handle.scrollOffset, animated: false });
          scrolled = true;
        }
      }
      const boardLayout = boardLayoutRef.current;
      if (boardLayout && boardScrollRef.current !== null) {
        const vx = autoScrollVelocity({
          pos: x,
          start: boardLayout.x,
          end: boardLayout.x + boardLayout.width,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vx !== 0) {
          boardScrollXRef.current = Math.max(boardScrollXRef.current + vx, 0);
          boardScrollRef.current.scrollTo?.({ x: boardScrollXRef.current, animated: false });
          scrolled = true;
          // Column window positions shift when the board scrolls.
          measureLayouts();
        }
      }
      if (scrolled) {
        const target = hitTest(x, y, session);
        setDrag((prev) => withTarget(prev, target));
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [hitTest, measureLayouts, stopAutoScroll]);

  useEffect(
    () => () => {
      stopAutoScroll();
    },
    [stopAutoScroll],
  );

  // ── Drop / cancel ───────────────────────────────────────────

  const finishDrag = useCallback(
    (commit: boolean) => {
      const session = dragStateRef.current;
      if (!session || session.settling) {
        return;
      }
      stopAutoScroll();

      const resolved = resolveDrop(session);
      const crossColumn = resolved.to.columnId !== resolved.from.columnId;
      const canCommit = commit && resolved.commit && (crossColumn ? Boolean(onCardMove) : Boolean(onCardReorder));

      const settleSession: NativeDragSession<T> = canCommit
        ? { ...session, settling: true }
        : {
            ...session,
            settling: true,
            target: { columnId: session.sourceColumnId, index: session.sourceIndex },
          };
      const dest = gapPositionInContainer(settleSession);

      const complete = () => {
        setDrag(null);
        dragStateRef.current = null;
        liftValue.setValue(0);
        if (canCommit) {
          announce('drop', settleSession, session.itemLabel);
          if (crossColumn) {
            onCardMove?.(session.item, resolved.from.columnId, resolved.to.columnId, resolved.to.index);
          } else {
            onCardReorder?.(session.item, resolved.from.columnId, resolved.from.index, resolved.to.index);
          }
        } else {
          announce('cancel', settleSession, session.itemLabel);
        }
      };

      setDrag(settleSession);
      dragStateRef.current = settleSession;

      if (dest && springToken) {
        // Settle leap tweens with the canonical spring vocabulary;
        // Animated.spring provides the completion callback Tamagui lacks.
        const config = animationConfig[springToken];
        Animated.parallel([
          Animated.spring(ghostPos, {
            toValue: dest,
            useNativeDriver: true,
            damping: config.damping,
            stiffness: config.stiffness,
            ...('mass' in config ? { mass: config.mass } : undefined),
          }),
          Animated.spring(liftValue, {
            toValue: 0,
            useNativeDriver: true,
            damping: config.damping,
            stiffness: config.stiffness,
          }),
        ]).start(complete);
      } else {
        // animation=none: no decorative settling — land instantly (Axiom 3).
        if (dest) {
          ghostPos.setValue(dest);
        }
        complete();
      }
    },
    [announce, gapPositionInContainer, ghostPos, liftValue, onCardMove, onCardReorder, springToken, stopAutoScroll],
  );

  // ── Gesture handlers (responder system, Calendar pattern) ───

  const liftCard = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.lifted) {
      return;
    }
    gesture.lifted = true;
    measureLayouts();
    const label = getItemLabel?.(gesture.item) ?? t('Card');
    const session: NativeDragSession<T> = {
      item: gesture.item,
      itemLabel: label,
      sourceColumnId: gesture.columnId,
      sourceIndex: gesture.index,
      size: estimateSize,
      target: { columnId: gesture.columnId, index: gesture.index },
    };
    ghostPos.setValue({
      x: fingerRef.current.x - containerOffsetRef.current.x - columnWidth / 2,
      y: fingerRef.current.y - containerOffsetRef.current.y - estimateSize / 2,
    });
    if (springToken) {
      const config = animationConfig[springToken];
      Animated.spring(liftValue, {
        toValue: 1,
        useNativeDriver: true,
        damping: config.damping,
        stiffness: config.stiffness,
      }).start();
    } else {
      liftValue.setValue(1);
    }
    setDrag(session);
    dragStateRef.current = session;
    announce('lift', session, label);
    startAutoScroll();
  }, [
    announce,
    columnWidth,
    estimateSize,
    getItemLabel,
    ghostPos,
    liftValue,
    measureLayouts,
    springToken,
    startAutoScroll,
    t,
  ]);

  const handleGrant = useCallback(
    (item: T, columnId: string, index: number, e: GestureResponderEvent) => {
      if (!canDrag) {
        return;
      }
      const { pageX, pageY } = e.nativeEvent;
      fingerRef.current = { x: pageX, y: pageY };
      gestureRef.current = {
        item,
        columnId,
        index,
        startX: pageX,
        startY: pageY,
        lifted: false,
        timer: setTimeout(liftCard, TOUCH_LONG_PRESS_MS),
      };
    },
    [canDrag, liftCard],
  );

  const handleMove = useCallback(
    (e: GestureResponderEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) {
        return;
      }
      const { pageX, pageY } = e.nativeEvent;
      fingerRef.current = { x: pageX, y: pageY };
      if (!gesture.lifted) {
        // Finger moved before the hold elapsed — this is a scroll, not a drag.
        if (Math.hypot(pageX - gesture.startX, pageY - gesture.startY) >= DRAG_THRESHOLD_PX) {
          if (gesture.timer != null) {
            clearTimeout(gesture.timer);
          }
          gestureRef.current = null;
        }
        return;
      }
      // 1:1 finger tracking — no tween while the finger carries the card.
      ghostPos.setValue({
        x: pageX - containerOffsetRef.current.x - columnWidth / 2,
        y: pageY - containerOffsetRef.current.y - estimateSize / 2,
      });
      const session = dragStateRef.current;
      if (!session || session.settling) {
        return;
      }
      const target = hitTest(pageX, pageY, session);
      setDrag((prev) => withTarget(prev, target));
    },
    [columnWidth, estimateSize, ghostPos, hitTest],
  );

  const handleRelease = useCallback(
    (item: T, columnId: string) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture) {
        return;
      }
      if (gesture.timer != null) {
        clearTimeout(gesture.timer);
      }
      if (!gesture.lifted) {
        // Responders steal onPress when drag is enabled — a short tap selects.
        if (!suppressTapRef.current) {
          onCardSelect?.(item, columnId);
        }
        return;
      }
      suppressTapRef.current = true;
      setTimeout(() => {
        suppressTapRef.current = false;
      }, 0);
      finishDrag(true);
    },
    [finishDrag, onCardSelect],
  );

  const handleTerminate = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) {
      return;
    }
    if (gesture.timer != null) {
      clearTimeout(gesture.timer);
    }
    if (gesture.lifted) {
      finishDrag(false);
    }
  }, [finishDrag]);

  const getCardDragProps = useCallback(
    (item: T, columnId: string, index: number): CardDragProps => {
      if (!canDrag) {
        return {};
      }
      return {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => !gestureRef.current?.lifted,
        onResponderGrant: (e: GestureResponderEvent) => {
          handleGrant(item, columnId, index, e);
        },
        onResponderMove: handleMove,
        onResponderRelease: () => {
          handleRelease(item, columnId);
        },
        onResponderTerminate: handleTerminate,
      };
    },
    [canDrag, handleGrant, handleMove, handleRelease, handleTerminate],
  );

  const dragActive = drag != null && !drag.settling;

  return (
    <AsyncBoundary
      loading={boardLoading}
      empty={boardEmpty}
      error={error}
      onRetry={onRetry}
      layout="kanban"
      emptyTitle="No columns"
      {...stackProps}>
      <View
        flex={1}
        position="relative"
        ref={(node: TamaguiElement | null) => {
          containerNodeRef.current = node;
        }}>
        <ScrollView
          ref={boardScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!dragActive}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            boardScrollXRef.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={64}>
          <XStack {...knobProps.gap}>
            {/* oxlint-disable-next-line react/refs -- the per-column handle registry is a ref map by design; each column is handed its own geometry record while rendering */}
            {columns.map((column, colIndex) => (
              <KanbanColumnView
                key={column.id}
                kanbanId={kanbanId}
                column={column}
                columnIndex={colIndex}
                renderCard={renderCard}
                columnWidth={columnWidth}
                minColumnHeight={minColumnHeight}
                estimateSize={estimateSize}
                overscan={overscan}
                emptyColumnMessage={emptyColumnMessage}
                onLoadMore={onLoadMore}
                getItemKey={getItemKey}
                hasMore={hasMore}
                isLoading={isLoading}
                onCardSelect={onCardSelect}
                renderColumnActions={renderColumnActions}
                getCardDragProps={canDrag ? getCardDragProps : undefined}
                handle={getHandle(column.id)}
                drag={drag}
                scrollEnabled={!dragActive}
              />
            ))}
            {boardEnd}
          </XStack>
        </ScrollView>

        {/* Drag ghost: 1:1 finger tracking + lift transforms (A-GESTURE). */}
        {drag && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: columnWidth,
              zIndex: 1000,
              transform: [
                { translateX: ghostPos.x },
                { translateY: ghostPos.y },
                {
                  scale: liftValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.03],
                  }),
                },
                {
                  rotate: liftValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '2.5deg'],
                  }),
                },
              ],
            }}>
            <View padding="$1">
              <Card
                overflow="hidden"
                {...LIFT_SHADOW}>
                {renderCard(drag.item)}
              </Card>
            </View>
          </Animated.View>
        )}
      </View>
    </AsyncBoundary>
  );
};

interface KanbanColumnViewProps<T> {
  kanbanId: string;
  column: KanbanColumn<T>;
  columnIndex: number;
  renderCard: (item: T) => React.ReactNode;
  columnWidth: number;
  minColumnHeight: number;
  estimateSize: number;
  overscan: number;
  emptyColumnMessage: string;
  onLoadMore?: () => void;
  getItemKey?: (item: T, index: number) => string | number;
  hasMore?: boolean;
  isLoading?: boolean;
  onCardSelect?: (item: T, columnId: string) => void;
  renderColumnActions?: (column: KanbanColumn<T>) => ReactNode;
  getCardDragProps?: (item: T, columnId: string, index: number) => CardDragProps;
  handle: NativeColumnHandle<T>;
  drag: NativeDragSession<T> | null;
  scrollEnabled: boolean;
}

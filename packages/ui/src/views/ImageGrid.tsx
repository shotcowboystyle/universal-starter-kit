import { Spinner } from '@repo/forms';
import {
  getLayoutSizeClass,
  keyboardFocusRingProps,
  type LayoutSizeClass,
  type MediaAspect,
  type TileSizeRung,
  ensureKeyboardModalityTracking,
  resolveMediaAspect,
  tileColumnsForWidth,
  tileSizeLadder,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { useHotkey } from '@tanstack/react-hotkeys';
import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
// useWindowDimensions from tamagui, NOT react-native: importing react-native
// here pulls react-native-web's CJS inline-style-prefixer into the SSR module
// graph, which the SSR runner evaluates as ESM ("exports is not defined").
import { View, XStack, YStack, getTokenValue, useWindowDimensions, type YStackProps } from 'tamagui';

import { useDirection } from '../hooks/useDirection';
import { AsyncBoundary, resolveAsyncStatus } from '../layouts/AsyncBoundary';
import { useTranslation } from '../shared/i18n';
import { Skeleton } from '../Skeleton';

/**
 * Configurable hotkey bindings for the ImageGrid component.
 */
export interface ImageGridHotkeys {
  /** Move focus up one row (default: ArrowUp) */
  up?: RegisterableHotkey;
  /** Move focus down one row (default: ArrowDown) */
  down?: RegisterableHotkey;
  /** Move focus left one column (default: ArrowLeft) */
  left?: RegisterableHotkey;
  /** Move focus right one column (default: ArrowRight) */
  right?: RegisterableHotkey;
  /** Select the focused item (default: Enter) */
  select?: RegisterableHotkey;
  /** Move focus to the first item (default: Home) */
  first?: RegisterableHotkey;
  /** Move focus to the last item (default: End) */
  last?: RegisterableHotkey;
}

/**
 * Props for the generic ImageGrid component.
 *
 * @typeParam T - The item type rendered in the grid
 */
export interface ImageGridProps<T> extends Omit<YStackProps, 'children'> {
  /** Array of items to render */
  items: T[];
  /** Render function for each grid item */
  renderItem: (item: T) => React.ReactNode;
  /** Called when an item is clicked */
  onItemClick?: (item: T) => void;
  /** Called when user scrolls near the bottom (infinite scroll) */
  onLoadMore?: () => void;
  /** Whether more items are available */
  hasMore?: boolean;
  /** Whether data is loading — initial load renders a grid-shaped skeleton twin */
  isLoading?: boolean;
  /**
   * Failed load. Wins over empty — never shows empty chrome.
   * Pass a string, Error, custom node, or `true` for the default error UI.
   */
  error?: boolean | string | Error | React.ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Number of columns in the grid (default: responsive to window width, 2-5) */
  columns?: number;
  /**
   * Named tile-size rung from the theme's generated ladder. Column
   * count derives from the rung's minWidth and the live gutter, so a
   * user-facing S/M/L/XL control maps straight onto this prop. WHICH rung is
   * the app's choice; the rung VALUES are the design system's. An explicit
   * `columns` wins over `tileSize`.
   */
  tileSize?: TileSizeRung;
  /**
   * Media aspect ratio (width/height) of the tiles — a named aspect
   * (`"square" | "photo" | "screen" | "video" | "portrait"`) or a number
   * The loading skeleton twin renders at this aspect so
   * non-square media does not jump on load. Default: `"square"`.
   */
  mediaAspect?: MediaAspect;
  /** Estimated height of each row in pixels (default: 240) */
  estimateSize?: number;
  /** Number of rows to render outside visible area (default: 3) */
  overscan?: number;
  /**
   * Fixed height of the grid in pixels. When set, the grid scrolls within
   * its own container; when omitted, the grid flows with the page scroll.
   */
  height?: number;
  /** Message shown when items array is empty */
  emptyMessage?: string;
  /** Configurable keyboard shortcut overrides */
  hotkeys?: ImageGridHotkeys;
}

const tileTrack = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 } as const;

/**
 * Skeleton twin of the grid: aspect-correct muted blocks
 * in the live cell geometry — same column count, same flex tracks + gap as the
 * ready wall — so the layout doesn't jump when images land. Gutters ride the
 * parent's `gap` (never a negative margin): a −half-gutter outset widened the
 * page past the viewport at 390 (FB-390-grid-overflow-x).
 */
function ImageGridSkeleton({
  columns,
  gutter,
  aspect,
  loadingLabel,
}: {
  columns: number;
  gutter: number;
  /** Resolved width/height ratio — the twin must be the media's shape. */
  aspect: number;
  loadingLabel: string;
}) {
  return (
    <YStack
      gap={gutter}
      data-async-skeleton="image-grid"
      data-media-aspect={aspect}
      aria-busy
      aria-label={loadingLabel}
      maxWidth="100%">
      {Array.from({ length: 2 }, (_, row) => (
        <XStack key={`skel-row-${row}`} gap={gutter}>
          {Array.from({ length: columns }, (_, col) => (
            <View key={`skel-${row}-${col}`} {...tileTrack}>
              <Skeleton variant="rounded" width="100%" aspectRatio={aspect} />
            </View>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

/**
 * One Photos/Polar tile: the rounded media frame is the perceived control.
 * The keyboard ring rides this node (inset — overflow clips children to radius),
 * never the padded cell and never the grid. Hover veil is pointer-only;
 * keyboard focus is ring-only (no fill wash over the image).
 * No status pip on the media; radius UNCLAMPED (not CONTAINER-CAP).
 * This module does not wrap Tint — nested hue is opt-in at the caller.
 */
function ImageGridTile({
  id,
  isFocused,
  showRing,
  clickable,
  colIndex,
  rowIndex,
  radiusFragment,
  onPress,
  children,
}: {
  id: string;
  isFocused: boolean;
  showRing: boolean;
  clickable: boolean;
  colIndex: number;
  rowIndex: number;
  radiusFragment: { borderRadius?: string | number; className?: string };
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const radius = radiusFragment.borderRadius;
  const [hovered, setHovered] = useState(false);
  return (
    <View {...tileTrack} role="presentation">
      <View
        id={id}
        // "gridcell" is a valid ARIA role but outside RN's `Role` union;
        // forwarded to the DOM node on web (house Record cast).
        {...({ role: 'gridcell' } as Record<string, unknown>)}
        aria-colindex={colIndex}
        aria-rowindex={rowIndex}
        aria-selected={isFocused}
        data-focused={isFocused || undefined}
        data-media-tile="image-grid"
        position="relative"
        {...radiusFragment}
        borderWidth={0}
        cursor={clickable ? 'pointer' : undefined}
        {...(showRing ? keyboardFocusRingProps : { outlineWidth: 0 })}
        // Tamagui forwards onHoverIn/onHoverOut at runtime; the RN-flavored
        // View prop type omits them (house Record cast).
        {...({
          onHoverIn: () => {
            setHovered(true);
          },
          onHoverOut: () => {
            setHovered(false);
          },
        } as Record<string, unknown>)}
        onPress={onPress}>
        {/* Clip media to the radius; keep overflow off the ring node so
            the ring outline is not severed (same split as Input.Box). */}
        <View borderRadius={radius} overflow="hidden">
          {children}
        </View>
        {hovered && !showRing ? (
          <View
            position="absolute"
            inset={0}
            pointerEvents="none"
            backgroundColor="$color12"
            opacity={0.08}
            borderRadius={radius}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Generic image grid component with keyboard navigation.
 *
 * Uses a CSS flex-wrap grid for reliable cross-platform rendering and
 * `@tanstack/react-hotkeys` for grid keyboard navigation.
 * Accepts data purely through props — no data fetching logic included.
 *
 * @typeParam T - The item type rendered in the grid
 *
 * @example
 * ```tsx
 * <ImageGrid
 *   items={images}
 *   columns={3}
 *   renderItem={(item) => (
 *     <Image source={{ uri: item.url }} width="100%" height={180} />
 *   )}
 *   onItemClick={(item) => console.log(item)}
 * />
 * ```
 */
export function ImageGrid<T>({
  items,
  renderItem,
  onItemClick,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  error = null,
  onRetry,
  columns: columnsProp,
  tileSize,
  mediaAspect,
  estimateSize: _estimateSize,
  overscan: _overscan,
  height: heightProp,
  emptyMessage: emptyMessageProp,
  hotkeys: hotkeyOverrides,
  ...stackProps
}: ImageGridProps<T>) {
  const { t } = useTranslation();
  const emptyMessage = emptyMessageProp ?? t('No items found');
  const { knobProps } = useResolvedKnobs({ component: 'ImageGrid' });
  const isRTL = useDirection() === 'rtl';
  // Gutters are the rows' flex `gap`, and every tile takes an equal flex
  // share of its row (web and native, no CSS calc). A short last row is
  // topped up with empty tracks so its tiles keep the full-row width.
  // Never a negative half-gutter margin — that widened scrollWidth past
  // the viewport at 390 (FB-390-grid-overflow-x).
  const gapToken = knobProps.gap.gap;
  const gutter =
    typeof gapToken === 'number'
      ? gapToken
      : ((getTokenValue(gapToken as Parameters<typeof getTokenValue>[0], 'space') as number) ?? 16);

  // Responsive default: a fixed count that looks right on desktop renders
  // skinny slivers on a phone. Explicit `columns` always wins; a `tileSize`
  // rung derives the count from the theme's generated ladder at the
  // live gutter. Otherwise column count is a structural layout decision, so
  // it consumes the canonical layout size classes
  // instead of a raw pixel ladder.
  const { width: windowWidth } = useWindowDimensions();
  const columnsBySizeClass: Record<LayoutSizeClass, number> = {
    compact: 2,
    medium: 3,
    expanded: 4,
    large: 5,
    xl: 5,
  };
  const columns =
    columnsProp ??
    (tileSize
      ? tileColumnsForWidth(windowWidth, tileSizeLadder[tileSize], gutter)
      : columnsBySizeClass[getLayoutSizeClass(windowWidth)]);
  const height = heightProp;
  const gridId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const handleContainerFocus = useCallback(() => {
    if (!wasKeyboardFocus()) {
      return;
    }
    setFocusedIndex((prev) => (prev < 0 ? 0 : prev));
  }, []);

  // Scroll to focused item using DOM scrollIntoView
  const scrollToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        document.getElementById(`${gridId}-item-${index}`)?.scrollIntoView({ block: 'nearest' });
      }
    },
    [gridId, items.length],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      setFocusedIndex((prev) => {
        if (items.length === 0) {
          return prev;
        }
        if (prev < 0) {
          scrollToIndex(0);
          return 0;
        }
        const next = Math.max(0, Math.min(items.length - 1, prev + delta));
        scrollToIndex(next);
        return next;
      });
    },
    [items.length, scrollToIndex],
  );

  // Keyboard navigation via @tanstack/react-hotkeys.
  // Photos: Left/Right walk reading order (wrap to the next row); Up/Down
  // jump a row. Physical arrows flip on RTL so visual direction holds.
  const hotkeyOpts = {
    target: containerRef as React.RefObject<HTMLElement | null>,
  };

  useHotkey(
    hotkeyOverrides?.right ?? 'ArrowRight',
    () => {
      moveFocus(isRTL ? -1 : 1);
    },
    hotkeyOpts,
  );
  useHotkey(
    hotkeyOverrides?.left ?? 'ArrowLeft',
    () => {
      moveFocus(isRTL ? 1 : -1);
    },
    hotkeyOpts,
  );
  useHotkey(
    hotkeyOverrides?.down ?? 'ArrowDown',
    () => {
      moveFocus(columns);
    },
    hotkeyOpts,
  );
  useHotkey(
    hotkeyOverrides?.up ?? 'ArrowUp',
    () => {
      moveFocus(-columns);
    },
    hotkeyOpts,
  );

  const activateFocused = useCallback(() => {
    if (focusedIndex >= 0 && focusedIndex < items.length) {
      onItemClick?.(items[focusedIndex]);
    }
  }, [focusedIndex, items, onItemClick]);

  useHotkey(hotkeyOverrides?.select ?? 'Enter', activateFocused, hotkeyOpts);
  // Photos opens the focused thumbnail with Space as well as Return.
  useHotkey('Space', activateFocused, hotkeyOpts);

  useHotkey(
    hotkeyOverrides?.first ?? 'Home',
    () => {
      if (items.length === 0) {
        return;
      }
      setFocusedIndex(0);
      scrollToIndex(0);
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.last ?? 'End',
    () => {
      if (items.length === 0) {
        return;
      }
      const last = items.length - 1;
      setFocusedIndex(last);
      scrollToIndex(last);
    },
    hotkeyOpts,
  );

  // Page-flow mode (no explicit height): fire infinite loads when the
  // bottom sentinel enters the viewport. IntersectionObserver is web-only;
  // native consumers needing infinite scroll pass an explicit `height` so
  // the grid owns its own scroll container.
  useEffect(() => {
    if (height !== undefined || !onLoadMore || !hasMore || isLoading) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onLoadMore();
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [height, onLoadMore, hasMore, isLoading]);

  // Error wins over empty; initial load renders the grid twin.
  const hasError = resolveAsyncStatus({ error }) === 'error';

  // Clamp focused index if items shrunk
  const effectiveFocused = focusedIndex >= items.length ? -1 : focusedIndex;
  const showKeyboardRing = effectiveFocused >= 0 && wasKeyboardFocus();
  const rowCount = Math.ceil(items.length / columns);
  // media-19 UNCLAMPED: spread the scale radius fragment, never
  // `containerRadius` / `cardSurface`. Tile has no padding for
  // CONTAINER-CAP to bite on.
  const radiusFragment = knobProps.borderRadius;

  const gridBody =
    items.length === 0 ? null : (
      <View
        ref={containerRef as any}
        role="grid"
        aria-label={t('Image grid')}
        aria-colcount={columns}
        aria-rowcount={rowCount}
        aria-activedescendant={effectiveFocused >= 0 ? `${gridId}-item-${effectiveFocused}` : undefined}
        tabIndex={0}
        outlineWidth={0}
        focusStyle={{ outlineWidth: 0 }}
        focusVisibleStyle={{ outlineWidth: 0 }}
        onFocus={handleContainerFocus}
        {...(height !== undefined
          ? {
              style: { height, overflowY: 'auto' } as React.CSSProperties,
              onScroll:
                onLoadMore && hasMore && !isLoading
                  ? () => {
                      const el = containerRef.current;
                      if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
                        onLoadMore();
                      }
                    }
                  : undefined,
            }
          : null)}>
        <YStack gap={gutter} maxWidth="100%">
          {Array.from({ length: rowCount }, (_, row) => {
            const start = row * columns;
            const rowItems = items.slice(start, start + columns);
            return (
              <XStack key={`${gridId}-row-${row}`} role="row" gap={gutter}>
                {rowItems.map((item, col) => {
                  const index = start + col;
                  const isFocused = effectiveFocused === index;
                  return (
                    <ImageGridTile
                      key={`${gridId}-item-${index}`}
                      id={`${gridId}-item-${index}`}
                      isFocused={isFocused}
                      showRing={isFocused && showKeyboardRing}
                      clickable={Boolean(onItemClick)}
                      colIndex={col + 1}
                      rowIndex={row + 1}
                      radiusFragment={radiusFragment}
                      onPress={
                        onItemClick
                          ? () => {
                              setFocusedIndex(index);
                              onItemClick(item);
                            }
                          : undefined
                      }>
                      {renderItem(item)}
                    </ImageGridTile>
                  );
                })}
                {Array.from({ length: columns - rowItems.length }, (_, pad) => (
                  <View key={`${gridId}-pad-${row}-${pad}`} {...tileTrack} aria-hidden />
                ))}
              </XStack>
            );
          })}
        </YStack>
        {isLoading && items.length > 0 && (
          <YStack padding="$2" alignItems="center">
            <Spinner size="small" />
          </YStack>
        )}
        <View ref={sentinelRef as any} height={1} />
      </View>
    );

  // Exactly one of: error → loading skeleton → empty → grid
  return (
    <AsyncBoundary
      compact
      error={error}
      onRetry={onRetry}
      errorTitle={t("Couldn't load images")}
      emptyTitle={emptyMessage}
      loading={
        !hasError && isLoading && items.length === 0 ? (
          <ImageGridSkeleton
            columns={columns}
            gutter={gutter}
            aspect={resolveMediaAspect(mediaAspect)}
            loadingLabel={t('Loading')}
          />
        ) : (
          false
        )
      }
      empty={!hasError && items.length === 0}
      {...stackProps}>
      {gridBody}
    </AsyncBoundary>
  );
}

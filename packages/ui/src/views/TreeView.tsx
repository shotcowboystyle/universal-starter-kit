import {
  CaretLeftIcon,
  CaretRightIcon,
  DotsSixVerticalIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react';
import {
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  stackRadiusProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useHotkey } from '@tanstack/react-hotkeys';
import type { RegisterableHotkey } from '@tanstack/react-hotkeys';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Text, View, XStack, YStack, isWeb, styled, type YStackProps } from 'tamagui';

import { componentColors } from '../componentColors';
import { useDirection } from '../hooks/useDirection';
import { EmptyState } from '../layouts/Page';
import { useTranslation } from '../shared/i18n';

import { autoScrollVelocity } from './kanbanDnd';
import {
  applyTreeMove,
  describeTreeCancel,
  describeTreeDragState,
  flattenDndRows,
  indicatorForTarget,
  resolveTreeDrop,
  subtreeIds,
  treeDropTargetForY,
  treeKeyboardLift,
  treeKeyboardMove,
  type TreeDragAnnouncement,
  type TreeDragSession,
  type TreeDropIndicator,
  type TreeDropTarget,
} from './treeViewDnd';
import { TREE_LIFT_SHADOW, treeDefaultHeight, treeEdgeRowPad, treeIndentStep } from './treeViewLayout';
import { diffVisibleRows, flattenVisibleIds, isEmptyDiff } from './treeViewMotion';
import { treeRevealExpansion, treeRevealOffset } from './treeViewReveal';

const DragHandleTarget = styled(View, { name: 'DragHandleTarget' });

/**
 * A node in a tree structure.
 *
 * @typeParam T - Additional data type stored on the node
 */
export interface TreeNode<T = unknown> {
  /** Unique node identifier */
  id: string;
  /** Display label */
  label: string;
  /** Child nodes */
  children?: TreeNode<T>[];
  /** Additional data */
  data?: T;
  /** Optional leading icon (closed / leaf state) */
  icon?: ReactNode;
  /** Optional leading icon when the branch is expanded */
  iconWhenExpanded?: ReactNode;
}

/**
 * Configurable hotkey bindings for the TreeView component.
 */
export interface TreeViewHotkeys {
  /** Move focus to next visible node (default: ArrowDown) */
  next?: RegisterableHotkey;
  /** Move focus to previous visible node (default: ArrowUp) */
  prev?: RegisterableHotkey;
  /** Expand focused node (default: ArrowRight) */
  expand?: RegisterableHotkey;
  /** Collapse focused node (default: ArrowLeft) */
  collapse?: RegisterableHotkey;
  /** Toggle expand/collapse on focused branch (default: Space) */
  toggle?: RegisterableHotkey;
  /** Select the focused node (default: Enter) */
  select?: RegisterableHotkey;
  /** Move focus to first visible node (default: Home) */
  first?: RegisterableHotkey;
  /** Move focus to last visible node (default: End) */
  last?: RegisterableHotkey;
}

export type TreeViewDisplay = 'default' | 'compressed';

/**
 * Props for the generic TreeView component.
 *
 * @typeParam T - Additional data type stored on the nodes
 */
export interface TreeViewProps<T = unknown> extends Omit<YStackProps, 'children' | 'display'> {
  /** Tree nodes to render */
  nodes: TreeNode<T>[];
  /** Render function for each node (defaults to rendering node.label) */
  renderNode?: (node: TreeNode<T>, depth: number) => React.ReactNode;
  /** Called when a node is expanded/collapsed */
  onNodeToggle?: (node: TreeNode<T>) => void;
  /** Called when a node is selected/clicked */
  onNodeSelect?: (node: TreeNode<T>) => void;
  /**
   * Called when a node is reordered by drag or keyboard. `target.index` is
   * the insertion position among the destination parent's children with the
   * moved node removed (0-based), so consumers can apply the move directly
   * with `applyTreeMove(nodes, nodeId, target)`. Opt-in: without this prop no
   * drag affordance renders and Space keeps its expand/collapse binding.
   */
  onNodeMove?: (nodeId: string, target: TreeDropTarget) => void;
  /** Estimated size of each row in pixels */
  estimateSize?: number;
  /** Number of items to render outside visible area (default: 10) */
  overscan?: number;
  /** Height of the scrollable container in pixels */
  height?: number;
  /** Initial vertical offset in layout pixels, restored once after usable list layout. */
  initialScrollOffset?: number;
  /** Observed, bounded vertical offset. Does not report unacknowledged scroll commands. */
  onScrollOffsetChange?: (offset: number) => void;
  /** Message shown when there are no nodes */
  emptyMessage?: string;
  /** Controlled expansion; takes precedence over initial expansion props. */
  expandedIds?: string[];
  /** Next complete expansion set from a user toggle or explicit reveal. */
  onExpandedIdsChange?: (ids: string[]) => void;
  /** Expand ancestors and reveal this row. Change requestId to reveal the same ID again. */
  revealRequest?: { id: string; requestId: number };
  /** Called once when the current reveal target is measured, mounted and visible. */
  onRevealComplete?: (request: { id: string; requestId: number }) => void;
  /** Initially expanded node IDs (wins over expandByDefault when provided) */
  defaultExpandedIds?: string[];
  /** Expand every branch on initial load */
  expandByDefault?: boolean;
  /** Density — compressed uses smaller row/icon/type sizes (EUI-style) */
  display?: TreeViewDisplay;
  /** Show caret arrows next to branches (default: true) */
  showExpansionArrows?: boolean;
  /** Sticky selected node id (separate from keyboard focus) */
  selectedId?: string;
  /** Accessible name for the tree (also accepts aria-label via stack props) */
  ariaLabel?: string;
  /** Configurable keyboard shortcut overrides */
  hotkeys?: TreeViewHotkeys;
}

/**
 * Flattened tree node used internally for virtualization.
 */
interface FlatNode<T> {
  node: TreeNode<T>;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  index: number;
  parentId: string | null;
}

/**
 * One toggle's worth of row motion. `armed` renders rows at their previous
 * position (FLIP invert) / hidden (enter) with the tween suppressed; one
 * frame later `play` releases everyone to identity with
 * `knobProps.transition` so the whole toggle tweens (Axiom 4).
 */
interface TreeMotion {
  phase: 'armed' | 'play';
  entering: Set<string>;
  deltas: Map<string, number>;
}

/** Entering rows rise this many px into their slot (subtle, from the parent). */
const ENTER_RISE_PX = -4;

// ── Reorder interaction constants (gesture recognition, not animation
// timing — a documented exemption; values mirror Kanban) ──────────

/** Pixels of pointer travel before a press becomes a drag (clicks stay clicks below this). */
const DRAG_THRESHOLD_PX = 4;
/** Touch/pen hold before lift so vertical swipes still scroll the list. */
const TOUCH_LONG_PRESS_MS = 200;
/** Distance from a scroll edge where auto-scroll engages. */
const AUTO_SCROLL_EDGE_PX = 48;
/** Auto-scroll speed cap in px per frame; ramps with edge proximity. */
const AUTO_SCROLL_MAX_SPEED = 16;

// Raised drag shadow: the house $4 elevation tier (single light source,
// blur = 2 × y-offset — Axiom 14 OPTICS). Gesture state, not the tree's
// resting elevation knob. Token color — never a hex (design-audit).
const LIFT_SHADOW = TREE_LIFT_SHADOW;

/** Active drag session UI state (pointer ghost or keyboard insertion point). */
interface TreeDragUi<T> {
  mode: 'pointer' | 'keyboard';
  node: TreeNode<T>;
  session: TreeDragSession;
  /** Dragged node + descendants (dimmed; invalid as drop targets). */
  subtree: Set<string>;
  sourceDepth: number;
  /**
   * Container-relative x of the row box at lift (rows span edge-to-edge —
   * SP-EDGE — so every settle destination shares this left edge).
   */
  homeX: number;
  /** Ghost clone chrome size (pointer mode). */
  width: number;
  height: number;
  indicator: TreeDropIndicator | null;
  /** Ghost position in list-container coordinates (pointer mode, 1:1). */
  ghost?: { x: number; y: number };
}

/** Overlay settle leap after a pointer drop/cancel (FLIP settle). */
interface TreeSettle<T> {
  node: TreeNode<T>;
  width: number;
  height: number;
  to: { x: number; y: number };
  /** Row hidden while the overlay is its visual (committed drops only). */
  hideId?: string;
}

function collectBranchIds<T>(items: TreeNode<T>[], into: Set<string> = new Set()): Set<string> {
  for (const node of items) {
    if ((node.children?.length ?? 0) > 0) {
      into.add(node.id);
      collectBranchIds(node.children!, into);
    }
  }
  return into;
}

/** Ancestor ids of `id` (root → parent), or null when the node is absent. */
function findNodePath<T>(items: TreeNode<T>[], id: string, trail: string[] = []): string[] | null {
  for (const node of items) {
    if (node.id === id) {
      return trail;
    }
    if (node.children?.length) {
      const found = findNodePath(node.children, id, [...trail, node.id]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Typeahead window matching menu rows (DropdownMenu) and Finder/VS Code jump-to. */
const TYPEAHEAD_MS = 600;

function defaultNodeIcon(hasChildren: boolean, isExpanded: boolean, iconSize: number): ReactNode {
  if (hasChildren) {
    return isExpanded ? (
      <FolderOpenIcon size={iconSize} weight="duotone" />
    ) : (
      <FolderIcon size={iconSize} weight="duotone" />
    );
  }
  return <FileIcon size={iconSize} weight="duotone" />;
}

/**
 * Generic virtualized tree view.
 *
 * Visual language is the VS Code / Primer / Carbon / Finder consensus:
 * flush rows (SP-EDGE), twistie + icon + label, indent guides at each
 * depth, selected = accent fill, keyboard focus = one inset ring on the
 * active row, stacked-group radius on the first/last row.
 *
 * Keyboard follows the WAI-ARIA tree pattern those systems share: one tab
 * stop, arrows move, Right expands then enters, Left collapses then climbs
 * to the parent, Home/End, typeahead. Pressing a branch row toggles it
 * (EUI/VS Code), so the caret is an indicator, not a sub-44px control.
 *
 * Motion (Axiom 4): expanding/collapsing a branch FLIPs surviving rows
 * and fades revealed children; the caret rotates. Tweened with
 * `knobProps.transition`, transform/opacity only. `animation: none` /
 * reduced motion jumps.
 *
 * @typeParam T - Additional data type stored on the nodes
 */
export function TreeView<T = unknown>({
  nodes,
  renderNode,
  onNodeToggle,
  onNodeSelect,
  onNodeMove,
  estimateSize: estimateSizeProp,
  overscan = 10,
  height: heightProp,
  initialScrollOffset,
  onScrollOffsetChange,
  emptyMessage: emptyMessageProp,
  defaultExpandedIds,
  expandedIds: controlledExpandedIds,
  onExpandedIdsChange,
  revealRequest,
  onRevealComplete,
  expandByDefault = false,
  display = 'default',
  showExpansionArrows = true,
  selectedId,
  ariaLabel,
  hotkeys: hotkeyOverrides,
  ...stackProps
}: TreeViewProps<T>) {
  const { t } = useTranslation();
  const emptyMessage = emptyMessageProp ?? t('No items found');
  const compressed = display === 'compressed';
  // Compressed display forces compact density stepping; default display
  // leaves the density knob in charge.
  const { knobProps, control } = useResolvedKnobs(compressed ? { compact: true } : undefined);
  // UX-P02 / Axiom 15: the selected row paints `$accentBackground`; its label
  // must sit on the accent fill with a luminance-computed foreground (the
  // scheme `$color` ink measured 2.59:1 on the accent).
  const onAccentLabel = useReadableTextOn('$accentBackground');
  const transition = knobProps.transition;
  const nestedPx = knobProps.nestedControl.px;
  const rowGap = knobProps.control.gap;
  const iconSize = knobProps.controlIcon.width;

  // Row height rides nestedControl (Carbon 32/24, VS Code ~22, house
  // nested px is 32 at medium) — not a private pixel table.
  const estimateSize = estimateSizeProp ?? nestedPx;
  const height = heightProp ?? treeDefaultHeight(nestedPx);
  const expandIconSize = iconSize;
  const nodeIconSize = iconSize;
  const caretSize = iconSize;
  // Collapsed caret encodes the expansion direction (inline-end), so it
  // mirrors in RTL via glyph swap (useDirection, Axiom 15); the rotation
  // sign flips with it so the expanded state still points down.
  const isRTL = useDirection() === 'rtl';
  const CollapsedCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const expandedCaretRotation = isRTL ? '-90deg' : '90deg';
  // Indent is proportional to size (nestedControl), not a space-keyed table.
  const indentStep = treeIndentStep(nestedPx);
  // SP-EDGE: the frame owns no inset; rows own the shared
  // space-token pad (same map as getTableCellPadding). compact display
  // steps space only — no private compressed pad table.
  const rowPad = treeEdgeRowPad(knobProps.space);

  const treeId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const flashListRef = useRef<FlashListRef<FlatNode<T>>>(null);
  const initialScroll = useRef<
    | {
        offset: number;
        attempted?: { target: number; width: number; height: number; contentHeight: number };
      }
    | undefined
  >(
    initialScrollOffset === undefined
      ? undefined
      : { offset: Number.isFinite(initialScrollOffset) ? Math.max(0, initialScrollOffset) : 0 },
  );
  const cancelInitialScroll = useCallback(() => {
    initialScroll.current = undefined;
  }, []);
  const hasNodes = nodes.length > 0;
  const listInstance = useMemo(
    () => ({ hasNodes, attached: false, loaded: false, indexScrollRequested: false, offset: 0 }),
    [hasNodes],
  );
  const scrollActive = useRef(true);
  const lastReportedOffset = useRef<number | undefined>(undefined);
  const offsetCallback = useRef(onScrollOffsetChange);
  useLayoutEffect(() => {
    offsetCallback.current = onScrollOffsetChange;
  }, [onScrollOffsetChange]);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  // Ring is a React flag, not a render-time wasKeyboardFocus() read —
  // Tab-away/Tab-back with the same activedescendant must still re-paint.
  const [keyboardRing, setKeyboardRing] = useState(false);
  const typeaheadRef = useRef({ buffer: '', at: 0 });
  // Axiom 12: the tree is one tab stop (aria-activedescendant pattern) — but
  // Tab-in with no active row painted NOTHING (ring suppressed on the
  // container, no row highlighted until an arrow was pressed). On
  // keyboard-origin focus, light up the first row so position is visible.
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const handleContainerFocus = useCallback(() => {
    const kb = wasKeyboardFocus();
    setKeyboardRing(kb);
    if (kb) {
      setFocusedIndex((prev) => (prev < 0 ? 0 : prev));
    }
  }, []);
  const handleContainerBlur = useCallback(() => {
    setKeyboardRing(false);
  }, []);
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpandedIds) {
      return new Set(defaultExpandedIds);
    }
    if (expandByDefault) {
      return collectBranchIds(nodes);
    }
    return new Set();
  });

  const expandedIds = useMemo(
    () => (controlledExpandedIds === undefined ? internalExpandedIds : new Set(controlledExpandedIds)),
    [controlledExpandedIds, internalExpandedIds],
  );
  const setExpandedIds = useCallback(
    (next: ReadonlySet<string>) => {
      if (controlledExpandedIds === undefined) {
        setInternalExpandedIds(new Set(next));
      }
      onExpandedIdsChange?.([...next]);
    },
    [controlledExpandedIds, onExpandedIdsChange],
  );

  // ── Expand/collapse motion (FLIP + enter fade; Axiom 4) ────────────────
  const [motion, setMotion] = useState<TreeMotion | null>(null);
  const rowHeights = useRef(new Map<string, number>());
  const getRowHeight = useCallback((id: string) => rowHeights.current.get(id) ?? estimateSize, [estimateSize]);

  const toggleNode = useCallback(
    (node: TreeNode<T>) => {
      cancelInitialScroll();
      const next = new Set(expandedIds);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      setExpandedIds(next);
      onNodeToggle?.(node);
    },
    [expandedIds, setExpandedIds, onNodeToggle, cancelInitialScroll],
  );

  const previousExpandedIds = useRef(expandedIds);
  useLayoutEffect(() => {
    const previous = previousExpandedIds.current;
    previousExpandedIds.current = expandedIds;
    if (previous.size === expandedIds.size && [...previous].every((id) => expandedIds.has(id))) {
      return;
    }
    if (transition) {
      const diff = diffVisibleRows(
        flattenVisibleIds(nodes, previous),
        flattenVisibleIds(nodes, expandedIds),
        getRowHeight,
      );
      setMotion(isEmptyDiff(diff) ? null : { phase: 'armed', ...diff });
    } else {
      setMotion(null);
    }
  }, [expandedIds, nodes, transition, getRowHeight]);

  // Release the FLIP one frame after the armed styles paint so the tween
  // runs from the previous layout to the new one.
  useLayoutEffect(() => {
    if (motion?.phase !== 'armed') {
      return;
    }
    const raf = requestAnimationFrame(() => {
      setMotion((m) => (m && m.phase === 'armed' ? { ...m, phase: 'play' } : m));
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [motion]);

  const flatNodes = useMemo(() => {
    const result: FlatNode<T>[] = [];

    const walk = (items: TreeNode<T>[], depth: number, parentId: string | null) => {
      for (const node of items) {
        const hasChildren = (node.children?.length ?? 0) > 0;
        const isExpanded = expandedIds.has(node.id);
        result.push({
          node,
          depth,
          hasChildren,
          isExpanded,
          index: result.length,
          parentId,
        });
        if (isExpanded && node.children) {
          walk(node.children, depth + 1, node.id);
        }
      }
    };

    walk(nodes, 0, null);
    return result;
  }, [nodes, expandedIds]);

  const revealIntent = useRef<
    | {
        id: string;
        requestId: number;
        complete: boolean;
        notifiedExpansion?: ReadonlySet<string>;
      }
    | undefined
  >(undefined);
  const scrollFrame = useRef<number | undefined>(undefined);
  const scrollStep = useRef<() => void>(() => {});
  const renderedRows = useRef(new Set<string>());
  const scrollBounds = useCallback(() => {
    const list = flashListRef.current;
    if (!scrollActive.current || !listInstance.attached || !listInstance.loaded || !list) {
      return;
    }
    if (isWeb) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
        return;
      }
    }
    const viewport = list.getWindowSize();
    const contentHeight = list.getChildContainerDimensions().height + list.getFirstItemOffset();
    if (
      !Number.isFinite(viewport.width) ||
      viewport.width <= 0 ||
      !Number.isFinite(viewport.height) ||
      viewport.height <= 0 ||
      !Number.isFinite(contentHeight) ||
      contentHeight <= 0
    ) {
      return;
    }
    return {
      list,
      width: viewport.width,
      height: viewport.height,
      contentHeight,
      maxOffset: Math.max(0, contentHeight - viewport.height),
    };
  }, [listInstance]);
  const observeOffset = useCallback(
    (offset: number, fromEvent = false) => {
      if (!scrollActive.current || !listInstance.attached || !Number.isFinite(offset)) {
        return;
      }
      if (fromEvent && initialScroll.current?.attempted === undefined && offset !== listInstance.offset) {
        cancelInitialScroll();
      }
      listInstance.offset = offset;
      const bounds = scrollBounds();
      if (!bounds) {
        return;
      }
      const bounded = Math.max(0, Math.min(offset, bounds.maxOffset));
      const initial = initialScroll.current;
      if (initial) {
        const target = Math.min(initial.offset, bounds.maxOffset);
        if (initial.attempted ? Math.abs(bounded - target) >= 1 : bounded !== target) {
          return;
        }
        initialScroll.current = undefined;
      }
      if (offsetCallback.current && lastReportedOffset.current !== bounded) {
        lastReportedOffset.current = bounded;
        offsetCallback.current(bounded);
      }
    },
    [cancelInitialScroll, scrollBounds, listInstance],
  );
  const scheduleScroll = useCallback(() => {
    if (!scrollActive.current || !listInstance.attached || scrollFrame.current !== undefined) {
      return;
    }
    if (!initialScroll.current && (!revealIntent.current || revealIntent.current.complete) && !offsetCallback.current) {
      return;
    }
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = undefined;
      if (listInstance.attached) {
        scrollStep.current();
      }
    });
  }, [listInstance]);
  const attachList = useCallback(
    (list: FlashListRef<FlatNode<T>> | null) => {
      flashListRef.current = list;
      listInstance.attached = list !== null;
      if (!list) {
        listInstance.loaded = false;
        if (initialScroll.current) {
          initialScroll.current.attempted = undefined;
        }
        if (scrollFrame.current !== undefined) {
          cancelAnimationFrame(scrollFrame.current);
        }
        scrollFrame.current = undefined;
      }
    },
    [listInstance],
  );

  useLayoutEffect(() => {
    scrollActive.current = true;
    return () => {
      scrollActive.current = false;
      revealIntent.current = undefined;
      if (scrollFrame.current !== undefined) {
        cancelAnimationFrame(scrollFrame.current);
      }
      scrollFrame.current = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    if (!revealRequest) {
      revealIntent.current = undefined;
    } else if (
      revealIntent.current?.id !== revealRequest.id ||
      revealIntent.current?.requestId !== revealRequest.requestId
    ) {
      cancelInitialScroll();
      revealIntent.current = { ...revealRequest, complete: false };
    }
    const step = () => {
      const currentList = flashListRef.current;
      if (currentList) {
        // Index preparation changes FlashList's getter before transport completes.
        // Once requested, only delivered events can advance this list's observation.
        observeOffset(
          listInstance.indexScrollRequested ? listInstance.offset : currentList.getAbsoluteLastScrollOffset(),
        );
      }
      if (!scrollActive.current) {
        return;
      }
      if (scrollStep.current !== step) {
        scheduleScroll();
        return;
      }
      const intent = revealIntent.current;
      if (!intent || intent.complete) {
        const initial = initialScroll.current;
        const bounds = scrollBounds();
        if (!initial || !bounds || flatNodes.length === 0) {
          return;
        }
        const target = Math.min(initial.offset, bounds.maxOffset);
        const attempted = initial.attempted;
        if (
          !attempted ||
          attempted.target !== target ||
          attempted.width !== bounds.width ||
          attempted.height !== bounds.height ||
          attempted.contentHeight !== bounds.contentHeight
        ) {
          initial.attempted = {
            target,
            width: bounds.width,
            height: bounds.height,
            contentHeight: bounds.contentHeight,
          };
          bounds.list.scrollToOffset({ offset: target, animated: false });
        }
        return;
      }
      const next = treeRevealExpansion(nodes, expandedIds, intent.id);
      if (!next) {
        return;
      }
      if (next !== expandedIds) {
        const notified = intent.notifiedExpansion;
        if (!notified || notified.size !== next.size || [...next].some((id) => !notified.has(id))) {
          intent.notifiedExpansion = next;
          setExpandedIds(next);
        }
        return;
      }
      if (motion) {
        setMotion(null);
        return;
      }
      const list = flashListRef.current;
      const index = flatNodes.findIndex((item) => item.node.id === intent.id);
      if (!list || index < 0) {
        return;
      }
      if (isWeb) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return;
        }
      }
      const viewport = list.getWindowSize();
      if (viewport.width <= 0) {
        return;
      }
      const layout = list.getLayout(index);
      if (!layout) {
        return;
      }
      const offset = listInstance.indexScrollRequested ? listInstance.offset : list.getAbsoluteLastScrollOffset();
      const top = layout.y + list.getFirstItemOffset();
      const nextOffset = treeRevealOffset({ y: top, height: layout.height }, offset, viewport.height);
      if (nextOffset === undefined) {
        return;
      }
      if (Math.abs(nextOffset - offset) < 1) {
        let visible = top < offset + viewport.height && top + layout.height > offset;
        if (!listInstance.indexScrollRequested) {
          const range = list.computeVisibleIndices();
          visible = visible && index >= range.startIndex && index <= range.endIndex;
        }
        if (
          revealIntent.current === intent &&
          layout.isHeightMeasured &&
          renderedRows.current.has(intent.id) &&
          visible
        ) {
          intent.complete = true;
          onRevealComplete?.({ id: intent.id, requestId: intent.requestId });
        }
        return;
      }
      // FlashList's scrollToIndex has uncancellable delayed steps. Immediate offsets
      // let the next layout/scroll event correct estimates using only the latest intent.
      list.scrollToOffset({ offset: nextOffset, animated: false });
    };
    scrollStep.current = step;
    scheduleScroll();
  }, [
    nodes,
    expandedIds,
    setExpandedIds,
    flatNodes,
    revealRequest?.id,
    revealRequest?.requestId,
    onRevealComplete,
    height,
    motion,
    scheduleScroll,
    cancelInitialScroll,
    observeOffset,
    scrollBounds,
    listInstance,
  ]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < flatNodes.length) {
        cancelInitialScroll();
        listInstance.indexScrollRequested = true;
        flashListRef.current?.scrollToIndex({ index, animated: true });
      }
    },
    [flatNodes.length, cancelInitialScroll, listInstance],
  );

  const focusRow = useCallback(
    (index: number) => {
      setKeyboardRing(true);
      setFocusedIndex(index);
      scrollToIndex(index);
    },
    [scrollToIndex],
  );

  // Carbon: a collapsed ancestor of the selected node inherits a muted
  // "contains selection" fill so the selection is not lost off-screen.
  const collapsedSelectedAncestors = useMemo(() => {
    if (!selectedId) {
      return new Set<string>();
    }
    const path = findNodePath(nodes, selectedId);
    if (!path) {
      return new Set<string>();
    }
    return new Set(path.filter((id) => !expandedIds.has(id)));
  }, [nodes, selectedId, expandedIds]);

  // ── Drag-reorder (drag anatomy / DnD a11y) ─────────────────
  // Opt-in via `onNodeMove`. The ghost is an overlay clone outside the
  // FlashList (virtualization-safe); hit-testing is pure math over the
  // flattened rows + measured heights, so no DOM traversal of virtual cells.
  const canReorder = Boolean(onNodeMove);

  const [dragUi, setDragUi] = useState<TreeDragUi<T> | null>(null);
  const [settle, setSettle] = useState<TreeSettle<T> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // Scroll offset snapshot that re-renders the drop indicator while the list
  // scrolls mid-drag (the ref below is the always-current value).
  const [dragScrollY, setDragScrollY] = useState(0);
  const dragUiRef = useRef<TreeDragUi<T> | null>(null);
  dragUiRef.current = dragUi;
  const scrollOffsetRef = useRef(0);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  // A committed move's FLIP arms only once the consumer applies the move
  // (guarded by the expected visible order — a lie is worse than a jump).
  const pendingMoveFlipRef = useRef<{ prevIds: string[]; expectedIds: string[] } | null>(null);

  useEffect(() => () => sessionCleanupRef.current?.(), []);

  const dndRows = useMemo(() => flattenDndRows(nodes, expandedIds), [nodes, expandedIds]);

  /** Content-coordinate top of the visible row / insertion line at a flat index. */
  const topOfFlatIndex = useCallback(
    (flatIndex: number): number => {
      let top = 0;
      for (let i = 0; i < flatIndex && i < flatNodes.length; i++) {
        top += getRowHeight(flatNodes[i].node.id);
      }
      return top;
    },
    [flatNodes, getRowHeight],
  );

  const announce = useCallback(
    (a: TreeDragAnnouncement) => {
      const parent = a.parent ?? t('top level');
      const text =
        a.type === 'lift'
          ? t(
              'Lifted {{node}} in {{parent}}, position {{position}} of {{count}}. Use arrow keys to move, space to drop, escape to cancel.',
              { ...a, parent },
            )
          : a.type === 'move'
            ? t('Moved {{node}} to {{parent}}, position {{position}} of {{count}}.', {
                ...a,
                parent,
              })
            : a.type === 'drop'
              ? t('Dropped {{node}} in {{parent}}, position {{position}} of {{count}}.', {
                  ...a,
                  parent,
                })
              : t('Movement cancelled. {{node}} returned to {{parent}}.', { ...a, parent });
      setAnnouncement(text);
    },
    [t],
  );

  /** Pointer y (client coords) → drop target + indicator, or null over the dragged subtree. */
  const hitTest = useCallback(
    (clientY: number, ui: TreeDragUi<T>): { target: TreeDropTarget; indicator: TreeDropIndicator } | null => {
      const rect = (containerRef.current as HTMLElement | null)?.getBoundingClientRect?.();
      if (!rect) {
        return null;
      }
      return treeDropTargetForY({
        localY: clientY - rect.top + scrollOffsetRef.current,
        rows: dndRows,
        getHeight: getRowHeight,
        session: ui.session,
        draggedSubtree: ui.subtree,
      });
    },
    [dndRows, getRowHeight],
  );

  // ── Auto-scroll near list edges (velocity ramps with proximity) ────────

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = null;
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();
    const tick = () => {
      const ui = dragUiRef.current;
      if (!ui || ui.mode !== 'pointer') {
        autoScrollRafRef.current = null;
        return;
      }
      const rect = (containerRef.current as HTMLElement | null)?.getBoundingClientRect?.();
      if (rect) {
        const vy = autoScrollVelocity({
          pos: pointerPosRef.current.y,
          start: rect.top,
          end: rect.bottom,
          edge: AUTO_SCROLL_EDGE_PX,
          maxSpeed: AUTO_SCROLL_MAX_SPEED,
        });
        if (vy !== 0) {
          const max = Math.max(0, topOfFlatIndex(flatNodes.length) - rect.height);
          const next = Math.min(max, Math.max(0, scrollOffsetRef.current + vy));
          if (next !== scrollOffsetRef.current) {
            scrollOffsetRef.current = next;
            flashListRef.current?.scrollToOffset({ offset: next, animated: false });
            setDragScrollY(next);
            const hit = hitTest(pointerPosRef.current.y, ui);
            if (hit) {
              setDragUi((prev) =>
                prev
                  ? {
                      ...prev,
                      session: { ...prev.session, target: hit.target },
                      indicator: hit.indicator,
                    }
                  : prev,
              );
            }
          }
        }
      }
      autoScrollRafRef.current = requestAnimationFrame(tick);
    };
    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [flatNodes.length, hitTest, stopAutoScroll, topOfFlatIndex]);

  // ── Drop / cancel ──────────────────────────────────────────────────────

  const endDrag = useCallback(
    (commit: boolean) => {
      const ui = dragUiRef.current;
      if (!ui) {
        return;
      }
      stopAutoScroll();
      sessionCleanupRef.current?.();
      sessionCleanupRef.current = null;

      const resolved = resolveTreeDrop(ui.session);
      const canCommit = commit && resolved.commit && Boolean(onNodeMove);

      // Destination geometry from the post-move layout so the overlay
      // settles exactly onto the row's final slot.
      let dest: { x: number; y: number } | null = null;
      let expectedIds: string[] | null = null;
      if (canCommit) {
        const nextNodes = applyTreeMove(nodes, ui.session.nodeId, resolved.to);
        expectedIds = flattenVisibleIds(nextNodes, expandedIds);
        const destFlat = expectedIds.indexOf(ui.session.nodeId);
        const parentRow =
          resolved.to.parentId === null ? null : (dndRows.find((r) => r.id === resolved.to.parentId) ?? null);
        let top = 0;
        if (destFlat >= 0) {
          for (let i = 0; i < destFlat; i++) {
            top += getRowHeight(expectedIds[i]);
          }
        } else if (parentRow) {
          // Moved into a collapsed parent: the row will not be visible —
          // settle the ghost onto the parent row instead.
          top = topOfFlatIndex(dndRows.indexOf(parentRow));
        }
        dest = { x: ui.homeX, y: top - scrollOffsetRef.current };
      } else {
        const originFlat = flatNodes.findIndex((f) => f.node.id === ui.session.nodeId);
        dest = {
          x: ui.homeX,
          y: (originFlat >= 0 ? topOfFlatIndex(originFlat) : 0) - scrollOffsetRef.current,
        };
      }

      setDragUi(null);
      dragUiRef.current = null;

      if (ui.mode === 'pointer' && dest) {
        setSettle({
          node: ui.node,
          width: ui.width,
          height: ui.height,
          to: dest,
          hideId: canCommit ? ui.session.nodeId : undefined,
        });
      }

      if (canCommit && expectedIds) {
        if (transition) {
          pendingMoveFlipRef.current = {
            prevIds: flattenVisibleIds(nodes, expandedIds),
            expectedIds,
          };
        }
        announce(describeTreeDragState('drop', ui.session, nodes, ui.node.label));
        onNodeMove?.(ui.session.nodeId, resolved.to);
      } else {
        announce(describeTreeCancel(ui.session, nodes, ui.node.label));
      }
    },
    [
      announce,
      dndRows,
      expandedIds,
      flatNodes,
      getRowHeight,
      nodes,
      onNodeMove,
      stopAutoScroll,
      topOfFlatIndex,
      transition,
    ],
  );

  // Arm the move FLIP once the consumer applies the move: surviving rows
  // tween from their pre-move offsets (transform-only). If the
  // consumer renders anything other than the expected order, drop the FLIP.
  useLayoutEffect(() => {
    const pending = pendingMoveFlipRef.current;
    if (!pending) {
      return;
    }
    const currentIds = flatNodes.map((f) => f.node.id);
    const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (same(currentIds, pending.prevIds)) {
      return;
    } // move not applied yet
    pendingMoveFlipRef.current = null;
    if (!same(currentIds, pending.expectedIds)) {
      return;
    }
    const diff = diffVisibleRows(pending.prevIds, pending.expectedIds, getRowHeight);
    if (!isEmptyDiff(diff)) {
      setMotion({ phase: 'armed', ...diff });
    }
  }, [flatNodes, getRowHeight]);

  // Settle completion: watch the overlay transform until it stops changing
  // (mechanical spring-rest detection — no timing constants). With
  // animation=none the position lands in one frame and this exits instantly.
  useEffect(() => {
    if (!settle) {
      return;
    }
    const el = (containerRef.current as HTMLElement | null)?.querySelector?.(
      '[data-treeview-overlay]',
    ) as HTMLElement | null;
    if (!el || typeof requestAnimationFrame === 'undefined') {
      setSettle(null);
      return;
    }
    let last: string | null = null;
    let stableFrames = 0;
    let raf = 0;
    const check = () => {
      const current = getComputedStyle(el).transform;
      if (current === last) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        last = current;
      }
      if (stableFrames >= 3) {
        setSettle(null);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [settle]);

  // ── Pointer drag session (drag handle → window listeners) ──────────────

  const beginPointerDrag = useCallback(
    (flat: FlatNode<T>, rowEl: HTMLElement, clientX: number, clientY: number): boolean => {
      const container = containerRef.current as HTMLElement | null;
      if (!container?.getBoundingClientRect) {
        return false;
      }
      const session = treeKeyboardLift(nodes, flat.node.id);
      if (!session) {
        return false;
      }
      cancelInitialScroll();
      const rowRect = rowEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      grabOffsetRef.current = { x: clientX - rowRect.left, y: clientY - rowRect.top };
      pointerPosRef.current = { x: clientX, y: clientY };
      const ui: TreeDragUi<T> = {
        mode: 'pointer',
        node: flat.node,
        session,
        subtree: subtreeIds(nodes, flat.node.id),
        sourceDepth: flat.depth,
        homeX: rowRect.left - containerRect.left,
        width: rowRect.width,
        height: rowRect.height,
        indicator: null,
        ghost: {
          x: rowRect.left - containerRect.left,
          y: rowRect.top - containerRect.top,
        },
      };
      setSettle(null);
      setDragScrollY(scrollOffsetRef.current);
      setDragUi(ui);
      dragUiRef.current = ui;
      announce(describeTreeDragState('lift', session, nodes, flat.node.label));
      startAutoScroll();
      return true;
    },
    [announce, nodes, startAutoScroll, cancelInitialScroll],
  );

  const handleDragHandlePointerDown = useCallback(
    (flat: FlatNode<T>, e: any) => {
      if (!canReorder || typeof window === 'undefined') {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      if (dragUiRef.current) {
        return;
      }
      sessionCleanupRef.current?.();
      e.stopPropagation?.();

      const handleEl = e.currentTarget as HTMLElement;
      const rowEl = (handleEl.closest?.('[data-treeview-row]') ?? handleEl) as HTMLElement;
      const startX = e.clientX as number;
      const startY = e.clientY as number;
      const pointerType: string = e.pointerType ?? 'mouse';
      let lifted = false;
      let longPressTimer: ReturnType<typeof setTimeout> | null = null;
      let prevUserSelect = '';
      let prevCursor = '';

      const lift = (x: number, y: number) => {
        if (lifted) {
          return;
        }
        lifted = beginPointerDrag(flat, rowEl, x, y);
        if (!lifted) {
          return;
        }
        prevUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        prevCursor = document.documentElement.style.cursor;
        document.documentElement.style.cursor = 'grabbing';
      };

      const teardown = () => {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('contextmenu', onContextMenu, true);
        sessionCleanupRef.current = null;
        if (lifted) {
          document.body.style.userSelect = prevUserSelect;
          document.documentElement.style.cursor = prevCursor;
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }
      };

      const onMove = (me: PointerEvent) => {
        pointerPosRef.current = { x: me.clientX, y: me.clientY };
        if (!lifted) {
          const travelled = Math.hypot(me.clientX - startX, me.clientY - startY);
          if (pointerType === 'mouse') {
            if (travelled >= DRAG_THRESHOLD_PX) {
              lift(me.clientX, me.clientY);
            }
          } else if (travelled >= DRAG_THRESHOLD_PX) {
            // Finger moved before the hold elapsed — this is a scroll, not a drag.
            teardown();
          }
          if (!lifted) {
            return;
          }
        }
        const containerRect = (containerRef.current as HTMLElement | null)?.getBoundingClientRect?.();
        const ghost = {
          x: me.clientX - (containerRect?.left ?? 0) - grabOffsetRef.current.x,
          y: me.clientY - (containerRect?.top ?? 0) - grabOffsetRef.current.y,
        };
        const ui = dragUiRef.current;
        if (!ui) {
          return;
        }
        const hit = hitTest(me.clientY, ui);
        setDragUi((prev) =>
          prev
            ? {
                ...prev,
                ghost,
                ...(hit && {
                  session: { ...prev.session, target: hit.target },
                  indicator: hit.indicator,
                }),
              }
            : prev,
        );
      };

      const onUp = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(true);
        }
      };

      const onCancel = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      const onKey = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape') {
          return;
        }
        ke.stopPropagation();
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      // While lifted, claim touch moves so the page/list does not scroll out
      // from under the drag (registered non-passive on purpose).
      const onTouchMove = (te: TouchEvent) => {
        if (lifted) {
          te.preventDefault();
        }
      };
      const onContextMenu = (ce: Event) => {
        if (lifted || longPressTimer !== null) {
          ce.preventDefault();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('contextmenu', onContextMenu, true);
      sessionCleanupRef.current = () => {
        const wasLifted = lifted;
        teardown();
        if (wasLifted) {
          endDrag(false);
        }
      };

      if (pointerType !== 'mouse') {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          const p = pointerPosRef.current;
          lift(p.x || startX, p.y || startY);
        }, TOUCH_LONG_PRESS_MS);
        pointerPosRef.current = { x: startX, y: startY };
      }
    },
    [beginPointerDrag, canReorder, endDrag, hitTest],
  );

  // ── Keyboard drag (kanban grammar mapped onto the tree) ────────

  const liftFocusedNode = useCallback((): boolean => {
    if (!canReorder || dragUiRef.current) {
      return false;
    }
    const flat = flatNodes[focusedIndex];
    if (!flat) {
      return false;
    }
    const session = treeKeyboardLift(nodes, flat.node.id);
    if (!session) {
      return false;
    }
    cancelInitialScroll();
    const ui: TreeDragUi<T> = {
      mode: 'keyboard',
      node: flat.node,
      session,
      subtree: subtreeIds(nodes, flat.node.id),
      sourceDepth: flat.depth,
      homeX: 0,
      width: 0,
      height: getRowHeight(flat.node.id),
      indicator: indicatorForTarget(dndRows, session, session.target),
    };
    setSettle(null);
    setDragScrollY(scrollOffsetRef.current);
    setDragUi(ui);
    dragUiRef.current = ui;
    announce(describeTreeDragState('lift', session, nodes, flat.node.label));
    return true;
  }, [announce, canReorder, dndRows, flatNodes, focusedIndex, getRowHeight, nodes, cancelInitialScroll]);

  const moveKeyboardDrag = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right'): boolean => {
      const ui = dragUiRef.current;
      if (!ui || ui.mode !== 'keyboard') {
        return false;
      }
      const next = treeKeyboardMove(ui.session, nodes, direction);
      if (next === ui.session) {
        return true;
      } // boundary no-op still swallows the key
      const indicator = indicatorForTarget(dndRows, next, next.target);
      const updated: TreeDragUi<T> = { ...ui, session: next, indicator };
      setDragUi(updated);
      dragUiRef.current = updated;
      if (indicator.kind === 'line' && flatNodes.length > 0) {
        scrollToIndex(Math.min(indicator.flatIndex, flatNodes.length - 1));
      }
      announce(describeTreeDragState('move', next, nodes, ui.node.label));
      return true;
    },
    [announce, dndRows, flatNodes.length, nodes, scrollToIndex],
  );

  const hotkeyOpts = {
    target: containerRef as React.RefObject<HTMLElement | null>,
  };

  useHotkey(
    hotkeyOverrides?.next ?? 'ArrowDown',
    () => {
      if (moveKeyboardDrag('down')) {
        return;
      }
      setKeyboardRing(true);
      setFocusedIndex((prev) => {
        const next = prev < 0 ? 0 : Math.min(prev + 1, Math.max(0, flatNodes.length - 1));
        scrollToIndex(next);
        return next;
      });
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.prev ?? 'ArrowUp',
    () => {
      if (moveKeyboardDrag('up')) {
        return;
      }
      setKeyboardRing(true);
      setFocusedIndex((prev) => {
        const next = prev < 0 ? flatNodes.length - 1 : Math.max(prev - 1, 0);
        if (next >= 0) {
          scrollToIndex(next);
        }
        return next;
      });
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.expand ?? 'ArrowRight',
    () => {
      // While lifted: nest into the previous sibling (kanban grammar).
      if (moveKeyboardDrag('right')) {
        return;
      }
      // APG / Primer / Carbon / VS Code: collapsed → expand; expanded → first child.
      if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
        const flat = flatNodes[focusedIndex];
        if (flat.hasChildren && !flat.isExpanded) {
          setKeyboardRing(true);
          toggleNode(flat.node);
        } else if (flat.hasChildren && flat.isExpanded) {
          const child = focusedIndex + 1;
          if (child < flatNodes.length && flatNodes[child].parentId === flat.node.id) {
            focusRow(child);
          }
        }
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.collapse ?? 'ArrowLeft',
    () => {
      // While lifted: un-nest to after the current parent.
      if (moveKeyboardDrag('left')) {
        return;
      }
      // APG / Primer / Carbon / Finder: expanded → collapse; else climb to parent.
      if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
        const flat = flatNodes[focusedIndex];
        if (flat.hasChildren && flat.isExpanded) {
          setKeyboardRing(true);
          toggleNode(flat.node);
        } else if (flat.parentId) {
          const parentIndex = flatNodes.findIndex((f) => f.node.id === flat.parentId);
          if (parentIndex >= 0) {
            focusRow(parentIndex);
          }
        }
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.toggle ?? 'Space',
    () => {
      // With reorder enabled, Space follows the WAI-ARIA drag grammar
      // (lift/drop); expand/collapse stays on ArrowRight/ArrowLeft + press.
      if (dragUiRef.current?.mode === 'keyboard') {
        endDrag(true);
        return;
      }
      if (canReorder) {
        liftFocusedNode();
        return;
      }
      if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
        const { node, hasChildren } = flatNodes[focusedIndex];
        if (hasChildren) {
          toggleNode(node);
        }
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.select ?? 'Enter',
    () => {
      if (dragUiRef.current?.mode === 'keyboard') {
        endDrag(true);
        return;
      }
      if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
        onNodeSelect?.(flatNodes[focusedIndex].node);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    'Escape',
    () => {
      if (dragUiRef.current?.mode === 'keyboard') {
        endDrag(false);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.first ?? 'Home',
    () => {
      if (flatNodes.length > 0) {
        focusRow(0);
      }
    },
    hotkeyOpts,
  );

  useHotkey(
    hotkeyOverrides?.last ?? 'End',
    () => {
      if (flatNodes.length > 0) {
        focusRow(flatNodes.length - 1);
      }
    },
    hotkeyOpts,
  );

  const handleTreeKeyDown = useCallback(
    (e: any) => {
      const key = e?.key as string | undefined;
      if (!key || key.length !== 1) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (key === ' ') {
        return;
      }
      if (dragUiRef.current) {
        return;
      }
      if (flatNodes.length === 0) {
        return;
      }
      e.preventDefault?.();
      const now = Date.now();
      const state = typeaheadRef.current;
      state.buffer = now - state.at > TYPEAHEAD_MS ? key : state.buffer + key;
      state.at = now;
      const query = state.buffer.toLowerCase();
      const start = focusedIndex >= 0 ? focusedIndex : -1;
      const n = flatNodes.length;
      for (let i = 1; i <= n; i++) {
        const idx = (start + i) % n;
        if (flatNodes[idx].node.label.toLowerCase().startsWith(query)) {
          focusRow(idx);
          return;
        }
      }
    },
    [flatNodes, focusedIndex, focusRow],
  );

  if (nodes.length === 0) {
    return <EmptyState compact title={emptyMessage} {...stackProps} />;
  }

  const effectiveFocused = focusedIndex >= flatNodes.length ? -1 : focusedIndex;
  const resolvedAriaLabel =
    ariaLabel ??
    (typeof (stackProps as { 'aria-label'?: string })['aria-label'] === 'string'
      ? (stackProps as { 'aria-label'?: string })['aria-label']
      : undefined);

  const overlayNode = dragUi?.mode === 'pointer' ? dragUi.node : settle?.node;
  const overlayHasChildren = (overlayNode?.children?.length ?? 0) > 0;
  // Handle glyphs stay small; the hit target reaches the 44px floor via
  // negative outset + hitSlop (pattern shared with Chip/Button).
  const handleOutset = Math.max(0, (MIN_PRESS_TARGET - estimateSize) / 2);

  // Rows span edge-to-edge inside the frame (SP-EDGE): the container
  // owns only the corner clip; rows own their inset, so hover/selection fills
  // and hit targets reach both edges. The tree is SF-TRANSPARENT, so it takes
  // the radius-only fragment — a border-bearing one would be unlicensed chrome
  // on a chromeless part.
  return (
    <YStack {...knobProps.containerRadius} overflow="hidden" {...stackProps}>
      <View
        ref={containerRef as any}
        role="tree"
        aria-label={resolvedAriaLabel}
        {...{
          'data-nested-px': nestedPx,
          'data-indent-step': indentStep,
          'data-space': knobProps.space,
          'data-size': knobProps.size,
          'data-viewport-height': height,
          // Spec Part 3 TreeView: E-FLAT + SF-TRANSPARENT on this chromeless frame.
          'data-elevation-class': 'flat',
          'data-fill': 'transparent',
        }}
        aria-activedescendant={effectiveFocused >= 0 ? `${treeId}-node-${effectiveFocused}` : undefined}
        tabIndex={0}
        outlineWidth={0}
        outlineStyle={'none' as any}
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
        onKeyDown={handleTreeKeyDown}
        onLayout={scheduleScroll}
        {...(isWeb && { onWheel: cancelInitialScroll, onPointerDown: cancelInitialScroll })}
        position="relative"
        style={{
          height,
        }}>
        <FlashList
          keyboardShouldPersistTaps="handled"
          ref={attachList}
          data={flatNodes}
          drawDistance={overscan * estimateSize}
          keyExtractor={(item) => item.node.id}
          onLoad={() => {
            if (!scrollActive.current || !listInstance.attached) {
              return;
            }
            listInstance.loaded = true;
            scheduleScroll();
          }}
          onCommitLayoutEffect={scheduleScroll}
          onContentSizeChange={scheduleScroll}
          onScrollBeginDrag={() => {
            if (scrollActive.current && listInstance.attached) {
              cancelInitialScroll();
            }
          }}
          extraData={{
            focused: effectiveFocused,
            selectedId,
            expandedIds,
            motion,
            dragUi,
            settle,
            keyboardRing,
            collapsedSelectedAncestors,
          }}
          onScroll={(e: any) => {
            if (!scrollActive.current || !listInstance.attached) {
              return;
            }
            const y = e?.nativeEvent?.contentOffset?.y;
            if (typeof y === 'number' && Number.isFinite(y)) {
              scrollOffsetRef.current = y;
              if (dragUiRef.current) {
                setDragScrollY(y);
              }
              observeOffset(y, true);
            }
            scheduleScroll();
          }}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => {
            const { node, depth, hasChildren, isExpanded } = item;
            const isFocused = effectiveFocused === index;
            const isSelected = selectedId !== undefined && selectedId === node.id;
            const leadingIcon =
              hasChildren && isExpanded && node.iconWhenExpanded
                ? node.iconWhenExpanded
                : node.icon
                  ? node.icon
                  : defaultNodeIcon(hasChildren, isExpanded, nodeIconSize);

            const containsSelected = collapsedSelectedAncestors.has(node.id);
            const groupPosition = getGroupPosition(index, flatNodes.length);

            const labelContent = renderNode ? (
              renderNode(node, depth)
            ) : (
              <Text
                {...knobProps.body}
                {...knobProps.label}
                color={isSelected && onAccentLabel ? onAccentLabel : '$color'}
                numberOfLines={1}
                flexShrink={1}>
                {node.label}
              </Text>
            );

            // FLIP/enter styles for this toggle (identity when idle).
            const armed = motion?.phase === 'armed';
            const entering = motion?.entering.has(node.id) ?? false;
            const delta = motion?.deltas.get(node.id) ?? 0;
            const rowY = armed ? (entering ? ENTER_RISE_PX : delta) : 0;
            // Drag states: the lifted subtree dims in place (the ghost is the
            // carried visual); the moved row hides while the overlay settles
            // onto its final slot.
            const inDraggedSubtree = dragUi?.subtree.has(node.id) ?? false;
            const isSettleHidden = settle?.hideId === node.id;
            const isDropParent = dragUi?.indicator?.kind === 'into' && dragUi.indicator.parentId === node.id;
            const rowOpacity = isSettleHidden ? 0 : armed && entering ? 0 : inDraggedSubtree ? 0.4 : 1;
            // Armed rows apply their inverted offset instantly; everyone else
            // keeps the knob tween (also covers hover/press fills — A-STATE).
            const rowTransition = armed && (entering || delta !== 0) ? 'none' : transition;

            return (
              <XStack
                // Remount when a recycled cell switches nodes so state fills
                // and the caret never tween across two different rows.
                key={node.id}
                ref={(row) => {
                  if (row) {
                    renderedRows.current.add(node.id);
                  } else {
                    renderedRows.current.delete(node.id);
                  }
                  scheduleScroll();
                }}
                id={`${treeId}-node-${index}`}
                {...{ 'data-treeview-row': node.id }}
                {...(isDropParent && { 'data-treeview-drop-parent': 'true' })}
                {...(isFocused && { 'data-focused': true })}
                {...{ 'data-group-position': groupPosition }}
                role="treeitem"
                aria-expanded={hasChildren ? isExpanded : undefined}
                aria-selected={isSelected}
                aria-level={depth + 1}
                aria-setsize={flatNodes.length}
                aria-posinset={index + 1}
                alignItems="center"
                minHeight={estimateSize}
                paddingVertical={rowPad.paddingVertical}
                paddingInlineEnd={rowPad.paddingHorizontal}
                paddingInlineStart={rowPad.paddingHorizontal}
                gap={rowGap}
                cursor="pointer"
                position="relative"
                y={rowY}
                opacity={rowOpacity}
                transition={rowTransition as any}
                {...stackRadiusProps(groupPosition, knobProps.borderRadius.borderRadius)}
                onLayout={(e: any) => {
                  const h = e?.nativeEvent?.layout?.height;
                  if (typeof h === 'number' && h > 0) {
                    rowHeights.current.set(node.id, h);
                  }
                  scheduleScroll();
                }}
                backgroundColor={
                  // Nest-into parent highlight wins while a drag is active
                  // (drop-target affordance).
                  isDropParent
                    ? componentColors.interactive.background
                    : isSelected
                      ? '$accentBackground'
                      : containsSelected
                        ? componentColors.interactive.background
                        : 'transparent'
                }
                // Row hover/press come from the knob state recipes (A-STATE);
                // selection tint stays sticky underneath them. Focus is the
                // ring channel — never a second fill.
                hoverStyle={{
                  ...(control.hoverKnobProps as any),
                  ...(isSelected && { backgroundColor: '$accentBackground' }),
                }}
                pressStyle={{
                  ...(control.pressKnobProps as any),
                  ...(isSelected && { backgroundColor: '$accentBackground' }),
                }}
                // Keyboard ring on the focused row only (activedescendant).
                // Selected is fill above; selected + keyboard-focused = both.
                {...(isFocused && keyboardRing ? keyboardFocusRingProps : { outlineWidth: 0 })}
                onPress={() => {
                  // A completed drag's terminating click is not a selection.
                  if (suppressClickRef.current) {
                    return;
                  }
                  setKeyboardRing(false);
                  setFocusedIndex(index);
                  // Branch rows toggle on press (EUI/VS Code semantics): the
                  // whole row is the expand target, not a sub-44px caret.
                  if (hasChildren) {
                    toggleNode(node);
                  }
                  onNodeSelect?.(node);
                }}>
                {depth > 0 ? (
                  <View
                    width={depth * indentStep}
                    flexShrink={0}
                    alignSelf="stretch"
                    position="relative"
                    pointerEvents="none">
                    {Array.from({ length: depth }, (_, guide) => {
                      const inset = guide * indentStep + expandIconSize / 2;
                      return (
                        <View
                          key={`guide-${guide}`}
                          position="absolute"
                          top={0}
                          bottom={0}
                          {...hairline.vline}
                          pointerEvents="none"
                          backgroundColor={isSelected ? '$color1' : '$borderColor'}
                          opacity={isSelected ? 0.35 : 0.5}
                          {...(isRTL ? { right: inset } : { left: inset })}
                        />
                      );
                    })}
                  </View>
                ) : null}

                {showExpansionArrows ? (
                  hasChildren ? (
                    <View
                      {...knobProps.controlIcon}
                      alignItems="center"
                      justifyContent="center"
                      pointerEvents="none"
                      // Indicator only — the row is the toggle target. One
                      // caret that rotates (transform, knob tween) instead of
                      // an icon swap, so the state change is continuous.
                      rotate={isExpanded ? expandedCaretRotation : '0deg'}
                      transition={transition as any}>
                      <CollapsedCaretIcon size={caretSize} weight="bold" />
                    </View>
                  ) : (
                    <View {...knobProps.controlIcon} />
                  )
                ) : null}

                <View {...knobProps.controlIcon} alignItems="center" justifyContent="center" flexShrink={0}>
                  {leadingIcon}
                </View>

                <View flex={1} minWidth={0} justifyContent="center">
                  {labelContent}
                </View>

                {canReorder ? (
                  <DragHandleTarget
                    {...{ 'data-treeview-handle': node.id }}
                    role="button"
                    aria-label={t('Drag {{label}} to reorder', { label: node.label })}
                    tabIndex={-1}
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    minWidth={MIN_PRESS_TARGET}
                    minHeight={MIN_PRESS_TARGET}
                    marginVertical={-handleOutset}
                    hitSlop={pressTargetHitSlop(caretSize)}
                    cursor="grab"
                    opacity={0.6}
                    transition={transition as any}
                    hoverStyle={{ opacity: 1 }}
                    onPress={(e: any) => e?.stopPropagation?.()}
                    {...{
                      onPointerDown: (e: any) => {
                        handleDragHandlePointerDown(item, e);
                      },
                    }}>
                    <DotsSixVerticalIcon size={caretSize} weight="bold" color={knobProps.textAccentColor} />
                  </DragHandleTarget>
                ) : null}
              </XStack>
            );
          }}
        />

        {/* Drop-target line between rows, indented to the destination depth
            Logical padding keeps it RTL-correct. */}
        {dragUi?.indicator?.kind === 'line' && (
          <XStack
            {...{ 'data-treeview-drop-indicator': 'line' }}
            position="absolute"
            top={0}
            left={0}
            right={0}
            y={topOfFlatIndex(dragUi.indicator.flatIndex) - dragScrollY - 1}
            height={2}
            paddingInlineStart={rowPad.paddingHorizontal}
            paddingInlineEnd={rowPad.paddingHorizontal}
            pointerEvents="none"
            zIndex={999}
            transition={dragUi.mode === 'keyboard' ? (transition as any) : ('none' as any)}>
            <View width={dragUi.indicator.depth * indentStep} flexShrink={0} />
            <View flex={1} height={2} borderRadius={1} backgroundColor="$accentBackground" />
          </XStack>
        )}

        {/* Ghost overlay: clone of the dragged row outside the virtualized
            list. Pointer mode tracks 1:1 with no tween; the drop/cancel
            settle leap tweens with the animation knob. */}
        {overlayNode !== undefined && (
          <View
            {...{
              'data-treeview-overlay': 'true',
              'data-treeview-overlay-phase': dragUi ? 'pointer' : 'settling',
            }}
            position="absolute"
            top={0}
            left={0}
            x={(dragUi?.mode === 'pointer' ? dragUi.ghost?.x : settle?.to.x) ?? 0}
            y={(dragUi?.mode === 'pointer' ? dragUi.ghost?.y : settle?.to.y) ?? 0}
            width={dragUi?.width ?? settle?.width}
            height={dragUi?.height ?? settle?.height}
            pointerEvents="none"
            zIndex={1000}
            transition={dragUi ? ('none' as any) : (transition as any)}>
            <XStack
              alignItems="center"
              height="100%"
              paddingHorizontal={rowPad.paddingHorizontal}
              gap={rowGap}
              {...knobProps.borderRadius}
              backgroundColor="$background"
              borderWidth={1}
              borderColor="$borderColor"
              overflow="hidden"
              transition={transition as any}
              enterStyle={{ scale: 1 }}
              scale={dragUi ? 1.03 : 1}
              {...(dragUi ? LIFT_SHADOW : undefined)}>
              <View {...knobProps.controlIcon} alignItems="center" justifyContent="center" flexShrink={0}>
                {overlayNode.icon ?? defaultNodeIcon(overlayHasChildren, false, nodeIconSize)}
              </View>
              <Text {...knobProps.body} {...knobProps.label} color="$color" numberOfLines={1} flexShrink={1}>
                {overlayNode.label}
              </Text>
            </XStack>
          </View>
        )}

        {/* Screen-reader drag announcements (WAI-ARIA drag pattern). */}
        {canReorder && (
          <View
            aria-live="assertive"
            aria-atomic
            {...{ 'data-treeview-announcer': 'true' }}
            position="absolute"
            width={1}
            height={1}
            overflow="hidden"
            opacity={0}
            pointerEvents="none">
            <Text>{announcement}</Text>
          </View>
        )}
      </View>
    </YStack>
  );
}

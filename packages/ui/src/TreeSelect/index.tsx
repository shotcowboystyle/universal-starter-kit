import { useDismiss, useInteractions, FloatingFocusManager } from '@floating-ui/react';
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import {
  FieldLayout,
  FloatingPanel,
  formCommonColors,
  InputParts,
  PanelPortal,
  useFloatingPanel,
  useFormField,
  useViewportGtSm,
  panelTransition,
  panelViewportPadding,
  zIndex,
} from '@repo/forms';
import {
  FOCUS_VISIBLE_RING,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  useResolvedKnobs,
} from '@repo/theme';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Text, View, XStack, YStack, isWeb } from 'tamagui';
import type { GetProps, SizeTokens } from 'tamagui';

import { useDirection } from '../hooks/use-direction';
import { useTranslation } from '../shared/i18n';
import { Skeleton } from '../Skeleton';
import { hasNode, isNonEmpty } from '../views/guards';
import type { TreeNode } from '../views/TreeView';

import { filterForest, findNode, findNodePath, flattenVisible } from './tree-select-model';
import type { FlatTreeRow } from './tree-select-model';

export type { TreeNode as TreeSelectNode } from '../views/TreeView';

const TREE_SELECT_WIDTH_MODE = 'at-least-trigger' as const;

export interface TreeSelectProps extends Omit<GetProps<typeof YStack>, 'children' | 'onChange'> {
  nodes: TreeNode[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  valueLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  skeleton?: boolean;
  compact?: boolean;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultExpandedIds?: string[];
  /**
   * Accessible name for the trigger. `GetProps<typeof YStack>`
   * already admitted this prop, but it landed on the outer wrapper, which is
   * not an accessibility element on iOS, so nothing read it. It is routed to
   * the trigger now. `aria-label` is accepted as an alias.
   */
  accessibilityLabel?: string;
  'aria-label'?: string;
}

const defaultNodeIcon = (hasChildren: boolean, isExpanded: boolean, iconSize: number) => {
  if (hasChildren) {
    return isExpanded ? (
      <FolderOpenIcon
        size={iconSize}
        weight="duotone"
      />
    ) : (
      <FolderIcon
        size={iconSize}
        weight="duotone"
      />
    );
  }
  return (
    <FileIcon
      size={iconSize}
      weight="duotone"
    />
  );
};

type SpaceStop = ReturnType<typeof useResolvedKnobs>['knobProps']['space'];
type BodyProps = ReturnType<typeof useResolvedKnobs>['knobProps']['body'];

const bySpace = (space: SpaceStop, small: number, medium: number, large: number) => {
  if (space === 'small') {
    return small;
  }
  return space === 'large' ? large : medium;
};

const expandIconSizeFor = (nestedPx: number) => {
  if (nestedPx <= 28) {
    return 14;
  }
  return nestedPx >= 36 ? 18 : 16;
};

const caretRotation = (isExpanded: boolean, isRTL: boolean) => {
  if (!isExpanded) {
    return '0deg';
  }
  return isRTL ? '-90deg' : '90deg';
};

interface TreeRowMetrics {
  nestedPx: number;
  indentStep: number;
  expandIconSize: number;
  nodeIconSize: number;
  caretSize: number;
  rowPadX: number;
  isRTL: boolean;
  bodyProps: BodyProps;
}

const TreeRowGuides = ({ depth, metrics }: { depth: number; metrics: TreeRowMetrics }) => {
  const { rowPadX, indentStep, expandIconSize, isRTL } = metrics;
  return (
    <>
      {Array.from({ length: depth }, (_, guide) => {
        const inset = rowPadX + guide * indentStep + expandIconSize / 2;
        return (
          <View
            key={`guide-${guide}`}
            position="absolute"
            top={0}
            bottom={0}
            width={1}
            pointerEvents="none"
            backgroundColor="$borderColor"
            opacity={0.5}
            {...(isRTL ? { right: inset } : { left: inset })}
          />
        );
      })}
    </>
  );
};

const TreeRowCaret = ({
  node,
  isExpanded,
  metrics,
  onToggle,
}: {
  node: TreeNode;
  isExpanded: boolean;
  metrics: TreeRowMetrics;
  onToggle: (node: TreeNode) => void;
}) => {
  const { t } = useTranslation();
  const { expandIconSize, caretSize, isRTL } = metrics;
  const CollapsedCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const toggleLabel = isExpanded
    ? t('Collapse {{label}}', { label: node.label })
    : t('Expand {{label}}', { label: node.label });
  return (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a tamagui View in a pressable row, not a standalone <button>
      role="button"
      tabIndex={-1}
      data-treeselect-caret={node.id}
      aria-label={toggleLabel}
      // The aria-label above never reaches native.
      {...(isWeb
        ? undefined
        : {
            accessible: true,
            accessibilityRole: 'button' as const,
            accessibilityLabel: toggleLabel,
          })}
      width={expandIconSize}
      height={expandIconSize}
      alignItems="center"
      justifyContent="center"
      rotate={caretRotation(isExpanded, isRTL)}
      onPress={(e: { stopPropagation?: () => void }) => {
        e.stopPropagation?.();
        onToggle(node);
      }}>
      <CollapsedCaretIcon
        size={caretSize}
        weight="bold"
      />
    </View>
  );
};

const TreeRow = ({
  row,
  selectedId,
  activeIndex,
  keyboardRing,
  treeId,
  metrics,
  onCommit,
  onToggle,
}: {
  row: FlatTreeRow;
  selectedId?: string;
  activeIndex: number;
  keyboardRing: boolean;
  treeId: string;
  metrics: TreeRowMetrics;
  onCommit: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
}) => {
  const { node, depth, hasChildren, isExpanded, childCount, index } = row;
  const { nestedPx, indentStep, expandIconSize, nodeIconSize, rowPadX, bodyProps } = metrics;
  const isSelected = selectedId === node.id;
  const isActive = index === activeIndex;
  const showsExpandedIcon = hasChildren && isExpanded && hasNode(node.iconWhenExpanded);
  const leadingIcon = showsExpandedIcon
    ? node.iconWhenExpanded
    : (node.icon ?? defaultNodeIcon(hasChildren, isExpanded, nodeIconSize));
  return (
    <XStack
      id={`${treeId}-node-${index}`}
      role="treeitem"
      tabIndex={-1}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
      aria-level={depth + 1}
      // The aria-* above are web-only. Without the RN spellings
      // a row is not an accessibility element on iOS, so the whole tree
      // came back as loose StaticText with no role and no selected state.
      // `role` is overridden too: RN prefers it over accessibilityRole,
      // and `treeitem` leaves the element out of the iOS tree the same
      // way `radio` does (measured, iOS 26.2).
      {...(isWeb
        ? undefined
        : {
            accessible: true,
            role: 'button' as const,
            accessibilityRole: 'button' as const,
            accessibilityLabel: node.label,
            accessibilityState: {
              selected: isSelected,
              ...(hasChildren ? { expanded: isExpanded } : undefined),
            },
          })}
      data-treeselect-row={node.id}
      data-treeselect-index={String(index)}
      data-depth={String(depth)}
      alignItems="center"
      minHeight={nestedPx}
      paddingInlineEnd={rowPadX}
      paddingInlineStart={rowPadX + depth * indentStep}
      gap="$2"
      cursor="pointer"
      position="relative"
      backgroundColor={isSelected ? '$color2' : 'transparent'}
      hoverStyle={keyboardRing ? undefined : { backgroundColor: '$color3' }}
      {...(isActive && keyboardRing ? keyboardFocusRingProps : undefined)}
      onPress={(e) => {
        const target: unknown = e.target;
        if (isWeb && target instanceof Element && target.closest('[data-treeselect-caret]') !== null) {
          return;
        }
        onCommit(node);
      }}>
      {depth > 0 ? (
        <TreeRowGuides
          depth={depth}
          metrics={metrics}
        />
      ) : null}
      {hasChildren ? (
        <TreeRowCaret
          node={node}
          isExpanded={isExpanded}
          metrics={metrics}
          onToggle={onToggle}
        />
      ) : (
        <View
          width={expandIconSize}
          height={expandIconSize}
        />
      )}
      <View
        width={nodeIconSize + 2}
        height={nodeIconSize + 2}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}>
        {leadingIcon}
      </View>
      <Text
        {...bodyProps}
        fontSize={13}
        lineHeight={24}
        color="$color12"
        numberOfLines={1}
        flex={1}
        minWidth={0}>
        {node.label}
      </Text>
      {hasChildren && childCount > 0 ? (
        <Text
          fontFamily="$mono"
          fontSize={11}
          lineHeight={21}
          color="$color8">
          {childCount}
        </Text>
      ) : null}
      {isSelected ? (
        <View
          flexShrink={0}
          width={14}
          height={14}>
          <CheckIcon
            size={14}
            weight="bold"
          />
        </View>
      ) : null}
    </XStack>
  );
};

const TreeSelectRows = ({
  rows,
  selectedId,
  activeIndex,
  keyboardRing,
  treeId,
  onCommit,
  onToggle,
}: {
  rows: FlatTreeRow[];
  selectedId?: string;
  activeIndex: number;
  keyboardRing: boolean;
  treeId: string;
  onCommit: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
}) => {
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const isRTL = useDirection() === 'rtl';
  const metrics: TreeRowMetrics = {
    nestedPx,
    indentStep: bySpace(knobProps.space, 12, 16, 20),
    expandIconSize: expandIconSizeFor(nestedPx),
    nodeIconSize: nestedPx <= 28 ? 14 : 18,
    caretSize: nestedPx <= 28 ? 12 : 14,
    rowPadX: bySpace(knobProps.space, 6, 8, 13),
    isRTL,
    bodyProps: knobProps.body,
  };

  return (
    <YStack
      role="tree"
      data-tree=""
      data-testid="tree-select-tree"
      data-indent-step={String(metrics.indentStep)}
      data-row-height={String(nestedPx)}
      aria-activedescendant={activeIndex >= 0 ? `${treeId}-node-${activeIndex}` : undefined}
      tabIndex={-1}>
      {rows.map((row) => (
        <TreeRow
          key={row.node.id}
          row={row}
          selectedId={selectedId}
          activeIndex={activeIndex}
          keyboardRing={keyboardRing}
          treeId={treeId}
          metrics={metrics}
          onCommit={onCommit}
          onToggle={onToggle}
        />
      ))}
    </YStack>
  );
};

const SearchRow = ({
  value,
  placeholder,
  inputRef,
  onChange,
  onKeyDown,
  treeId,
  activeDescendant,
  sizeToken,
}: {
  value: string;
  placeholder: string;
  inputRef: { current: HTMLInputElement | null };
  onChange: (next: string) => void;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  treeId: string;
  activeDescendant?: string;
  sizeToken: SizeTokens;
}) => (
  <InputParts size={sizeToken}>
    <InputParts.Box
      data-search-row=""
      data-testid="tree-select-search"
      borderWidth={0}
      borderBottomWidth={1}
      borderBottomColor={formCommonColors.divider}
      borderRadius={0}
      elevation={undefined}
      {...(isWeb ? { className: 'mp-composite-ring' } : undefined)}>
      <InputParts.Section>
        <InputParts.Icon adornment="leading">
          <MagnifyingGlassIcon />
        </InputParts.Icon>
      </InputParts.Section>
      <InputParts.Section>
        <InputParts.Area
          ref={(node) => {
            inputRef.current = isWeb && node instanceof HTMLInputElement ? node : null;
          }}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-controls={treeId}
          aria-activedescendant={activeDescendant}
          aria-expanded
        />
      </InputParts.Section>
    </InputParts.Box>
  </InputParts>
);

const EmptyFilterRow = ({ message }: { message: string }) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      data-testid="tree-select-empty"
      alignItems="center"
      height={44}
      minHeight={44}
      paddingHorizontal="$3">
      <Text
        {...knobProps.body}
        color={formCommonColors.text}>
        {message}
      </Text>
    </XStack>
  );
};

const Trigger = ({
  display,
  placeholder,
  open,
  disabled,
  id,
  labelled,
  onToggle,
  triggerRef,
  sizeToken,
  accessibilityLabel,
}: {
  display?: string;
  placeholder: string;
  open: boolean;
  disabled: boolean;
  id?: string;
  labelled: boolean;
  accessibilityLabel?: string;
  onToggle: () => void;
  triggerRef: (node: HTMLElement | null) => void;
  sizeToken: SizeTokens;
}) => {
  const handleKey = (e: { key?: string; preventDefault?: () => void }) => {
    if (disabled) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault?.();
      onToggle();
    }
  };
  return (
    <InputParts size={sizeToken}>
      <InputParts.Box
        ref={(node) => {
          triggerRef(isWeb && node instanceof HTMLElement ? node : null);
        }}
        data-testid="tree-select-trigger"
        data-fp-trigger=""
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/role-has-required-aria-props -- a tamagui pressable box acting as the combobox trigger; the listbox it controls only exists while open
        role="combobox"
        aria-haspopup="tree"
        aria-expanded={open}
        aria-label={accessibilityLabel ?? (labelled ? undefined : placeholder)}
        id={id}
        // Same family as ToggleGroup / RadioGroup: every semantic on
        // this trigger above is a web attribute, and tamagui does not map any
        // of them onto React Native, so on iOS the control reached the
        // accessibility tree with no role, no name and no expanded state.
        {...(isWeb
          ? undefined
          : {
              accessible: true,
              role: 'button' as const,
              accessibilityRole: 'button' as const,
              accessibilityLabel: accessibilityLabel ?? display ?? placeholder,
              accessibilityState: { disabled, expanded: open },
            })}
        tabIndex={disabled || open ? -1 : 0}
        disabled={disabled}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        minHeight={44}
        suppressFocusRing={open}
        {...(isWeb
          ? {
              className: 'mp-composite-ring',
              onKeyDown: handleKey,
            }
          : undefined)}
        onPress={disabled ? undefined : onToggle}
        focusVisibleStyle={ensureFocusVisibleRing(FOCUS_VISIBLE_RING)}>
        <InputParts.Section>
          <Text
            data-trig-text=""
            flex={1}
            numberOfLines={1}
            color={isNonEmpty(display) ? '$color12' : formCommonColors.muted}
            paddingHorizontal="$3">
            {display ?? placeholder}
          </Text>
        </InputParts.Section>
        <InputParts.Section>
          <InputParts.Icon adornment="trailing">
            <CaretDownIcon size={16} />
          </InputParts.Icon>
        </InputParts.Section>
      </InputParts.Box>
    </InputParts>
  );
};

const useTreeSelectState = (props: {
  nodes: TreeNode[];
  value?: string;
  open: boolean;
  defaultExpandedIds?: string[];
}) => {
  const { nodes, value, open, defaultExpandedIds } = props;
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [keyboardRing, setKeyboardRing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const next = new Set(defaultExpandedIds);
    if (isNonEmpty(value)) {
      const path = findNodePath(nodes, value);
      if (path) {
        for (const id of path) {
          next.add(id);
        }
      }
    }
    return next;
  });

  const filtered = useMemo(() => filterForest(nodes, filter), [nodes, filter]);
  const displayNodes = filtered.nodes;
  const rows = useMemo(() => {
    const expanded = new Set(expandedIds);
    for (const id of filtered.expandIds) {
      expanded.add(id);
    }
    return flattenVisible(displayNodes, expanded);
  }, [displayNodes, expandedIds, filtered.expandIds]);

  // Reset-on-change belongs in render, not an effect: the stale value never paints.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setActiveIndex(0);
    if (!open) {
      setFilter('');
      setKeyboardRing(false);
    }
  }
  const [prevFilter, setPrevFilter] = useState(filter);
  if (filter !== prevFilter) {
    setPrevFilter(filter);
    setActiveIndex(0);
  }

  const toggle = useCallback((node: TreeNode) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, []);

  return {
    filter,
    setFilter,
    activeIndex,
    setActiveIndex,
    keyboardRing,
    setKeyboardRing,
    rows,
    toggle,
    displayNodes,
  };
};

const TreeSelectPanelBody = ({
  rows,
  selectedId,
  activeIndex,
  keyboardRing,
  treeId,
  emptyMessage,
  loading,
  onCommit,
  onToggle,
}: {
  rows: FlatTreeRow[];
  selectedId?: string;
  activeIndex: number;
  keyboardRing: boolean;
  treeId: string;
  emptyMessage: string;
  loading?: boolean;
  onCommit: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
}) => {
  if (loading && rows.length === 0) {
    return (
      <YStack
        padding="$2"
        gap="$2">
        <Skeleton
          variant="rounded"
          width="100%"
          height={32}
        />
        <Skeleton
          variant="rounded"
          width="100%"
          height={32}
        />
      </YStack>
    );
  }
  if (rows.length === 0) {
    return <EmptyFilterRow message={emptyMessage} />;
  }
  return (
    <TreeSelectRows
      rows={rows}
      selectedId={selectedId}
      activeIndex={activeIndex}
      keyboardRing={keyboardRing}
      treeId={treeId}
      onCommit={onCommit}
      onToggle={onToggle}
    />
  );
};

const handleTreeKeys = (args: {
  key: string;
  preventDefault: () => void;
  rows: FlatTreeRow[];
  activeIndex: number;
  setActiveIndex: (next: number | ((prev: number) => number)) => void;
  setKeyboardRing: (next: boolean) => void;
  toggle: (node: TreeNode) => void;
  onCommit: (node: TreeNode) => void;
  onClose: () => void;
}) => {
  const { key, preventDefault, rows, activeIndex, setActiveIndex, setKeyboardRing, toggle, onCommit, onClose } = args;
  const current: FlatTreeRow | undefined = rows[activeIndex];
  if (key === 'ArrowDown') {
    preventDefault();
    setKeyboardRing(true);
    setActiveIndex((prev) => (rows.length === 0 ? 0 : (prev + 1) % rows.length));
    return;
  }
  if (key === 'ArrowUp') {
    preventDefault();
    setKeyboardRing(true);
    setActiveIndex((prev) => (rows.length === 0 ? 0 : (prev - 1 + rows.length) % rows.length));
    return;
  }
  if (key === 'Home') {
    preventDefault();
    setKeyboardRing(true);
    setActiveIndex(0);
    return;
  }
  if (key === 'End') {
    preventDefault();
    setKeyboardRing(true);
    setActiveIndex(Math.max(0, rows.length - 1));
    return;
  }
  if (key === 'ArrowRight' && current?.hasChildren) {
    preventDefault();
    setKeyboardRing(true);
    if (!current.isExpanded) {
      toggle(current.node);
    } else if (activeIndex + 1 < rows.length) {
      setActiveIndex(activeIndex + 1);
    }
    return;
  }
  if (key === 'ArrowLeft' && current != null) {
    preventDefault();
    setKeyboardRing(true);
    if (current.isExpanded) {
      toggle(current.node);
    }
    return;
  }
  if (key === 'Enter' && current != null) {
    preventDefault();
    onCommit(current.node);
    return;
  }
  if (key === 'Escape') {
    preventDefault();
    onClose();
  }
};

const useTreeSelectHandlers = ({
  state,
  onCommit,
  onOpenChange,
}: {
  state: ReturnType<typeof useTreeSelectState>;
  onCommit: (node: TreeNode) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const handleCommit = useCallback(
    (node: TreeNode) => {
      onCommit(node);
      onOpenChange(false);
    },
    [onCommit, onOpenChange],
  );

  const handleSearchKeyDown = (event: { key: string; preventDefault: () => void }) => {
    handleTreeKeys({
      key: event.key,
      preventDefault: () => {
        event.preventDefault();
      },
      rows: state.rows,
      activeIndex: state.activeIndex,
      setActiveIndex: state.setActiveIndex,
      setKeyboardRing: state.setKeyboardRing,
      toggle: state.toggle,
      onCommit: handleCommit,
      onClose: () => {
        onOpenChange(false);
      },
    });
  };

  const handleFilterChange = (next: string) => {
    state.setFilter(next);
  };

  const handleToggle = (node: TreeNode) => {
    state.toggle(node);
  };

  return { handleCommit, handleSearchKeyDown, handleFilterChange, handleToggle };
};

const FloatingTreeSelect = ({
  nodes,
  value,
  display,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  id,
  labelled,
  open,
  onOpenChange,
  onCommit,
  defaultExpandedIds,
  sizeToken,
  loading,
  accessibilityLabel,
}: {
  nodes: TreeNode[];
  value?: string;
  display?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled: boolean;
  id?: string;
  labelled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (node: TreeNode) => void;
  defaultExpandedIds?: string[];
  sizeToken: SizeTokens;
  loading?: boolean;
  accessibilityLabel?: string;
}) => {
  const treeId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const state = useTreeSelectState({ nodes, value, open, defaultExpandedIds });
  const repositionRef = useRef<(() => void) | null>(null);
  const overlayStyle = useRef<{ top: number } | null>(null);

  const panel = useFloatingPanel({
    open,
    onOpenChange,
    disabled,
    repositionRef,
    middleware: [],
    useAutoUpdate: false,
    onBeforeOpen: () => {
      overlayStyle.current = null;
    },
  });

  const reposition = useCallback(() => {
    const dropdown = panel.refs.floating.current;
    const trigger =
      panel.triggerRef.current ??
      dropdown?.ownerDocument.querySelector<HTMLElement>('[data-testid="tree-select-trigger"]');
    if (!dropdown || !trigger) {
      return;
    }
    const triggerBounds = trigger.getBoundingClientRect();
    const { top } = triggerBounds;
    // oxlint-disable-next-line react/immutability -- imperative positioning of the floating panel's DOM node
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${triggerBounds.left}px`;
    dropdown.style.minWidth = `${triggerBounds.width}px`;
    const maxAvailable = window.innerHeight - top - panelViewportPadding;
    dropdown.style.maxHeight = `${Math.max(120, maxAvailable)}px`;
    overlayStyle.current = { top };
    // oxlint-disable-next-line react/preserve-manual-memoization -- deps are the stable ref holders; depending on `panel` would re-run the layout effect every render
  }, [panel.refs.floating, panel.triggerRef]);

  // oxlint-disable-next-line react/refs -- floating-panel reads this ref from its own effects, which run before any effect here could set it
  repositionRef.current = reposition;

  useLayoutEffect(() => {
    if (!open || !panel.mounted) {
      return;
    }
    reposition();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- rows.length is a deliberate extra trigger: the panel must re-measure when the list grows or shrinks
  }, [open, panel.mounted, reposition, state.rows.length]);

  useEffect(() => {
    if (open && panel.mounted) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, panel.mounted]);

  const dismiss = useDismiss(panel.context, {
    outsidePressEvent: 'click',
    ancestorScroll: false,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  const { handleCommit, handleSearchKeyDown, handleFilterChange, handleToggle } = useTreeSelectHandlers({
    state,
    onCommit,
    onOpenChange,
  });

  const activeDescendant = open && state.activeIndex >= 0 ? `${treeId}-node-${state.activeIndex}` : undefined;
  // oxlint-disable-next-line react/refs -- top is written by reposition() in a layout effect and read back on the next render
  const overlayTop = overlayStyle.current?.top ?? 0;

  return (
    <>
      <Trigger
        display={display}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        id={id}
        labelled={labelled}
        onToggle={() => {
          if (!disabled) {
            onOpenChange(!open);
          }
        }}
        triggerRef={panel.setReferenceRef}
        sizeToken={sizeToken}
        accessibilityLabel={accessibilityLabel}
      />
      {panel.mounted && (
        <PanelPortal anchor={panel.triggerRef.current}>
          <FloatingFocusManager
            context={panel.context}
            modal={false}
            initialFocus={-1}>
            <YStack
              {...getFloatingProps({
                ref: panel.refs.setFloating,
              })}
              data-testid="tree-select-panel"
              data-cover=""
              data-width-mode={TREE_SELECT_WIDTH_MODE}
              data-dismiss-class="commit"
              data-fp-panel=""
              outlineWidth={0}
              pointerEvents={panel.visible ? 'auto' : 'none'}
              {...panel.knobProps.elevatedSurface}
              borderRadius={panel.dropdownRadius}
              overflow="hidden"
              style={{
                position: 'fixed',
                top: overlayTop,
                left: 0,
                zIndex: zIndex.dropdown,
                opacity: panel.visible ? 1 : 0,
                transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
                transition: panelTransition,
                boxSizing: 'border-box',
              }}>
              <SearchRow
                value={state.filter}
                placeholder={searchPlaceholder}
                inputRef={searchRef}
                onChange={handleFilterChange}
                onKeyDown={handleSearchKeyDown}
                treeId={treeId}
                activeDescendant={activeDescendant}
                sizeToken={sizeToken}
              />
              <YStack
                overflow="scroll"
                maxHeight={320}
                id={treeId}>
                <TreeSelectPanelBody
                  rows={state.rows}
                  selectedId={value}
                  activeIndex={state.activeIndex}
                  keyboardRing={state.keyboardRing}
                  treeId={treeId}
                  emptyMessage={emptyMessage}
                  loading={loading}
                  onCommit={handleCommit}
                  onToggle={handleToggle}
                />
              </YStack>
            </YStack>
          </FloatingFocusManager>
        </PanelPortal>
      )}
    </>
  );
};

const SheetTreeSelect = ({
  nodes,
  value,
  display,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  id,
  labelled,
  open,
  onOpenChange,
  onCommit,
  defaultExpandedIds,
  sizeToken,
  loading,
  accessibilityLabel,
}: {
  nodes: TreeNode[];
  value?: string;
  display?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled: boolean;
  id?: string;
  labelled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (node: TreeNode) => void;
  defaultExpandedIds?: string[];
  sizeToken: SizeTokens;
  loading?: boolean;
  accessibilityLabel?: string;
}) => {
  const treeId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const state = useTreeSelectState({ nodes, value, open, defaultExpandedIds });
  const triggerRef = useRef<HTMLElement | null>(null);

  const { handleCommit, handleSearchKeyDown, handleFilterChange, handleToggle } = useTreeSelectHandlers({
    state,
    onCommit,
    onOpenChange,
  });

  const activeDescendant = open && state.activeIndex >= 0 ? `${treeId}-node-${state.activeIndex}` : undefined;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={onOpenChange}
      sheet
      sheetFill
      contentPadding="none"
      disabled={disabled}
      trigger=<Trigger
        display={display}
        placeholder={placeholder}
        open={open}
        disabled={disabled}
        id={id}
        labelled={labelled}
        onToggle={() => {
          if (!disabled) {
            onOpenChange(true);
          }
        }}
        triggerRef={(node) => {
          triggerRef.current = node;
        }}
        sizeToken={sizeToken}
        accessibilityLabel={accessibilityLabel}
      />
      header=<SearchRow
        value={state.filter}
        placeholder={searchPlaceholder}
        inputRef={searchRef}
        onChange={handleFilterChange}
        onKeyDown={handleSearchKeyDown}
        treeId={treeId}
        activeDescendant={activeDescendant}
        sizeToken={sizeToken}
      />>
      <YStack
        data-testid="tree-select-panel"
        data-width-mode={TREE_SELECT_WIDTH_MODE}
        data-dismiss-class="commit"
        id={treeId}>
        <TreeSelectPanelBody
          rows={state.rows}
          selectedId={value}
          activeIndex={state.activeIndex}
          keyboardRing={state.keyboardRing}
          treeId={treeId}
          emptyMessage={emptyMessage}
          loading={loading}
          onCommit={handleCommit}
          onToggle={handleToggle}
        />
      </YStack>
    </FloatingPanel>
  );
};

const TreeSelectSkeleton = ({ hasLabel, ...stackProps }: GetProps<typeof YStack> & { hasLabel: boolean }) => (
  <YStack
    data-testid="tree-select"
    {...stackProps}>
    {hasLabel ? (
      <Skeleton
        variant="text"
        width="30%"
        height={14}
      />
    ) : null}
    <Skeleton
      variant="rounded"
      width="100%"
      height={44}
    />
  </YStack>
);

const TreeSelectReadOnly = ({
  id,
  label,
  error,
  helperText,
  required,
  knobProps,
  disabled,
  displayText,
  ...stackProps
}: GetProps<typeof YStack> &
  Pick<TreeSelectProps, 'label' | 'error' | 'helperText' | 'required'> & {
    id: string;
    knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
    disabled: boolean;
    displayText?: string;
  }) => (
  <YStack
    data-testid="tree-select"
    width="100%"
    {...stackProps}>
    <FieldLayout
      id={id}
      label={label}
      error={error}
      helperText={helperText}
      required={required}
      knobProps={knobProps}
      disabled={disabled}>
      <Text
        paddingVertical="$2"
        paddingHorizontal="$3"
        {...knobProps.body}>
        {displayText ?? '—'}
      </Text>
    </FieldLayout>
  </YStack>
);

export const TreeSelect = ({
  nodes,
  value,
  onChange,
  label,
  placeholder: placeholderProp,
  searchPlaceholder: searchPlaceholderProp,
  emptyMessage: emptyMessageProp,
  valueLabel,
  disabled = false,
  readOnly = false,
  required,
  error,
  helperText,
  skeleton,
  compact,
  loading,
  open: openProp,
  onOpenChange,
  defaultExpandedIds,
  id: idProp,
  accessibilityLabel,
  'aria-label': ariaLabel,
  ...stackProps
}: TreeSelectProps) => {
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const { t } = useTranslation();
  const { knobProps, id } = useFormField({ id: idProp, compact });
  const placeholder = placeholderProp ?? t('Select...');
  const searchPlaceholder = searchPlaceholderProp ?? t('Filter...');
  const emptyMessage = emptyMessageProp ?? t('No matching items');
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const viewportGtSm = useViewportGtSm();
  const effectiveGtSm = typeof window === 'undefined' ? false : viewportGtSm;
  const shouldUseSheet = !isWeb || !effectiveGtSm;
  const selected = isNonEmpty(value) ? findNode(nodes, value) : undefined;
  const display = selected?.label ?? (isNonEmpty(value) ? (valueLabel ?? value) : undefined);

  if (skeleton) {
    return (
      <TreeSelectSkeleton
        hasLabel={isNonEmpty(label)}
        {...stackProps}
      />
    );
  }

  if (readOnly) {
    return (
      <TreeSelectReadOnly
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        knobProps={knobProps}
        disabled={disabled}
        displayText={display}
        {...stackProps}
      />
    );
  }

  const shared = {
    nodes,
    value,
    display,
    placeholder,
    searchPlaceholder,
    emptyMessage,
    disabled,
    id,
    labelled: Boolean(label),
    open,
    onOpenChange: setOpen,
    onCommit: (node: TreeNode) => onChange?.(node.id),
    defaultExpandedIds,
    sizeToken: knobProps.sizeToken,
    loading,
    accessibilityLabel: accessibilityLabel ?? ariaLabel,
  };

  const core = shouldUseSheet ? <SheetTreeSelect {...shared} /> : <FloatingTreeSelect {...shared} />;

  return (
    <YStack
      data-testid="tree-select"
      width="100%"
      {...stackProps}>
      <FieldLayout
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        knobProps={knobProps}
        disabled={disabled}>
        {core}
      </FieldLayout>
    </YStack>
  );
};

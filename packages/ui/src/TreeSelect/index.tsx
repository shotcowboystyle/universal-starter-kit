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
import { Text, View, XStack, YStack, isWeb, type GetProps } from 'tamagui';

import { useDirection } from '../hooks/useDirection';
import { useTranslation } from '../shared/i18n';
import { Skeleton } from '../Skeleton';
import type { TreeNode } from '../views/TreeView';

import { filterForest, findNode, findNodePath, flattenVisible, type FlatTreeRow } from './treeSelectModel';

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

function defaultNodeIcon(hasChildren: boolean, isExpanded: boolean, iconSize: number) {
  if (hasChildren) {
    return isExpanded ? (
      <FolderOpenIcon size={iconSize} weight="duotone" />
    ) : (
      <FolderIcon size={iconSize} weight="duotone" />
    );
  }
  return <FileIcon size={iconSize} weight="duotone" />;
}

function TreeSelectRows({
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
}) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const indentStep = knobProps.space === 'small' ? 12 : knobProps.space === 'large' ? 20 : 16;
  const expandIconSize = nestedPx <= 28 ? 14 : nestedPx >= 36 ? 18 : 16;
  const nodeIconSize = nestedPx <= 28 ? 14 : 18;
  const caretSize = nestedPx <= 28 ? 12 : 14;
  const rowPadX = knobProps.space === 'small' ? 6 : knobProps.space === 'large' ? 13 : 8;
  const isRTL = useDirection() === 'rtl';
  const CollapsedCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;

  return (
    <YStack
      role="tree"
      data-tree=""
      data-testid="tree-select-tree"
      data-indent-step={String(indentStep)}
      data-row-height={String(nestedPx)}
      aria-activedescendant={activeIndex >= 0 ? `${treeId}-node-${activeIndex}` : undefined}
      tabIndex={-1}>
      {rows.map((row) => {
        const { node, depth, hasChildren, isExpanded, childCount, index } = row;
        const isSelected = selectedId === node.id;
        const isActive = index === activeIndex;
        const leadingIcon =
          hasChildren && isExpanded && node.iconWhenExpanded
            ? node.iconWhenExpanded
            : (node.icon ?? defaultNodeIcon(hasChildren, isExpanded, nodeIconSize));
        return (
          <XStack
            key={node.id}
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
            {...(!isWeb
              ? {
                  accessible: true,
                  role: 'button' as const,
                  accessibilityRole: 'button' as const,
                  accessibilityLabel: node.label,
                  accessibilityState: {
                    selected: isSelected,
                    ...(hasChildren ? { expanded: isExpanded } : undefined),
                  },
                }
              : undefined)}
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
              const target = (e as unknown as { target?: HTMLElement }).target;
              if (target?.closest?.('[data-treeselect-caret]')) {
                return;
              }
              onCommit(node);
            }}>
            {depth > 0
              ? Array.from({ length: depth }, (_, guide) => {
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
                })
              : null}
            {hasChildren ? (
              <View
                role="button"
                tabIndex={-1}
                data-treeselect-caret={node.id}
                aria-label={
                  isExpanded
                    ? t('Collapse {{label}}', { label: node.label })
                    : t('Expand {{label}}', { label: node.label })
                }
                // The aria-label above never reaches native.
                {...(!isWeb
                  ? {
                      accessible: true,
                      accessibilityRole: 'button' as const,
                      accessibilityLabel: isExpanded
                        ? t('Collapse {{label}}', { label: node.label })
                        : t('Expand {{label}}', { label: node.label }),
                    }
                  : undefined)}
                width={expandIconSize}
                height={expandIconSize}
                alignItems="center"
                justifyContent="center"
                rotate={isExpanded ? (isRTL ? '-90deg' : '90deg') : '0deg'}
                onPress={(e: { stopPropagation?: () => void }) => {
                  e.stopPropagation?.();
                  onToggle(node);
                }}>
                <CollapsedCaretIcon size={caretSize} weight="bold" />
              </View>
            ) : (
              <View width={expandIconSize} height={expandIconSize} />
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
              {...knobProps.body}
              fontSize={13}
              lineHeight={24}
              color="$color12"
              numberOfLines={1}
              flex={1}
              minWidth={0}>
              {node.label}
            </Text>
            {hasChildren && childCount > 0 ? (
              <Text fontFamily="$mono" fontSize={11} lineHeight={21} color="$color8">
                {childCount}
              </Text>
            ) : null}
            {isSelected ? (
              <View flexShrink={0} width={14} height={14}>
                <CheckIcon size={14} weight="bold" />
              </View>
            ) : null}
          </XStack>
        );
      })}
    </YStack>
  );
}

function SearchRow({
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
  sizeToken: string;
}) {
  return (
    <InputParts size={sizeToken as never}>
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
            ref={inputRef as never}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            onKeyDown={onKeyDown as never}
            aria-autocomplete="list"
            aria-controls={treeId}
            aria-activedescendant={activeDescendant}
            aria-expanded
          />
        </InputParts.Section>
      </InputParts.Box>
    </InputParts>
  );
}

function EmptyFilterRow({ message }: { message: string }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack data-testid="tree-select-empty" alignItems="center" height={44} minHeight={44} paddingHorizontal="$3">
      <Text {...knobProps.body} color={formCommonColors.text}>
        {message}
      </Text>
    </XStack>
  );
}

function Trigger({
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
  sizeToken: string;
}) {
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
    <InputParts size={sizeToken as never}>
      <InputParts.Box
        ref={triggerRef as never}
        data-testid="tree-select-trigger"
        data-fp-trigger=""
        role="combobox"
        aria-haspopup="tree"
        aria-expanded={open}
        aria-label={accessibilityLabel ?? (labelled ? undefined : placeholder)}
        id={id}
        // Same family as ToggleGroup / RadioGroup: every semantic on
        // this trigger above is a web attribute, and tamagui does not map any
        // of them onto React Native, so on iOS the control reached the
        // accessibility tree with no role, no name and no expanded state.
        {...(!isWeb
          ? {
              accessible: true,
              role: 'button' as const,
              accessibilityRole: 'button' as const,
              accessibilityLabel: accessibilityLabel ?? display ?? placeholder,
              accessibilityState: { disabled, expanded: open },
            }
          : undefined)}
        tabIndex={disabled || open ? -1 : 0}
        disabled={disabled}
        cursor={disabled ? 'not-allowed' : 'pointer'}
        opacity={disabled ? 0.5 : 1}
        minHeight={44}
        suppressFocusRing={open}
        {...(isWeb
          ? {
              className: 'mp-composite-ring',
              onKeyDown: handleKey as never,
            }
          : undefined)}
        onPress={disabled ? undefined : onToggle}
        focusVisibleStyle={ensureFocusVisibleRing(FOCUS_VISIBLE_RING)}>
        <InputParts.Section>
          <Text
            data-trig-text=""
            flex={1}
            numberOfLines={1}
            color={display ? '$color12' : formCommonColors.muted}
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
}

function useTreeSelectState(props: {
  nodes: TreeNode[];
  value?: string;
  open: boolean;
  defaultExpandedIds?: string[];
}) {
  const { nodes, value, open, defaultExpandedIds } = props;
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [keyboardRing, setKeyboardRing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const next = new Set(defaultExpandedIds ?? []);
    if (value) {
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

  useEffect(() => {
    if (!open) {
      setFilter('');
      setActiveIndex(0);
      setKeyboardRing(false);
      return;
    }
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

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
}

function TreeSelectPanelBody({
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
}) {
  if (loading && rows.length === 0) {
    return (
      <YStack padding="$2" gap="$2">
        <Skeleton variant="rounded" width="100%" height={32} />
        <Skeleton variant="rounded" width="100%" height={32} />
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
}

function handleTreeKeys(args: {
  key: string;
  preventDefault: () => void;
  rows: FlatTreeRow[];
  activeIndex: number;
  setActiveIndex: (next: number | ((prev: number) => number)) => void;
  setKeyboardRing: (next: boolean) => void;
  toggle: (node: TreeNode) => void;
  onCommit: (node: TreeNode) => void;
  onClose: () => void;
}) {
  const { key, preventDefault, rows, activeIndex, setActiveIndex, setKeyboardRing, toggle, onCommit, onClose } = args;
  const current = rows[activeIndex];
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
  if (key === 'ArrowLeft' && current) {
    preventDefault();
    setKeyboardRing(true);
    if (current.isExpanded) {
      toggle(current.node);
    }
    return;
  }
  if (key === 'Enter' && current) {
    preventDefault();
    onCommit(current.node);
    return;
  }
  if (key === 'Escape') {
    preventDefault();
    onClose();
  }
}

function FloatingTreeSelect({
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
  sizeToken: string;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
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
      (dropdown?.ownerDocument.querySelector('[data-testid="tree-select-trigger"]') as HTMLElement | null);
    if (!dropdown || !trigger) {
      return;
    }
    const triggerBounds = trigger.getBoundingClientRect();
    const top = triggerBounds.top;
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${triggerBounds.left}px`;
    dropdown.style.minWidth = `${triggerBounds.width}px`;
    const maxAvailable = window.innerHeight - top - panelViewportPadding;
    dropdown.style.maxHeight = `${Math.max(120, maxAvailable)}px`;
    overlayStyle.current = { top };
  }, [panel.refs.floating, panel.triggerRef]);

  repositionRef.current = reposition;

  useLayoutEffect(() => {
    if (!open || !panel.mounted) {
      return;
    }
    reposition();
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

  const commit = useCallback(
    (node: TreeNode) => {
      onCommit(node);
      onOpenChange(false);
    },
    [onCommit, onOpenChange],
  );

  const onSearchKeyDown = (event: { key: string; preventDefault: () => void }) => {
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
      onCommit: commit,
      onClose: () => {
        onOpenChange(false);
      },
    });
  };

  const activeDescendant = open && state.activeIndex >= 0 ? `${treeId}-node-${state.activeIndex}` : undefined;

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
          <FloatingFocusManager context={panel.context} modal={false} initialFocus={-1}>
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
              style={
                {
                  position: 'fixed',
                  top: overlayStyle.current?.top ?? 0,
                  left: 0,
                  zIndex: zIndex.dropdown,
                  opacity: panel.visible ? 1 : 0,
                  transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
                  transition: panelTransition,
                  boxSizing: 'border-box',
                } as Record<string, unknown>
              }>
              <SearchRow
                value={state.filter}
                placeholder={searchPlaceholder}
                inputRef={searchRef}
                onChange={state.setFilter}
                onKeyDown={onSearchKeyDown}
                treeId={treeId}
                activeDescendant={activeDescendant}
                sizeToken={sizeToken}
              />
              <YStack overflow="scroll" maxHeight={320} id={treeId}>
                <TreeSelectPanelBody
                  rows={state.rows}
                  selectedId={value}
                  activeIndex={state.activeIndex}
                  keyboardRing={state.keyboardRing}
                  treeId={treeId}
                  emptyMessage={emptyMessage}
                  loading={loading}
                  onCommit={commit}
                  onToggle={state.toggle}
                />
              </YStack>
            </YStack>
          </FloatingFocusManager>
        </PanelPortal>
      )}
    </>
  );
}

function SheetTreeSelect({
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
  sizeToken: string;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  const treeId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const state = useTreeSelectState({ nodes, value, open, defaultExpandedIds });
  const triggerRef = useRef<HTMLElement | null>(null);

  const commit = useCallback(
    (node: TreeNode) => {
      onCommit(node);
      onOpenChange(false);
    },
    [onCommit, onOpenChange],
  );

  const onSearchKeyDown = (event: { key: string; preventDefault: () => void }) => {
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
      onCommit: commit,
      onClose: () => {
        onOpenChange(false);
      },
    });
  };

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
        onChange={state.setFilter}
        onKeyDown={onSearchKeyDown}
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
          onCommit={commit}
          onToggle={state.toggle}
        />
      </YStack>
    </FloatingPanel>
  );
}

export function TreeSelect({
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
}: TreeSelectProps) {
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
  const effectiveGtSm = typeof window !== 'undefined' ? viewportGtSm : false;
  const shouldUseSheet = !isWeb || !effectiveGtSm;
  const selected = value ? findNode(nodes, value) : undefined;
  const display = selected?.label ?? (value ? (valueLabel ?? value) : undefined);

  if (skeleton) {
    return (
      <YStack data-testid="tree-select" {...stackProps}>
        {label ? <Skeleton variant="text" width="30%" height={14} /> : null}
        <Skeleton variant="rounded" width="100%" height={44} />
      </YStack>
    );
  }

  if (readOnly) {
    return (
      <YStack data-testid="tree-select" width="100%" {...stackProps}>
        <FieldLayout
          id={id}
          label={label}
          error={error}
          helperText={helperText}
          required={required}
          knobProps={knobProps as never}
          disabled={disabled}>
          <Text paddingVertical="$2" paddingHorizontal="$3" {...knobProps.body}>
            {display ?? '—'}
          </Text>
        </FieldLayout>
      </YStack>
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
    sizeToken: String(knobProps.sizeToken),
    loading,
    accessibilityLabel: accessibilityLabel ?? ariaLabel,
  };

  const core = shouldUseSheet ? <SheetTreeSelect {...shared} /> : <FloatingTreeSelect {...shared} />;

  return (
    <YStack data-testid="tree-select" width="100%" {...stackProps}>
      <FieldLayout
        id={id}
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        knobProps={knobProps as never}
        disabled={disabled}>
        {core}
      </FieldLayout>
    </YStack>
  );
}

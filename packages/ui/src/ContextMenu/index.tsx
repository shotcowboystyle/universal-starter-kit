/**
 * ContextMenu — catalog action menu on the FloatingPanel overlay stack.
 *
 * Compose DropdownMenu row grammar on FloatingPanel. Web opens
 * on `contextmenu`; native opens on long-press. Same menu. Do not invent a
 * second overlay stack. Do not wrap Card in Tint — elevatedSurface on the
 * panel is the only surface source.
 *
 * Pointer-positioned per layoutTokens.ts: a FREE overlay, not the
 * cover contract. The menu opens at the right-click / long-press point,
 * content-sized, `OVERLAY_ANCHOR_GAP` from the point, and flips toward the
 * start or up where the viewport runs out. A keyboard open opens from the
 * target's bottom start corner. Native tablets (window > 640) open at the
 * long-press point; phones keep the sheet.
 *
 * Rows: 44 tall, padX 13 (`menuRowFrame` $3), selected `$color2` + trailing
 * check, hover `$color3`, label weight 400, keyboard 2px ring offset 0.
 * Sheet at ≤640 via FloatingPanel's overlay family pivot.
 */

import { CheckIcon } from '@phosphor-icons/react';
import { FloatingPanel } from '@repo/forms';
import {
  hairline,
  keyboardFocusRingProps,
  menuRowFrame,
  useResolvedKnobs,
  warnBareDisabled,
  wasKeyboardFocus,
  ensureKeyboardModalityTracking,
} from '@repo/theme';
import {
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode, RefObject } from 'react';
import type { GetProps, TamaguiElement } from 'tamagui';
import {
  Text,
  View,
  XStack,
  YStack,
  isWeb,
  styled,
  useControllableState,
  useTheme,
  withStaticProperties,
} from 'tamagui';

import { componentColors } from '../component-colors';
import type { DropdownMenuEntry, DropdownMenuItemSpec } from '../DropdownMenu';

export type ContextMenuEntry = DropdownMenuEntry;
export type ContextMenuItemSpec = DropdownMenuItemSpec;

export interface ContextMenuProps {
  children?: ReactNode;
  items?: ContextMenuEntry[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  maxHeight?: number;
  closeOnSelect?: boolean;
}

interface ContextMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
  closeOnSelect?: boolean;
  pendingFocusRef: RefObject<'first' | 'last'>;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

const useContextMenuContext = (part: string): ContextMenuContextValue => {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error(`ContextMenu.${part} must be used inside <ContextMenu>`);
  }
  return ctx;
};

const HOVER_FILL = '$color3';
const SELECTED_FILL = '$color2';
const MENU_ITEM_ATTR = 'data-mp-menu-item';

const ItemRow = styled(XStack, {
  name: 'ContextMenuItem',
  ...menuRowFrame,
  gap: '$2.5',
  cursor: 'pointer',
  outlineWidth: 0,
  hoverStyle: { backgroundColor: HOVER_FILL },
  pressStyle: { backgroundColor: HOVER_FILL },
  focusStyle: {
    backgroundColor: HOVER_FILL,
    outlineWidth: 0,
  },
  focusVisibleStyle: {
    backgroundColor: HOVER_FILL,
    outlineWidth: 0,
  },
  variants: {
    selected: {
      true: { backgroundColor: SELECTED_FILL },
    },
    disabled: {
      true: {
        cursor: 'default',
        opacity: 0.5,
        hoverStyle: { backgroundColor: 'transparent' },
        pressStyle: { backgroundColor: 'transparent' },
        focusStyle: { backgroundColor: 'transparent' },
      },
    },
  } as const,
});

const SeparatorLine = styled(View, {
  name: 'ContextMenuSeparator',
  height: 1,
  width: '100%',
  backgroundColor: componentColors.divider,
  marginVertical: '$1.5',
});

const freeOverlay = {
  widthMode: 'fit-content' as const,
  openOn: 'contextmenu' as const,
};

const ContextMenuSeparator = (props: ContextMenuSeparatorProps) => (
  <SeparatorLine
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- cross-platform Tamagui View; an <hr> render would change the native tree
    role="separator"
    {...hairline.height}
    {...props}
  />
);

// oxlint-disable-next-line react/jsx-no-useless-fragment -- `children` is typed ReactNode (may be a Promise), so it can't be returned bare
const ContextMenuTrigger = ({ children }: ContextMenuTriggerProps) => <>{children}</>;

// oxlint-disable-next-line react/jsx-no-useless-fragment -- `children` is typed ReactNode (may be a Promise), so it can't be returned bare
const ContextMenuContent = ({ children }: ContextMenuContentProps) => <>{children}</>;

// Menu refs are Tamagui host elements; only web hosts are DOM nodes.
const toHtmlElement = (el: TamaguiElement | null): HTMLElement | null =>
  isWeb && el instanceof HTMLElement ? el : null;

const listScrollProps = (maxHeight: number) => (isWeb ? { maxHeight, style: { overflowY: 'auto' } } : { maxHeight });

const ContextMenuList = ({ children, maxHeight }: { children?: ReactNode; maxHeight?: number }) => {
  const ctx = useContextMenuContext('Content');
  const innerRef = useRef<TamaguiElement | null>(null);
  const typeahead = useRef({ buffer: '', at: 0 });
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const getItems = useCallback((): HTMLElement[] => {
    const node = toHtmlElement(innerRef.current);
    if (!node) {
      return [];
    }
    return [...node.querySelectorAll<HTMLElement>(`[${MENU_ITEM_ATTR}]:not([aria-disabled="true"])`)];
  }, []);

  const focusItem = useCallback((el: HTMLElement | undefined) => {
    el?.focus();
  }, []);

  const { open, close, pendingFocusRef } = ctx;
  useEffect(() => {
    if (!isWeb || !open) {
      return;
    }
    const prefer = pendingFocusRef.current;
    pendingFocusRef.current = 'first';
    requestAnimationFrame(() => {
      const items = getItems();
      focusItem(prefer === 'last' ? items.at(-1) : items[0]);
    });
  }, [open, pendingFocusRef, focusItem, getItems]);

  useEffect(() => {
    const node = toHtmlElement(innerRef.current);
    const handler = (event: globalThis.KeyboardEvent) => {
      const items = getItems();
      if (!items.length) {
        return;
      }
      const active = document.activeElement;
      const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          focusItem(items[(index + 1) % items.length]);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          focusItem(items[(index - 1 + items.length) % items.length]);
          break;
        }
        case 'Home': {
          event.preventDefault();
          focusItem(items[0]);
          break;
        }
        case 'End': {
          event.preventDefault();
          focusItem(items.at(-1));
          break;
        }
        case 'Enter':
        case ' ': {
          if (index !== -1) {
            event.preventDefault();
            items[index].click();
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          event.stopPropagation();
          close();
          break;
        }
        case 'Tab': {
          close();
          break;
        }
        default: {
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            const state = typeahead.current;
            state.buffer = now - state.at > 600 ? event.key : state.buffer + event.key;
            state.at = now;
            const query = state.buffer.toLowerCase();
            const start = index === -1 ? 0 : index;
            const ordered = [...items.slice(start + 1), ...items.slice(0, start + 1)];
            const match = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(query));
            if (match) {
              focusItem(match);
            }
          }
        }
      }
    };
    node?.addEventListener('keydown', handler);
    return () => {
      node?.removeEventListener('keydown', handler);
    };
  }, [close, focusItem, getItems]);

  const scrollProps = maxHeight !== undefined && maxHeight !== 0 ? listScrollProps(maxHeight) : undefined;
  return (
    <YStack
      ref={innerRef}
      role="menu"
      width="100%"
      paddingVertical={0}
      {...scrollProps}>
      {children}
    </YStack>
  );
};

export interface ContextMenuTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

export interface ContextMenuContentProps {
  children?: ReactNode;
  maxHeight?: number;
}

export interface ContextMenuItemProps extends Omit<GetProps<typeof ItemRow>, 'children' | 'onSelect'> {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onSelect?: () => void;
  closeOnSelect?: boolean;
}

interface ItemBodyProps extends ContextMenuItemProps {
  trailing?: ReactNode;
  closeOnSelectDefault?: boolean;
  selected?: boolean;
}

interface WebRowProps {
  tabIndex: number;
  onFocus: () => void;
  onBlur: () => void;
  onPointerMove: (e: { pointerType?: string; currentTarget: unknown }) => void;
  'data-highlighted'?: 'true';
  'data-mp-kb-ring'?: 'true';
  [MENU_ITEM_ATTR]: '';
}

/** Web-only focus/pointer wiring: keyboard ring vs pointer highlight, tracked per row. */
const useWebRowProps = (disabled: boolean) => {
  const [kbRing, setKbRing] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const pointerIntentRef = useRef(false);

  const webProps: WebRowProps = {
    tabIndex: -1,
    [MENU_ITEM_ATTR]: '',
    onFocus: () => {
      setHighlighted(true);
      setKbRing(wasKeyboardFocus() && !pointerIntentRef.current);
      pointerIntentRef.current = false;
    },
    onBlur: () => {
      setHighlighted(false);
      setKbRing(false);
    },
    onPointerMove: (e) => {
      if (disabled) {
        return;
      }
      const pointerType = e.pointerType ?? '';
      if (pointerType !== '' && pointerType !== 'mouse') {
        return;
      }
      const node = e.currentTarget;
      if (!(node instanceof HTMLElement) || document.activeElement === node) {
        return;
      }
      pointerIntentRef.current = true;
      node.focus();
    },
  };
  if (highlighted) {
    webProps['data-highlighted'] = 'true';
  }
  if (kbRing) {
    webProps['data-mp-kb-ring'] = 'true';
  }
  return { kbRing, webProps: isWeb ? webProps : undefined };
};

interface ItemLabelProps {
  children: ReactNode;
  disabledReason?: string;
  explained: boolean;
  textColor: string;
}

const ItemLabel = ({ children, disabledReason, explained, textColor }: ItemLabelProps) => {
  const { knobProps } = useResolvedKnobs();
  if (explained) {
    return (
      <YStack
        flexGrow={1}
        flexShrink={1}
        gap="$0.5">
        <Text
          {...knobProps.body}
          color={textColor}
          fontSize="$3"
          fontWeight="400"
          numberOfLines={1}>
          {children}
        </Text>
        <Text
          {...knobProps.body}
          color={knobProps.textAccentColor}
          fontSize="$1"
          data-mp-disabled-reason="true">
          {disabledReason}
        </Text>
      </YStack>
    );
  }
  return (
    <Text
      {...knobProps.body}
      color={textColor}
      fontSize="$3"
      fontWeight="400"
      numberOfLines={1}
      flexGrow={1}
      flexShrink={1}>
      {children}
    </Text>
  );
};

interface ItemIconProps {
  icon: ReactNode;
  destructive: boolean;
}

const ItemIcon = ({ icon, destructive }: ItemIconProps) => {
  const theme = useTheme();
  const colorToken = destructive ? theme.red11 : theme.color12;
  const iconColor = colorToken == null ? undefined : String(colorToken.get());
  const hasIcon = Boolean(icon);
  if (!hasIcon) {
    return null;
  }
  return (
    <View
      flexShrink={0}
      alignItems="center"
      justifyContent="center"
      width={18}
      {...(isWeb ? { style: { color: iconColor } } : undefined)}>
      {icon}
    </View>
  );
};

const ItemShortcut = ({ shortcut }: { shortcut?: string }) => {
  const { knobProps } = useResolvedKnobs();
  if (shortcut === undefined || shortcut === '') {
    return null;
  }
  return (
    <Text
      {...knobProps.body}
      color={knobProps.textAccentColor}
      fontSize="$1"
      flexShrink={0}
      paddingInlineStart="$4"
      opacity={0.9}>
      {shortcut}
    </Text>
  );
};

const getRowFills = (destructive: boolean, disabled: boolean, selected: boolean, kbRing: boolean) => {
  const redIntent = destructive && !disabled;
  const highlightFill = redIntent
    ? {
        hoverStyle: { backgroundColor: '$red3' },
        pressStyle: { backgroundColor: '$red4' },
      }
    : undefined;
  const focusFill = redIntent
    ? { backgroundColor: '$red3' as const }
    : { backgroundColor: selected ? SELECTED_FILL : HOVER_FILL };
  const ring = kbRing ? { ...keyboardFocusRingProps, outlineOffset: 0 } : { outlineWidth: 0 as const };
  return { highlightFill, ring, focusStyle: { ...focusFill, ...ring } };
};

const ContextMenuItemBody = forwardRef<TamaguiElement, ItemBodyProps>(function ContextMenuItemBody(
  {
    children,
    icon,
    shortcut,
    disabled = false,
    disabledReason,
    destructive = false,
    onSelect,
    closeOnSelect,
    closeOnSelectDefault = true,
    role = 'menuitem',
    trailing,
    selected = false,
    ...props
  },
  forwardedRef,
) {
  const ctx = useContextMenuContext('Item');
  const { knobProps } = useResolvedKnobs();
  const { kbRing, webProps } = useWebRowProps(disabled);
  warnBareDisabled({
    component: 'ContextMenu.Item',
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- children is an arbitrary ReactNode; only a plain string label can serve as the warning id
    id: typeof children === 'string' ? children : undefined,
    disabled,
    disabledReason,
  });
  const explainedDisable = disabled && Boolean(disabledReason?.trim());
  const shouldCloseOnSelect = closeOnSelect ?? ctx.closeOnSelect ?? closeOnSelectDefault;

  const handleSelect = () => {
    if (disabled) {
      return;
    }
    onSelect?.();
    if (shouldCloseOnSelect) {
      ctx.close();
    }
  };

  const textColor = destructive ? '$red11' : componentColors.text.primary;
  const { highlightFill, ring, focusStyle } = getRowFills(destructive, disabled, selected, kbRing);
  const rowHeight = knobProps.sizeToken === '$4' ? '44' : knobProps.sizeToken;

  return (
    <ItemRow
      ref={forwardedRef}
      role={role}
      disabled={disabled}
      selected={selected}
      aria-disabled={disabled || undefined}
      minHeight={knobProps.sizeToken}
      transition={knobProps.transition}
      onPress={handleSelect}
      data-mp-hover-fill={HOVER_FILL}
      data-mp-selected-fill={selected ? SELECTED_FILL : undefined}
      data-mp-pad-x="13"
      data-mp-row-height={rowHeight}
      data-mp-font-weight="400"
      data-mp-ring-offset="0"
      {...highlightFill}
      {...(explainedDisable ? { paddingVertical: '$1.5' } : {})}
      {...props}
      {...webProps}
      {...ring}
      focusStyle={focusStyle}
      focusVisibleStyle={focusStyle}>
      <ItemIcon
        icon={icon}
        destructive={destructive}
      />
      <ItemLabel
        disabledReason={disabledReason}
        explained={explainedDisable}
        textColor={textColor}>
        {children}
      </ItemLabel>
      <ItemShortcut shortcut={shortcut} />
      {trailing}
    </ItemRow>
  );
});

const ContextMenuItem = forwardRef<TamaguiElement, ContextMenuItemProps>(function ContextMenuItem(props, ref) {
  return (
    <ContextMenuItemBody
      ref={ref}
      {...props}
    />
  );
});

export interface ContextMenuCheckboxItemProps extends Omit<ContextMenuItemProps, 'destructive' | 'icon'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const ContextMenuCheckboxItem = forwardRef<TamaguiElement, ContextMenuCheckboxItemProps>(
  function ContextMenuCheckboxItem({ checked, onCheckedChange, onSelect, ...props }, ref) {
    return (
      <ContextMenuItemBody
        ref={ref}
        // SAFETY: Role omits 'menuitemcheckbox' although it is a valid ARIA role; ItemRow forwards role to the DOM unchanged
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the widened ItemRow Role type lacks this valid ARIA role
        role={'menuitemcheckbox' as 'menuitem'}
        aria-checked={checked}
        selected={checked}
        closeOnSelectDefault={false}
        onSelect={() => {
          onCheckedChange?.(!checked);
          onSelect?.();
        }}
        trailing={
          <View
            width={18}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            opacity={checked ? 1 : 0}
            data-mp-check="trailing">
            <CheckIcon
              size={14}
              weight="bold"
            />
          </View>
        }
        {...props}
      />
    );
  },
);

export type ContextMenuSeparatorProps = GetProps<typeof SeparatorLine>;

export interface ContextMenuLabelProps extends GetProps<typeof Text> {
  children: ReactNode;
}

const ContextMenuLabel = ({ children, ...props }: ContextMenuLabelProps) => {
  const { knobProps } = useResolvedKnobs();
  return (
    <Text
      {...knobProps.body}
      fontWeight="600"
      fontSize="$1"
      color={knobProps.textAccentColor}
      paddingHorizontal="$3"
      paddingVertical="$1.5"
      userSelect="none"
      {...props}>
      {children}
    </Text>
  );
};

const isSeparatorEntry = (entry: ContextMenuEntry): entry is { separator: true } =>
  'separator' in entry && entry.separator;

// Entries carry no identity beyond an optional `key`; position is the documented fallback.
const positionalKey = (key: string | undefined, position: number): string | number => key ?? position;

const separatorKey = (position: number): string => `separator-${position}`;

const isNodeArray = (node: ReactNode): node is ReactNode[] => Array.isArray(node);

const renderEntry = (entry: ContextMenuEntry, position: number): ReactNode => {
  if (isSeparatorEntry(entry)) {
    return <ContextMenuSeparator key={separatorKey(position)} />;
  }
  const handleSelect = entry.onSelect;
  const handleCheckedChange = entry.onCheckedChange;
  if (entry.checked !== undefined) {
    return (
      <ContextMenuCheckboxItem
        key={positionalKey(entry.key, position)}
        checked={entry.checked}
        onCheckedChange={handleCheckedChange}
        onSelect={handleSelect}
        closeOnSelect={entry.closeOnSelect}
        disabled={entry.disabled}
        disabledReason={entry.disabledReason}
        shortcut={entry.shortcut}>
        {entry.label}
      </ContextMenuCheckboxItem>
    );
  }
  return (
    <ContextMenuItem
      key={positionalKey(entry.key, position)}
      icon={entry.icon}
      shortcut={entry.shortcut}
      disabled={entry.disabled}
      disabledReason={entry.disabledReason}
      destructive={entry.destructive}
      closeOnSelect={entry.closeOnSelect}
      onSelect={handleSelect}>
      {entry.label}
    </ContextMenuItem>
  );
};

const ContextMenuRoot = ({
  children,
  items,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  maxHeight,
  closeOnSelect,
}: ContextMenuProps) => {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const pendingFocusRef = useRef<'first' | 'last'>('first');

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const ctx = useMemo<ContextMenuContextValue>(
    () => ({ open, setOpen, close, closeOnSelect, pendingFocusRef }),
    [open, setOpen, close, closeOnSelect],
  );

  let trigger: ReactNode = children;
  let body: ReactNode = null;
  if (items) {
    body = items.map(renderEntry);
  } else if (isNodeArray(children) || isValidElement(children)) {
    const list = isNodeArray(children) ? children : [children];
    const triggerParts: ReactNode[] = [];
    const contentParts: ReactNode[] = [];
    for (const child of list) {
      if (!isValidElement<{ children?: ReactNode }>(child)) {
        triggerParts.push(child);
        continue;
      }
      const { type } = child;
      if (type === ContextMenuTrigger) {
        triggerParts.push(child.props.children);
      } else if (type === ContextMenuContent) {
        contentParts.push(child.props.children);
      } else {
        triggerParts.push(child);
      }
    }
    if (triggerParts.length) {
      trigger = triggerParts.length === 1 ? triggerParts[0] : triggerParts;
    }
    if (contentParts.length) {
      body = contentParts;
    }
  }

  return (
    <ContextMenuContext.Provider value={ctx}>
      <FloatingPanel
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        contentPadding="none"
        {...freeOverlay}>
        <ContextMenuList maxHeight={maxHeight}>{body}</ContextMenuList>
      </FloatingPanel>
    </ContextMenuContext.Provider>
  );
};

export const ContextMenu = withStaticProperties(ContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Separator: ContextMenuSeparator,
  Label: ContextMenuLabel,
});

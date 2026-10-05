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
  type ReactNode,
  type RefObject,
} from 'react';
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

import { componentColors } from '../componentColors';
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

function useContextMenuContext(part: string): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error(`ContextMenu.${part} must be used inside <ContextMenu>`);
  }
  return ctx;
}

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

function ContextMenuRoot({
  children,
  items,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  maxHeight,
  closeOnSelect,
}: ContextMenuProps) {
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
    body = items.map((entry, index) =>
      'separator' in entry && entry.separator ? (
        <ContextMenuSeparator key={`separator-${index}`} />
      ) : 'checked' in entry && entry.checked !== undefined ? (
        <ContextMenuCheckboxItem
          key={entry.key ?? index}
          checked={entry.checked!}
          onCheckedChange={entry.onCheckedChange}
          onSelect={entry.onSelect}
          closeOnSelect={entry.closeOnSelect}
          disabled={entry.disabled}
          disabledReason={entry.disabledReason}
          shortcut={entry.shortcut}>
          {entry.label}
        </ContextMenuCheckboxItem>
      ) : (
        <ContextMenuItem
          key={(entry as ContextMenuItemSpec).key ?? index}
          icon={(entry as ContextMenuItemSpec).icon}
          shortcut={(entry as ContextMenuItemSpec).shortcut}
          disabled={(entry as ContextMenuItemSpec).disabled}
          disabledReason={(entry as ContextMenuItemSpec).disabledReason}
          destructive={(entry as ContextMenuItemSpec).destructive}
          closeOnSelect={(entry as ContextMenuItemSpec).closeOnSelect}
          onSelect={(entry as ContextMenuItemSpec).onSelect}>
          {(entry as ContextMenuItemSpec).label}
        </ContextMenuItem>
      ),
    );
  } else if (Array.isArray(children) || isValidElement(children)) {
    const list = Array.isArray(children) ? children : [children];
    const triggerParts: ReactNode[] = [];
    const contentParts: ReactNode[] = [];
    for (const child of list) {
      if (!isValidElement(child)) {
        triggerParts.push(child);
        continue;
      }
      const type = (child as { type?: unknown }).type;
      if (type === ContextMenuTrigger) {
        triggerParts.push((child.props as { children?: ReactNode }).children);
      } else if (type === ContextMenuContent) {
        contentParts.push((child.props as { children?: ReactNode }).children);
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
      <FloatingPanel open={open} onOpenChange={setOpen} trigger={trigger} contentPadding="none" {...freeOverlay}>
        <ContextMenuList maxHeight={maxHeight}>{body}</ContextMenuList>
      </FloatingPanel>
    </ContextMenuContext.Provider>
  );
}

export interface ContextMenuTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

function ContextMenuTrigger({ children }: ContextMenuTriggerProps) {
  return <>{children}</>;
}

export interface ContextMenuContentProps {
  children?: ReactNode;
  maxHeight?: number;
}

function ContextMenuContent({ children }: ContextMenuContentProps) {
  return <>{children}</>;
}

function ContextMenuList({ children, maxHeight }: { children?: ReactNode; maxHeight?: number }) {
  const ctx = useContextMenuContext('Content');
  const innerRef = useRef<TamaguiElement | null>(null);
  const typeahead = useRef({ buffer: '', at: 0 });
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }

  const getItems = useCallback((): HTMLElement[] => {
    const node = innerRef.current as unknown as HTMLElement | null;
    if (!node) {
      return [];
    }
    return Array.from(node.querySelectorAll<HTMLElement>(`[${MENU_ITEM_ATTR}]:not([aria-disabled="true"])`));
  }, []);

  const focusItem = useCallback((el: HTMLElement | undefined) => {
    el?.focus();
  }, []);

  useEffect(() => {
    if (!isWeb || !ctx.open) {
      return;
    }
    const prefer = ctx.pendingFocusRef.current;
    ctx.pendingFocusRef.current = 'first';
    requestAnimationFrame(() => {
      const items = getItems();
      focusItem(prefer === 'last' ? items[items.length - 1] : items[0]);
    });
  }, [ctx, ctx.open, focusItem, getItems]);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const node = innerRef.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    const handler = (event: globalThis.KeyboardEvent) => {
      const items = getItems();
      if (!items.length) {
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusItem(items[(index + 1) % items.length]);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusItem(items[(index - 1 + items.length) % items.length]);
          break;
        case 'Home':
          event.preventDefault();
          focusItem(items[0]);
          break;
        case 'End':
          event.preventDefault();
          focusItem(items[items.length - 1]);
          break;
        case 'Enter':
        case ' ':
          if (index >= 0) {
            event.preventDefault();
            items[index].click();
          }
          break;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          ctx.close();
          break;
        case 'Tab':
          ctx.close();
          break;
        default: {
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            const state = typeahead.current;
            state.buffer = now - state.at > 600 ? event.key : state.buffer + event.key;
            state.at = now;
            const query = state.buffer.toLowerCase();
            const start = index >= 0 ? index : 0;
            const ordered = [...items.slice(start + 1), ...items.slice(0, start + 1)];
            const match = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(query));
            if (match) {
              focusItem(match);
            }
          }
        }
      }
    };
    node.addEventListener('keydown', handler);
    return () => {
      node.removeEventListener('keydown', handler);
    };
  }, [ctx, focusItem, getItems]);

  return (
    <YStack
      ref={innerRef}
      role="menu"
      width="100%"
      paddingVertical={0}
      {...(maxHeight
        ? {
            maxHeight,
            ...(isWeb ? { style: { overflowY: 'auto' } as Record<string, unknown> } : {}),
          }
        : {})}>
      {children}
    </YStack>
  );
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
  const theme = useTheme();
  const [kbRing, setKbRing] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const pointerIntentRef = useRef(false);
  warnBareDisabled({
    component: 'ContextMenu.Item',
    id: typeof children === 'string' ? children : undefined,
    disabled,
    disabledReason,
  });
  const explainedDisable = disabled && Boolean(disabledReason?.trim());
  const iconColor = (destructive ? theme.red11?.get() : theme.color12?.get()) as string | undefined;
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
  const highlightFill =
    destructive && !disabled
      ? {
          hoverStyle: { backgroundColor: '$red3' },
          pressStyle: { backgroundColor: '$red4' },
        }
      : undefined;
  const focusFill =
    destructive && !disabled
      ? { backgroundColor: '$red3' as const }
      : { backgroundColor: selected ? SELECTED_FILL : HOVER_FILL };
  const ring = kbRing ? { ...keyboardFocusRingProps, outlineOffset: 0 } : { outlineWidth: 0 as const };
  const rowHeight = knobProps.sizeToken === '$4' ? '44' : String(knobProps.sizeToken);

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
      data-mp-kb-ring={kbRing ? 'true' : undefined}
      {...highlightFill}
      {...(explainedDisable ? { paddingVertical: '$1.5' } : {})}
      {...(props as Record<string, unknown>)}
      {...(isWeb
        ? ({
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
            onPointerMove: (e: { pointerType?: string; currentTarget: unknown }) => {
              if (disabled) {
                return;
              }
              if (e.pointerType && e.pointerType !== 'mouse') {
                return;
              }
              const node = e.currentTarget as HTMLElement;
              if (document.activeElement === node) {
                return;
              }
              pointerIntentRef.current = true;
              node.focus();
            },
            'data-highlighted': highlighted ? 'true' : undefined,
            'data-mp-kb-ring': kbRing ? 'true' : undefined,
          } as Record<string, unknown>)
        : {})}
      {...(kbRing ? { ...keyboardFocusRingProps, outlineOffset: 0 } : { outlineWidth: 0 })}
      focusStyle={{ ...focusFill, ...ring }}
      focusVisibleStyle={{ ...focusFill, ...ring }}>
      {icon ? (
        <View
          flexShrink={0}
          alignItems="center"
          justifyContent="center"
          width={18}
          {...(isWeb ? ({ style: { color: iconColor } } as Record<string, unknown>) : {})}>
          {icon}
        </View>
      ) : null}
      {explainedDisable ? (
        <YStack flexGrow={1} flexShrink={1} gap="$0.5">
          <Text {...knobProps.body} color={textColor} fontSize="$3" fontWeight="400" numberOfLines={1}>
            {children}
          </Text>
          <Text {...knobProps.body} color={knobProps.textAccentColor} fontSize="$1" data-mp-disabled-reason="true">
            {disabledReason}
          </Text>
        </YStack>
      ) : (
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
      )}
      {shortcut ? (
        <Text
          {...knobProps.body}
          color={knobProps.textAccentColor}
          fontSize="$1"
          flexShrink={0}
          paddingInlineStart="$4"
          opacity={0.9}>
          {shortcut}
        </Text>
      ) : null}
      {trailing}
    </ItemRow>
  );
});

const ContextMenuItem = forwardRef<TamaguiElement, ContextMenuItemProps>(function ContextMenuItem(props, ref) {
  return <ContextMenuItemBody ref={ref} {...props} />;
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
            <CheckIcon size={14} weight="bold" />
          </View>
        }
        {...props}
      />
    );
  },
);

export interface ContextMenuSeparatorProps extends GetProps<typeof SeparatorLine> {}

function ContextMenuSeparator(props: ContextMenuSeparatorProps) {
  return <SeparatorLine role="separator" {...hairline.height} {...props} />;
}

export interface ContextMenuLabelProps extends GetProps<typeof Text> {
  children: ReactNode;
}

function ContextMenuLabel({ children, ...props }: ContextMenuLabelProps) {
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
}

export const ContextMenu = withStaticProperties(ContextMenuRoot, {
  Trigger: ContextMenuTrigger,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Separator: ContextMenuSeparator,
  Label: ContextMenuLabel,
});

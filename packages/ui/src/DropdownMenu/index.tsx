/**
 * DropdownMenu — the canonical house action menu.
 *
 * Trigger + elevated overlay of action rows on the FloatingPanel stack
 * (cover contract: `OVERLAY_ATTACH_GAP=0`, `at-least-trigger`). Do not fork
 * a second overlay. SF-OVERLAY via elevatedSurface, SP-EDGE rows (container
 * owns only its 1px border; items own ALL padding), COMMIT/COMPOSE close classes,
 * and the APG keyboard layer (ArrowUp/Down + Home/End, Enter/Space, Escape,
 * typeahead). Sheet at ≤640 via FloatingPanel's overlay family pivot.
 *
 * Composable parts (DropdownMenu.Trigger/Content/Item/CheckboxItem/
 * Separator/Label) plus a convenience `items=[]` prop. Plain items
 * COMMIT-close; checkable items COMPOSE-stay; `closeOnSelect` opts a
 * radio-style menu into close-on-pick. Checked entries fire BOTH
 * `onCheckedChange` and `onSelect`.
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
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
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

// ── Types ─────────────────────────────────────────────────────

export type DropdownMenuPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end';

export interface DropdownMenuItemSpec {
  /** Stable key (defaults to index). */
  key?: string;
  label: ReactNode;
  /** Leading icon node (phosphor icons inherit currentColor on web). */
  icon?: ReactNode;
  /** Trailing shortcut hint, e.g. "⌘C". */
  shortcut?: string;
  disabled?: boolean;
  /**
   * Explains why the item is disabled; renders inline under the
   * label (no hover needed). Bare `disabled` DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
  /** Error-intent row (destructive action). */
  destructive?: boolean;
  /** Present ⇒ renders as a checkable item (menuitemcheckbox). */
  checked?: boolean;
  /** Toggle callback for checkable entries (fires with the next checked state). */
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Fires on every activation — checkable entries included (alongside
   * `onCheckedChange`), so single-select "radio-style" menus can navigate
   * from the same entry that carries the check mark.
   */
  onSelect?: () => void;
  /**
   * Close the menu after this entry activates. Defaults per class:
   * plain items close (COMMIT — the pick completes the contract), checkable
   * items stay open (COMPOSE — toggles accumulate). The menu-level
   * `closeOnSelect` overrides the class default; this entry-level value
   * wins over both.
   */
  closeOnSelect?: boolean;
}

export type DropdownMenuEntry = DropdownMenuItemSpec | { separator: true };

export interface DropdownMenuProps {
  /**
   * Composable children (Trigger + Content), or — when `items` is given —
   * the trigger element itself.
   */
  children?: ReactNode;
  /** Convenience declarative items; children become the trigger. */
  items?: DropdownMenuEntry[];
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: DropdownMenuPlacement;
  /** Max menu height before the list scrolls (convenience `items` path). */
  maxHeight?: number;
  /**
   * Menu-level close-on-activate default for every item (entry-level
   * `closeOnSelect` wins). Set true on single-select "radio-style" menus —
   * view/board/sort switchers whose checked pick commits and closes
   * (COMMIT) — instead of controlling `open` from the consumer.
   */
  closeOnSelect?: boolean;
}

// ── Context ───────────────────────────────────────────────────

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: () => void;
  /** Menu-level closeOnSelect default (entry-level values win). */
  closeOnSelect?: boolean;
  /** APG: ArrowUp on the trigger focuses the last item on open. */
  pendingFocusRef: RefObject<'first' | 'last'>;
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(part: string): DropdownMenuContextValue {
  const ctx = useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error(`DropdownMenu.${part} must be used inside <DropdownMenu>`);
  }
  return ctx;
}

// ── Styled parts ──────────────────────────────────────────────

// SP-EDGE geometry comes from the shared `menuRowFrame` recipe (theme):
// full-width row, own horizontal padding, flat corners, no focus outline —
// the same frame Select options and MentionInput suggestions use. Menu-only
// concerns stay local: cursor, gap, and the interactive color ramp.
const HOVER_FILL = '$color3';
const SELECTED_FILL = '$color2';
const MENU_ITEM_ATTR = 'data-mp1-menu-item';

const ItemRow = styled(XStack, {
  name: 'DropdownMenuItem',
  ...menuRowFrame,
  gap: '$2.5',
  cursor: 'pointer',
  // CONTAINER-CLIP: rows stay square; the overlay clips outer corners.
  // Rest and pointer-origin focus paint no ring. Keyboard ring is
  // applied per-row via keyboardFocusRingProps (offset 0 — design-law menu
  // grammar) when wasKeyboardFocus().
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
  name: 'DropdownMenuSeparator',
  height: 1,
  width: '100%',
  backgroundColor: componentColors.divider,
  marginVertical: '$1.5',
});

const coverContract = {
  widthMode: 'at-least-trigger' as const,
  fitContent: false,
};

function decorateTrigger(trigger: ReactNode, open: boolean, onArrow: (prefer: 'first' | 'last') => void): ReactNode {
  if (!isValidElement(trigger)) {
    return trigger;
  }
  const props = trigger.props as {
    onKeyDown?: (e: ReactKeyboardEvent) => void;
  };
  return cloneElement(trigger as ReactElement<Record<string, unknown>>, {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    onKeyDown: (e: ReactKeyboardEvent) => {
      props.onKeyDown?.(e);
      if (e.repeat) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        onArrow(e.key === 'ArrowUp' ? 'last' : 'first');
      }
    },
  });
}

function renderEntries(items: DropdownMenuEntry[]) {
  return items.map((entry, index) =>
    'separator' in entry && entry.separator ? (
      <DropdownMenuSeparator key={`separator-${index}`} />
    ) : 'checked' in entry && entry.checked !== undefined ? (
      <DropdownMenuCheckboxItem
        key={entry.key ?? index}
        checked={entry.checked!}
        onCheckedChange={entry.onCheckedChange}
        onSelect={entry.onSelect}
        closeOnSelect={entry.closeOnSelect}
        disabled={entry.disabled}
        disabledReason={entry.disabledReason}
        shortcut={entry.shortcut}>
        {entry.label}
      </DropdownMenuCheckboxItem>
    ) : (
      <DropdownMenuItem
        key={(entry as DropdownMenuItemSpec).key ?? index}
        icon={(entry as DropdownMenuItemSpec).icon}
        shortcut={(entry as DropdownMenuItemSpec).shortcut}
        disabled={(entry as DropdownMenuItemSpec).disabled}
        disabledReason={(entry as DropdownMenuItemSpec).disabledReason}
        destructive={(entry as DropdownMenuItemSpec).destructive}
        closeOnSelect={(entry as DropdownMenuItemSpec).closeOnSelect}
        onSelect={(entry as DropdownMenuItemSpec).onSelect}>
        {(entry as DropdownMenuItemSpec).label}
      </DropdownMenuItem>
    ),
  );
}

// ── Root ──────────────────────────────────────────────────────

function DropdownMenuRoot({
  children,
  items,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom-start',
  maxHeight,
  closeOnSelect,
}: DropdownMenuProps) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const pendingFocusRef = useRef<'first' | 'last'>('first');

  // Content's onCloseAutoFocus, read off the Content child below during the
  // same render. A ref because the child scan happens after these callbacks
  // are defined, and both close paths have to reach the same handler.
  const closeAutoFocusRef = useRef<DropdownMenuContentProps['onCloseAutoFocus']>(undefined);
  // Notify on the actual state transition, including parent-controlled closes.
  // A rejected controlled close request must not move focus out of an open menu.
  const wasOpenRef = useRef(false);
  const skipReturnFocusRef = useRef(false);

  const fireCloseAutoFocus = useCallback(() => {
    const handler = closeAutoFocusRef.current;
    if (!handler) {
      return;
    }
    handler({
      preventDefault: () => {
        skipReturnFocusRef.current = true;
      },
      get defaultPrevented() {
        return skipReturnFocusRef.current;
      },
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      fireCloseAutoFocus();
    }
    wasOpenRef.current = !!open;
    if (open) {
      skipReturnFocusRef.current = false;
    }
  }, [open, fireCloseAutoFocus]);

  const ctx = useMemo<DropdownMenuContextValue>(
    () => ({ open, setOpen, close, closeOnSelect, pendingFocusRef }),
    [open, setOpen, close, closeOnSelect],
  );

  const onArrow = useCallback(
    (prefer: 'first' | 'last') => {
      pendingFocusRef.current = prefer;
      if (!open) {
        setOpen(true);
      }
    },
    [open, setOpen],
  );

  let trigger: ReactNode = children;
  let body: ReactNode = null;
  let contentMaxHeight = maxHeight;
  let contentMaxWidth: number | undefined;
  let contentAriaLabel: string | undefined;
  closeAutoFocusRef.current = undefined;
  if (items) {
    body = renderEntries(items);
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
      if (type === DropdownMenuTrigger) {
        triggerParts.push((child.props as { children?: ReactNode }).children);
      } else if (type === DropdownMenuContent) {
        const contentProps = child.props as DropdownMenuContentProps;
        contentParts.push(contentProps.children);
        if (contentProps.maxHeight != null) {
          contentMaxHeight = contentProps.maxHeight;
        }
        if (contentProps.maxWidth != null) {
          contentMaxWidth = contentProps.maxWidth;
        }
        if (contentProps.onCloseAutoFocus) {
          closeAutoFocusRef.current = contentProps.onCloseAutoFocus;
        }
        if (contentProps['aria-label'] != null) {
          contentAriaLabel = contentProps['aria-label'];
        }
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
    <DropdownMenuContext.Provider value={ctx}>
      <FloatingPanel
        open={open}
        onOpenChange={setOpen}
        skipReturnFocusRef={skipReturnFocusRef}
        trigger={decorateTrigger(trigger, open, onArrow)}
        contentPadding="none"
        {...coverContract}
        {...(placement ? { placement } : {})}>
        <DropdownMenuList maxHeight={contentMaxHeight} maxWidth={contentMaxWidth} aria-label={contentAriaLabel}>
          {body}
        </DropdownMenuList>
      </FloatingPanel>
    </DropdownMenuContext.Provider>
  );
}

// ── Trigger ───────────────────────────────────────────────────

export interface DropdownMenuTriggerProps {
  children?: ReactNode;
  asChild?: boolean;
}

function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  return <>{children}</>;
}

// ── Content ───────────────────────────────────────────────────

export interface DropdownMenuContentProps {
  children?: ReactNode;
  /** Max height before the item list scrolls. */
  maxHeight?: number;
  /**
   * Max menu width. Callers such as DataTableViewOptions pass a popover
   * cap; FloatingPanel still owns at-least-trigger, this only clips overflow.
   */
  maxWidth?: number;
  /**
   * Minimum menu width. FloatingPanel's at-least-trigger cover contract
   * owns this now — kept so existing callers type-check.
   */
  minWidth?: number;
  /**
   * Fired as the menu closes, before focus would return to the trigger.
   * Call `preventDefault()` to keep the trigger from taking focus back —
   * the rich-text toolbars do exactly that and hand focus to the editor
   * instead, so the user can keep typing after picking a heading or a list.
   */
  onCloseAutoFocus?: (event: DropdownMenuCloseAutoFocusEvent) => void;
  /**
   * Accessible name for the menu. Lands on the `role="menu"` element, which
   * is the node a screen reader announces — a facet menu whose trigger is an
   * icon has no other name. DataTableFacetMenu passes its column label.
   */
  'aria-label'?: string;
}

/**
 * The minimal preventable event `onCloseAutoFocus` receives. Deliberately not
 * a DOM event: the close can originate from a native sheet or a keyboard
 * dismissal where there is no DOM event to forward.
 */
export interface DropdownMenuCloseAutoFocusEvent {
  preventDefault: () => void;
  readonly defaultPrevented: boolean;
}

function DropdownMenuContent({ children }: DropdownMenuContentProps) {
  return <>{children}</>;
}

function DropdownMenuList({
  children,
  maxHeight,
  maxWidth,
  'aria-label': ariaLabel,
}: {
  children?: ReactNode;
  maxHeight?: number;
  maxWidth?: number;
  'aria-label'?: string;
}) {
  const ctx = useDropdownMenuContext('Content');
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
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      data-dismiss-class="commit"
      data-mp-width-mode="at-least-trigger"
      width="100%"
      paddingVertical={0}
      {...(maxHeight
        ? {
            maxHeight,
            ...(isWeb ? { style: { overflowY: 'auto' } as Record<string, unknown> } : {}),
          }
        : {})}
      {...(maxWidth ? { maxWidth } : {})}>
      {children}
    </YStack>
  );
}

// ── Item ──────────────────────────────────────────────────────

export interface DropdownMenuItemProps extends Omit<GetProps<typeof ItemRow>, 'children' | 'onSelect'> {
  children: ReactNode;
  /** Leading icon node. */
  icon?: ReactNode;
  /** Trailing shortcut hint, e.g. "⌘C". */
  shortcut?: string;
  disabled?: boolean;
  /**
   * Explains why the item is disabled; renders inline under the
   * label (no hover needed). Bare `disabled` DEV-warns `bare-disabled`.
   */
  disabledReason?: string;
  /** Error-intent row (destructive action). */
  destructive?: boolean;
  onSelect?: () => void;
  /**
   * Close the menu after selecting. Class default when unset: Item closes
   * (COMMIT), CheckboxItem stays open (COMPOSE); a menu-level
   * `closeOnSelect` on the root overrides the class default.
   */
  closeOnSelect?: boolean;
}

interface ItemBodyProps extends DropdownMenuItemProps {
  trailing?: ReactNode;
  /** Close-class default applied when neither entry nor menu set a value. */
  closeOnSelectDefault?: boolean;
  selected?: boolean;
}

const DropdownMenuItemBody = forwardRef<TamaguiElement, ItemBodyProps>(function DropdownMenuItemBody(
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
  const ctx = useDropdownMenuContext('Item');
  const { knobProps } = useResolvedKnobs();
  const theme = useTheme();
  const [kbRing, setKbRing] = useState(false);
  const [highlighted, setHighlighted] = useState(false);
  const pointerIntentRef = useRef(false);
  warnBareDisabled({
    component: 'DropdownMenu.Item',
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

const DropdownMenuItem = forwardRef<TamaguiElement, DropdownMenuItemProps>(function DropdownMenuItem(props, ref) {
  return <DropdownMenuItemBody ref={ref} {...props} />;
});

// ── CheckboxItem ──────────────────────────────────────────────

export interface DropdownMenuCheckboxItemProps extends Omit<DropdownMenuItemProps, 'destructive' | 'icon'> {
  checked: boolean;
  /** Toggle callback (fires with the next checked state on every activation). */
  onCheckedChange?: (checked: boolean) => void;
}

const DropdownMenuCheckboxItem = forwardRef<TamaguiElement, DropdownMenuCheckboxItemProps>(
  function DropdownMenuCheckboxItem({ checked, onCheckedChange, onSelect, ...props }, ref) {
    return (
      <DropdownMenuItemBody
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

// ── Separator & Label ─────────────────────────────────────────

export interface DropdownMenuSeparatorProps extends GetProps<typeof SeparatorLine> {}

function DropdownMenuSeparator(props: DropdownMenuSeparatorProps) {
  return <SeparatorLine role="separator" {...hairline.height} {...props} />;
}

export interface DropdownMenuLabelProps extends GetProps<typeof Text> {
  children: ReactNode;
}

function DropdownMenuLabel({ children, ...props }: DropdownMenuLabelProps) {
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

// ── Export ────────────────────────────────────────────────────

export const DropdownMenu = withStaticProperties(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
});

export type DropdownMenuRowProps = GetProps<typeof ItemRow>;

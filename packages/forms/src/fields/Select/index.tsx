import {
  useClick,
  useDismiss,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
  FloatingFocusManager,
} from '@floating-ui/react';
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import {
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  menuRowFrame,
  sizeRecipeForToken,
  useGlyphColor,
  useResolvedKnobs,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject, UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
// `react-native` aliases to react-native-web on the web, and RNW 0.21 exports
// no ActionSheetIOS at all — a NAMED import of it is a hard SyntaxError that
// kills the whole preview bundle, so every Forms story renders blank. The
// sheet is reached only under shouldUseIosNativeSelect (iOS, never web), so
// read it off the namespace and let it be undefined where it does not exist.
import * as ReactNative from 'react-native';
import { Platform, Pressable as RNPressable } from 'react-native';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Paragraph, Text, View, YStack, isWeb, styled, useTheme } from 'tamagui';

import { Chip, type ChipProps } from '../../Chip';
import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../fieldLayout';
import {
  FloatingPanel,
  useFloatingPanel,
  panelTransition,
  panelViewportPadding,
  useViewportGtSm,
} from '../../FloatingPanel';
import { PanelPortal } from '../../FloatingPanel/PanelPortal';
import { Input as InputParts, FocusContext } from '../../InputParts';
import { formCommonColors, formInputColors, formSelectedColors } from '../../shared/colorRamps';
import { warnSelectTooFewOptions } from '../../shared/devWarn';
import { ScrollArrow } from '../../shared/floatingList';
import { pickerTriggerContract } from '../../shared/pickerTriggerContract';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';
import { useDragScroll } from '../../shared/useDragScroll';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { zIndex } from '../../shared/zIndex';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import { shouldUseIosNativeSelect } from '../nativeSelect';
import { orderOptionsBySelected, type SelectedOrder } from '../selectedOrder';

/** Undefined on web (RNW ships no ActionSheetIOS); real on iOS. */
const actionSheetIOS = (ReactNative as { ActionSheetIOS?: typeof ReactNative.ActionSheetIOS }).ActionSheetIOS;

// ── Types ─────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  /** Optional group label for grouping options */
  group?: string;
}

export interface SelectProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: string | string[];
  defaultValue?: string | string[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string | string[]) => void;
  /** @deprecated Use `onChange` instead. Kept as an alias for the tamagui/Radix name. */
  onValueChange?: (value: string | string[]) => void;
  onBlur?: (...args: any[]) => void;
  options: SelectOption[];
  placeholder?: string;
  groupLabel?: string;
  multiple?: boolean;
  /**
   * Multi-select list order. `selected-first` (default) pins chosen rows to the
   * top, alphabetically among themselves. `stable` keeps `options` order.
   */
  selectedOrder?: SelectedOrder;
  /** Show dismiss button on badges to remove selected items (only applies when multiple=true) */
  dismissible?: boolean;
  /** When true, renders a skeleton placeholder instead of the select */
  skeleton?: boolean;
  'aria-label'?: string;
  /** When true, uses compact sizing */
  compact?: boolean;
  /**
   * Opt into the OS picker on iOS (ActionSheet). Ignored on web, when
   * `multiple` is set, and on Android (the catalog sheet stays). Default false.
   */
  native?: boolean;
}

// ── Lightweight item row (replaces heavy ListItem-based DropdownItem) ──
// Geometry comes from the shared `menuRowFrame` recipe (theme) — the
// same frame DropdownMenu items and MentionInput suggestions use. Listbox
// concerns stay local: `default` cursor, gap, and the form-input color ramp.

// Tamagui maps `focusVisibleStyle` onto mouse/:focus, so the ring is
// painted from `wasKeyboardFocus()` (inset — overlay overflow clips it).
// Rows stay square; the panel radius cuts the corners.
const selectOutlineRest = {
  outlineWidth: 0,
  outlineStyle: 'solid' as const,
  outlineColor: 'transparent',
};
const selectRowOutlineRest = {
  ...selectOutlineRest,
  borderRadius: 0,
};

const SelectRow = styled(View, {
  name: 'SelectRow',
  ...menuRowFrame,
  ...selectRowOutlineRest,
  gap: '$2',
  cursor: 'default',
  hoverStyle: {
    backgroundColor: formInputColors.background.focus,
    borderRadius: 0,
  },
  // Do not put outlineWidth here — Tamagui maps these onto mouse :focus and
  // they beat instance ring props. Rows paint the ring via selectItemRingProps.
  variants: {
    selected: {
      true: { backgroundColor: formInputColors.background.base, borderRadius: 0 },
      false: { backgroundColor: 'transparent' },
    },
    active: {
      true: { backgroundColor: formInputColors.background.focus, borderRadius: 0 },
      false: {},
    },
    size: {
      '...size': (val: any) => ({ height: val }),
    },
  } as const,
});

const GroupHeader = styled(Text, {
  name: 'SelectGroupHeader',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  paddingTop: '$3',
  fontWeight: '600',
  fontSize: '$2',
  opacity: 0.6,
  numberOfLines: 1,
  userSelect: 'none',
  cursor: 'default',
});

// ── Helper to group options ───────────────────────────────────

interface GroupedOption {
  type: 'option';
  option: SelectOption;
  flatIndex: number;
}

interface GroupHeaderItem {
  type: 'header';
  label: string;
}

type GroupedItem = GroupedOption | GroupHeaderItem;

function groupOptions(options: SelectOption[]): {
  items: GroupedItem[];
  flatOptions: SelectOption[];
} {
  const hasGroups = options.some((o) => o.group);
  if (!hasGroups) {
    return {
      items: options.map((option, index) => ({
        type: 'option' as const,
        option,
        flatIndex: index,
      })),
      flatOptions: options,
    };
  }

  // Separate grouped and ungrouped options
  const ungrouped = options.filter((o) => !o.group);
  const grouped = options.filter((o) => o.group);

  // Group by group label
  const groups = new Map<string, SelectOption[]>();
  for (const option of grouped) {
    const groupLabel = option.group!;
    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, []);
    }
    groups.get(groupLabel)!.push(option);
  }

  // Build result
  const items: GroupedItem[] = [];
  const flatOptions: SelectOption[] = [];

  // Add ungrouped first
  for (const option of ungrouped) {
    items.push({ type: 'option', option, flatIndex: flatOptions.length });
    flatOptions.push(option);
  }

  // Add grouped options with headers
  for (const [groupLabel, groupOptions] of groups) {
    items.push({ type: 'header', label: groupLabel });
    for (const option of groupOptions) {
      items.push({ type: 'option', option, flatIndex: flatOptions.length });
      flatOptions.push(option);
    }
  }

  return { items, flatOptions };
}

/** Trigger rings on keyboard-origin only; list rows inherit that modality. */
function useSelectKeyboardRing() {
  const [kbTrigger, setKbTrigger] = useState(false);
  const [kbNav, setKbNav] = useState(false);
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const onTriggerFocus = useCallback(() => {
    if (wasKeyboardFocus()) {
      setKbTrigger(true);
    }
  }, []);
  const onTriggerBlur = useCallback(() => {
    setKbTrigger(false);
  }, []);
  const onTriggerPointerDown = useCallback(() => {
    setKbTrigger(false);
    setKbNav(false);
  }, []);
  return {
    kbTrigger,
    kbNav,
    setKbNav,
    onTriggerFocus,
    onTriggerBlur,
    onTriggerPointerDown,
  };
}

function selectTriggerRingProps(kbTrigger: boolean, open: boolean) {
  if (kbTrigger && !open) {
    return { ...keyboardFocusRingProps, 'data-kb-ring': 'true' as const };
  }
  // Focus modality owns the outline; the control recipe owns trigger shape.
  return { ...selectOutlineRest, 'data-kb-ring': undefined };
}

function selectItemRingProps(isActive: boolean, kbNav: boolean) {
  if (isActive && kbNav) {
    return {
      ...keyboardFocusRingProps,
      'data-kb-ring': 'true' as const,
      // Inline beats Tamagui :focus/:focus-visible classes that otherwise
      // clamp outlineWidth back to 0 (same trap as on Tabs).
      style: {
        outline: '2px solid var(--outlineColor, var(--c-outlineColor, CanvasText))',
        outlineOffset: '-2px',
      },
    };
  }
  return { ...selectRowOutlineRest, 'data-kb-ring': undefined };
}

/**
 * Resolve the selected-mark token to a real paint.
 *
 * An earlier change put `formSelectedColors.mark` ("$accentBackground") on the tick, but a
 * phosphor glyph is NOT a Tamagui styled component: its IconBase writes the
 * prop straight into `<svg fill>`. On web "$accentBackground" is not a valid
 * paint, so the declaration is dropped and `fill` falls back to its initial
 * value — an opaque BLACK tick, measured 1.19:1 against the `$color2` selected
 * row. On native the shim can only resolve a token the theme in scope actually
 * carries, and the component sub-themes carry no `accentBackground` at all.
 * Resolve it here, where the value becomes a paint — the same shape as
 * `mutedColor` in Combobox. Keyed off the ramp constant so the token stays
 * declared once in colorRamps, and degrading to `$color` ink rather than black
 * when a narrow sub-theme has no accent step.
 */
function useSelectedMarkColor(): string {
  const theme = useTheme();
  const entry = (theme as unknown as Record<string, { val?: string } | undefined>)[formSelectedColors.mark.slice(1)];
  return entry?.val ?? theme.color?.val ?? 'currentColor';
}

/** Paints the Input.Box ring via FocusContext — keyboard-origin only. */
function SyncKeyboardFocusToBox({ active }: { active: boolean }) {
  const { setFocused } = FocusContext.useStyledContext();
  useEffect(() => {
    setFocused(active);
  }, [active, setFocused]);
  return null;
}

interface SelectItemHandlers {
  getItemProps: any;
  handleSelect: (index: number, event?: MouseEvent) => void;
  setOpen: (open: boolean) => void;
  knobProps: any;
  textColor: any;
  /** Selected mark, already resolved to a paint. */
  markColor: string;
  allowSelectRef: RefObject<boolean>;
  allowMouseUpRef: RefObject<boolean>;
  selectTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  isTypingRef: { current: { isTyping: boolean } };
  listItemsRef: RefObject<Array<HTMLElement | null>>;
  multiple?: boolean;
  kbNav: boolean;
  setKbNav: (next: boolean) => void;
}

// ── Memoized option row ──────────────────────────────────────

const SelectItem = memo(function SelectItem({
  option,
  index,
  isSelected,
  isActive,
  suppressHover,
  handlers,
  setActiveIndex,
  setControlledScrolling,
  optionCount,
}: {
  option: SelectOption;
  index: number;
  isSelected: boolean;
  isActive?: boolean;
  suppressHover?: boolean;
  handlers: RefObject<SelectItemHandlers>;
  setActiveIndex: (index: number) => void;
  setControlledScrolling: (scrolling: boolean) => void;
  optionCount: number;
}) {
  const ctx = handlers.current;
  const isDown = (k: string) => k === 'ArrowDown' || k === 'j';
  const isUp = (k: string) => k === 'ArrowUp' || k === 'k';
  return (
    <SelectRow
      ref={(node: any) => {
        ctx.listItemsRef.current[index] = node;
      }}
      {...ctx.getItemProps({
        onKeyDown(event: KeyboardEvent) {
          if (event.key === 'Enter' || event.key === ' ' || event.code === 'Space') {
            event.preventDefault();
            event.stopPropagation();
            ctx.handleSelect(index);
            if (event.key === 'Enter' || event.code === 'Enter' || !ctx.multiple) {
              ctx.setOpen(false);
            }
          } else if (isDown(event.key) || isUp(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            ctx.setKbNav(true);
            if (optionCount === 0) {
              return;
            }
            const nextIndex = isDown(event.key)
              ? index + 1 >= optionCount
                ? 0
                : index + 1
              : index - 1 < 0
                ? optionCount - 1
                : index - 1;
            setActiveIndex(nextIndex);
            setControlledScrolling(true);
          }
        },
        onClick(event: MouseEvent) {
          if (ctx.allowSelectRef.current) {
            ctx.handleSelect(index, event);
          }
        },
        onFocus() {
          ctx.setKbNav(wasKeyboardFocus());
        },
        onPointerDown() {
          ctx.setKbNav(false);
          // A press on a mounted row is a new gesture, not the release that
          // opened this covering panel. Arm immediately, regardless of time.
          ctx.allowMouseUpRef.current = true;
          ctx.allowSelectRef.current = true;
        },
        onMouseUp() {
          if (!ctx.allowMouseUpRef.current) {
            ctx.allowMouseUpRef.current = true;
            ctx.allowSelectRef.current = true;
            return;
          }
          if (!ctx.multiple) {
            if (ctx.allowSelectRef.current) {
              ctx.handleSelect(index);
            }
          }
          if (ctx.selectTimeoutRef.current) {
            clearTimeout(ctx.selectTimeoutRef.current);
          }
          ctx.selectTimeoutRef.current = setTimeout(() => {
            ctx.allowSelectRef.current = true;
          });
        },
      })}
      {...selectItemRingProps(Boolean(isActive), ctx.kbNav)}
      role="option"
      tabIndex={-1}
      selected={isSelected}
      active={isActive}
      aria-selected={isSelected}
      data-state={isSelected ? 'active' : 'inactive'}
      height={ctx.knobProps.control.height}
      // Menu rows re-rhythm with the space knob —
      // horizontal inset from the panelPadding token (SP-EDGE, sidebar-row
      // precedent) over menuRowFrame's static $3; in-row gap rides the gap
      // fragment.
      paddingHorizontal={ctx.knobProps.panelPadding.padding}
      {...ctx.knobProps.gap}
      onMouseEnter={() => {
        setActiveIndex(index);
      }}
      {...(suppressHover
        ? {
            hoverStyle: {
              backgroundColor: isActive
                ? formInputColors.background.focus
                : isSelected
                  ? formInputColors.background.base
                  : 'transparent',
            },
          }
        : {
            hoverStyle: {
              backgroundColor: isSelected ? formInputColors.background.base : formInputColors.background.focus,
            },
          })}
      {...transitionProps(ctx.knobProps.transition)}>
      <Text
        fontFamily={ctx.knobProps.body.fontFamily}
        fontWeight={ctx.knobProps.body.fontWeight}
        color={ctx.textColor}
        numberOfLines={1}
        flex={1}>
        {option.label}
      </Text>
      {isSelected && <CheckIcon size={14} color={ctx.markColor} />}
    </SelectRow>
  );
});

// ── Floating Select Core ─────────────────────────────────────

interface FloatingSelectCoreProps {
  options: SelectOption[];
  value: string | string[] | undefined;
  onValueChange?: (value: string | string[]) => void;
  onBlur?: (...args: any[]) => void;
  placeholder: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** When true, FieldLayout rendered `${id}-label` — wire aria-labelledby. */
  hasLabel?: boolean;
  knobProps: ReturnType<typeof useResolvedKnobs>['knobProps'];
  groupLabel?: string;
  multiple?: boolean;
  selectedOrder?: SelectedOrder;
  dismissible?: boolean;
  native?: boolean;
}
function FloatingSelectCore({
  options,
  value,
  onValueChange,
  onBlur,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  hasLabel,
  knobProps,
  groupLabel,
  multiple,
  selectedOrder,
  dismissible,
}: FloatingSelectCoreProps) {
  const hydrationTouch = useTouchSurface();
  const inTableCell = useIsInTableCell();
  const describedBy = useFieldDescribedBy();
  const glyphColor = useGlyphColor();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [controlledScrolling, setControlledScrolling] = useState(false);
  const { kbTrigger, kbNav, setKbNav, onTriggerFocus, onTriggerBlur, onTriggerPointerDown } = useSelectKeyboardRing();

  const labelCacheRef = useRef<Map<string, string>>(new Map());
  for (const o of options) {
    labelCacheRef.current.set(o.value, o.label);
  }
  const getLabel = useCallback((v: string) => labelCacheRef.current.get(v) ?? v, []);

  const selectedValues = useMemo<string[]>(() => {
    if (!multiple) {
      return [];
    }
    const vals = Array.isArray(value) ? value : value ? [value] : [];
    return [...vals].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
  }, [multiple, value, getLabel]);

  // Group options for rendering with headers
  const { items: groupedItems, flatOptions } = useMemo(() => groupOptions(options), [options]);

  const selectedIndex = useMemo(
    () => (multiple ? -1 : options.findIndex((option) => option.value === value)),
    [options, value, multiple],
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const isSelected = useCallback(
    (optionValue: string) => (multiple ? selectedValues.includes(optionValue) : optionValue === value),
    [multiple, selectedValues, value],
  );

  const handleDismiss = useCallback(
    (valueToRemove: string) => {
      if (!multiple) {
        return;
      }
      const current = Array.isArray(value) ? value : value ? [value] : [];
      const next = current.filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const textColor = knobProps.textAccentColor;
  const markColor = useSelectedMarkColor();

  const listItemsRef = useRef<Array<HTMLElement | null>>([]);
  const listContentRef = useRef<Array<string | null>>(options.map((option) => option.label));
  const allowSelectRef = useRef(false);
  const allowMouseUpRef = useRef(true);
  const selectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ isTyping: false });
  const overlayStyle = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    listContentRef.current = options.map((option) => option.label);
  }, [options]);

  const sortedOptionsRef = useRef<SelectOption[]>(options);
  const computeSortedOptions = useCallback(() => {
    if (!multiple) {
      sortedOptionsRef.current = options;
      return;
    }
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    sortedOptionsRef.current = orderOptionsBySelected(options, selected, selectedOrder);
  }, [options, value, multiple, selectedOrder]);

  const programmaticScrollRef = useRef(0);
  const pinnedTopRef = useRef(0);
  const pinnedHeightRef = useRef(0);
  const grownRef = useRef(false);
  const growUpOnlyRef = useRef(false);
  const growDownOnlyRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  const repositionRef = useRef<(() => void) | null>(null);

  const panel = useFloatingPanel({
    open,
    onOpenChange: setOpen,
    disabled,
    repositionRef,
    wheelGrowRef: selectedIndex >= 0 ? grownRef : undefined,
    onBeforeOpen: () => {
      computeSortedOptions();
      overlayStyle.current = null;
      pinnedTopRef.current = 0;
      pinnedHeightRef.current = 0;
      grownRef.current = false;
      growUpOnlyRef.current = false;
      growDownOnlyRef.current = false;
      lastScrollTopRef.current = 0;
      programmaticScrollRef.current = 0;
    },
  });

  const { scrollRef: dragScrollRef, dragProps } = useDragScroll({
    direction: 'vertical',
    onDragEnd: () => {
      // The following mouseup finishes scrolling; it must not pick a row.
      allowSelectRef.current = false;
      allowMouseUpRef.current = false;
      if (selectTimeoutRef.current) {
        clearTimeout(selectTimeoutRef.current);
      }
      selectTimeoutRef.current = setTimeout(() => {
        allowSelectRef.current = true;
        allowMouseUpRef.current = true;
      });
    },
  });

  // Sync drag scroll ref with floating ref
  useEffect(() => {
    if (panel.refs.floating.current) {
      dragScrollRef.current = panel.refs.floating.current;
    }
  }, [panel.refs.floating.current, dragScrollRef]);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else {
      setActiveIndex(null);
      setControlledScrolling(false);
    }
  }, [open, selectedIndex]);

  const repositionOverlay = useCallback(() => {
    const dropdownElement = panel.refs.floating.current;
    const selectedItemIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const selectedItem = listItemsRef.current[selectedItemIndex];
    const trigger = panel.triggerRef.current;
    if (!dropdownElement || !selectedItem || !trigger) {
      return;
    }

    const isInitial = panel.initializingRef.current;
    if (isInitial) {
      dropdownElement.style.transition = 'none';
    }

    if (pinnedTopRef.current === 0 && pinnedHeightRef.current === 0) {
      programmaticScrollRef.current++;
      dropdownElement.scrollTop = 0;
    }

    const triggerBounds = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const computedStyle = getComputedStyle(dropdownElement);
    const borderTopWidth = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottomWidth = parseFloat(computedStyle.borderBottomWidth) || 0;
    const totalBorderWidth = borderTopWidth + borderBottomWidth;
    const scrollContentHeight = dropdownElement.scrollHeight;
    const totalContentHeight = scrollContentHeight + totalBorderWidth;

    // Cover-alignment (OVERLAY_ANCHOR_GAP rule): the panel's border-box top
    // coincides with the trigger's border-box top EXACTLY, so frame, corner
    // arc and row text all line up (panel border draws over trigger border;
    // row content = panel.top + border + offsetTop lands on the trigger's
    // content edge). Subtracting the border here shifted the whole panel 1px
    // up and made the corner arcs visibly diverge from the trigger's.
    let idealTop: number;
    if (selectedIndex >= 0) {
      idealTop = triggerBounds.top - selectedItem.offsetTop;
    } else if (panel.placement.startsWith('top')) {
      idealTop = triggerBounds.bottom - totalContentHeight;
    } else {
      idealTop = triggerBounds.top - (selectedItem.offsetTop ?? 0);
    }
    const idealBottom = idealTop + totalContentHeight;
    const pinnedTop = Math.max(panelViewportPadding, idealTop);
    const pinnedBottom = Math.min(viewportHeight - panelViewportPadding, idealBottom);
    const pinnedHeight = Math.max(120, pinnedBottom - pinnedTop);

    if (pinnedTopRef.current === 0 && pinnedHeightRef.current === 0) {
      pinnedTopRef.current = pinnedTop;
      pinnedHeightRef.current = pinnedHeight;
    }

    let top = pinnedTopRef.current;
    let height = pinnedHeightRef.current;

    if (grownRef.current) {
      const canGrowDown = Math.max(0, viewportHeight - panelViewportPadding - (top + height));
      height += canGrowDown;
      const canGrowUp = Math.max(0, top - panelViewportPadding);
      top -= canGrowUp;
      height += canGrowUp;
    }

    if (growUpOnlyRef.current) {
      const canGrowUp = Math.max(0, top - panelViewportPadding);
      top -= canGrowUp;
      height += canGrowUp;
    }
    if (growDownOnlyRef.current) {
      const canGrowDown = Math.max(0, viewportHeight - panelViewportPadding - (top + height));
      height += canGrowDown;
    }

    height = Math.min(height, viewportHeight - top - panelViewportPadding);
    height = Math.min(height, totalContentHeight);
    height = Math.max(120, height);

    // When grown but content is shorter than viewport: anchor dropdown to bottom (gap above), dropup to top (gap below)
    const availableViewport = viewportHeight - 2 * panelViewportPadding;
    if ((grownRef.current || growUpOnlyRef.current || growDownOnlyRef.current) && height < availableViewport) {
      if (panel.placement.startsWith('top')) {
        top = panelViewportPadding;
      } else {
        top = viewportHeight - panelViewportPadding - height;
      }
    }

    const cachedOverlayStyle = overlayStyle.current;

    if (!cachedOverlayStyle || cachedOverlayStyle.top !== top || cachedOverlayStyle.maxHeight !== height) {
      dropdownElement.style.top = `${top}px`;
      dropdownElement.style.maxHeight = `${height}px`;
      dropdownElement.style.height = '';
      overlayStyle.current = { top, maxHeight: height };
      void dropdownElement.offsetHeight;
    }

    if (!grownRef.current && !growUpOnlyRef.current && !growDownOnlyRef.current) {
      const maxScrollTop = dropdownElement.scrollHeight - dropdownElement.clientHeight;
      if (selectedIndex >= 0) {
        // Row-over-trigger: row y (top + border + offsetTop − scroll) must
        // land on the trigger's content edge (trigger.top + border).
        const neededScroll = top + selectedItem.offsetTop - triggerBounds.top;
        const clampedScrollTop = Math.max(0, Math.min(neededScroll, maxScrollTop));
        if (Math.abs(dropdownElement.scrollTop - clampedScrollTop) > 0.5) {
          programmaticScrollRef.current++;
          dropdownElement.scrollTop = clampedScrollTop;
        }
        if (Math.abs(neededScroll - clampedScrollTop) > 0.5) {
          const scrollDeficit = neededScroll - clampedScrollTop;
          top -= scrollDeficit;
          top = Math.max(panelViewportPadding, top);
          const remainingContentHeight = totalContentHeight - clampedScrollTop;
          const adjustedMaxHeight = Math.min(remainingContentHeight, viewportHeight - top - panelViewportPadding);
          dropdownElement.style.top = `${top}px`;
          dropdownElement.style.maxHeight = `${adjustedMaxHeight}px`;
          overlayStyle.current = { top, maxHeight: adjustedMaxHeight };
        }
      }
    }

    panel.initializingRef.current = false;

    void dropdownElement.offsetHeight;
    if (isInitial) {
      dropdownElement.style.transition = panelTransition;
    }
    requestAnimationFrame(() => {
      if (dropdownElement) {
        panel.updateArrows(dropdownElement);
        requestAnimationFrame(() => {
          if (dropdownElement) {
            panel.updateArrows(dropdownElement);
          }
        });
      }
    });
  }, [selectedIndex, panel.refs, panel.updateArrows, panel.placement, options.length]);

  repositionRef.current = repositionOverlay;

  useLayoutEffect(() => {
    if (!open || !panel.mounted) {
      return;
    }
    repositionOverlay();
  }, [open, panel.mounted, selectedIndex, repositionOverlay, panel.y]);

  const onMatch = useCallback(
    (index: number) => {
      if (open) {
        setActiveIndex(index);
      } else {
        const matchedOption = options[index];
        if (matchedOption) {
          onValueChange?.(matchedOption.value);
        }
      }
    },
    [open, options, onValueChange],
  );

  const click = useClick(panel.context, { event: 'mousedown', keyboardHandlers: false });
  const dismiss = useDismiss(panel.context);
  const role = useRole(panel.context, { role: 'listbox' });
  const listNav = useListNavigation(panel.context, {
    listRef: listItemsRef,
    activeIndex: activeIndex ?? 0,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : undefined,
    onNavigate: (index) => {
      if (index !== null) {
        setActiveIndex(index);
      }
    },
    scrollItemIntoView: false,
    focusItemOnHover: false,
  });
  const typeahead = useTypeahead(panel.context, {
    listRef: listContentRef,
    onMatch,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : undefined,
    activeIndex,
    onTypingChange: (typing) => {
      stateRef.current.isTyping = typing;
    },
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNav,
    typeahead,
  ]);

  useLayoutEffect(() => {
    if (open) {
      allowMouseUpRef.current = false;
      selectTimeoutRef.current = setTimeout(() => {
        allowSelectRef.current = true;
        allowMouseUpRef.current = true;
      }, 300);
      return () => {
        if (selectTimeoutRef.current) {
          clearTimeout(selectTimeoutRef.current);
        }
      };
    }
    allowSelectRef.current = false;
    allowMouseUpRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex == null) {
      return;
    }
    const floatingElement = panel.refs.floating.current;
    const itemElement = listItemsRef.current[activeIndex];
    if (controlledScrolling && floatingElement && itemElement) {
      const containerRect = floatingElement.getBoundingClientRect();
      const itemRect = itemElement.getBoundingClientRect();
      if (itemRect.bottom > containerRect.bottom) {
        floatingElement.scrollTop += itemRect.bottom - containerRect.bottom;
      } else if (itemRect.top < containerRect.top) {
        floatingElement.scrollTop -= containerRect.top - itemRect.top;
      }
    }
    requestAnimationFrame(() => {
      listItemsRef.current[activeIndex]?.focus({ preventScroll: true });
      if (floatingElement) {
        panel.updateArrows(floatingElement);
      }
    });
  }, [open, controlledScrolling, activeIndex, panel.refs, panel.updateArrows]);

  const lastSelectedIndexRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleSelect = useCallback(
    (index: number, event?: MouseEvent) => {
      const displayOptions = sortedOptionsRef.current;
      const option = displayOptions[index];
      if (!option) {
        return;
      }
      if (multiple) {
        const latestValue = valueRef.current;
        const current = Array.isArray(latestValue) ? latestValue : latestValue ? [latestValue] : [];
        if (event?.shiftKey && lastSelectedIndexRef.current != null) {
          const from = Math.min(lastSelectedIndexRef.current, index);
          const to = Math.max(lastSelectedIndexRef.current, index);
          const rangeValues = displayOptions.slice(from, to + 1).map((o) => o.value);
          const merged = new Set([...current, ...rangeValues]);
          onValueChange?.([...merged]);
        } else {
          const next = current.includes(option.value)
            ? current.filter((v) => v !== option.value)
            : [...current, option.value];
          onValueChange?.(next);
          lastSelectedIndexRef.current = index;
        }
      } else {
        onValueChange?.(option.value);
        setOpen(false);
        onBlur?.();
      }
    },
    [onValueChange, onBlur, multiple],
  );

  const handleSelectByOption = useCallback(
    (option: SelectOption) => {
      const displayOptions = sortedOptionsRef.current;
      const index = displayOptions.findIndex((o) => o.value === option.value);
      if (index >= 0) {
        handleSelect(index);
      }
    },
    [handleSelect],
  );

  const handlersRef = useRef({} as SelectItemHandlers);
  handlersRef.current = {
    getItemProps,
    handleSelect,
    setOpen,
    knobProps,
    textColor,
    markColor,
    allowSelectRef,
    allowMouseUpRef,
    selectTimeoutRef,
    isTypingRef: stateRef,
    listItemsRef,
    multiple,
    kbNav,
    setKbNav,
  };

  const referenceProps = getReferenceProps({
    ref: panel.setReferenceRef,
    onKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Enter' ||
        event.code === 'Space' ||
        event.key === ' ' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'j' ||
        event.key === 'k'
      ) {
        event.preventDefault();
        setKbNav(true);
        setOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
    },
  });

  const boxEventProps: Record<string, any> = {};
  for (const [key, val] of Object.entries(referenceProps)) {
    if (key === 'ref' || typeof val === 'function') {
      boxEventProps[key] = val;
    }
    if (key.startsWith('aria-') || key === 'role' || key === 'tabIndex') {
      boxEventProps[key] = val;
    }
  }
  boxEventProps.tabIndex = disabled ? -1 : 0;
  boxEventProps.role = 'combobox';
  boxEventProps['aria-haspopup'] = 'listbox';
  boxEventProps['aria-expanded'] = open;
  boxEventProps['aria-autocomplete'] = 'none';
  if (id) {
    boxEventProps.id = id;
  }
  if (ariaLabel) {
    boxEventProps['aria-label'] = ariaLabel;
  }
  // A labelled trigger is already named: the sibling Label wires
  // `aria-labelledby` onto this id itself, so naming it again here doubles the
  // spoken name. Standalone triggers (no label) still need one (axe button-name).
  else if (!(hasLabel && id) && placeholder) {
    boxEventProps['aria-label'] = placeholder;
  }
  if (describedBy) {
    boxEventProps['aria-describedby'] = describedBy;
  }

  const handleScroll = useCallback(
    (event: UIEvent) => {
      const el = event.target as HTMLElement;
      panel.updateArrows(el);
      if (panel.initializingRef.current || programmaticScrollRef.current > 0) {
        if (programmaticScrollRef.current > 0) {
          programmaticScrollRef.current--;
        }
        lastScrollTopRef.current = el.scrollTop;
        return;
      }
      const arrowDir = panel.arrowScrollDirRef.current;
      if (arrowDir) {
        panel.arrowScrollDirRef.current = null;
        lastScrollTopRef.current = el.scrollTop;
        if (arrowDir === 'down') {
          growUpOnlyRef.current = true;
        } else {
          growDownOnlyRef.current = true;
        }
        repositionOverlay();
        return;
      }
      const delta = el.scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = el.scrollTop;
      if (delta !== 0) {
        grownRef.current = true;
        repositionOverlay();
      }
    },
    [panel.updateArrows, repositionOverlay],
  );

  return (
    <>
      <InputParts.Box
        {...boxEventProps}
        {...selectTriggerRingProps(kbTrigger, open)}
        onFocus={(e: any) => {
          boxEventProps.onFocus?.(e);
          onTriggerFocus();
        }}
        // XGroup types omit capture-phase handlers; forwarded to the DOM node at
        // runtime (same pattern as AdaptivePopup/FloatingPanel onClickCapture).
        {...({ onFocusCapture: onTriggerFocus } as Record<string, unknown>)}
        onBlur={(e: any) => {
          boxEventProps.onBlur?.(e);
          onTriggerBlur();
        }}
        onPointerDown={(e: any) => {
          boxEventProps.onPointerDown?.(e);
          onTriggerPointerDown();
        }}
        data-testid="select-trigger"
        cursor="pointer"
        disabled={disabled}
        // One surface owner (OVERLAY_ANCHOR_GAP rule): the open listbox
        // covers this trigger exactly, so the trigger's outer focus ring
        // must not paint — it would ghost around the panel's corners.
        suppressFocusRing={open}
        size={knobProps.sizeToken}
        {...pickerTriggerContract(knobProps.control.height)}
        paddingHorizontal={knobProps.panelPadding.padding}
        {...(inTableCell
          ? // Chromeless in cells.
            {}
          : {
              borderWidth: knobProps.borderRadius.borderWidth,
            })}>
        <SyncKeyboardFocusToBox active={kbTrigger && !open} />
        <View
          flex={1}
          // The Box owns the same horizontal inset as the option rows.
          minWidth={0}
          paddingVertical="$2"
          justifyContent={multiple && selectedValues.length > 0 ? 'center' : 'flex-start'}
          alignItems={multiple && selectedValues.length > 0 ? 'center' : 'flex-start'}>
          {multiple && selectedValues.length > 0 ? (
            <View
              flexDirection="row"
              flexWrap="nowrap"
              gap="$1.5"
              alignItems="center"
              maxHeight={getFieldHeight(knobProps.sizeToken as SizeTokens, 1, hydrationTouch) * 0.75}
              overflow="hidden"
              overflowX="auto">
              {selectedValues.map((v) => (
                <Chip
                  key={v}
                  size={({ $3: '$2', $4: '$3', $5: '$4' }[knobProps.sizeToken] ?? '$3') as ChipProps['size']}
                  color="gray"
                  onDismiss={
                    dismissible && !disabled
                      ? () => {
                          handleDismiss(v);
                        }
                      : undefined
                  }>
                  {getLabel(v)}
                </Chip>
              ))}
            </View>
          ) : (
            <Text
              {...knobProps.controlType}
              fontFamily={knobProps.body.fontFamily}
              fontWeight={knobProps.body.fontWeight}
              color={selectedOption ? textColor : formCommonColors.muted}
              numberOfLines={1}
              userSelect="none">
              {selectedOption?.label ?? placeholder}
            </Text>
          )}
        </View>
        <View flexShrink={0} alignSelf="center">
          <CaretDownIcon size={16} color={glyphColor} />
        </View>
      </InputParts.Box>

      {panel.mounted && (
        <PanelPortal anchor={panel.triggerRef.current}>
          <FloatingFocusManager context={panel.context} modal={false} initialFocus={-1}>
            <YStack
              outlineWidth={0}
              pointerEvents={panel.visible ? 'auto' : 'none'}
              {...getFloatingProps({
                ref: panel.refs.setFloating,
                style: {
                  position: panel.strategy,
                  top: overlayStyle.current?.top ?? panel.y ?? 0,
                  left: panel.x ?? 0,
                  scrollbarWidth: 'none' as any,
                  zIndex: zIndex.dropdown,
                  overflow: 'auto',
                  ...panel.floatingStyleRef.current,
                  ...(overlayStyle.current ? { maxHeight: overlayStyle.current.maxHeight } : {}),
                  boxShadow: '0px 8px 28px rgba(0,0,0,0.12), 0px 2px 6px rgba(0,0,0,0.04)',
                  opacity: panel.visible ? 1 : 0,
                  transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
                  transition: panelTransition,
                  transformOrigin: panel.placement.startsWith('top') ? 'bottom left' : 'top left',
                  ...dragProps.style,
                },
                onPointerDown: dragProps.onPointerDown,
                onKeyDown(e: KeyboardEvent) {
                  setControlledScrolling(true);
                  const count = flatOptions.length;
                  if (count === 0) {
                    return;
                  }
                  const isDown = e.key === 'ArrowDown' || e.key === 'j';
                  const isUp = e.key === 'ArrowUp' || e.key === 'k';
                  if (isDown) {
                    e.preventDefault();
                    e.stopPropagation();
                    setKbNav(true);
                    setActiveIndex((prev) => (prev == null ? 0 : prev + 1 >= count ? 0 : prev + 1));
                  } else if (isUp) {
                    e.preventDefault();
                    e.stopPropagation();
                    setKbNav(true);
                    setActiveIndex((prev) => (prev == null ? count - 1 : prev - 1 < 0 ? count - 1 : prev - 1));
                  } else if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeIndex != null) {
                      const option = flatOptions[activeIndex];
                      if (option) {
                        handleSelectByOption(option);
                      }
                      if (e.key === 'Enter' || e.code === 'Enter' || !multiple) {
                        setOpen(false);
                      }
                    }
                  }
                },
                onContextMenu(event: MouseEvent) {
                  event.preventDefault();
                },
                onScroll: handleScroll,
              })}
              backgroundColor="$background"
              borderRadius={panel.dropdownRadius}
              borderWidth={panel.hasBorder ? knobProps.borderRadius.borderWidth : 0}
              borderColor={panel.hasBorder ? formInputColors.border.focus : 'transparent'}
              data-testid="select-dropdown"
              paddingVertical={0}>
              <ScrollArrow
                direction="up"
                scrollRef={panel.refs.floating}
                visible={panel.arrowUp}
                arrowScrollDirRef={panel.arrowScrollDirRef}
              />
              {groupLabel && (
                <GroupHeader color={textColor} paddingHorizontal={knobProps.panelPadding.padding}>
                  {groupLabel}
                </GroupHeader>
              )}
              {multiple
                ? sortedOptionsRef.current.map((option, i) => (
                    <SelectItem
                      key={option.value}
                      option={option}
                      index={i}
                      isSelected={isSelected(option.value)}
                      isActive={i === activeIndex}
                      suppressHover={activeIndex != null}
                      handlers={handlersRef}
                      setActiveIndex={setActiveIndex}
                      setControlledScrolling={setControlledScrolling}
                      optionCount={sortedOptionsRef.current.length}
                    />
                  ))
                : groupedItems.map((item) =>
                    item.type === 'header' ? (
                      <GroupHeader
                        key={`header-${item.label}`}
                        color={textColor}
                        paddingHorizontal={knobProps.panelPadding.padding}>
                        {item.label}
                      </GroupHeader>
                    ) : (
                      <SelectItem
                        key={item.option.value}
                        option={item.option}
                        index={item.flatIndex}
                        isSelected={isSelected(item.option.value)}
                        isActive={item.flatIndex === activeIndex}
                        suppressHover={activeIndex != null}
                        handlers={handlersRef}
                        setActiveIndex={setActiveIndex}
                        setControlledScrolling={setControlledScrolling}
                        optionCount={flatOptions.length}
                      />
                    ),
                  )}
              <ScrollArrow
                direction="down"
                scrollRef={panel.refs.floating}
                visible={panel.arrowDown}
                arrowScrollDirRef={panel.arrowScrollDirRef}
              />
            </YStack>
          </FloatingFocusManager>
        </PanelPortal>
      )}
    </>
  );
}

// ── Native Select (Sheet-based for iOS/Android) ──────────────

function NativeSelectCore({
  options,
  value,
  onValueChange,
  onBlur,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  hasLabel,
  knobProps,
  groupLabel,
  multiple,
  selectedOrder,
  dismissible,
  native,
}: FloatingSelectCoreProps) {
  const hydrationTouch = useTouchSurface();
  const describedBy = useFieldDescribedBy();
  const fieldA11y = useFieldA11y();
  const inTableCell = useIsInTableCell();
  const glyphColor = useGlyphColor();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const listRef = useRef<HTMLElement | null>(null);
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const { kbTrigger, kbNav, setKbNav, onTriggerFocus, onTriggerBlur, onTriggerPointerDown } = useSelectKeyboardRing();

  const labelCacheRef = useRef<Map<string, string>>(new Map());
  for (const o of options) {
    labelCacheRef.current.set(o.value, o.label);
  }
  const getLabel = useCallback((v: string) => labelCacheRef.current.get(v) ?? v, []);

  const selectedValues = useMemo<string[]>(() => {
    if (!multiple) {
      return [];
    }
    const vals = Array.isArray(value) ? value : value ? [value] : [];
    return [...vals].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
  }, [multiple, value, getLabel]);

  const selectedOption = useMemo(
    () => (multiple ? undefined : options.find((o) => o.value === value)),
    [options, value, multiple],
  );

  const isSelectedFn = useCallback(
    (optionValue: string) => (multiple ? selectedValues.includes(optionValue) : optionValue === value),
    [multiple, selectedValues, value],
  );

  const handleDismiss = useCallback(
    (valueToRemove: string) => {
      if (!multiple) {
        return;
      }
      const current = Array.isArray(value) ? value : value ? [value] : [];
      const next = current.filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const displayOptions = useMemo(() => {
    if (!multiple) {
      return options;
    }
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return orderOptionsBySelected(options, selected, selectedOrder);
  }, [options, value, multiple, selectedOrder]);

  const textColor = knobProps.textAccentColor;
  const markColor = useSelectedMarkColor();
  const sheetTransition = knobProps.transition ?? 'medium';
  const hasScrollableContent = displayOptions.length > 6;

  const selectedIndex = displayOptions.findIndex((o) => o.value === value);
  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [open, selectedIndex]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      if (multiple) {
        const current = Array.isArray(value) ? value : value ? [value] : [];
        const next = current.includes(optionValue)
          ? current.filter((v) => v !== optionValue)
          : [...current, optionValue];
        onValueChange?.(next);
      } else {
        onValueChange?.(optionValue);
        setOpen(false);
        onBlur?.();
      }
    },
    [onValueChange, onBlur, multiple, value],
  );

  const handleListKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const count = displayOptions.length;
      if (count === 0) {
        return;
      }
      const isDown = e.key === 'ArrowDown' || e.key === 'j';
      const isUp = e.key === 'ArrowUp' || e.key === 'k';
      if (isDown) {
        e.preventDefault();
        setKbNav(true);
        setActiveIndex((prev) => {
          const next = prev == null ? 0 : prev + 1;
          return next >= count ? 0 : next;
        });
      } else if (isUp) {
        e.preventDefault();
        setKbNav(true);
        setActiveIndex((prev) => {
          const next = prev == null ? count - 1 : prev - 1;
          return next < 0 ? count - 1 : next;
        });
      } else if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (activeIndex != null) {
          const option = displayOptions[activeIndex];
          if (option) {
            handleSelect(option.value);
          }
        }
      }
    },
    [displayOptions, activeIndex, handleSelect, setKbNav],
  );

  const listContent = (
    // Native sheet path: do NOT set flex={1} — inside FloatingPanel's
    // RNScrollView (flexGrow:0) flex:1 resolves to ~0 height and collapses
    // every option row except a stray fragment of the selected one.
    // tabIndex/onKeyDown are web-only: on iOS tabIndex makes the container an
    // accessibility element, which merges every option into one unactionable
    // VoiceOver blob.
    <View
      ref={listRef as any}
      // React Native's Role type omits listbox; these are DOM-only attributes.
      {...(isWeb
        ? ({
            id: listboxId,
            role: 'listbox' as const,
            'aria-label': ariaLabel ?? fieldA11y?.label ?? placeholder,
            'aria-multiselectable': multiple || undefined,
            'aria-hidden': !open,
            'aria-activedescendant':
              activeIndex != null && displayOptions[activeIndex] ? optionId(activeIndex) : undefined,
            tabIndex: open ? 0 : -1,
            onKeyDown: handleListKeyDown,
            onFocus: () => {
              setKbNav(wasKeyboardFocus());
            },
          } as Record<string, unknown>)
        : undefined)}
      outlineStyle="none">
      {groupLabel && (
        <Text
          paddingHorizontal={knobProps.panelPadding.padding}
          paddingVertical="$2"
          fontFamily={knobProps.body.fontFamily}
          fontWeight="700"
          color={textColor}
          opacity={0.5}
          numberOfLines={1}>
          {groupLabel}
        </Text>
      )}
      {displayOptions.map((option, i) => {
        const selected = isSelectedFn(option.value);
        const active = i === activeIndex;
        const row = (
          <View
            key={isWeb ? option.value : undefined}
            {...(isWeb ? { id: optionId(i), role: 'option' as const, 'aria-selected': selected } : undefined)}
            flexDirection="row"
            alignItems="center"
            borderRadius={0}
            // Sheet rows ride the space knob like the floating
            // menu rows — panelPadding inset + gap fragment.
            {...knobProps.gap}
            paddingHorizontal={knobProps.panelPadding.padding}
            height={knobProps.control.height}
            onPress={
              isWeb
                ? () => {
                    handleSelect(option.value);
                  }
                : undefined
            }
            onMouseEnter={() => {
              setActiveIndex(i);
            }}
            onPointerDown={
              isWeb
                ? () => {
                    setKbNav(false);
                  }
                : undefined
            }
            {...(isWeb ? selectItemRingProps(active, kbNav) : undefined)}
            hoverStyle={
              activeIndex != null
                ? {
                    backgroundColor: active
                      ? formInputColors.background.focus
                      : selected
                        ? formInputColors.background.base
                        : 'transparent',
                  }
                : {
                    backgroundColor: selected ? formInputColors.background.base : formInputColors.background.focus,
                  }
            }
            backgroundColor={
              active ? formInputColors.background.focus : selected ? formInputColors.background.base : 'transparent'
            }
            pressStyle={{ backgroundColor: formInputColors.background.focus }}
            // Native: parent RNPressable owns the hit; disable child stealing.
            pointerEvents={isWeb ? undefined : 'none'}>
            <Text
              fontFamily={knobProps.body.fontFamily}
              fontWeight={knobProps.body.fontWeight}
              color={textColor}
              numberOfLines={1}
              flex={1}>
              {option.label}
            </Text>
            {selected && <CheckIcon size={14} color={markColor} />}
          </View>
        );
        if (isWeb) {
          return row;
        }
        // Fabric: Tamagui View onPress does not fire — core Pressable commits.
        return (
          <RNPressable
            key={option.value}
            onPress={() => {
              handleSelect(option.value);
            }}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}>
            {row}
          </RNPressable>
        );
      })}
    </View>
  );

  const triggerValueText = multiple
    ? selectedValues.length > 0
      ? selectedValues.map(getLabel).join(', ')
      : placeholder
    : (selectedOption?.label ?? placeholder);

  if (shouldUseIosNativeSelect({ native, multiple, isWeb, os: Platform.OS })) {
    const openNative = () => {
      if (disabled) {
        return;
      }
      const labels = options.map((o) => o.label);
      actionSheetIOS?.showActionSheetWithOptions(
        {
          options: [...labels, t('Cancel')],
          cancelButtonIndex: labels.length,
        },
        (index) => {
          if (index == null || index === labels.length) {
            onBlur?.();
            return;
          }
          handleSelect(options[index].value);
        },
      );
    };
    return (
      <RNPressable
        onPress={openNative}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, expanded: false }}
        accessibilityLabel={ariaLabel ?? fieldA11y?.label}
        accessibilityValue={{ text: triggerValueText }}
        style={{ width: '100%' }}>
        <InputParts.Box
          disabled={disabled}
          size={knobProps.sizeToken}
          {...pickerTriggerContract(knobProps.control.height)}
          paddingHorizontal={knobProps.panelPadding.padding}
          pointerEvents="none"
          {...(inTableCell
            ? {}
            : {
                borderWidth: knobProps.borderRadius.borderWidth,
              })}
          data-testid="select-trigger"
          id={id}>
          <View flex={1} minWidth={0} paddingVertical="$2" justifyContent="flex-start" alignItems="flex-start">
            <Text
              {...knobProps.controlType}
              fontFamily={knobProps.body.fontFamily}
              fontWeight={knobProps.body.fontWeight}
              color={selectedOption ? formCommonColors.text : formCommonColors.muted}
              numberOfLines={1}>
              {triggerValueText}
            </Text>
          </View>
          <View flexShrink={0} alignSelf="center">
            <CaretDownIcon size={16} />
          </View>
        </InputParts.Box>
      </RNPressable>
    );
  }

  return (
    <FloatingPanel
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) {
          onBlur?.();
        }
      }}
      sheet
      triggerA11y={{
        label: ariaLabel ?? fieldA11y?.label,
        value: triggerValueText,
        hint: fieldA11y?.description,
      }}
      trigger={
        <InputParts.Box
          disabled={disabled}
          size={knobProps.sizeToken}
          {...pickerTriggerContract(knobProps.control.height)}
          paddingHorizontal={knobProps.panelPadding.padding}
          {...(inTableCell
            ? {}
            : {
                borderWidth: knobProps.borderRadius.borderWidth,
              })}
          {...(isWeb ? selectTriggerRingProps(kbTrigger, open) : undefined)}
          data-testid="select-trigger"
          id={id}
          // Web: the box is the combobox control (ARIA + keyboard). Native:
          // FloatingPanel's trigger Pressable (triggerA11y) is the single
          // accessible node — role/aria props here surface the box as a
          // duplicate TalkBack stop on Android, so exclude it from the tree
          // (descendants stay reachable; "no", not "no-hide-descendants").
          {...(isWeb
            ? {
                role: 'combobox' as const,
                'aria-haspopup': 'listbox',
                'aria-expanded': open,
                'aria-controls': open ? listboxId : undefined,
                'aria-autocomplete': 'none',
                // Standalone (no label): fall back to placeholder so the
                // trigger still has a name (axe button-name). Labelled: the
                // sibling Label wires `aria-labelledby` onto this id itself —
                // naming it here too doubles the spoken name.
                'aria-label': ariaLabel ?? (!hasLabel ? placeholder : undefined),
                'aria-describedby': describedBy,
                tabIndex: disabled ? -1 : 0,
              }
            : { importantForAccessibility: 'no' as const })}
          // The web sheet shares this gesture with FloatingPanel's capture
          // opener. Both must open idempotently. Native owns its own press.
          onPress={
            isWeb && !disabled
              ? () => {
                  setOpen(true);
                }
              : undefined
          }
          onFocus={isWeb ? onTriggerFocus : undefined}
          onBlur={isWeb ? onTriggerBlur : undefined}
          onPointerDown={isWeb ? onTriggerPointerDown : undefined}
          onKeyDown={(e: KeyboardEvent) => {
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'j', 'k'].includes(e.key) || e.code === 'Space') {
              e.preventDefault();
              setKbNav(true);
              if (!open) {
                setOpen(true);
              }
            }
          }}>
          <SyncKeyboardFocusToBox active={kbTrigger && !open} />
          <View
            flex={1}
            // The Box owns the same horizontal inset as the option rows.
            minWidth={0}
            paddingVertical="$2"
            justifyContent={multiple && selectedValues.length > 0 ? 'center' : 'flex-start'}
            alignItems={multiple && selectedValues.length > 0 ? 'center' : 'flex-start'}>
            {multiple && selectedValues.length > 0 ? (
              <View
                flexDirection="row"
                flexWrap="nowrap"
                gap="$1.5"
                alignItems="center"
                maxHeight={getFieldHeight(knobProps.sizeToken as SizeTokens, 1, hydrationTouch) * 0.75}
                overflow="hidden"
                overflowX="auto">
                {selectedValues.map((v) => (
                  <Chip
                    key={v}
                    size={({ $3: '$2', $4: '$3', $5: '$4' }[knobProps.sizeToken] ?? '$3') as ChipProps['size']}
                    color="gray"
                    onDismiss={
                      dismissible && !disabled
                        ? () => {
                            handleDismiss(v);
                          }
                        : undefined
                    }>
                    {getLabel(v)}
                  </Chip>
                ))}
              </View>
            ) : (
              <Text
                {...knobProps.controlType}
                fontFamily={knobProps.body.fontFamily}
                fontWeight={knobProps.body.fontWeight}
                color={selectedOption ? textColor : formCommonColors.muted}
                numberOfLines={1}>
                {selectedOption?.label ?? placeholder}
              </Text>
            )}
          </View>
          <View flexShrink={0} alignSelf="center">
            <CaretDownIcon size={16} color={glyphColor} />
          </View>
        </InputParts.Box>
      }
      scrollable={hasScrollableContent}
      disabled={disabled}
      contentPadding="none"
      transition={typeof sheetTransition === 'string' ? sheetTransition : 'medium'}>
      {listContent}
    </FloatingPanel>
  );
}

// ── Select (public API) ──────────────────────────────────────

export function Select({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size: sizeProp,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  options,
  placeholder = t('Select an option'),
  groupLabel,
  multiple,
  selectedOrder,
  dismissible,
  skeleton,
  compact,
  native,
  'aria-label': ariaLabel,
  ...rest
}: SelectProps) {
  // Canonical `onChange` and the alias `onValueChange` both fire from the
  // single emit site in renderSelectContent (same reconciliation as Switch).
  const emitValueChange = (val: string | string[]) => {
    onChange?.(val);
    onValueChange?.(val);
  };
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
    size: sizeProp,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  // Uncontrolled (no `value` prop, no form) still must reflect selections in
  // the trigger — callbacks alone leave the display frozen on the placeholder.
  const [uncontrolledValue, setUncontrolledValue] = useState<string | string[] | undefined>(defaultValue);
  const isControlled = value !== undefined;
  const hasLabel = Boolean(label);

  // Short single-select lists prefer RadioGroup.
  warnSelectTooFewOptions({
    count: options?.length ?? 0,
    multiple,
    component: 'Select',
    id,
  });
  const viewportGtSm = useViewportGtSm();
  // Sheet on native and below `$sm` (viewport < 640, OVERLAY_BREAKPOINT).
  // Floating from `$sm` up.
  const effectiveGtSm = typeof window !== 'undefined' ? viewportGtSm : false;
  const shouldUseSheet = !isWeb || !effectiveGtSm;

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <InputParts size={sizeProp || knobProps.sizeToken}>
        {label && (
          <Skeleton
            variant="text"
            width="30%"
            // Label bone tracks the recipe type channel (skeleton mirrors anatomy).
            height={sizeRecipeForToken(String(sizeProp || knobProps.sizeToken)).fontSize}
          />
        )}
        <Skeleton variant="rounded" width="100%" height={knobProps.sizeToken} />
      </InputParts>
    );
  }

  const renderReadOnly = (selectValue: string | string[] | undefined) => {
    if (multiple && Array.isArray(selectValue)) {
      const labels = selectValue.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ');
      return (
        <Paragraph
          fontSize={knobProps.sizeToken}
          color={knobProps.textAccentColor}
          paddingVertical="$2"
          paddingHorizontal={knobProps.panelPadding.padding}
          fontFamily={knobProps.body.fontFamily}
          fontWeight={knobProps.body.fontWeight}
          aria-readonly="true">
          {labels || '-'}
        </Paragraph>
      );
    }
    const sv = typeof selectValue === 'string' ? selectValue : undefined;
    const selectedOption = options.find((option) => option.value === sv);
    const displayText = selectedOption?.label ?? (sv || '-');
    return (
      <Paragraph
        fontSize={knobProps.sizeToken}
        color={knobProps.textAccentColor}
        paddingVertical="$2"
        paddingHorizontal={knobProps.panelPadding.padding}
        fontFamily={knobProps.body.fontFamily}
        fontWeight={knobProps.body.fontWeight}
        borderRadius={knobProps.borderRadius.borderRadius}
        borderWidth={knobProps.borderRadius.borderWidth}
        {...(knobProps.outlined ? { backgroundColor: 'transparent' } : undefined)}
        aria-readonly="true">
        {displayText}
      </Paragraph>
    );
  };

  const renderSelectContent = (
    selectValue: string | string[] | undefined,
    handleValueChange?: (val: any) => void,
    handleBlur?: (...args: any[]) => void,
  ) => {
    if (readOnly) {
      return renderReadOnly(selectValue);
    }
    const SelectCore = shouldUseSheet ? NativeSelectCore : FloatingSelectCore;
    return (
      <SelectCore
        options={options}
        value={selectValue}
        onValueChange={(val) => {
          if (disabled) {
            return;
          }
          handleValueChange?.(val);
          emitValueChange(val);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
        hasLabel={hasLabel}
        knobProps={knobProps}
        groupLabel={groupLabel}
        multiple={multiple}
        selectedOrder={selectedOrder}
        dismissible={dismissible}
        native={native}
      />
    );
  };

  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        helperText={helperText}
        required={required}
        size={sizeProp}
        knobProps={knobProps as any}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}
        {...rest}>
        <InputParts size={sizeProp || knobProps.sizeToken}>
          {renderSelectContent(value ?? uncontrolledValue, isControlled ? undefined : setUncontrolledValue, onBlur)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={helperText}
            required={required}
            size={sizeProp}
            knobProps={knobProps as any}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}
            {...rest}>
            <InputParts size={sizeProp || knobProps.sizeToken}>
              {renderSelectContent(
                field.state.value,
                (val) => {
                  field.handleChange(val as any);
                },
                mergeFieldHandler(field, 'handleBlur', onBlur),
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
}

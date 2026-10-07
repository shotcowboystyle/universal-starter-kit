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
import type { useResolvedKnobs } from '@repo/theme';
import {
  useTouchSurface,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  menuRowFrame,
  sizeRecipeForToken,
  useGlyphColor,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, RefObject, UIEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
// `react-native` aliases to react-native-web on the web, and RNW 0.21 exports
// no ActionSheetIOS at all — a NAMED import of it is a hard SyntaxError that
// kills the whole preview bundle, so every Forms story renders blank. The
// sheet is reached only under shouldUseIosNativeSelect (iOS, never web), so
// read it off the namespace and let it be undefined where it does not exist.
// oxlint-disable-next-line sonarjs/no-wildcard-import -- the namespace import is deliberate: a named ActionSheetIOS import is a hard SyntaxError under react-native-web
import * as ReactNative from 'react-native';
import { Platform, Pressable as RNPressable } from 'react-native';
import type { LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { Paragraph, Text, View, YStack, isWeb, styled, useTheme } from 'tamagui';

import { Chip } from '../../Chip';
import type { ChipProps } from '../../Chip';
import { Field, FieldLayout, useFieldA11y, useFieldDescribedBy } from '../../FieldLayout';
import {
  FloatingPanel,
  useFloatingPanel,
  panelTransition,
  panelViewportPadding,
  useViewportGtSm,
} from '../../FloatingPanel';
import { PanelPortal } from '../../FloatingPanel/PanelPortal';
import { Input as InputParts, FocusContext } from '../../InputParts';
import { formCommonColors, formInputColors, formSelectedColors } from '../../shared/color-ramps';
import { warnSelectTooFewOptions } from '../../shared/dev-warn';
import { ScrollArrow } from '../../shared/floating-list';
import { pickerTriggerContract } from '../../shared/picker-trigger-contract';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { useDragScroll } from '../../shared/use-drag-scroll';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { zIndex } from '../../shared/z-index';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import { shouldUseIosNativeSelect } from '../native-select';
import { orderOptionsBySelected } from '../selected-order';
import type { SelectedOrder } from '../selected-order';

/** Undefined on web (RNW ships no ActionSheetIOS); real on iOS. */
// SAFETY: react-native-web's namespace has no ActionSheetIOS export, so the member is optional at runtime even though the native typings declare it.
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
  validators?: Parameters<typeof useResolvedValidators>[1];
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
  onBlur?: (...args: never[]) => void;
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
      '...size': (val: number | string) => ({ height: val }),
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

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

interface ThemeToken {
  val?: string;
}

/** The Tamagui theme looked up by token name; entries are resolved Variables carrying `val`. */
const useThemeTokens = (): Readonly<Record<string, ThemeToken | undefined>> => useTheme();

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- an open bag of DOM attributes that React Native's View props cannot type
type DomAttributeBag = Record<string, unknown>;

type SelectValue = string | string[] | undefined;

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

interface GroupedOptions {
  items: GroupedItem[];
  flatOptions: SelectOption[];
}

const groupOptions = (options: SelectOption[]): GroupedOptions => {
  const hasGroups = options.some((o) => hasText(o.group));
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

  // Separate ungrouped options and group the rest by group label
  const ungrouped: SelectOption[] = [];
  const groups = new Map<string, SelectOption[]>();
  for (const option of options) {
    const groupLabel = option.group;
    if (!hasText(groupLabel)) {
      ungrouped.push(option);
      continue;
    }
    const bucket = groups.get(groupLabel);
    if (bucket === undefined) {
      groups.set(groupLabel, [option]);
    } else {
      bucket.push(option);
    }
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
  for (const [groupLabel, members] of groups) {
    items.push({ type: 'header', label: groupLabel });
    for (const option of members) {
      items.push({ type: 'option', option, flatIndex: flatOptions.length });
      flatOptions.push(option);
    }
  }

  return { items, flatOptions };
};

/** Selected-value chips sit one step below the control height they live in. */
const chipSizeForControl = (sizeToken: string): ChipProps['size'] => {
  switch (sizeToken) {
    case '$3': {
      return '$2';
    }
    case '$4': {
      return '$3';
    }
    case '$5': {
      return '$4';
    }
    default: {
      return '$3';
    }
  }
};

const toValueArray = (value: SelectValue): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return hasText(value) ? [value] : [];
};

/** Wraps around: forward past the last row lands on 0, backward past 0 on the last row. */
const stepIndex = (index: number, forward: boolean, count: number): number => {
  if (forward) {
    return index + 1 >= count ? 0 : index + 1;
  }
  return index - 1 < 0 ? count - 1 : index - 1;
};

const isDownKey = (k: string) => k === 'ArrowDown' || k === 'j';
const isUpKey = (k: string) => k === 'ArrowUp' || k === 'k';
const isActivateKey = (event: KeyboardEvent) => event.key === 'Enter' || event.code === 'Space' || event.key === ' ';
const isTriggerOpenKey = (event: KeyboardEvent) => isActivateKey(event) || isDownKey(event.key) || isUpKey(event.key);

const hoverBackground = (selected: boolean) =>
  selected ? formInputColors.background.base : formInputColors.background.focus;

const rowBackground = (active: boolean, selected: boolean) => {
  if (active) {
    return formInputColors.background.focus;
  }
  return selected ? formInputColors.background.base : 'transparent';
};

/** Trigger rings on keyboard-origin only; list rows inherit that modality. */
const useSelectKeyboardRing = () => {
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
};

const selectTriggerRingProps = (kbTrigger: boolean, open: boolean) => {
  if (kbTrigger && !open) {
    return { ...keyboardFocusRingProps, 'data-kb-ring': 'true' as const };
  }
  // Focus modality owns the outline; the control recipe owns trigger shape.
  return { ...selectOutlineRest };
};

const selectItemRingProps = (isActive: boolean, kbNav: boolean) => {
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
  return { ...selectRowOutlineRest };
};

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
const useSelectedMarkColor = (): string => {
  const theme = useThemeTokens();
  const entry = theme[formSelectedColors.mark.slice(1)];
  return entry?.val ?? theme.color?.val ?? 'currentColor';
};

/** Paints the Input.Box ring via FocusContext — keyboard-origin only. */
const SyncKeyboardFocusToBox = ({ active }: { active: boolean }) => {
  const { setFocused } = FocusContext.useStyledContext();
  useEffect(() => {
    setFocused(active);
  }, [active, setFocused]);
  return null;
};

interface OverlayStyle {
  top: number;
  maxHeight: number;
}

type SelectKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

interface SelectItemHandlers {
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
  handleSelect: (index: number, event?: MouseEvent) => void;
  setOpen: (open: boolean) => void;
  knobProps: SelectKnobProps;
  textColor: SelectKnobProps['textAccentColor'];
  /** Selected mark, already resolved to a paint. */
  markColor: string;
  allowSelectRef: RefObject<boolean>;
  allowMouseUpRef: RefObject<boolean>;
  selectTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  isTypingRef: { current: { isTyping: boolean } };
  listItemsRef: RefObject<(HTMLElement | null)[]>;
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
  return (
    <SelectRow
      ref={(node: TamaguiElement | null) => {
        // oxlint-disable-next-line react/immutability -- ctx.listItemsRef is a ref object owned by the parent; registering the row element is the point of a callback ref
        ctx.listItemsRef.current[index] = node instanceof HTMLElement ? node : null;
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
          } else if (isDownKey(event.key) || isUpKey(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            ctx.setKbNav(true);
            if (optionCount === 0) {
              return;
            }
            setActiveIndex(stepIndex(index, isDownKey(event.key), optionCount));
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
          // oxlint-disable-next-line react/immutability -- ref objects owned by the parent; event handlers flip them to arm selection
          ctx.allowMouseUpRef.current = true;
          ctx.allowSelectRef.current = true;
        },
        onMouseUp() {
          if (!ctx.allowMouseUpRef.current) {
            // oxlint-disable-next-line react/immutability -- ref objects owned by the parent; event handlers flip them to arm selection
            ctx.allowMouseUpRef.current = true;
            ctx.allowSelectRef.current = true;
            return;
          }
          if (!ctx.multiple && ctx.allowSelectRef.current) {
            ctx.handleSelect(index);
          }
          if (ctx.selectTimeoutRef.current !== null) {
            clearTimeout(ctx.selectTimeoutRef.current);
          }
          ctx.selectTimeoutRef.current = setTimeout(() => {
            ctx.allowSelectRef.current = true;
          }, 0);
        },
      })}
      {...selectItemRingProps(Boolean(isActive), ctx.kbNav)}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled View row inside a floating listbox; a native <option> cannot be styled or placed outside <select>
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
              backgroundColor: rowBackground(isActive === true, isSelected),
            },
          }
        : {
            hoverStyle: {
              backgroundColor: hoverBackground(isSelected),
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
      {isSelected && (
        <CheckIcon
          size={14}
          color={ctx.markColor}
        />
      )}
    </SelectRow>
  );
});

// ── Floating Select Core ─────────────────────────────────────

interface FloatingSelectCoreProps {
  options: SelectOption[];
  value: SelectValue;
  onValueChange?: (value: string | string[]) => void;
  onBlur?: (...args: never[]) => void;
  placeholder: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** When true, FieldLayout rendered `${id}-label` — wire aria-labelledby. */
  hasLabel?: boolean;
  knobProps: SelectKnobProps;
  groupLabel?: string;
  multiple?: boolean;
  selectedOrder?: SelectedOrder;
  dismissible?: boolean;
  native?: boolean;
}
// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- one cohesive floating-listbox state machine (positioning, drag-scroll, typeahead, keyboard); splitting it would scatter refs that must stay in lock-step
const FloatingSelectCore = ({
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component-level note: positioning and keyboard handling share state
}: FloatingSelectCoreProps) => {
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
    return toValueArray(value).toSorted((a, b) => getLabel(a).localeCompare(getLabel(b)));
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
      const next = toValueArray(value).filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const textColor = knobProps.textAccentColor;
  const markColor = useSelectedMarkColor();
  const hasChips = multiple === true && selectedValues.length > 0;
  const chipAlign = hasChips ? 'center' : 'flex-start';

  const listItemsRef = useRef<(HTMLElement | null)[]>([]);
  // oxlint-disable-next-line react-doctor/rerender-lazy-ref-init -- cheap map over the options; the effect below keeps it current
  const listContentRef = useRef<(string | null)[]>(options.map((option) => option.label));
  const allowSelectRef = useRef(false);
  const allowMouseUpRef = useRef(true);
  const selectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ isTyping: false });
  const overlayStyle = useRef<OverlayStyle | null>(null);

  useEffect(() => {
    listContentRef.current = options.map((option) => option.label);
  }, [options]);

  const sortedOptionsRef = useRef<SelectOption[]>(options);
  const computeSortedOptions = useCallback(() => {
    if (!multiple) {
      sortedOptionsRef.current = options;
      return;
    }
    sortedOptionsRef.current = orderOptionsBySelected(options, toValueArray(value), selectedOrder);
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

  const { refs: panelRefs, triggerRef, initializingRef, arrowScrollDirRef, updateArrows, placement } = panel;

  const { scrollRef: dragScrollRef, dragProps } = useDragScroll({
    direction: 'vertical',
    onDragEnd: () => {
      // The following mouseup finishes scrolling; it must not pick a row.
      allowSelectRef.current = false;
      allowMouseUpRef.current = false;
      if (selectTimeoutRef.current !== null) {
        clearTimeout(selectTimeoutRef.current);
      }
      selectTimeoutRef.current = setTimeout(() => {
        allowSelectRef.current = true;
        allowMouseUpRef.current = true;
      }, 0);
    },
  });

  // Sync drag scroll ref with floating ref
  useEffect(() => {
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on the floating node itself: it is attached after mount, and a ref's .current is the only signal
    if (panelRefs.floating.current) {
      dragScrollRef.current = panelRefs.floating.current;
    }
  }, [panelRefs.floating.current, dragScrollRef]);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react-doctor/no-chain-state-updates -- the highlighted row must reset to the selection whenever the listbox opens; open is driven by floating-ui so there is no event to hang this on
      setActiveIndex(Math.max(selectedIndex, 0));
    } else {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- clearing keyboard highlight state when the listbox closes
      setActiveIndex(null);
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- same close-time reset as the highlight above
      setControlledScrolling(false);
    }
  }, [open, selectedIndex]);

  // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one imperative pass that pins/grows the overlay against the viewport; the branches share many locals
  const repositionOverlay = useCallback(() => {
    const dropdownElement = panelRefs.floating.current;
    const selectedItemIndex = Math.max(selectedIndex, 0);
    const selectedItem = listItemsRef.current[selectedItemIndex];
    const trigger = triggerRef.current;
    if (!dropdownElement || !selectedItem || !trigger) {
      return;
    }

    const isInitial = initializingRef.current;
    if (isInitial) {
      dropdownElement.style.transition = 'none';
    }

    if (pinnedTopRef.current === 0 && pinnedHeightRef.current === 0) {
      programmaticScrollRef.current += 1;
      dropdownElement.scrollTop = 0;
    }

    const triggerBounds = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const computedStyle = getComputedStyle(dropdownElement);
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseFloat of a computed border width yields NaN for '' and must fall back to 0
    const borderTopWidth = Number.parseFloat(computedStyle.borderTopWidth) || 0;
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- same NaN fallback as the top border
    const borderBottomWidth = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
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
    } else if (placement.startsWith('top')) {
      idealTop = triggerBounds.bottom - totalContentHeight;
    } else {
      idealTop = triggerBounds.top - selectedItem.offsetTop;
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
      top = placement.startsWith('top') ? panelViewportPadding : viewportHeight - panelViewportPadding - height;
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
          programmaticScrollRef.current += 1;
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

    initializingRef.current = false;

    void dropdownElement.offsetHeight;
    if (isInitial) {
      dropdownElement.style.transition = panelTransition;
    }
    requestAnimationFrame(() => {
      updateArrows(dropdownElement);
      requestAnimationFrame(() => {
        updateArrows(dropdownElement);
      });
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- options.length re-pins the overlay when the row count changes even though the body never reads it
  }, [selectedIndex, panelRefs, updateArrows, placement, options.length, triggerRef, initializingRef]);

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
        if (matchedOption != null) {
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
        if (selectTimeoutRef.current !== null) {
          clearTimeout(selectTimeoutRef.current);
        }
      };
    }
    allowSelectRef.current = false;
    allowMouseUpRef.current = true;
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on the open path; a bare return trips consistent-return
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex == null) {
      return;
    }
    const floatingElement = panelRefs.floating.current;
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
        updateArrows(floatingElement);
      }
    });
  }, [open, controlledScrolling, activeIndex, panelRefs, updateArrows]);

  const lastSelectedIndexRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleSelect = useCallback(
    (index: number, event?: MouseEvent) => {
      const displayOptions = sortedOptionsRef.current;
      const option = displayOptions[index];
      if (option == null) {
        return;
      }
      if (multiple) {
        const current = toValueArray(valueRef.current);
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
      if (index !== -1) {
        handleSelect(index);
      }
    },
    [handleSelect],
  );

  // SAFETY: the empty bag is replaced with the full handler set on the next line, before any row can read it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- placeholder until the assignment below
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
      if (isTriggerOpenKey(event)) {
        event.preventDefault();
        setKbNav(true);
        setOpen(true);
        setActiveIndex(Math.max(selectedIndex, 0));
      }
    },
  });

  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- floating-ui's prop getter returns an open bag of DOM handlers and aria attributes; only the subset forwarded to the trigger is copied
  const boxEventProps: Record<string, unknown> = {};
  // SAFETY: getReferenceProps returns plain DOM event handlers; the three below are the only ones the trigger wraps.
  const referenceHandlers = referenceProps as {
    onFocus?: (e: FocusEvent<HTMLDivElement>) => void;
    onBlur?: (e: FocusEvent<HTMLDivElement>) => void;
    onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  };
  for (const [key, val] of Object.entries(referenceProps)) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- prop-bag values are untyped; only function values are event handlers to forward
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
  if (hasText(id)) {
    boxEventProps.id = id;
  }
  if (hasText(ariaLabel)) {
    boxEventProps['aria-label'] = ariaLabel;
  }
  // A labelled trigger is already named: the sibling Label wires
  // `aria-labelledby` onto this id itself, so naming it again here doubles the
  // spoken name. Standalone triggers (no label) still need one (axe button-name).
  else if (!(hasLabel === true && hasText(id)) && placeholder) {
    boxEventProps['aria-label'] = placeholder;
  }
  if (hasText(describedBy)) {
    boxEventProps['aria-describedby'] = describedBy;
  }

  const handleScroll = useCallback(
    (event: UIEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement)) {
        return;
      }
      updateArrows(el);
      if (initializingRef.current || programmaticScrollRef.current > 0) {
        if (programmaticScrollRef.current > 0) {
          programmaticScrollRef.current -= 1;
        }
        lastScrollTopRef.current = el.scrollTop;
        return;
      }
      const arrowDir = arrowScrollDirRef.current;
      if (arrowDir !== null) {
        arrowScrollDirRef.current = null;
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
    [updateArrows, repositionOverlay, initializingRef, arrowScrollDirRef],
  );

  const captureFocusProps = { onFocusCapture: onTriggerFocus };
  const pinnedOverlay = overlayStyle.current;
  const floatingStyle = panel.floatingStyleRef.current;
  const multipleOptions = sortedOptionsRef.current;
  const multipleRows = multipleOptions.map((option, i) => (
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
      optionCount={multipleOptions.length}
    />
  ));
  const pinnedMaxHeightStyle = pinnedOverlay === null ? undefined : { maxHeight: pinnedOverlay.maxHeight };

  return (
    <>
      <InputParts.Box
        {...boxEventProps}
        {...selectTriggerRingProps(kbTrigger, open)}
        onFocus={(e: FocusEvent<HTMLDivElement>) => {
          referenceHandlers.onFocus?.(e);
          onTriggerFocus();
        }}
        // XGroup types omit capture-phase handlers; forwarded to the DOM node at
        // runtime (same pattern as AdaptivePopup/FloatingPanel onClickCapture).
        {...captureFocusProps}
        onBlur={(e: FocusEvent<HTMLDivElement>) => {
          referenceHandlers.onBlur?.(e);
          onTriggerBlur();
        }}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          referenceHandlers.onPointerDown?.(e);
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
        // Chromeless in cells.
        {...(inTableCell ? {} : { borderWidth: knobProps.borderRadius.borderWidth })}>
        <SyncKeyboardFocusToBox active={kbTrigger && !open} />
        <View
          flex={1}
          // The Box owns the same horizontal inset as the option rows.
          minWidth={0}
          paddingVertical="$2"
          justifyContent={chipAlign}
          alignItems={chipAlign}>
          {hasChips ? (
            <View
              flexDirection="row"
              flexWrap="nowrap"
              gap="$1.5"
              alignItems="center"
              maxHeight={getFieldHeight(knobProps.sizeToken, 1, hydrationTouch) * 0.75}
              overflow="hidden"
              overflowX="auto">
              {selectedValues.map((v) => (
                <Chip
                  key={v}
                  size={chipSizeForControl(knobProps.sizeToken)}
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
        <View
          flexShrink={0}
          alignSelf="center">
          <CaretDownIcon
            size={16}
            color={glyphColor}
          />
        </View>
      </InputParts.Box>

      {panel.mounted && (
        <PanelPortal anchor={panel.triggerRef.current}>
          <FloatingFocusManager
            context={panel.context}
            modal={false}
            initialFocus={-1}>
            <YStack
              outlineWidth={0}
              pointerEvents={panel.visible ? 'auto' : 'none'}
              {...getFloatingProps({
                ref: panel.refs.setFloating,
                style: {
                  position: panel.strategy,
                  top: pinnedOverlay?.top ?? panel.y ?? 0,
                  left: panel.x ?? 0,
                  scrollbarWidth: 'none',
                  zIndex: zIndex.dropdown,
                  overflow: 'auto',
                  ...floatingStyle,
                  ...pinnedMaxHeightStyle,
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
                  if (isDownKey(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setKbNav(true);
                    setActiveIndex((prev) => (prev == null ? 0 : stepIndex(prev, true, count)));
                  } else if (isUpKey(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setKbNav(true);
                    setActiveIndex((prev) => (prev == null ? count - 1 : stepIndex(prev, false, count)));
                  } else if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeIndex != null) {
                      const option = flatOptions[activeIndex];
                      if (option != null) {
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
              {hasText(groupLabel) && (
                <GroupHeader
                  color={textColor}
                  paddingHorizontal={knobProps.panelPadding.padding}>
                  {groupLabel}
                </GroupHeader>
              )}
              {multiple
                ? multipleRows
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
};

// ── Native Select (Sheet-based for iOS/Android) ──────────────

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- sheet + iOS action-sheet + web listbox variants share one set of selection state; splitting would duplicate the keyboard/selection wiring
const NativeSelectCore = ({
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component-level note: three presentations of one selection state machine
}: FloatingSelectCoreProps) => {
  const hydrationTouch = useTouchSurface();
  const describedBy = useFieldDescribedBy();
  const fieldA11y = useFieldA11y();
  const inTableCell = useIsInTableCell();
  const glyphColor = useGlyphColor();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const listRef = useRef<TamaguiElement | null>(null);
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const { kbTrigger, kbNav, setKbNav, onTriggerFocus, onTriggerBlur, onTriggerPointerDown } = useSelectKeyboardRing();

  const labelCacheRef = useRef<Map<string, string>>(new Map());
  for (const o of options) {
    // oxlint-disable-next-line react/refs -- the label cache must absorb the current options in this same render so chips for values that left `options` keep their label
    labelCacheRef.current.set(o.value, o.label);
  }
  const getLabel = useCallback((v: string) => labelCacheRef.current.get(v) ?? v, []);

  const selectedValues = useMemo<string[]>(() => {
    if (!multiple) {
      return [];
    }
    // oxlint-disable-next-line react/refs -- getLabel reads the render-time label cache above
    return toValueArray(value).toSorted((a, b) => getLabel(a).localeCompare(getLabel(b)));
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
      const next = toValueArray(value).filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const displayOptions = useMemo(() => {
    if (!multiple) {
      return options;
    }
    return orderOptionsBySelected(options, toValueArray(value), selectedOrder);
  }, [options, value, multiple, selectedOrder]);

  const textColor = knobProps.textAccentColor;
  const markColor = useSelectedMarkColor();
  const hasChips = multiple === true && selectedValues.length > 0;
  const chipAlign = hasChips ? 'center' : 'flex-start';
  const sheetTransition = knobProps.transition ?? 'medium';
  const hasScrollableContent = displayOptions.length > 6;

  const selectedIndex = displayOptions.findIndex((o) => o.value === value);
  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react-doctor/no-chain-state-updates, react/set-state-in-effect -- the highlighted row must reset to the selection each time the sheet opens; open is driven by FloatingPanel so there is no event to hang this on
      setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [open, selectedIndex]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      if (multiple) {
        const current = toValueArray(value);
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
      if (isDownKey(e.key)) {
        e.preventDefault();
        setKbNav(true);
        setActiveIndex((prev) => {
          const next = prev == null ? 0 : prev + 1;
          return next >= count ? 0 : next;
        });
      } else if (isUpKey(e.key)) {
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
          if (option != null) {
            handleSelect(option.value);
          }
        }
      }
    },
    [displayOptions, activeIndex, handleSelect, setKbNav],
  );

  const listboxDomProps = {
    id: listboxId,
    role: 'listbox' as const,
    'aria-label': ariaLabel ?? fieldA11y?.label ?? placeholder,
    'aria-multiselectable': multiple === true ? true : undefined,
    'aria-hidden': !open,
    'aria-activedescendant':
      activeIndex != null && displayOptions[activeIndex] != null ? optionId(activeIndex) : undefined,
    tabIndex: open ? 0 : -1,
    onKeyDown: handleListKeyDown,
    onFocus: () => {
      setKbNav(wasKeyboardFocus());
    },
  };
  // SAFETY: these are DOM-only listbox attributes; the bag is only spread when isWeb, where View renders a div that accepts them.
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- RN's Role type omits listbox, so the typed props would not compile on View
  const webListboxProps = isWeb ? (listboxDomProps as DomAttributeBag) : undefined;

  const listContent = (
    // Native sheet path: do NOT set flex={1} — inside FloatingPanel's
    // RNScrollView (flexGrow:0) flex:1 resolves to ~0 height and collapses
    // every option row except a stray fragment of the selected one.
    // tabIndex/onKeyDown are web-only: on iOS tabIndex makes the container an
    // accessibility element, which merges every option into one unactionable
    // VoiceOver blob.
    <View
      ref={listRef}
      // React Native's Role type omits listbox; these are DOM-only attributes.
      {...webListboxProps}
      outlineStyle="none">
      {hasText(groupLabel) && (
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
            hoverStyle={{
              backgroundColor: activeIndex == null ? hoverBackground(selected) : rowBackground(active, selected),
            }}
            backgroundColor={rowBackground(active, selected)}
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
            {selected && (
              <CheckIcon
                size={14}
                color={markColor}
              />
            )}
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

  // oxlint-disable-next-line react/refs -- getLabel reads the render-time label cache
  const multipleText = selectedValues.length > 0 ? selectedValues.map(getLabel).join(', ') : placeholder;
  const triggerValueText = multiple ? multipleText : (selectedOption?.label ?? placeholder);

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
          {...(inTableCell ? {} : { borderWidth: knobProps.borderRadius.borderWidth })}
          data-testid="select-trigger"
          id={id}>
          <View
            flex={1}
            minWidth={0}
            paddingVertical="$2"
            justifyContent="flex-start"
            alignItems="flex-start">
            <Text
              {...knobProps.controlType}
              fontFamily={knobProps.body.fontFamily}
              fontWeight={knobProps.body.fontWeight}
              color={selectedOption ? formCommonColors.text : formCommonColors.muted}
              numberOfLines={1}>
              {triggerValueText}
            </Text>
          </View>
          <View
            flexShrink={0}
            alignSelf="center">
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
          {...(inTableCell ? {} : { borderWidth: knobProps.borderRadius.borderWidth })}
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
                'aria-label': ariaLabel ?? (hasLabel ? undefined : placeholder),
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
            justifyContent={chipAlign}
            alignItems={chipAlign}>
            {hasChips ? (
              <View
                flexDirection="row"
                flexWrap="nowrap"
                gap="$1.5"
                alignItems="center"
                maxHeight={getFieldHeight(knobProps.sizeToken, 1, hydrationTouch) * 0.75}
                overflow="hidden"
                overflowX="auto">
                {/* oxlint-disable-next-line react/refs -- getLabel reads the render-time label cache so chips keep labels for values that left `options` */}
                {selectedValues.map((v) => (
                  <Chip
                    key={v}
                    size={chipSizeForControl(knobProps.sizeToken)}
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
          <View
            flexShrink={0}
            alignSelf="center">
            <CaretDownIcon
              size={16}
              color={glyphColor}
            />
          </View>
        </InputParts.Box>
      }
      scrollable={hasScrollableContent}
      disabled={disabled}
      contentPadding="none"
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TransitionProp also admits animation-config objects, which FloatingPanel's string-only transition cannot take
      transition={typeof sheetTransition === 'string' ? sheetTransition : 'medium'}>
      {listContent}
    </FloatingPanel>
  );
};

// ── Select (public API) ──────────────────────────────────────

export const Select = ({
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
  // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is still honoured; both callbacks fire from emitValueChange
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
}: SelectProps) => {
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
  const [uncontrolledValue, setUncontrolledValue] = useState<SelectValue>(defaultValue);
  const isControlled = value !== undefined;
  const hasLabel = Boolean(label);
  const resolvedSize = sizeProp ?? knobProps.sizeToken;

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
  const effectiveGtSm = typeof window === 'undefined' ? false : viewportGtSm;
  const shouldUseSheet = !isWeb || !effectiveGtSm;

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <InputParts size={resolvedSize}>
        {hasLabel && (
          <Skeleton
            variant="text"
            width="30%"
            // Label bone tracks the recipe type channel (skeleton mirrors anatomy).
            height={sizeRecipeForToken(String(resolvedSize)).fontSize}
          />
        )}
        <Skeleton
          variant="rounded"
          width="100%"
          height={knobProps.sizeToken}
        />
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
    const sv = Array.isArray(selectValue) ? undefined : selectValue;
    const selectedOption = options.find((option) => option.value === sv);
    const displayText = selectedOption?.label ?? (hasText(sv) ? sv : '-');
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
    handleValueChange?: (val: string | string[]) => void,
    handleBlur?: (...args: never[]) => void,
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

  if (resolvedForm == null || !hasText(name)) {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        helperText={helperText}
        required={required}
        size={sizeProp}
        knobProps={knobProps}
        // FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}
        {...rest}>
        <InputParts size={resolvedSize}>
          {renderSelectContent(value ?? uncontrolledValue, isControlled ? undefined : setUncontrolledValue, onBlur)}
        </InputParts>
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
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
            knobProps={knobProps}
            // See standalone branch — FieldLayout carries dimWhole.
            disabled={disabled}
            {...rest}>
            <InputParts size={resolvedSize}>
              {renderSelectContent(
                field.state.value,
                (val) => {
                  field.handleChange(val);
                },
                mergeFieldHandler(field, 'handleBlur', onBlur),
              )}
            </InputParts>
          </FieldLayout>
        );
      }}
    </Field>
  );
};

import {
  useClick,
  useDismiss,
  useInteractions,
  useListNavigation,
  useRole,
  FloatingFocusManager,
} from '@floating-ui/react';
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { useResolvedKnobs } from '@repo/theme';
import {
  useTouchSurface,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  keyboardFocusRingProps,
  menuRowFrame,
  useGlyphColor,
  transitionProps,
} from '@repo/theme';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { Pressable as RNPressable } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { ColorTokens, LabelProps, SizeTokens, TamaguiElement } from 'tamagui';
import { Input as TInput, Text, View, XStack, YStack, isWeb, styled, useTheme } from 'tamagui';

import { Button } from '../../Button';
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
import { Input as InputParts } from '../../InputParts';
import { formCommonColors, formInputColors, formSelectedColors } from '../../shared/color-ramps';
import { SyncFocusToOpen, ScrollArrow } from '../../shared/floating-list';
import { useTranslation } from '../../shared/i18n';
import { pickerTriggerContract } from '../../shared/picker-trigger-contract';
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
import { Spinner } from '../../Spinner';
import type { AnyFormApi } from '../../types';
import { orderOptionsBySelected } from '../selected-order';
import type { SelectedOrder } from '../selected-order';

/** Buffer so we scroll before the item hits the scroll-arrow gradient (28px) */
const scrollArrowBuffer = 28;

type SelectionValue = string | string[] | undefined;

const comboboxRowSelector = '[data-combobox-index]';

const hasText = (text: string | undefined): text is string => text !== undefined && text !== '';

/** Normalizes the string | string[] value into a list (empty string means no selection). */
const toValueArray = (value: SelectionValue): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return hasText(value) ? [value] : [];
};

/** Row fill: the active row wins over the selected row; otherwise `fallback`. */
const rowBackground = (isActive: boolean, isSelected: boolean, fallback?: string) => {
  if (isActive) {
    return formInputColors.background.focus;
  }
  return isSelected ? formInputColors.background.base : fallback;
};

/** Next active index for j/k and arrow navigation, wrapping at both ends. */
const stepActiveIndex = (previous: number | null, isDown: boolean, total: number): number => {
  if (isDown) {
    const next = previous == null ? 0 : previous + 1;
    return next >= total ? 0 : next;
  }
  const next = previous == null ? total - 1 : previous - 1;
  return next < 0 ? total - 1 : next;
};

const chipSizeFor = (sizeToken: string): ChipProps['size'] => {
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

const withCreatedOption = (previous: ComboboxOption[], created: ComboboxOption): ComboboxOption[] =>
  previous.some((option) => option.value === created.value) ? previous : [...previous, created];

/** Tamagui types `ref` as Ref<TamaguiElement>; these web-only panels hold DOM refs. */
const asTamaguiRef = <Element extends HTMLElement>(
  ref: React.RefObject<Element | null> | undefined,
): React.Ref<TamaguiElement> | undefined =>
  // SAFETY: the web panel renders DOM elements, so the ref only ever receives HTMLElements.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TamaguiElement also admits native views, which never reach these web-only refs
  ref as React.Ref<TamaguiElement> | undefined;

const toColorToken = (color: string): ColorTokens =>
  // SAFETY: Tamagui resolves raw color strings and `$token` names alike at runtime; the union only models the token form.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ColorTokens is narrower than string by typing only
  color as ColorTokens;

const cssPixels = (length: string): number =>
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed lengths carry a `px` suffix, which Number() rejects as NaN
  Number.parseFloat(length) || 0;

const floatingPanelStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: zIndex.dropdown,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0px 8px 28px rgba(0,0,0,0.12), 0px 2px 6px rgba(0,0,0,0.04)',
  transition: panelTransition,
  boxSizing: 'border-box',
} satisfies React.CSSProperties;

const triggerOpenKeys = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp', 'j', 'k']);

const isTriggerBagEntry = ([key, val]: [string, unknown]): boolean => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- floating-ui's prop bag mixes handlers and attributes; handlers are only identifiable by runtime kind
  if (key === 'ref' || typeof val === 'function') {
    return true;
  }
  return key.startsWith('aria-') || key === 'role' || key === 'tabIndex';
};

const isNode = (target: EventTarget | null): target is Node => target !== null && 'nodeType' in target;

/** True for a non-checkbox <input> (duck-typed so it also works for nodes from other documents). */
const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (target === null || !('tagName' in target) || target.tagName !== 'INPUT') {
    return false;
  }
  return !('type' in target && target.type === 'checkbox');
};

// ── Styled row ───────────────────────────────────────────────

// Menu-row frame: fill (selected/active) and ring are orthogonal.
// Virtual list navigation never DOM-focuses the row, so the keyboard ring is
// painted from `keyboardFocusRingProps` on the active option (activedescendant),
// same as TreeView. focusVisibleStyle remains for the rare real-focus path.
const ComboboxRow = styled(View, {
  name: 'ComboboxRow',
  ...menuRowFrame,
  gap: '$2',
  cursor: 'default',
  hoverStyle: { backgroundColor: formInputColors.background.focus },
  focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
  variants: {
    selected: {
      true: { backgroundColor: formInputColors.background.base },
      false: { backgroundColor: 'transparent' },
    },
    active: {
      true: { backgroundColor: formInputColors.background.focus },
      false: {},
    },
    size: {
      '...size': (val: SizeTokens) => ({ height: val }),
    },
  } as const,
});

const comboboxOptionId = (baseId: string | undefined, index: number) => `${baseId ?? 'combobox'}-opt-${index}`;

const comboboxListboxId = (baseId: string | undefined) => `${baseId ?? 'combobox'}-listbox`;

const listItemRingProps = (keyboardRing: boolean) =>
  keyboardRing ? keyboardFocusRingProps : { outlineWidth: 0 as const };

interface ThemeToken {
  val?: string;
}

/** The Tamagui theme looked up by token name; entries are resolved Variables carrying `val`. */
const useThemeTokens = (): Readonly<Record<string, ThemeToken | undefined>> => useTheme();

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
 * `mutedColor` for the search glyph. Keyed off the ramp constant so the token
 * stays declared once in colorRamps, and degrading to `$color` ink rather than
 * black when a narrow sub-theme has no accent step.
 */
const useSelectedMarkColor = (): string => {
  const theme = useThemeTokens();
  const entry = theme[formSelectedColors.mark.slice(1)];
  return entry?.val ?? theme.color?.val ?? 'currentColor';
};

const GroupHeader = styled(Text, {
  name: 'ComboboxGroupHeader',
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

// ── Types ─────────────────────────────────────────────────────

// A handler may return nothing or a cleanup function, so `void` must stay in the return union.
// oxlint-disable-next-line typescript/no-invalid-void-type -- return-position void keeps callbacks that return nothing assignable
type SearchHandler = (query: string) => void | (() => void);

// oxlint-disable-next-line typescript/no-invalid-void-type -- return-position void keeps callbacks that return nothing assignable
type CreateHandler = (value: string) => ComboboxOption | void;

type TriggerRender = (selected: ComboboxOption | ComboboxOption[] | undefined, open: boolean) => ReactNode;

export interface ComboboxOption {
  value: string;
  label: string;
  keywords?: string;
  /** Optional group label for grouping options */
  group?: string;
  /** Optional secondary line (muted) rendered under the label, e.g. a doc description */
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | string[];
  defaultValue?: string | string[];
  /**
   * Canonical change handler, consistent with the rest of the field family.
   * Prefer this over `onValueChange`.
   */
  onChange?: (value: string | string[]) => void;
  /** @deprecated Use `onChange` instead. */
  onValueChange?: (value: string | string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onSearch?: SearchHandler;
  loading?: boolean;
  /**
   * Honest async-search failure surface: when set, the dropdown list area
   * shows this message (error-colored) instead of options / empty state.
   */
  searchError?: string;
  /**
   * Label to display for the current single-select value when it is not in
   * `options` (async combobox: show the selected doc's title before any
   * options have loaded). Purely additive — without it the placeholder shows.
   */
  valueLabel?: string;
  /** Single-select: show a clear (×) affordance in the trigger when a value is set. */
  clearable?: boolean;
  /** Called when the user scrolls near the bottom of the list. Use for cursor-based pagination. */
  onLoadMore?: () => void;
  /** Whether more pages are available. Shows a spinner at the bottom when loading more. */
  hasMore?: boolean;
  trigger?: TriggerRender;
  /** Custom triggers stretch by default; content hugs a composite-field adornment. */
  triggerSizing?: 'stretch' | 'content';
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
  onBlur?: (...args: never[]) => void;
  popoverWidth?: number;
  tabIndex?: number;
  multiple?: boolean;
  /**
   * Multi-select list order. `selected-first` (default) pins chosen rows to the
   * top, alphabetically among themselves. `stable` keeps `options` order.
   */
  selectedOrder?: SelectedOrder;
  /** Show dismiss button on badges to remove selected items (only applies when multiple=true) */
  dismissible?: boolean;
  /** When true, renders a skeleton placeholder instead of the combobox */
  skeleton?: boolean;
  /** When true, uses compact sizing */
  compact?: boolean;
  /** Allow creating new options when search doesn't match existing options */
  creatable?: boolean;
  /**
   * Called with the typed text. Return an option to select it; the Combobox
   * keeps it listed until `options` carries it. Return nothing to handle
   * creation yourself (a single-value panel still closes).
   */
  onCreate?: CreateHandler;
  /** Label template for the create option. Use {value} as placeholder. Default: 'Create "{value}"' */
  createLabel?: string;
  /** Hide the search input (useful for @mentions where search is provided externally) */
  hideSearch?: boolean;
  /** External search value (used when hideSearch is true) */
  searchValue?: string;
  /** Controlled open state (for external control like @mentions) */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  'aria-label'?: string;
}

// ── Helper to group options ───────────────────────────────────

interface GroupedComboboxOption {
  type: 'option';
  option: ComboboxOption;
  flatIndex: number;
}

interface ComboboxGroupHeaderItem {
  type: 'header';
  label: string;
}

type GroupedComboboxItem = GroupedComboboxOption | ComboboxGroupHeaderItem;

const groupComboboxOptions = (options: ComboboxOption[]) => {
  const hasGroups = options.some((o) => hasText(o.group));
  if (!hasGroups) {
    const items: GroupedComboboxItem[] = options.map((option, index) => ({
      type: 'option',
      option,
      flatIndex: index,
    }));
    return { items, flatOptions: options };
  }

  // Separate ungrouped options and bucket the rest by group label
  const ungrouped: ComboboxOption[] = [];
  const groups = new Map<string, ComboboxOption[]>();
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
  const items: GroupedComboboxItem[] = [];
  const flatOptions: ComboboxOption[] = [];

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
};

// ── Memoized option row ──────────────────────────────────────

type KnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

interface ComboboxItemHandlers {
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
  onSelect: (option: ComboboxOption, index: number, event?: React.MouseEvent) => void;
  onItemHover?: (e: React.MouseEvent<HTMLElement>) => void;
  onItemKeyDown?: (e: React.KeyboardEvent, index: number) => void;
  knobProps: KnobProps;
  textColor: string;
  /** Selected mark, already resolved to a paint. */
  markColor: string;
  listItemsRef: React.RefObject<(HTMLElement | null)[]>;
}

const ComboboxItem = memo(function ComboboxItem({
  option,
  index,
  isSelected,
  isActive,
  keyboardRing,
  optionId,
  suppressHover,
  handlers,
}: {
  option: ComboboxOption;
  index: number;
  isSelected: boolean;
  isActive: boolean;
  /** Inset ring on the activedescendant row during keyboard nav only. */
  keyboardRing?: boolean;
  optionId?: string;
  /** When true, disable hoverStyle so only isActive drives the highlight (avoids ghost highlight from stale hover) */
  suppressHover?: boolean;
  handlers: React.RefObject<ComboboxItemHandlers | null>;
}) {
  const ctx = handlers.current;
  if (ctx === null) {
    throw new Error('ComboboxItem rendered before its handlers were set');
  }
  const itemProps = ctx.getItemProps({
    onClick(event: React.MouseEvent) {
      ctx.onSelect(option, index, event);
    },
  });
  // SAFETY: floating-ui's item props are an untyped bag; its `onKeyDown` is a React keyboard handler when present.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the bag is Record<string, unknown> by floating-ui's contract
  const defaultOnKeyDown = itemProps.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined;
  return (
    <ComboboxRow
      ref={(node: TamaguiElement | null) => {
        // SAFETY: option rows render as DOM nodes on the web panel, the only consumer of listItemsRef.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion, react/immutability -- TamaguiElement also admits native views, which never reach this web-only list; the ref callback registers the row in floating-ui's listRef by design
        ctx.listItemsRef.current[index] = node as HTMLElement | null;
      }}
      {...itemProps}
      id={optionId}
      data-combobox-index={index}
      data-active={isActive}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (['j', 'k'].includes(e.key)) {
          ctx.onItemKeyDown?.(e, index);
        } else {
          defaultOnKeyDown?.(e);
        }
      }}
      {...(ctx.onItemHover ? { onMouseEnter: ctx.onItemHover } : {})}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
      role="option"
      tabIndex={-1}
      selected={isSelected}
      active={isActive}
      aria-selected={isSelected}
      data-state={isSelected ? 'active' : 'inactive'}
      height={ctx.knobProps.control.height}
      {...listItemRingProps(Boolean(keyboardRing))}
      {...(suppressHover
        ? {
            hoverStyle: {
              backgroundColor: rowBackground(isActive, isSelected, 'transparent'),
            },
            backgroundColor: rowBackground(isActive, isSelected),
          }
        : {
            hoverStyle: {
              backgroundColor: isSelected ? formInputColors.background.base : formInputColors.background.focus,
            },
          })}
      // Two-line rows need to grow past the size-variant height.
      {...(hasText(option.description) ? { height: 'auto', paddingVertical: '$2' } : undefined)}
      {...transitionProps(ctx.knobProps.transition)}>
      {hasText(option.description) ? (
        <YStack
          flex={1}
          minWidth={0}>
          <Text
            fontFamily={ctx.knobProps.body.fontFamily}
            fontWeight={ctx.knobProps.body.fontWeight}
            color={ctx.textColor}
            numberOfLines={1}>
            {option.label}
          </Text>
          <Text
            fontFamily={ctx.knobProps.body.fontFamily}
            fontSize="$2"
            color={formCommonColors.muted}
            numberOfLines={1}>
            {option.description}
          </Text>
        </YStack>
      ) : (
        <Text
          fontFamily={ctx.knobProps.body.fontFamily}
          fontWeight={ctx.knobProps.body.fontWeight}
          color={ctx.textColor}
          numberOfLines={1}
          flex={1}>
          {option.label}
        </Text>
      )}
      {isSelected && (
        <CheckIcon
          size={14}
          color={ctx.markColor}
        />
      )}
    </ComboboxRow>
  );
});

// ── Floating Combobox Core ────────────────────────────────────

interface FloatingComboboxCoreProps {
  options: ComboboxOption[];
  value: SelectionValue;
  onValueChange?: (value: string | string[]) => void;
  onBlur?: (...args: never[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onSearch?: SearchHandler;
  loading?: boolean;
  searchError?: string;
  valueLabel?: string;
  clearable?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  hasLabel?: boolean;
  tabIndexOverride?: number;
  popoverWidth?: number;
  trigger?: TriggerRender;
  triggerSizing?: 'stretch' | 'content';
  knobProps: KnobProps;
  multiple?: boolean;
  selectedOrder?: SelectedOrder;
  dismissible?: boolean;
  creatable?: boolean;
  onCreate?: CreateHandler;
  createLabel?: string;
  hideSearch?: boolean;
  searchValue?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- one component owns the shared overlay refs and keyboard state; splitting would thread ~20 refs through props
const FloatingComboboxCore = ({
  options,
  value,
  onValueChange,
  onBlur,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onSearch,
  loading,
  searchError,
  valueLabel,
  clearable,
  onLoadMore,
  hasMore,
  disabled,
  id,
  'aria-label': ariaLabel,
  hasLabel,
  tabIndexOverride,
  popoverWidth,
  trigger: triggerRender,
  triggerSizing = 'stretch',
  knobProps,
  multiple,
  selectedOrder,
  dismissible,
  creatable,
  onCreate,
  createLabel = 'Create "{value}"',
  hideSearch,
  searchValue,
  open: openProp,
  onOpenChange,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component note above
}: FloatingComboboxCoreProps) => {
  const hydrationTouch = useTouchSurface();
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const { t } = useTranslation();
  const inTableCell = useIsInTableCell();
  const describedBy = useFieldDescribedBy();
  const glyphColor = useGlyphColor();
  const [internalOpen, setInternalOpen] = useState(false);
  // Use external open state when provided (controlled), otherwise use internal state
  const open = openProp ?? internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setInternalOpen(nextOpen);
      } else {
        onOpenChange?.(nextOpen);
      }
    },
    [openProp, onOpenChange],
  );
  const [internalFilter, setInternalFilter] = useState('');
  // Use external searchValue when provided, otherwise use internal filter
  const filter = searchValue ?? internalFilter;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const textColor = knobProps.textAccentColor;
  const markColor = useSelectedMarkColor();

  const labelCacheRef = useRef<Map<string, string>>(new Map());
  for (const o of options) {
    // oxlint-disable-next-line react/refs -- label cache keeps labels of options that leave the list (async search) so selected values keep their text
    labelCacheRef.current.set(o.value, o.label);
  }
  const getLabel = useCallback((v: string) => labelCacheRef.current.get(v) ?? v, []);

  const selectedValues = useMemo<string[]>(() => {
    if (!multiple) {
      return [];
    }
    const vals = toValueArray(value);
    // oxlint-disable-next-line react/refs -- label cache keeps labels of options that leave the list (async search) so selected values keep their text
    return vals.toSorted((a, b) => getLabel(a).localeCompare(getLabel(b)));
  }, [multiple, value, getLabel]);

  const selectedOption = useMemo(
    () => (multiple ? undefined : options.find((option) => option.value === value)),
    [options, value, multiple],
  );

  const selectedOptions = useMemo(() => {
    if (!multiple) {
      return [];
    }
    const selectedSet = new Set(selectedValues);
    return options.filter((o) => selectedSet.has(o.value));
  }, [options, selectedValues, multiple]);

  const isSelected = useCallback(
    (optionValue: string) => (multiple ? selectedValues.includes(optionValue) : optionValue === value),
    [multiple, selectedValues, value],
  );

  const handleDismiss = useCallback(
    (valueToRemove: string) => {
      if (!multiple) {
        return;
      }
      const current = toValueArray(value);
      const next = current.filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const filtered = useMemo(() => {
    if (onSearch || !filter) {
      return options;
    }
    const query = filter.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query) ||
        option.keywords?.toLowerCase().includes(query) === true,
    );
  }, [options, filter, onSearch]);

  // Show create option if creatable is enabled and filter doesn't exactly match an existing option
  const showCreateOption = useMemo(() => {
    if (!creatable || !filter.trim()) {
      return false;
    }
    const trimmed = filter.trim().toLowerCase();
    return !options.some((o) => o.label.toLowerCase() === trimmed || o.value.toLowerCase() === trimmed);
  }, [creatable, filter, options]);

  const handleCreate = useCallback(() => {
    const typed = filter.trim();
    if (!onCreate || !typed) {
      return;
    }
    const newOption = onCreate(typed);
    if (newOption && multiple) {
      const current = toValueArray(value);
      if (!current.includes(newOption.value)) {
        onValueChange?.([...current, newOption.value]);
      }
    } else if (newOption) {
      onValueChange?.(newOption.value);
    }
    // A void onCreate hands creation to the host (a dialog, a server round
    // trip); a single-value panel left open would sit over that UI.
    if (!multiple) {
      setOpen(false);
    }
    setInternalFilter('');
  }, [onCreate, filter, multiple, value, onValueChange, setOpen]);

  // Multi-select: selected at front ONLY when first opening. Never reorder when searching or selecting.
  const initialOrderRef = useRef<ComboboxOption[] | null>(null);
  const hasSearchedRef = useRef(false);
  const sortedFiltered = useMemo(() => {
    if (filter.trim()) {
      // oxlint-disable-next-line react/refs -- first-open order is pinned in a ref so selecting never reorders the open list
      hasSearchedRef.current = true;
      return filtered;
    }
    if (!multiple) {
      return filtered;
    }
    if (!open) {
      return filtered;
    }
    // First open with empty filter (no search yet): compute order with selected at front, store once
    // User searched then cleared: keep natural order.
    // oxlint-disable-next-line react/refs -- first-open order is pinned in a ref so selecting never reorders the open list
    if (hasSearchedRef.current) {
      return filtered;
    }
    if (initialOrderRef.current === null) {
      const current = toValueArray(value);
      initialOrderRef.current = orderOptionsBySelected(filtered, current, selectedOrder);
    }
    // oxlint-disable-next-line react/refs -- first-open order is pinned in a ref so selecting never reorders the open list
    return initialOrderRef.current;
  }, [filtered, filter, open, multiple, value, selectedOrder]);

  // Group for render. `activeIndex` indexes `navigableOptions` — selectable
  // rows in that same order — not `sortedFiltered`. `groupComboboxOptions`
  // clusters by group and assigns `flatIndex` on the reordered list; keeping
  // activeIndex on sortedFiltered while rendering headers silently breaks
  // ArrowUp/ArrowDown.
  const { items: groupedItems, flatOptions: navigableOptions } = useMemo(
    () => groupComboboxOptions(sortedFiltered),
    [sortedFiltered],
  );

  const searchCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!onSearch || !open) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const timerId = setTimeout(() => {
      searchCleanupRef.current?.();
      const cleanup = onSearch(filter);
      searchCleanupRef.current = cleanup ?? null;
    }, 200);
    return () => {
      clearTimeout(timerId);
      searchCleanupRef.current?.();
      searchCleanupRef.current = null;
    };
  }, [filter, onSearch, open]);

  const listItemsRef = useRef<(HTMLElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useRef<HTMLElement | null>(null);
  const keyboardNavRef = useRef(false);
  const [listKeyboardRing, setListKeyboardRing] = useState(false);
  const setKeyboardNav = useCallback((next: boolean) => {
    keyboardNavRef.current = next;
    setListKeyboardRing((prev) => (prev === next ? prev : next));
  }, []);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const currentMousePosRef = useRef({ x: 0, y: 0 });
  const lastKeyboardNavTimeRef = useRef(0);

  const overlayStyle = useRef<{ top: number; maxHeight: number } | null>(null);
  const searchTopRef = useRef<number | null>(null);
  const grownRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const growConstraintRef = useRef<'no-up' | 'no-down' | null>(null);
  const filterRef = useRef(filter);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  filterRef.current = filter;

  const repositionRef = useRef<(() => void) | null>(null);

  const panel = useFloatingPanel({
    open,
    onOpenChange: (nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        onBlur?.();
      }
    },
    disabled,
    repositionRef,
    wheelGrowRef: grownRef,
    scrollBoundaryRef: listScrollRef,
    middleware: [],
    useAutoUpdate: false,
    onBeforeOpen: () => {
      overlayStyle.current = null;
      searchTopRef.current = null;
      grownRef.current = false;
      lastScrollTopRef.current = 0;
    },
  });

  const { refs: panelRefs, triggerRef: panelTriggerRef, arrowScrollDirRef, updateArrows } = panel;

  const { scrollRef: dragScrollRef, dragProps } = useDragScroll({
    direction: 'vertical',
  });
  const handleListPointerDown = dragProps.onPointerDown;

  // Sync drag scroll ref with list scroll ref
  useEffect(() => {
    if (listScrollRef.current) {
      dragScrollRef.current = listScrollRef.current;
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `open` re-syncs once the list mounts; react-hooks requires dragScrollRef because it comes from a custom hook
  }, [open, dragScrollRef]);

  const justResetFromFilterRef = useRef(false);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const hasSelectedSinceOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      justResetFromFilterRef.current = true;
      // oxlint-disable-next-line react/set-state-in-effect, react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setActiveIndex(0);
      hasSelectedSinceOpenRef.current = false;
    } else {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setInternalFilter('');
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setActiveIndex(null);
      lastMousePosRef.current = null;
      initialOrderRef.current = null;
      hasSearchedRef.current = false;
      // oxlint-disable-next-line react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setKeyboardNav(false);
    }
  }, [open, setKeyboardNav]);

  // Document-level Enter/Escape to close (catches keys when focus is on list, not just search)
  const activeIndexRef = useRef(activeIndex);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  activeIndexRef.current = activeIndex;
  const navigableOptionsRef = useRef(navigableOptions);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  navigableOptionsRef.current = navigableOptions;
  const showCreateOptionRef = useRef(showCreateOption);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  showCreateOptionRef.current = showCreateOption;
  const multipleRef = useRef(multiple);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  multipleRef.current = multiple;

  const repositionOverlay = useCallback(
    // oxlint-disable-next-line eslint/complexity, sonarjs/cognitive-complexity -- one imperative positioning pass; splitting would scatter the shared geometry locals
    (source: 'filter' | 'wheel' | 'init') => {
      const dropdownElement = panelRefs.floating.current;
      const trigger = panelTriggerRef.current;
      const listScrollElement = listScrollRef.current;
      if (!dropdownElement || !trigger) {
        return;
      }

      const suppressTransition = source === 'init' || source === 'filter';
      if (suppressTransition) {
        // oxlint-disable-next-line react/immutability -- imperative positioning writes the floating element's DOM style from layout callbacks, never during render
        dropdownElement.style.transition = 'none';
      }

      const triggerBounds = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // OVERLAY_ANCHOR_GAP rule (theme/layoutTokens): the listbox matches the
      // trigger width exactly and stays flush at triggerBounds.left below.
      const minWidth = popoverWidth ?? triggerBounds.width;
      const maxWidth = viewportWidth - 20;

      dropdownElement.style.minWidth = `${minWidth}px`;
      dropdownElement.style.maxWidth = `${maxWidth}px`;
      if (popoverWidth !== undefined && popoverWidth !== 0) {
        dropdownElement.style.width = `${popoverWidth}px`;
      }

      const searchBarElement = dropdownElement.querySelector<HTMLElement>(':scope > *');
      const searchBarHeight = searchBarElement?.offsetHeight ?? 0;
      const listContentHeight = listScrollElement?.scrollHeight ?? 0;
      const computedStyle = getComputedStyle(dropdownElement);
      const borderHeight = cssPixels(computedStyle.borderTopWidth) + cssPixels(computedStyle.borderBottomWidth);
      const contentHeight = searchBarHeight + listContentHeight + borderHeight;

      const isDropup = panel.placement.startsWith('top');
      // Cover ruling. A single-value Combobox covers its trigger:
      // the trigger shows one label, and the panel replaces it in place
      // (macOS-style aligned listbox). A MULTI-select trigger carries live
      // state — the selected chips and the query you are typing — so a panel
      // drawn over it hides the very thing you are editing. Measured before
      // this landed: panel top == trigger top and panel width == trigger
      // width with `multiple` set, chips and filter text both covered.
      // A trigger carrying live state keeps its own surface; the panel
      // attaches flush on its BOTTOM edge instead.
      const coversTrigger = !multipleRef.current;
      let top: number;

      if (searchTopRef.current === null) {
        // The edge the panel hangs from: the trigger's far edge when it
        // covers, its near edge when it only attaches.
        const dropupAnchor = coversTrigger ? triggerBounds.bottom : triggerBounds.top;
        if (isDropup) {
          const availableAbove = dropupAnchor - panelViewportPadding;
          const initialHeight = Math.min(contentHeight, availableAbove);
          top = dropupAnchor - initialHeight;
        } else {
          top = coversTrigger ? triggerBounds.top : triggerBounds.bottom;
        }
        searchTopRef.current = top;

        const maxAvailable = isDropup ? dropupAnchor - top : viewportHeight - top - panelViewportPadding;
        let height = Math.min(contentHeight, maxAvailable);
        height = Math.max(120, height);

        dropdownElement.style.top = `${top}px`;
        dropdownElement.style.left = `${triggerBounds.left}px`;
        dropdownElement.style.height = `${height}px`;
        dropdownElement.style.maxHeight = '';
        overlayStyle.current = { top, maxHeight: height };

        if (listScrollRef.current) {
          listScrollRef.current.scrollTop = 0;
        }

        void dropdownElement.offsetHeight;
        if (suppressTransition) {
          dropdownElement.style.transition = panelTransition;
        }
        requestAnimationFrame(() => {
          if (listScrollRef.current) {
            updateArrows(listScrollRef.current);
            requestAnimationFrame(() => {
              if (listScrollRef.current) {
                updateArrows(listScrollRef.current);
              }
            });
          }
        });
        return;
      } else if (source === 'wheel') {
        top = searchTopRef.current;
        const currentHeight = overlayStyle.current?.maxHeight ?? 0;
        let grownHeight = currentHeight;

        const constraint = growConstraintRef.current;
        if (constraint !== 'no-down') {
          const canGrowDown = Math.max(0, viewportHeight - panelViewportPadding - (top + currentHeight));
          grownHeight += canGrowDown;
        }
        if (constraint !== 'no-up') {
          const canGrowUp = Math.max(0, top - panelViewportPadding);
          top -= canGrowUp;
          grownHeight += canGrowUp;
        }

        grownHeight = Math.min(grownHeight, contentHeight);
        searchTopRef.current = top;
        const maxAvailable = viewportHeight - top - panelViewportPadding;
        let height = Math.min(grownHeight, maxAvailable);
        height = Math.max(120, height);

        // Only reposition if the panel has actually grown past the trigger's original position
        // Don't jump to the bottom of the viewport - keep the panel near the trigger
        const triggerTop = triggerBounds.top;
        const triggerBottom = triggerBounds.bottom;

        // For dropdowns: don't move the panel below the trigger
        // For dropups: don't move the panel above where it started
        if (isDropup) {
          // Keep the panel ending at or below the trigger; a non-covering
          // drop-up stops at the trigger's TOP edge.
          const floor = coversTrigger ? triggerBottom : triggerTop;
          const panelBottom = top + height;
          if (panelBottom < floor) {
            top = floor - height;
          }
        } else {
          // Keep the panel starting at or above the trigger. A non-covering
          // (multi-select) panel may not grow upward at all — that is what
          // would swallow the chips.
          top = coversTrigger ? Math.min(top, triggerTop) : triggerBottom;
        }
        searchTopRef.current = top;

        const cached = overlayStyle.current;
        if (!cached || cached.top !== top || cached.maxHeight !== height) {
          dropdownElement.style.top = `${top}px`;
          dropdownElement.style.left = `${triggerBounds.left}px`;
          dropdownElement.style.height = `${height}px`;
          dropdownElement.style.maxHeight = '';
          overlayStyle.current = { top, maxHeight: height };
        }

        void dropdownElement.offsetHeight;
        requestAnimationFrame(() => {
          if (listScrollRef.current) {
            updateArrows(listScrollRef.current);
          }
        });
        return;
      }
      top = searchTopRef.current;

      const hasTyped = filterRef.current.length > 0;
      const maxAvailable =
        !hasTyped && isDropup ? triggerBounds.bottom - top : viewportHeight - top - panelViewportPadding;
      let height = Math.min(contentHeight, maxAvailable);
      height = Math.max(120, height);

      const cached = overlayStyle.current;
      if (!cached || cached.top !== top || cached.maxHeight !== height) {
        dropdownElement.style.top = `${top}px`;
        dropdownElement.style.left = `${triggerBounds.left}px`;
        dropdownElement.style.height = `${height}px`;
        dropdownElement.style.maxHeight = '';
        overlayStyle.current = { top, maxHeight: height };
      }

      void dropdownElement.offsetHeight;
      if (suppressTransition) {
        dropdownElement.style.transition = panelTransition;
      }
      requestAnimationFrame(() => {
        if (listScrollRef.current) {
          updateArrows(listScrollRef.current);
          requestAnimationFrame(() => {
            if (listScrollRef.current) {
              updateArrows(listScrollRef.current);
            }
          });
        }
      });
    },
    // oxlint-disable-next-line react/preserve-manual-memoization -- repositionOverlay writes refs and DOM imperatively; the manual memo keeps its identity stable for the layout effect
    [panel.placement, updateArrows, popoverWidth, panelRefs, panelTriggerRef],
  );

  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  repositionRef.current = () => {
    repositionOverlay('wheel');
  };

  useLayoutEffect(() => {
    if (!open || !panel.mounted) {
      return;
    }
    grownRef.current = false;
    repositionOverlay('filter');
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- filtered.length and loading are re-measure triggers for the panel height
  }, [open, panel.mounted, filtered.length, loading, repositionOverlay]);

  useEffect(() => {
    if (open && panel.mounted && !hideSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open, panel.mounted, hideSearch]);

  const loadMoreTriggeredRef = useRef(false);

  const repositionOverlayRef = useRef(repositionOverlay);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  repositionOverlayRef.current = repositionOverlay;

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const element = event.currentTarget;
      updateArrows(element);

      const arrowDir = arrowScrollDirRef.current;
      if (arrowDir) {
        arrowScrollDirRef.current = null;
        lastScrollTopRef.current = element.scrollTop;
        growConstraintRef.current = arrowDir === 'down' ? 'no-down' : 'no-up';
        repositionOverlayRef.current('wheel');
        growConstraintRef.current = null;
        return;
      }

      lastScrollTopRef.current = element.scrollTop;

      if (onLoadMore && hasMore && !loading) {
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        if (nearBottom && !loadMoreTriggeredRef.current) {
          loadMoreTriggeredRef.current = true;
          onLoadMore();
        } else if (!nearBottom) {
          loadMoreTriggeredRef.current = false;
        }
      }
    },
    [updateArrows, arrowScrollDirRef, onLoadMore, hasMore, loading],
  );

  useEffect(() => {
    if (!open) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const scrollElement = listScrollRef.current;
      if (scrollElement) {
        updateArrows(scrollElement);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- filtered is a trigger: a new list needs its scroll arrows re-measured
  }, [open, filtered, updateArrows]);

  // Track mouse position when open. Use elementFromPoint as primary source for hover - mouseenter
  // lags behind React's async updates. Only sync when cursor is over OUR panel.
  // Sync synchronously (no rAF) so our update wins over any other handler.
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onMove = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      currentMousePosRef.current = { x, y };
      if (keyboardNavRef.current) {
        return;
      }
      const floating = panelRefs.floating.current;
      if (!floating) {
        return;
      }
      const el = document.elementFromPoint(x, y);
      if (!el || !floating.contains(el)) {
        return;
      }
      const row = el.closest?.<HTMLElement>(comboboxRowSelector);
      const actualIndex = row?.dataset.comboboxIndex;
      const list = navigableOptionsRef.current;
      const len = list.length + (showCreateOptionRef.current ? 1 : 0);
      const activeIdx = activeIndexRef.current;
      const n = actualIndex == null ? null : Number(actualIndex);
      const next = n != null && n >= 0 && n < len ? n : activeIdx;
      if (next !== activeIdx) {
        setActiveIndex(next);
      }
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('mousemove', onMove);
    };
  }, [open, panelRefs]);

  // When filter/list changes: truncate refs, sync activeIndex with cursor.
  // Typing is keyboard-origin — do not drop the list ring on filter.
  // After filter, the list remounts (Fragment key=filter) so mouseenter often doesn't fire for
  // elements that appear under a stationary cursor. Use elementFromPoint to set the correct index.
  useLayoutEffect(() => {
    const len = navigableOptions.length + (showCreateOption ? 1 : 0);
    listItemsRef.current.length = len;
    justResetFromFilterRef.current = true;

    const rawPos = currentMousePosRef.current ?? lastMousePosRef.current;
    // (0,0) is the default init before any mousemove - treat as "no position"
    const pos = rawPos.x > 0 || rawPos.y > 0 ? rawPos : null;
    if (pos && typeof document !== 'undefined') {
      const el = document.elementFromPoint(pos.x, pos.y);
      const row = el?.closest?.<HTMLElement>(comboboxRowSelector);
      const idx = row?.dataset.comboboxIndex;
      if (idx == null) {
        setActiveIndex(null);
      } else {
        const n = Number(idx);
        if (n >= 0 && n < len) {
          setActiveIndex(n);
        } else {
          setActiveIndex(null);
        }
      }
    } else {
      setActiveIndex(0);
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- filter is the trigger: the list remounts per query and the highlight re-syncs to the cursor
  }, [filter, navigableOptions.length, showCreateOption]);

  const click = useClick(panel.context, { event: 'mousedown', keyboardHandlers: false });
  const dismiss = useDismiss(panel.context);
  const role = useRole(panel.context, { role: 'listbox' });
  const listNav = useListNavigation(panel.context, {
    listRef: listItemsRef,
    activeIndex,
    onNavigate: (index) => {
      if (index !== null) {
        setKeyboardNav(true);
        lastKeyboardNavTimeRef.current = Date.now();
        lastMousePosRef.current = { ...currentMousePosRef.current };
        setActiveIndex(index);
      }
    },
    virtual: true,
    loop: true,
    scrollItemIntoView: false,
    // We use elementFromPoint in mousemove handlers - floating-ui's indexOf can be stale after filter
    focusItemOnHover: false,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, listNav]);

  const handleSelect = useCallback(
    (option: ComboboxOption, index: number, event?: React.MouseEvent) => {
      hasSelectedSinceOpenRef.current = true;
      if (multiple) {
        const current = toValueArray(value);
        if (event?.shiftKey && lastSelectedIndexRef.current != null) {
          const from = Math.min(lastSelectedIndexRef.current, index);
          const to = Math.max(lastSelectedIndexRef.current, index);
          const rangeValues = navigableOptions.slice(from, to + 1).map((o) => o.value);
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
      }
    },
    [onValueChange, multiple, value, navigableOptions, setOpen],
  );

  const handleListMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { clientX, clientY } = e;
      currentMousePosRef.current = { x: clientX, y: clientY };

      // Sync activeIndex from elementUnderCursor - list's own mousemove fires in correct context (works in iframes)
      if (!keyboardNavRef.current && typeof document !== 'undefined') {
        const el = document.elementFromPoint(clientX, clientY);
        const row = el?.closest?.<HTMLElement>(comboboxRowSelector);
        const actualIndex = row?.dataset.comboboxIndex;
        const list = navigableOptionsRef.current;
        const len = list.length + (showCreateOptionRef.current ? 1 : 0);
        const activeIdx = activeIndexRef.current;
        const n = actualIndex == null ? null : Number(actualIndex);
        const next = n != null && n >= 0 && n < len ? n : activeIdx;
        if (next !== activeIdx) {
          setActiveIndex(next);
        }
      }

      const last = lastMousePosRef.current;
      const posChanged = last != null && (clientX !== last.x || clientY !== last.y);
      if (!posChanged) {
        return;
      }
      const now = Date.now();
      if (now - lastKeyboardNavTimeRef.current < 200) {
        return;
      }
      lastMousePosRef.current = { x: clientX, y: clientY };
      setKeyboardNav(false);
    },
    [setKeyboardNav],
  );

  const handlersRef = useRef<ComboboxItemHandlers | null>(null);

  const handleSelectRef = useRef(handleSelect);
  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  handleSelectRef.current = handleSelect;
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const commitActive = (key: string) => {
      const idx = activeIndexRef.current;
      const list = navigableOptionsRef.current;
      const createIdx = showCreateOptionRef.current ? list.length : -1;
      if (idx === createIdx && showCreateOptionRef.current) {
        handleCreate();
      } else if (key === 'Enter' && multipleRef.current && hasSelectedSinceOpenRef.current) {
        setOpen(false);
      } else if (idx != null && list[idx] !== undefined) {
        handleSelectRef.current(list[idx], idx);
        if (key === 'Enter' || !multipleRef.current) {
          setOpen(false);
        }
      } else {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const floatingEl = panelRefs.floating.current;
      const triggerEl = panelTriggerRef.current;
      const target = isNode(e.target) ? e.target : null;
      const inPanel =
        target !== null && (floatingEl?.contains(target) === true || triggerEl?.contains(target) === true);
      if (!inPanel) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ' && isTextEntryTarget(e.target)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        commitActive(e.key);
      }
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [open, handleCreate, setOpen, panelRefs, panelTriggerRef]);

  // oxlint-disable-next-line react/refs -- floating-ui's prop getter merges the reference ref callback; no ref is read here
  const referenceProps = getReferenceProps({
    ref: panel.setReferenceRef,
    onKeyDown(event: React.KeyboardEvent) {
      if (triggerOpenKeys.has(event.key) || event.code === 'Space') {
        event.preventDefault();
        setKeyboardNav(true);
        setOpen(true);
        setActiveIndex(0);
      }
    },
  });

  const listboxId = comboboxListboxId(id);
  const activeDescendant =
    open && activeIndex != null && activeIndex >= 0 ? comboboxOptionId(id, activeIndex) : undefined;

  const boxEventProps = Object.fromEntries(Object.entries(referenceProps).filter(isTriggerBagEntry));
  boxEventProps.tabIndex = disabled ? -1 : (tabIndexOverride ?? 0);
  boxEventProps.role = 'combobox';
  boxEventProps['aria-haspopup'] = 'listbox';
  boxEventProps['aria-expanded'] = open;
  boxEventProps['aria-controls'] = listboxId;
  if (hideSearch) {
    boxEventProps['aria-autocomplete'] = 'list';
    if (hasText(activeDescendant)) {
      boxEventProps['aria-activedescendant'] = activeDescendant;
    }
  }
  if (hasText(id)) {
    boxEventProps.id = id;
  }
  if (hasText(ariaLabel)) {
    boxEventProps['aria-label'] = ariaLabel;
  } else if (!(hasLabel === true && hasText(id)) && hasText(placeholder)) {
    // A labelled trigger is already named: the sibling Label wires
    // `aria-labelledby` onto this id itself, so naming it again here doubles the
    // spoken name. Standalone triggers still need one (axe aria-input-field-name).
    boxEventProps['aria-label'] = placeholder;
  }
  if (hasText(describedBy)) {
    boxEventProps['aria-describedby'] = describedBy;
  }

  // Total navigable items includes the create option if shown
  const totalNavigableItems = navigableOptions.length + (showCreateOption ? 1 : 0);
  const createOptionIndex = showCreateOption ? navigableOptions.length : -1;

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, _index: number) => {
      const isDown = e.key === 'j';
      const isUp = e.key === 'k';
      if (isDown || isUp) {
        e.preventDefault();
        e.stopPropagation();
        setKeyboardNav(true);
        lastKeyboardNavTimeRef.current = Date.now();
        lastMousePosRef.current = { ...currentMousePosRef.current };
        setActiveIndex((prev) => stepActiveIndex(prev, isDown, totalNavigableItems));
      }
    },
    [totalNavigableItems, setKeyboardNav],
  );

  // oxlint-disable-next-line react/refs -- latest-value ref mirror, read only by listeners/rAF callbacks outside render
  handlersRef.current = {
    getItemProps,
    onSelect: handleSelect,
    onItemKeyDown: handleItemKeyDown,
    knobProps,
    textColor,
    markColor,
    listItemsRef,
  };

  const handleSearchKeyDown = useCallback(
    // oxlint-disable-next-line eslint/complexity -- flat key dispatch, one branch per key
    (event: React.KeyboardEvent) => {
      const isDown = event.key === 'ArrowDown' || event.key === 'j';
      const isUp = event.key === 'ArrowUp' || event.key === 'k';
      if (isDown || isUp) {
        event.preventDefault();
        setKeyboardNav(true);
        lastKeyboardNavTimeRef.current = Date.now();
        lastMousePosRef.current = { ...currentMousePosRef.current };
        setActiveIndex((prev) => stepActiveIndex(prev, isDown, totalNavigableItems));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setKeyboardNav(true);
        lastKeyboardNavTimeRef.current = Date.now();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setKeyboardNav(true);
        lastKeyboardNavTimeRef.current = Date.now();
        setActiveIndex(Math.max(0, totalNavigableItems - 1));
      } else if (event.key === 'Enter' || event.key === ' ') {
        // Space picks only from an empty search; after text it is part of
        // the query (and of a value being created), as it is in the sheet.
        if (event.key === ' ' && filter.trim()) {
          return;
        }
        event.preventDefault();
        if (activeIndex === createOptionIndex && showCreateOption) {
          handleCreate();
        } else if (event.key === 'Enter' && multiple && hasSelectedSinceOpenRef.current) {
          setOpen(false);
        } else if (activeIndex != null && navigableOptions[activeIndex] !== undefined) {
          handleSelect(navigableOptions[activeIndex], activeIndex);
          if (event.key === 'Enter' || !multiple) {
            setOpen(false);
          }
        } else {
          setOpen(false);
        }
      } else if (event.key === 'Escape') {
        // Consume the dismissal intent so an enclosing sheet (window-level
        // Escape listener) does not also close on the same keypress.
        event.preventDefault();
        setOpen(false);
      }
    },
    [
      navigableOptions,
      activeIndex,
      handleSelect,
      handleCreate,
      totalNavigableItems,
      createOptionIndex,
      showCreateOption,
      multiple,
      filter,
      setKeyboardNav,
      setOpen,
    ],
  );

  // Multi-select reorders the list on selection, so a value change re-runs the scroll sync.
  const multiValueDep = multiple ? value : undefined;
  // Scroll to keep active item in view. Defer to next frame to avoid racing with
  // focus/scroll from useListNavigation and to run after list reorder on selection.
  // Grow dropdown when scrolling via keyboard (same as wheel/hover-arrow).
  useEffect(() => {
    if (activeIndex == null) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const scrollContainer = listScrollRef.current;
    if (!scrollContainer) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const rafId = requestAnimationFrame(() => {
      const item = listItemsRef.current[activeIndex];
      const container = listScrollRef.current;
      if (!item || !container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const bottomEdge = containerRect.bottom - scrollArrowBuffer;
      const topEdge = containerRect.top + scrollArrowBuffer;
      let didScroll = false;
      let scrollDir: 'up' | 'down' | null = null;
      if (itemRect.bottom > bottomEdge) {
        scrollDir = 'down';
        container.scrollTop += itemRect.bottom - bottomEdge;
        didScroll = true;
      } else if (itemRect.top < topEdge) {
        scrollDir = 'up';
        container.scrollTop -= topEdge - itemRect.top;
        didScroll = true;
      }
      if (didScroll && scrollDir && !justResetFromFilterRef.current) {
        lastScrollTopRef.current = container.scrollTop;
        growConstraintRef.current = scrollDir === 'down' ? 'no-down' : 'no-up';
        repositionOverlayRef.current('wheel');
        growConstraintRef.current = null;
      }
      justResetFromFilterRef.current = false;
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- multiValueDep is a trigger: multi-select reorders the list on selection, so the scroll sync re-runs
  }, [activeIndex, multiValueDep]);

  const showsValueLabel = !multiple && value !== undefined && value !== '' && hasText(valueLabel);
  const hasSearchError = hasText(searchError);
  const showOptionList = !hasSearchError && navigableOptions.length > 0;
  const showCreateOnly = !hasSearchError && !showOptionList && showCreateOption;
  const showLoadingRow = !hasSearchError && !showOptionList && !showCreateOnly && loading === true;
  const showEmptyMessage = !hasSearchError && !showOptionList && !showCreateOnly && loading !== true;
  const canClear = clearable === true && !multiple && !disabled;
  const showClear = canClear && !Array.isArray(value) && hasText(value);
  const showChips = multiple === true && selectedValues.length > 0;
  const chipAlign = showChips ? 'center' : 'flex-start';
  const tableCellProps = inTableCell ? {} : { borderWidth: knobProps.borderRadius.borderWidth };
  const triggerContent = triggerRender ? (
    // Stretch so custom triggers (e.g. Awesomebar) can own their height
    // instead of collapsing inside a shrink-wrapped View (SB-M-1703).
    <View
      {...boxEventProps}
      data-testid="combobox-trigger"
      width={triggerSizing === 'content' ? 'auto' : '100%'}
      alignSelf="stretch"
      flexShrink={0}
      outlineWidth={0}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: triggerSizing === 'content' ? 'auto' : '100%',
      }}>
      {triggerRender(multiple ? selectedOptions : selectedOption, open)}
    </View>
  ) : (
    <InputParts.Box
      {...boxEventProps}
      data-testid="combobox-trigger"
      // Box washes its own chrome when disabled — no opacity dim here
      // (it stacked with the wash and pushed the value text below AA).
      cursor={disabled ? 'not-allowed' : 'pointer'}
      disabled={disabled}
      size={knobProps.sizeToken}
      // One surface owner: a single-value panel COVERS this trigger (panel
      // top = trigger top), so the trigger's outer focus ring must not paint
      // — it would ghost around the panel's corners. A multi-select panel
      // attaches below instead, leaving the trigger on screen and
      // focusable, so it keeps its ring.
      suppressFocusRing={open && !multiple}
      {...pickerTriggerContract(knobProps.control.height)}
      // Chromeless in cells.
      {...tableCellProps}>
      <SyncFocusToOpen open={open} />
      <View
        flex={1}
        paddingHorizontal="$3"
        paddingVertical="$2"
        justifyContent={chipAlign}
        alignItems={chipAlign}>
        {showChips ? (
          <View
            flexDirection="row"
            flexWrap="nowrap"
            gap="$1.5"
            alignItems="center"
            maxHeight={getFieldHeight(knobProps.sizeToken, 1, hydrationTouch) * 0.75}
            overflow="hidden"
            overflowX="auto">
            {/* oxlint-disable-next-line react/refs -- label cache keeps labels of options that leave the list (async search) so selected values keep their text */}
            {selectedValues.map((v) => (
              <Chip
                key={v}
                size={chipSizeFor(knobProps.sizeToken)}
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
            color={selectedOption !== undefined || showsValueLabel ? textColor : formCommonColors.muted}
            numberOfLines={1}
            userSelect="none">
            {selectedOption?.label ?? (showsValueLabel ? valueLabel : placeholder)}
          </Text>
        )}
      </View>
      {showClear && (
        <Button
          size={knobProps.control.height}
          chromeless
          {...pickerTriggerContract(knobProps.control.height)}
          icon=<XIcon size={14} />
          alignSelf="center"
          cursor="pointer"
          tabIndex={-1}
          aria-label={t('Clear')}
          opacity={0.6}
          hoverStyle={{ opacity: 1 }}
          // useClick opens on mousedown at the trigger — swallow it so
          // clearing never toggles the dropdown.
          onMouseDown={(e: Pick<Event, 'stopPropagation' | 'preventDefault'>) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onPress={(e: Partial<Pick<Event, 'stopPropagation'>>) => {
            e.stopPropagation?.();
            onValueChange?.('');
          }}
        />
      )}
      <View
        paddingInlineEnd="$2"
        alignSelf="center">
        <CaretDownIcon
          size={16}
          color={glyphColor}
        />
      </View>
    </InputParts.Box>
  );

  return (
    <>
      {triggerContent}

      {panel.mounted && (
        // oxlint-disable-next-line react/refs -- the portal mounts only after the trigger is committed (panel.mounted), so the ref is populated
        <PanelPortal anchor={panelTriggerRef.current}>
          <FloatingFocusManager
            context={panel.context}
            modal={false}
            initialFocus={-1}>
            <YStack
              outlineWidth={0}
              pointerEvents={panel.visible ? 'auto' : 'none'}
              {...getFloatingProps({
                ref: panelRefs.setFloating,
                id: listboxId,
              })}
              style={{
                ...floatingPanelStyle,
                opacity: panel.visible ? 1 : 0,
                transform: panel.visible ? 'scale(1)' : 'scale(0.96)',
                transformOrigin: panel.placement.startsWith('top') ? 'bottom left' : 'top left',
              }}
              backgroundColor="$background"
              borderRadius={panel.dropdownRadius}
              borderWidth={panel.hasBorder ? knobProps.borderRadius.borderWidth : 0}
              borderColor={panel.hasBorder ? formInputColors.border.focus : 'transparent'}
              data-testid="combobox-dropdown">
              {!hideSearch && (
                <InputParts size={knobProps.sizeToken}>
                  <InputParts.Box
                    borderWidth={0}
                    borderBottomWidth={1}
                    borderBottomColor={formCommonColors.divider}
                    borderRadius={0}
                    elevation={undefined}
                    // Search is text-entry — ring the whole row (magnifier included).
                    {...(isWeb ? { className: 'mp-composite-ring' } : undefined)}>
                    <InputParts.Section>
                      <InputParts.Icon adornment="leading">
                        <MagnifyingGlassIcon />
                      </InputParts.Icon>
                    </InputParts.Section>
                    <InputParts.Section>
                      <InputParts.Area
                        ref={asTamaguiRef(searchInputRef)}
                        defaultValue=""
                        onChangeText={(text: string) => {
                          setInternalFilter(text);
                        }}
                        placeholder={searchPlaceholder}
                        onKeyDown={handleSearchKeyDown}
                        aria-autocomplete="list"
                        aria-controls={listboxId}
                        aria-activedescendant={activeDescendant}
                        aria-expanded={open}
                      />
                    </InputParts.Section>
                    {loading && (
                      <InputParts.Section>
                        <InputParts.Icon adornment="trailing">
                          <Spinner size="small" />
                        </InputParts.Icon>
                      </InputParts.Section>
                    )}
                    {!loading && filter !== '' && (
                      <InputParts.Section>
                        <InputParts.Button
                          onPress={() => {
                            setInternalFilter('');
                          }}>
                          <InputParts.Icon>
                            <XIcon />
                          </InputParts.Icon>
                        </InputParts.Button>
                      </InputParts.Section>
                    )}
                  </InputParts.Box>
                </InputParts>
              )}

              <YStack
                ref={asTamaguiRef(listScrollRef)}
                overflow="scroll"
                flex={1}
                minHeight={0}
                onScroll={handleListScroll}
                onMouseMove={handleListMouseMove}
                onPointerDown={handleListPointerDown}
                style={dragProps.style}>
                <ScrollArrow
                  direction="up"
                  scrollRef={listScrollRef}
                  visible={panel.arrowUp}
                  arrowScrollDirRef={arrowScrollDirRef}
                />
                {hasSearchError && (
                  <View
                    {...knobProps.panelPadding}
                    alignItems="center">
                    <Text
                      color={formCommonColors.error}
                      fontSize="$3"
                      fontFamily={knobProps.body.fontFamily}
                      fontWeight={knobProps.body.fontWeight}>
                      {searchError}
                    </Text>
                  </View>
                )}
                {showOptionList && (
                  <Fragment key={filter}>
                    {groupedItems.map((item) =>
                      item.type === 'header' ? (
                        <GroupHeader
                          key={`header-${item.label}`}
                          color={textColor}
                          data-combobox-group-header="">
                          {item.label}
                        </GroupHeader>
                      ) : (
                        <ComboboxItem
                          key={item.option.value}
                          option={item.option}
                          index={item.flatIndex}
                          optionId={comboboxOptionId(id, item.flatIndex)}
                          isSelected={isSelected(item.option.value)}
                          isActive={item.flatIndex === activeIndex}
                          keyboardRing={item.flatIndex === activeIndex && listKeyboardRing}
                          suppressHover={activeIndex != null}
                          handlers={handlersRef}
                        />
                      ),
                    )}
                    {showCreateOption && (
                      <ComboboxRow
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
                        role="option"
                        aria-selected={false}
                        tabIndex={-1}
                        id={comboboxOptionId(id, createOptionIndex)}
                        selected={false}
                        active={createOptionIndex === activeIndex}
                        height={knobProps.control.height}
                        data-combobox-index={createOptionIndex}
                        data-active={createOptionIndex === activeIndex}
                        {...listItemRingProps(createOptionIndex === activeIndex && listKeyboardRing)}
                        backgroundColor={
                          createOptionIndex === activeIndex ? formInputColors.background.focus : undefined
                        }
                        hoverStyle={
                          activeIndex == null
                            ? undefined
                            : {
                                backgroundColor:
                                  createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent',
                              }
                        }
                        onPress={handleCreate}
                        {...transitionProps(knobProps.transition)}>
                        <PlusIcon
                          size={14}
                          color={knobProps.textAccentColor}
                        />
                        <Text
                          fontFamily={knobProps.body.fontFamily}
                          fontWeight={knobProps.body.fontWeight}
                          color={textColor}
                          numberOfLines={1}
                          flex={1}>
                          {createLabel.replace('{value}', filter.trim())}
                        </Text>
                      </ComboboxRow>
                    )}
                  </Fragment>
                )}
                {showCreateOnly && (
                  <ComboboxRow
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
                    role="option"
                    aria-selected={false}
                    tabIndex={-1}
                    id={comboboxOptionId(id, createOptionIndex)}
                    selected={false}
                    active={createOptionIndex === activeIndex}
                    height={knobProps.control.height}
                    data-combobox-index={createOptionIndex}
                    data-active={createOptionIndex === activeIndex}
                    {...listItemRingProps(createOptionIndex === activeIndex && listKeyboardRing)}
                    onPress={handleCreate}
                    hoverStyle={
                      activeIndex == null
                        ? { backgroundColor: formInputColors.background.focus }
                        : {
                            backgroundColor:
                              createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent',
                          }
                    }
                    backgroundColor={
                      createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent'
                    }
                    pressStyle={{ backgroundColor: formInputColors.background.focus }}
                    {...transitionProps(knobProps.transition)}>
                    <PlusIcon
                      size={14}
                      color={knobProps.textAccentColor}
                    />
                    <Text
                      fontFamily={knobProps.body.fontFamily}
                      fontWeight={knobProps.body.fontWeight}
                      color={textColor}
                      numberOfLines={1}
                      flex={1}>
                      {createLabel.replace('{value}', filter.trim())}
                    </Text>
                  </ComboboxRow>
                )}
                {showLoadingRow && (
                  // Async search in flight with nothing loaded yet: a bounded
                  // loading row — never a premature "no results".
                  <View
                    {...knobProps.panelPadding}
                    alignItems="center">
                    <Spinner size="small" />
                  </View>
                )}
                {showEmptyMessage && (
                  <View
                    {...knobProps.panelPadding}
                    alignItems="center">
                    <Text
                      color={formCommonColors.muted}
                      fontSize={knobProps.sizeToken}
                      fontFamily={knobProps.body.fontFamily}
                      fontWeight={knobProps.body.fontWeight}>
                      {emptyMessage}
                    </Text>
                  </View>
                )}
                {hasMore && loading && (
                  <View
                    padding="$2"
                    alignItems="center">
                    <Spinner size="small" />
                  </View>
                )}
                <ScrollArrow
                  direction="down"
                  scrollRef={listScrollRef}
                  visible={panel.arrowDown}
                  arrowScrollDirRef={arrowScrollDirRef}
                />
              </YStack>
            </YStack>
          </FloatingFocusManager>
        </PanelPortal>
      )}
    </>
  );
};

// ── Native Combobox (Sheet-based for iOS/Android) ─────────────

const comboboxSearchHeader = (
  knobProps: FloatingComboboxCoreProps['knobProps'],
  filter: string,
  setFilter: (v: string) => void,
  searchPlaceholder: string,
  textColor: string,
  mutedColor: string,
  loading: boolean,
  onKeyDown?: (e: React.KeyboardEvent) => void,
  inputRef?: React.RefObject<HTMLInputElement | null>,
) => (
  <XStack
    alignItems="center"
    gap="$2"
    paddingHorizontal="$3"
    height={knobProps.control.height}
    borderBottomWidth={1}
    borderBottomColor={formCommonColors.divider}>
    <MagnifyingGlassIcon
      size={16}
      color={mutedColor}
    />
    <TInput
      ref={asTamaguiRef(inputRef)}
      unstyled
      flex={1}
      placeholder={searchPlaceholder}
      // iOS VoiceOver: name the search box (placeholder alone is value-only).
      {...(isWeb ? undefined : { accessibilityLabel: searchPlaceholder })}
      value={filter}
      onChangeText={setFilter}
      onKeyDown={onKeyDown}
      fontFamily={knobProps.body.fontFamily}
      fontWeight={knobProps.body.fontWeight}
      color={textColor}
      placeholderTextColor={toColorToken(mutedColor)}
      autoFocus
    />
    {loading && <Spinner size="small" />}
    {!loading && filter !== '' && (
      <View
        onPress={() => {
          setFilter('');
        }}
        opacity={0.6}>
        <XIcon size={16} />
      </View>
    )}
  </XStack>
);

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- sheet-mode twin of FloatingComboboxCore; one component owns the sheet's refs and keyboard state
const NativeComboboxCore = ({
  options,
  value,
  onValueChange,
  onBlur,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onSearch,
  loading,
  searchError,
  valueLabel,
  clearable,
  onLoadMore,
  hasMore,
  disabled,
  id,
  'aria-label': ariaLabel,
  hasLabel,
  trigger: triggerRender,
  triggerSizing = 'stretch',
  knobProps,
  multiple,
  selectedOrder,
  dismissible,
  creatable,
  onCreate,
  createLabel = 'Create "{value}"',
  hideSearch,
  searchValue,
  open: openProp,
  onOpenChange,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the component note above
}: FloatingComboboxCoreProps) => {
  const hydrationTouch = useTouchSurface();
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const { t } = useTranslation();
  const inTableCell = useIsInTableCell();
  const describedBy = useFieldDescribedBy();
  const glyphColor = useGlyphColor();
  const [internalOpen, setInternalOpen] = useState(false);
  // Use external open state when provided (controlled), otherwise use internal state
  const open = openProp ?? internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setInternalOpen(nextOpen);
      } else {
        onOpenChange?.(nextOpen);
      }
    },
    [openProp, onOpenChange],
  );
  const [internalFilter, setInternalFilter] = useState('');
  // Use external searchValue when provided, otherwise use internal filter
  const filter = searchValue ?? internalFilter;
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const [listKeyboardRing, setListKeyboardRing] = useState(false);
  const setKeyboardNav = useCallback((next: boolean) => {
    setListKeyboardRing((prev) => (prev === next ? prev : next));
  }, []);
  const listRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fieldA11y = useFieldA11y();

  const textColor = knobProps.textAccentColor;
  const theme = useThemeTokens();
  const mutedColor = theme.color7?.val ?? '$color7';
  const markColor = useSelectedMarkColor();

  const labelCacheRef = useRef<Map<string, string>>(new Map());
  for (const o of options) {
    labelCacheRef.current.set(o.value, o.label);
  }
  const getLabel = useCallback((v: string) => labelCacheRef.current.get(v) ?? v, []);

  const selectedValues = useMemo<string[]>(() => {
    if (!multiple) {
      return [];
    }
    const vals = toValueArray(value);
    return vals.toSorted((a, b) => getLabel(a).localeCompare(getLabel(b)));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- options is a deliberate trigger: the label cache (a ref) refreshes from new options and the sort must re-run
  }, [multiple, value, options, getLabel]);

  const selectedOption = useMemo(
    () => (multiple ? undefined : options.find((o) => o.value === value)),
    [options, value, multiple],
  );

  const selectedOptions = useMemo(() => {
    if (!multiple) {
      return [];
    }
    const selectedSet = new Set(selectedValues);
    return options.filter((o) => selectedSet.has(o.value));
  }, [options, selectedValues, multiple]);

  const isSelectedFn = useCallback(
    (optionValue: string) => (multiple ? selectedValues.includes(optionValue) : optionValue === value),
    [multiple, selectedValues, value],
  );

  const handleDismiss = useCallback(
    (valueToRemove: string) => {
      if (!multiple) {
        return;
      }
      const current = toValueArray(value);
      const next = current.filter((v) => v !== valueToRemove);
      onValueChange?.(next);
    },
    [multiple, value, onValueChange],
  );

  const filtered = useMemo(() => {
    if (onSearch || !filter) {
      return options;
    }
    const query = filter.trim().toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query) ||
        option.keywords?.toLowerCase().includes(query) === true,
    );
  }, [options, filter, onSearch]);

  // Show create option if creatable is enabled and filter doesn't exactly match an existing option
  const showCreateOption = useMemo(() => {
    if (!creatable || !filter.trim()) {
      return false;
    }
    const trimmed = filter.trim().toLowerCase();
    return !options.some((o) => o.label.toLowerCase() === trimmed || o.value.toLowerCase() === trimmed);
  }, [creatable, filter, options]);

  const handleCreate = useCallback(() => {
    const typed = filter.trim();
    if (!onCreate || !typed) {
      return;
    }
    const newOption = onCreate(typed);
    if (newOption && multiple) {
      const current = toValueArray(value);
      if (!current.includes(newOption.value)) {
        onValueChange?.([...current, newOption.value]);
      }
    } else if (newOption) {
      onValueChange?.(newOption.value);
    }
    // A void onCreate hands creation to the host (a dialog, a server round
    // trip); a single-value panel left open would sit over that UI.
    if (!multiple) {
      setOpen(false);
    }
    setInternalFilter('');
  }, [onCreate, filter, multiple, value, onValueChange, setOpen]);

  // Async-search comboboxes (Awesomebar, Link fields) open with few or no
  // options and stream results as the user types — open the sheet tall
  // (FloatingPanel `scrollable` → percent snap points) so the keyboard and
  // incoming results have room, instead of a fit-height sliver that shows
  // only the search input.
  const hasScrollableContent = Boolean(onSearch) || filtered.length > 6;
  const sheetTransition = knobProps.transition ?? 'medium';
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TransitionProp is a token string or a config object; the sheet only takes the token
  const sheetTransitionToken = typeof sheetTransition === 'string' ? sheetTransition : 'medium';

  // Selected item(s) at top when filter empty (single + multi); `stable` never rearranges
  const sortedFiltered = useMemo(() => {
    if (filter.trim()) {
      return filtered;
    }
    const current = toValueArray(value);
    return orderOptionsBySelected(filtered, current, selectedOrder);
  }, [filtered, value, filter, selectedOrder]);

  // Same grouping the floating core uses (`groupComboboxOptions`, the mechanism
  // mpo-floating-measured.md §2.3 names as ours): rows cluster by group so each
  // group gets exactly ONE header. Rendering source order here emitted a repeat
  // header for interleaved groups and disagreed with the desktop panel for
  // identical props. `activeIndex` indexes `navigableOptions`, which IS the
  // render order, so arrows still land on the row the user sees.
  const { flatOptions: navigableOptions } = useMemo(() => groupComboboxOptions(sortedFiltered), [sortedFiltered]);

  const searchCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!onSearch || !open) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const timerId = setTimeout(() => {
      searchCleanupRef.current?.();
      const cleanup = onSearch(filter);
      searchCleanupRef.current = cleanup ?? null;
    }, 200);
    return () => {
      clearTimeout(timerId);
      searchCleanupRef.current?.();
      searchCleanupRef.current = null;
    };
  }, [filter, onSearch, open]);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setActiveIndex(0);
      requestAnimationFrame(() => (hideSearch ? listRef.current?.focus() : searchInputRef.current?.focus()));
    } else {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- open/close resets the transient panel state (highlight, filter, keyboard ring) in lock-step with `open`, which may be parent-controlled
      setInternalFilter('');
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs on open toggles only; hideSearch just picks the focus target at open time
  }, [open]);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change, react-doctor/no-chain-state-updates -- a new query re-homes the highlight to the first row
      setActiveIndex(0);
    }
  }, [filter, open]);

  const totalItems = navigableOptions.length + (showCreateOption ? 1 : 0);
  const createOptionIndex = showCreateOption ? navigableOptions.length : -1;
  const listboxId = comboboxListboxId(id);
  const activeDescendant =
    open && activeIndex != null && activeIndex >= 0 ? comboboxOptionId(id, activeIndex) : undefined;

  const handleSelect = useCallback(
    (option: ComboboxOption) => {
      if (multiple) {
        const current = toValueArray(value);
        const next = current.includes(option.value)
          ? current.filter((v) => v !== option.value)
          : [...current, option.value];
        onValueChange?.(next);
      } else {
        onValueChange?.(option.value);
        setOpen(false);
      }
    },
    [onValueChange, multiple, value, setOpen],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isDown = e.key === 'ArrowDown' || e.key === 'j';
      const isUp = e.key === 'ArrowUp' || e.key === 'k';
      if (isDown) {
        e.preventDefault();
        setKeyboardNav(true);
        listRef.current?.focus();
        setActiveIndex((prev) => {
          const next = prev == null ? 0 : prev + 1;
          return next >= totalItems ? 0 : next;
        });
      } else if (isUp) {
        e.preventDefault();
        setKeyboardNav(true);
        listRef.current?.focus();
        setActiveIndex((prev) => {
          const next = prev == null ? totalItems - 1 : prev - 1;
          return next < 0 ? totalItems - 1 : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex(Math.max(0, totalItems - 1));
      }
    },
    [totalItems, setKeyboardNav],
  );

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (totalItems === 0) {
        return;
      }
      const isDown = e.key === 'ArrowDown' || e.key === 'j';
      const isUp = e.key === 'ArrowUp' || e.key === 'k';
      if (isDown) {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex((prev) => {
          const next = prev == null ? 0 : prev + 1;
          return next >= totalItems ? 0 : next;
        });
      } else if (isUp) {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex((prev) => {
          const next = prev == null ? totalItems - 1 : prev - 1;
          return next < 0 ? totalItems - 1 : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setKeyboardNav(true);
        setActiveIndex(Math.max(0, totalItems - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (activeIndex === createOptionIndex && showCreateOption) {
          handleCreate();
        } else if (activeIndex != null && activeIndex >= 0 && navigableOptions[activeIndex] !== undefined) {
          handleSelect(navigableOptions[activeIndex]);
          if (e.key === 'Enter' || !multiple) {
            setOpen(false);
          }
        }
      }
    },
    [
      totalItems,
      createOptionIndex,
      showCreateOption,
      activeIndex,
      navigableOptions,
      handleCreate,
      handleSelect,
      multiple,
      setKeyboardNav,
      setOpen,
    ],
  );

  // Document-level Enter/Space/Escape (sheet mode - catches keys when focus is on search or list)
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ' && isTextEntryTarget(e.target)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (activeIndex === createOptionIndex && showCreateOption) {
          handleCreate();
        } else if (activeIndex != null && activeIndex >= 0 && navigableOptions[activeIndex] !== undefined) {
          handleSelect(navigableOptions[activeIndex]);
          if (e.key === 'Enter' || !multiple) {
            setOpen(false);
          }
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [
    open,
    activeIndex,
    createOptionIndex,
    showCreateOption,
    navigableOptions,
    handleCreate,
    handleSelect,
    multiple,
    setOpen,
  ]);

  const handleOpenChange = useCallback(
    (val: boolean) => {
      setOpen(val);
      if (!val) {
        onBlur?.();
      }
    },
    [onBlur, setOpen],
  );

  const searchHeader = hideSearch
    ? undefined
    : comboboxSearchHeader(
        knobProps,
        filter,
        setInternalFilter,
        searchPlaceholder,
        textColor,
        mutedColor,
        loading ?? false,
        handleSearchKeyDown,
        searchInputRef,
      );

  const hasSearchError = hasText(searchError);
  const showOptionList = !hasSearchError && navigableOptions.length > 0;
  const showCreateOnly = !hasSearchError && !showOptionList && showCreateOption;
  const showLoadingRow = !hasSearchError && !showOptionList && !showCreateOnly && loading === true;
  const showEmptyMessage = !hasSearchError && !showOptionList && !showCreateOnly && loading !== true;

  // role="listbox" is a valid ARIA role but outside RN's `Role` union; this web-only bag forwards it to the DOM node.
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening -- untyped on purpose: the spread bypasses RN's Role union for a valid web-only ARIA role
  const webListboxProps: Record<string, unknown> = {
    tabIndex: 0,
    onKeyDown: handleListKeyDown,
    role: 'listbox',
    id: listboxId,
  };

  const listContent = (
    // tabIndex/onKeyDown are web-only: on iOS tabIndex makes the container an
    // accessibility element, which merges every option into one unactionable
    // VoiceOver blob.
    <View
      ref={asTamaguiRef(listRef)}
      // role="listbox" is a valid ARIA role but outside RN's `Role` union;
      // this web-only bag forwards it to the DOM node (house Record cast).
      {...(isWeb ? webListboxProps : undefined)}
      outlineWidth={0}
      // Native sheet: flex={1} inside FloatingPanel ScrollView collapses rows.
    >
      {hasSearchError && (
        <View
          {...knobProps.panelPadding}
          alignItems="center">
          <Text
            color={formCommonColors.error}
            fontSize="$3"
            fontFamily={knobProps.body.fontFamily}
            fontWeight={knobProps.body.fontWeight}>
            {searchError}
          </Text>
        </View>
      )}
      {showOptionList && (
        <>
          {navigableOptions.map((option, i) => {
            const selected = isSelectedFn(option.value);
            const active = i === activeIndex;
            const prevGroup = i > 0 ? navigableOptions[i - 1].group : undefined;
            const showGroupHeader = hasText(option.group) && option.group !== prevGroup;
            const optionRow = (
              <View
                flexDirection="row"
                alignItems="center"
                gap="$2"
                paddingHorizontal="$3"
                id={comboboxOptionId(id, i)}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
                role="option"
                aria-selected={selected}
                data-combobox-index={i}
                data-active={active}
                {...listItemRingProps(active && listKeyboardRing)}
                {...(hasText(option.description)
                  ? { minHeight: knobProps.control.height, paddingVertical: '$2' }
                  : { height: knobProps.control.height })}
                onPress={
                  isWeb
                    ? () => {
                        handleSelect(option);
                      }
                    : undefined
                }
                onMouseEnter={() => {
                  setKeyboardNav(false);
                  setActiveIndex(i);
                }}
                {...(isWeb ? {} : { pointerEvents: 'none' as const })}
                hoverStyle={
                  activeIndex == null
                    ? {
                        backgroundColor: selected ? formInputColors.background.base : formInputColors.background.focus,
                      }
                    : {
                        backgroundColor: rowBackground(active, selected, 'transparent'),
                      }
                }
                backgroundColor={rowBackground(active, selected, 'transparent')}
                pressStyle={{ backgroundColor: formInputColors.background.focus }}>
                {hasText(option.description) ? (
                  <YStack
                    flex={1}
                    minWidth={0}>
                    <Text
                      fontFamily={knobProps.body.fontFamily}
                      fontWeight={knobProps.body.fontWeight}
                      color={textColor}
                      numberOfLines={1}>
                      {option.label}
                    </Text>
                    <Text
                      fontFamily={knobProps.body.fontFamily}
                      fontSize="$2"
                      color={formCommonColors.muted}
                      numberOfLines={1}>
                      {option.description}
                    </Text>
                  </YStack>
                ) : (
                  <Text
                    fontFamily={knobProps.body.fontFamily}
                    fontWeight={knobProps.body.fontWeight}
                    color={textColor}
                    numberOfLines={1}
                    flex={1}>
                    {option.label}
                  </Text>
                )}
                {selected && (
                  <CheckIcon
                    size={14}
                    color={markColor}
                  />
                )}
              </View>
            );
            return (
              <View key={option.value}>
                {showGroupHeader && (
                  <GroupHeader
                    color={textColor}
                    data-combobox-group-header="">
                    {option.group}
                  </GroupHeader>
                )}
                {isWeb ? (
                  optionRow
                ) : (
                  <RNPressable
                    onPress={() => {
                      handleSelect(option);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected }}>
                    {optionRow}
                  </RNPressable>
                )}
              </View>
            );
          })}
          {showCreateOption && (
            <View
              flexDirection="row"
              alignItems="center"
              gap="$2"
              paddingHorizontal="$3"
              height={knobProps.control.height}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
              role="option"
              aria-selected={false}
              id={comboboxOptionId(id, createOptionIndex)}
              data-combobox-index={createOptionIndex}
              data-active={createOptionIndex === activeIndex}
              {...listItemRingProps(createOptionIndex === activeIndex && listKeyboardRing)}
              onPress={handleCreate}
              onMouseEnter={() => {
                setKeyboardNav(false);
                setActiveIndex(createOptionIndex);
              }}
              hoverStyle={
                activeIndex == null
                  ? { backgroundColor: formInputColors.background.focus }
                  : {
                      backgroundColor:
                        createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent',
                    }
              }
              backgroundColor={createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent'}
              pressStyle={{ backgroundColor: formInputColors.background.focus }}>
              <PlusIcon
                size={14}
                color={textColor}
              />
              <Text
                fontFamily={knobProps.body.fontFamily}
                fontWeight={knobProps.body.fontWeight}
                color={textColor}
                numberOfLines={1}
                flex={1}>
                {createLabel.replace('{value}', filter.trim())}
              </Text>
            </View>
          )}
        </>
      )}
      {showCreateOnly && (
        <View
          flexDirection="row"
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          height={knobProps.control.height}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- listbox row on a Tamagui element; native <option> is only valid inside <select>
          role="option"
          aria-selected={false}
          id={comboboxOptionId(id, createOptionIndex)}
          data-combobox-index={createOptionIndex}
          data-active={createOptionIndex === activeIndex}
          {...listItemRingProps(createOptionIndex === activeIndex && listKeyboardRing)}
          onPress={handleCreate}
          onMouseEnter={() => {
            setKeyboardNav(false);
            setActiveIndex(createOptionIndex);
          }}
          hoverStyle={
            activeIndex == null
              ? { backgroundColor: formInputColors.background.focus }
              : {
                  backgroundColor: createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent',
                }
          }
          backgroundColor={createOptionIndex === activeIndex ? formInputColors.background.focus : 'transparent'}
          pressStyle={{ backgroundColor: formInputColors.background.focus }}>
          <PlusIcon
            size={14}
            color={textColor}
          />
          <Text
            fontFamily={knobProps.body.fontFamily}
            fontWeight={knobProps.body.fontWeight}
            color={textColor}
            numberOfLines={1}
            flex={1}>
            {createLabel.replace('{value}', filter.trim())}
          </Text>
        </View>
      )}
      {showLoadingRow && (
        // Async search in flight with nothing loaded yet: a bounded loading
        // row — never a premature "no results".
        <View
          {...knobProps.panelPadding}
          alignItems="center">
          <Spinner size="small" />
        </View>
      )}
      {showEmptyMessage && (
        <View
          {...knobProps.panelPadding}
          alignItems="center">
          <Text
            color={formCommonColors.muted}
            fontSize={knobProps.sizeToken}
            fontFamily={knobProps.body.fontFamily}
            fontWeight={knobProps.body.fontWeight}>
            {emptyMessage}
          </Text>
        </View>
      )}
      {hasMore && loading && (
        <View
          padding="$2"
          alignItems="center">
          <Spinner size="small" />
        </View>
      )}
    </View>
  );

  // Both trigger shapes share one accessible control. The sheet wrapper's
  // capture handler also opens it, so pointer activation is idempotent.
  const triggerProps = {
    id,
    ...(isWeb
      ? {
          role: 'combobox' as const,
          'aria-haspopup': 'listbox' as const,
          'aria-expanded': open,
          'aria-controls': listboxId,
          'aria-activedescendant': hideSearch ? activeDescendant : undefined,
          'aria-autocomplete': hideSearch ? ('list' as const) : undefined,
          'aria-label': ariaLabel ?? (hasLabel ? undefined : placeholder),
          'aria-describedby': describedBy,
          tabIndex: disabled ? -1 : 0,
        }
      : { importantForAccessibility: 'no' as const }),
    onPress:
      isWeb && !disabled
        ? () => {
            handleOpenChange(true);
          }
        : undefined,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (disabled) {
        return;
      }
      if (triggerOpenKeys.has(event.key) || event.code === 'Space') {
        event.preventDefault();
        setKeyboardNav(true);
        if (!open) {
          handleOpenChange(true);
        }
      }
    },
  };

  const showsValueLabel = !multiple && value !== undefined && value !== '' && hasText(valueLabel);
  const canClear = clearable === true && !multiple && !disabled;
  const showClear = canClear && !Array.isArray(value) && hasText(value);
  const showChips = multiple === true && selectedValues.length > 0;
  const chipAlign = showChips ? 'center' : 'flex-start';
  const tableCellProps = inTableCell ? {} : { borderWidth: knobProps.borderRadius.borderWidth };
  const triggerContent = triggerRender ? (
    <View
      data-testid="combobox-trigger"
      width={triggerSizing === 'content' ? 'auto' : '100%'}
      alignSelf="stretch"
      flexShrink={0}
      outlineWidth={0}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: triggerSizing === 'content' ? 'auto' : '100%',
      }}
      {...triggerProps}>
      {triggerRender(multiple ? selectedOptions : selectedOption, open)}
    </View>
  ) : (
    <InputParts.Box
      data-testid="combobox-trigger"
      // Box washes its own chrome when disabled — no opacity dim here
      // (it stacked with the wash and pushed the value text below AA).
      cursor={disabled ? 'not-allowed' : 'pointer'}
      disabled={disabled}
      size={knobProps.sizeToken}
      // One surface owner: a single-value FloatingPanel COVERS this trigger
      // (panel top = trigger top), so the trigger's outer focus ring must not
      // paint — it would ghost around the panel's corners. A multi-select
      // panel attaches below instead, so it keeps its ring.
      suppressFocusRing={open && !multiple}
      {...pickerTriggerContract(knobProps.control.height)}
      // Chromeless in cells.
      {...tableCellProps}
      {...triggerProps}>
      <View
        flex={1}
        paddingHorizontal="$3"
        paddingVertical="$2"
        justifyContent={chipAlign}
        alignItems={chipAlign}>
        {showChips ? (
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
                size={chipSizeFor(knobProps.sizeToken)}
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
            color={selectedOption !== undefined || showsValueLabel ? textColor : formCommonColors.muted}
            numberOfLines={1}>
            {selectedOption?.label ?? (showsValueLabel ? valueLabel : placeholder)}
          </Text>
        )}
      </View>
      <View
        paddingInlineEnd="$2"
        alignSelf="center">
        <CaretDownIcon
          size={16}
          color={glyphColor}
        />
      </View>
    </InputParts.Box>
  );

  const multiValueText = selectedValues.length > 0 ? selectedValues.map(getLabel).join(', ') : placeholder;
  const triggerValueText = multiple ? multiValueText : (selectedOption?.label ?? placeholder);

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      sheet
      // Search-driven comboboxes open the sheet tall: results stream in as
      // the user types, so a content-fit sheet would open as a sliver.
      sheetFill={Boolean(onSearch)}
      trigger={triggerContent}
      triggerSizing={triggerSizing}
      triggerEnd={
        showClear ? (
          <Button
            size={knobProps.sizeToken}
            chromeless
            minWidth={44}
            minHeight={44}
            aria-label={t('Clear')}
            icon=<XIcon size={14} />
            onPress={() => onValueChange?.('')}
          />
        ) : undefined
      }
      triggerA11y={{
        label: ariaLabel ?? fieldA11y?.label,
        value: triggerValueText,
        hint: fieldA11y?.description,
      }}
      header={searchHeader}
      scrollable={hasScrollableContent}
      disabled={disabled}
      contentPadding="none"
      transition={sheetTransitionToken}
      scrollViewProps={{
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (!onLoadMore || !hasMore || loading) {
            return;
          }
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (contentSize.height - contentOffset.y - layoutMeasurement.height < 100) {
            onLoadMore();
          }
        },
        scrollEventThrottle: 100,
      }}>
      {listContent}
    </FloatingPanel>
  );
};

// ── Combobox (public API) ─────────────────────────────────────

export const Combobox = ({
  options,
  value: valueProp,
  defaultValue,
  onChange,
  // oxlint-disable-next-line typescript/no-deprecated -- the deprecated alias is still honoured at the single emit site
  onValueChange,
  placeholder: placeholderProp,
  searchPlaceholder: searchPlaceholderProp,
  emptyMessage: emptyMessageProp,
  onSearch,
  loading,
  searchError,
  valueLabel,
  clearable,
  onLoadMore,
  hasMore,
  trigger,
  triggerSizing,
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
  onBlur,
  popoverWidth,
  tabIndex: tabIndexProp,
  multiple,
  selectedOrder,
  dismissible,
  skeleton,
  compact,
  creatable,
  onCreate,
  createLabel,
  hideSearch,
  searchValue,
  open,
  onOpenChange,
  'aria-label': ariaLabel,
  ...rest
}: ComboboxProps) => {
  const { t } = useTranslation();
  const placeholder = placeholderProp ?? t('Select...');
  const hasLabel = Boolean(label);
  const searchPlaceholder = searchPlaceholderProp ?? t('Search...');
  const emptyMessage = emptyMessageProp ?? t('No results found.');
  const { resolvedForm, knobProps, id } = useFormField({ form: formProp, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  // Uncontrolled (no `value` prop, no form) still must reflect selections in
  // the trigger — callbacks alone leave the display frozen on the placeholder.
  const [uncontrolledValue, setUncontrolledValue] = useState<SelectionValue>(defaultValue);
  const isControlled = valueProp !== undefined;
  const [createdOptions, setCreatedOptions] = useState<ComboboxOption[]>([]);
  const knownOptions = useMemo(() => {
    const unlisted = createdOptions.filter((c) => !options.some((o) => o.value === c.value));
    return unlisted.length ? [...options, ...unlisted] : options;
  }, [options, createdOptions]);
  const handleCreateOption = useMemo(
    () =>
      onCreate &&
      ((typed: string) => {
        const created = onCreate(typed);
        if (created) {
          setCreatedOptions((prev) => withCreatedOption(prev, created));
        }
        return created;
      }),
    [onCreate],
  );
  const viewportGtSm = useViewportGtSm();
  // Sheet on native and below `$sm` (viewport < 640, OVERLAY_BREAKPOINT).
  // Floating from `$sm` up.
  const effectiveGtSm = typeof window === 'undefined' ? false : viewportGtSm;
  const shouldUseSheet = !isWeb || !effectiveGtSm;
  const textColor = knobProps.textAccentColor;

  // Render skeleton placeholder
  if (skeleton) {
    return (
      <InputParts size={sizeProp ?? knobProps.sizeToken}>
        {hasLabel && (
          <Skeleton
            variant="text"
            width="30%"
            height={14}
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

  const renderReadOnly = (selectValue: SelectionValue) => {
    if (multiple && Array.isArray(selectValue)) {
      const labels = selectValue.map((v) => knownOptions.find((o) => o.value === v)?.label ?? v).join(', ');
      return (
        <Text
          fontSize={knobProps.sizeToken}
          color={textColor}
          paddingVertical="$2"
          paddingHorizontal="$3"
          fontFamily={knobProps.body.fontFamily}
          fontWeight={knobProps.body.fontWeight}>
          {labels || '-'}
        </Text>
      );
    }
    const sv = Array.isArray(selectValue) ? undefined : selectValue;
    const selected = knownOptions.find((option) => option.value === sv);
    const displayText = selected?.label ?? (hasText(sv) ? (valueLabel ?? sv) : '-');
    return (
      <Text
        fontSize={knobProps.sizeToken}
        color={textColor}
        paddingVertical="$2"
        paddingHorizontal="$3"
        fontFamily={knobProps.body.fontFamily}
        fontWeight={knobProps.body.fontWeight}>
        {displayText}
      </Text>
    );
  };

  const renderComboboxContent = (
    selectValue: SelectionValue,
    handleValueChange?: (value: string | string[]) => void,
    handleBlur?: (...args: never[]) => void,
  ) => {
    if (readOnly) {
      return renderReadOnly(selectValue);
    }
    const ComboboxCore = shouldUseSheet ? NativeComboboxCore : FloatingComboboxCore;
    return (
      <ComboboxCore
        options={onSearch ? options : knownOptions}
        value={selectValue}
        onValueChange={(value) => {
          if (disabled) {
            return;
          }
          handleValueChange?.(value);
          // Canonical `onChange` and the alias `onValueChange` both fire from
          // this single emit site (same reconciliation as Switch).
          onChange?.(value);
          onValueChange?.(value);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        onSearch={onSearch}
        loading={loading}
        searchError={searchError}
        valueLabel={valueLabel ?? createdOptions.find((o) => o.value === selectValue)?.label}
        clearable={clearable}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
        hasLabel={hasLabel}
        tabIndexOverride={tabIndexProp}
        popoverWidth={popoverWidth}
        trigger={trigger}
        triggerSizing={triggerSizing}
        knobProps={knobProps}
        multiple={multiple}
        selectedOrder={selectedOrder}
        dismissible={dismissible}
        creatable={creatable}
        onCreate={handleCreateOption}
        createLabel={createLabel}
        hideSearch={hideSearch}
        searchValue={searchValue}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  };

  if (trigger) {
    // User callbacks fire once at the emit site above — passing them again as
    // the internal handler double-fired `onValueChange` per change.
    return renderComboboxContent(
      valueProp ?? uncontrolledValue,
      isControlled ? undefined : setUncontrolledValue,
      onBlur,
    );
  }

  if (!resolvedForm || !hasText(name)) {
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
        <InputParts size={sizeProp ?? knobProps.sizeToken}>
          {renderComboboxContent(
            valueProp ?? uncontrolledValue,
            isControlled ? undefined : setUncontrolledValue,
            onBlur,
          )}
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
            <InputParts size={sizeProp ?? knobProps.sizeToken}>
              {renderComboboxContent(
                field.state.value,
                (value) => {
                  field.handleChange(value);
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

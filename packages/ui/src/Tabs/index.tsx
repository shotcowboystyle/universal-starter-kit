/**
 * Tabs — themed app-level tabs over the tamagui Tabs primitive.
 *
 * Wraps `tamagui`'s Tabs (roving focus, tablist/tab/tabpanel aria, automatic
 * or manual activation) and adds house anatomy + knob wiring:
 *
 * - variants: `underline` (desk / Primer / Linear) and `contained`
 *   (Carbon contained / iOS segmented — CONTAINER-CLIP, selected = fill)
 * - knobs: size (tab chrome via size recipe — height/pad/font/gap; radius
 *   stays on the radius knob), density/space (pad + panel), animation
 *   (indicator slide), elevation (thumb)
 * - intent: accent (default indicator hue) / error / warning / success
 * - overflow: horizontal scroll with web edge fades when tabs exceed width
 *   (RTL-aware: CSSOM `scrollLeft` is 0 → −range; G10 hairline on the
 *   underline strip, not a knob-driven border)
 * - lazyMount: panels mount on first visit and stay mounted (state preserved)
 * - fill: root + panel host grow into a bounded parent (Tabs contract)
 *
 * Selected = underline or sliding fill; unselected have zero chrome;
 * keyboard ring on the focused tab only. Underline rounds only the
 * strip's outer top corners; contained clips to the track. One
 * tab stop. Label strings ride Text.
 */

import {
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  getGroupPosition,
  hairline,
  keyboardFocusRingProps,
  pressTargetHitSlop,
  stackEdgeRadius,
  stackRadiusProps,
  useAccentTintedSurface,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
  transitionProps,
} from '@repo/theme';
import type { GroupPosition } from '@repo/theme';
import type { ComponentProps, ReactNode } from 'react';
import React from 'react';
import type { GetProps, ThemeName } from 'tamagui';
import { Tabs as TamaguiTabs, Text, Theme, View, YStack, isWeb, styled, withStaticProperties } from 'tamagui';

import { componentColors } from '../component-colors';
import { useDirection } from '../hooks/use-direction';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { isBareTextChild, wrapBareTextChildren } from '../shared/text-rides-text';

// ── Types ─────────────────────────────────────────────────────

export type TabsVariant = 'underline' | 'contained' | 'band';
export type TabsSize = '$2' | '$3' | '$4' | '$5';
export type TabsDirection = 'ltr' | 'rtl';

export interface TabsItem {
  /** Unique value identifying the tab (used for value/onChange) */
  value: string;
  /** Tab label */
  label: ReactNode;
  /** Spoken name when the label contains more than plain text. */
  accessibilityLabel?: string;
  /** Optional leading icon */
  icon?: ReactNode;
  /** Optional trailing adornment (e.g. a Badge/count pill) */
  badge?: ReactNode;
  /** Disable just this tab */
  disabled?: boolean;
  /** Panel content shown when the tab is active */
  content?: ReactNode;
}

export interface TabsProps {
  /** Tabs to render */
  items: TabsItem[];
  /** Controlled active value */
  value?: string;
  /** Uncontrolled initial value (defaults to the first item) */
  defaultValue?: string;
  /** Called when the active tab changes */
  onChange?: (value: string) => void;
  /** underline (desk-style, default) or contained (segmented track) */
  variant?: TabsVariant;
  /** Equal tabs share a bounded row. Band always uses equal distribution. */
  distribution?: 'content' | 'equal';
  /** Accent intent for the active indicator (default) */
  accent?: boolean;
  /** Error intent */
  error?: boolean;
  /** Warning intent */
  warning?: boolean;
  /** Success intent */
  success?: boolean;
  /** Size token override for tab height/font (size axis — not density) */
  size?: TabsSize;
  /** Compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /** Mount panels on first visit and keep them mounted (preserves state) */
  lazyMount?: boolean;
  /**
   * Grow into a bounded parent.
   *
   * By default every box in this component is `flex: 0 0 auto`, so the strip
   * and the panels size to their content and the whole thing sits at the top
   * of whatever contains it. That is right on a page, and wrong inside a box
   * with a declared height — a modal, a sheet, a split pane — where the panel
   * is supposed to take the leftover room and scroll inside it.
   *
   * `fill` opens the flex chain the panel needs: the tamagui root, the panel
   * host and the active panel each get `flex: 1` plus `minHeight: 0`, which is
   * the pair that lets a flex child shrink below its content height instead of
   * pushing the container open. The strip keeps its intrinsic height, so it
   * stays put while the panel scrolls under it.
   *
   * One prop rather than a style passthrough because the fix is three boxes
   * deep: a `contentProps` escape hatch would reach the panel host and leave
   * the root at `flex: 0 0 auto`, so the panel would still resolve against
   * zero. A consumer cannot express this correctly from outside.
   */
  fill?: boolean;
  /** automatic (focus selects, default) or manual (Enter/Space selects). Web only. */
  activationMode?: 'automatic' | 'manual';
  /** Loop arrow-key navigation past the ends */
  loop?: boolean;
  /** Disable the whole tab strip */
  disabled?: boolean;
  /** Accessible name of the tablist. Defaults to the translated "Tabs". */
  ariaLabel?: string;
}

interface TabLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Physical overflow fades for the tab strip.
 *
 * CSSOM `scrollLeft` runs 0 → −(scrollWidth − clientWidth) under RTL
 * (rtl-audit U1). Normalize so a rest-state strip still fades the inline-end
 * edge instead of both-or-neither.
 */
export const tabsOverflowFades = (
  offset: number,
  viewport: number,
  content: number,
  direction: TabsDirection,
  threshold = 4,
) => {
  const range = Math.max(content - viewport, 0);
  const minScrollLeft = direction === 'rtl' ? -range : 0;
  const fromLeft = offset - minScrollLeft;
  const fromRight = minScrollLeft + range - offset;
  return { left: fromLeft > threshold, right: fromRight > threshold };
};

export const tabsScrollIntoViewX = (
  layout: TabLayout,
  offset: number,
  viewport: number,
  content: number,
  direction: TabsDirection,
  pad = 32,
): number | undefined => {
  const allFinite = [layout.x, layout.width, layout.height, offset, viewport, content].every(Number.isFinite);
  const allPositive = layout.width > 0 && layout.height > 0 && viewport > 0 && content > 0;
  if (!allFinite || !allPositive) {
    return undefined;
  }
  const range = Math.max(content - viewport, 0);
  if (range <= 0) {
    return undefined;
  }
  const minScrollLeft = direction === 'rtl' ? -range : 0;
  const fromLeft = offset - minScrollLeft;
  let targetFromLeft: number | undefined;
  if (layout.x < fromLeft + pad) {
    targetFromLeft = Math.max(0, layout.x - pad);
  } else if (layout.x + layout.width > fromLeft + viewport - pad) {
    targetFromLeft = Math.min(range, layout.x + layout.width - viewport + pad);
  }
  return targetFromLeft === undefined ? undefined : targetFromLeft + minScrollLeft;
};

// Tabbing into the strip focuses the tablist container first; tamagui's
// roving-focus group then redirects focus to the current tab from inside a
// focusin handler. Chromium drops keyboard modality on that script focus, so
// neither :focus-visible nor focusVisibleStyle fire for the redirected tab —
// the ring is painted manually via the theme keyboard-modality tracker.

/**
 * Underline tabs sit on a full-bleed hairline, so only the TOP outer corners
 * round (the outer-corner rule adapted to a baseline). Bottoms stay square against the rule.
 * Contained uses the full horizontal stack fragment (or CONTAINER-CLIP).
 */
const underlineStackRadius = (position: GroupPosition, radius: RadiusToken) => {
  const start = position === 'first' || position === 'only';
  const end = position === 'last' || position === 'only';
  const full = stackEdgeRadius(radius, { start, end }, 'horizontal');
  return {
    ...full,
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
  };
};

/**
 * The fill chain, in one place so the three boxes cannot drift apart.
 * `flex: 1` grows into the leftover room; `minHeight: 0` is what lets the box
 * shrink below its content instead of pushing its container open — a filling
 * panel needs both on every link of the chain, or the innermost one resolves
 * against zero.
 */
const fillProps = { flex: 1, minHeight: 0 } as const;

// ── Styled components ─────────────────────────────────────────

const StripWrapper = styled(View, {
  name: 'MpTabsStrip',
  alignSelf: 'stretch',
  minWidth: 0,
  position: 'relative',
});

// A slot name for the spec's ## Slot margins table, not styled(): a styled
// wrapper drops onScroll on native.
const TabStripScroll = ScrollView;

const TabsList = styled(TamaguiTabs.List, {
  name: 'MpTabsList',
  unstyled: true,
  flexDirection: 'row',
  alignItems: 'stretch',
  alignSelf: 'flex-start',
  position: 'relative',

  variants: {
    contained: {
      true: {
        overflow: 'hidden',
      },
    },
  } as const,
});

const Trigger = styled(TamaguiTabs.Tab, {
  name: 'MpTabsTab',
  unstyled: true,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  borderWidth: 0,
  cursor: 'pointer',
  zIndex: 1,
  // Rest and mouse-focus paint no ring. Keyboard ring is applied
  // per-item via keyboardFocusRingProps when wasKeyboardFocus().
  outlineWidth: 0,
  outlineStyle: 'none' as const,
  focusStyle: { outlineWidth: 0, outlineStyle: 'none' as const },
  focusVisibleStyle: { outlineWidth: 0, outlineStyle: 'none' as const },
});

const UnderlineIndicator = styled(View, {
  name: 'MpTabsUnderline',
  position: 'absolute',
  bottom: 0,
  height: 2,
  // Token scale (design-audit): 0, not a 1px radius that isn't a stop.
  // A 2px selection mark is a rectangle sitting on the G10 hairline.
  borderRadius: 0,
  backgroundColor: '$color9',
});

// Selected fill: accent-tinted thumb, never a border on every tab.
// Neutral `$background` thumbs were indistinguishable from hover; selection
// is the accent language (as in ViewSwitcher).
const ThumbIndicator = styled(View, {
  name: 'MpTabsThumb',
  position: 'absolute',
  zIndex: 0,
});

const TabLabel = styled(Text, {
  name: 'MpTabsLabel',
  numberOfLines: 1,
  userSelect: 'none',

  variants: {
    active: {
      true: { fontWeight: '700' },
    },
  } as const,
});

// ── Tabs Component ────────────────────────────────────────────

type ResolvedKnobs = ReturnType<typeof useResolvedKnobs>;
type RadiusToken = string | number | undefined;
type TabBackground = ComponentProps<typeof View>['backgroundColor'];
type TabLabelColor = ComponentProps<typeof TabLabel>['color'];

const initialTabValue = (defaultValue: string | undefined, items: TabsItem[]) => defaultValue ?? items[0]?.value ?? '';

const INTENT_ORDER = ['accent', 'error', 'warning', 'success'] as const;

const resolveIntent = (flags: Record<(typeof INTENT_ORDER)[number], boolean | undefined>) =>
  INTENT_ORDER.find((name) => flags[name] === true);

const LAYOUT_KEYS = ['x', 'y', 'width', 'height'] as const;

const sameLayout = (prev: TabLayout & { value: string }, layout: TabLayout, tabValue: string) =>
  prev.value === tabValue && LAYOUT_KEYS.every((key) => prev[key] === layout[key]);

const nextEnabledIndex = (key: string, current: number, count: number, step: number, loop: boolean) => {
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return count - 1;
  }
  if (loop) {
    return (current + step + count) % count;
  }
  return Math.max(0, Math.min(count - 1, current + step));
};

interface TabNavigation {
  items: TabsItem[];
  disabled: boolean;
  direction: TabsDirection;
  loop: boolean;
  tabRefs: React.RefObject<Map<string, HTMLElement>>;
}

const focusAdjacentTab = (event: React.KeyboardEvent, tabValue: string, nav: TabNavigation) => {
  if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return;
  }
  const enabled = nav.items.filter((item) => !nav.disabled && !item.disabled);
  if (!enabled.length) {
    return;
  }
  const current = enabled.findIndex((item) => item.value === tabValue);
  const step = (event.key === 'ArrowRight' ? 1 : -1) * (nav.direction === 'rtl' ? -1 : 1);
  const next = nextEnabledIndex(event.key, current, enabled.length, step, nav.loop);
  event.preventDefault();
  event.stopPropagation();
  nav.tabRefs.current.get(enabled[next].value)?.focus();
};

// Web-only edge fades: a scroll-state mask keeps the fade background-agnostic
const edgeFadeMask = (fades: { left: boolean; right: boolean }): Record<string, string> | undefined => {
  if (!isWeb || !(fades.left || fades.right)) {
    return undefined;
  }
  const leftStop = fades.left ? 'transparent 0px, black 32px' : 'black 0px';
  const rightStop = fades.right ? 'black calc(100% - 32px), transparent 100%' : 'black 100%';
  const mask = `linear-gradient(to right, ${leftStop}, ${rightStop})`;
  return { maskImage: mask, WebkitMaskImage: mask };
};

// Roving tabindex (single tab stop): tamagui's vendored roving-focus item
// hardcodes tabIndex=0 on every tab, making each tab its own Tab stop. Exactly
// one tab stays in the page tab order — the focused one while focus is in the
// tablist, else the active one (or the first, when value matches nothing);
// ArrowLeft/Right move within the tablist.
const resolveTabStopIndex = (items: TabsItem[], disabled: boolean, focusValue: string | null, currentValue: string) => {
  const isEnabled = (item: TabsItem) => !(disabled || item.disabled);
  const hasEnabled = (candidate: string | null) =>
    candidate !== null && items.some((item) => item.value === candidate && isEnabled(item));
  if (hasEnabled(focusValue)) {
    return items.findIndex((item) => item.value === focusValue);
  }
  if (hasEnabled(currentValue)) {
    return items.findIndex((item) => item.value === currentValue);
  }
  return items.findIndex(isEnabled);
};

const clearIfSame = (prev: string | null, tabValue: string) => (prev === tabValue ? null : prev);

const useTabInteractionState = () => {
  // Tab value currently showing the manual keyboard focus ring (see tracker note)
  const [kbFocusValue, setKbFocusValue] = React.useState<string | null>(null);
  const [focusValue, setFocusValue] = React.useState<string | null>(null);
  const [hoverValue, setHoverValue] = React.useState<string | null>(null);
  const [pressValue, setPressValue] = React.useState<string | null>(null);
  return {
    kbFocusValue,
    focusValue,
    hoverValue,
    pressValue,
    handleFocusTab: (tabValue: string) => {
      setFocusValue(tabValue);
      if (wasKeyboardFocus()) {
        setKbFocusValue(tabValue);
      }
    },
    handleBlurTab: (tabValue: string) => {
      setFocusValue((prev) => clearIfSame(prev, tabValue));
      setKbFocusValue((prev) => clearIfSame(prev, tabValue));
    },
    handleHoverTab: (tabValue: string) => {
      setHoverValue(tabValue);
    },
    handleUnhoverTab: (tabValue: string) => {
      setHoverValue((prev) => clearIfSame(prev, tabValue));
    },
    handlePressTab: (tabValue: string) => {
      setPressValue(tabValue);
    },
    handleReleaseTab: (tabValue: string) => {
      setPressValue((prev) => clearIfSame(prev, tabValue));
    },
  };
};

const useTabStripScroll = (
  currentValue: string,
  direction: TabsDirection,
  tabRefs: React.RefObject<Map<string, HTMLElement>>,
) => {
  // Active tab layout (relative to the list) for the sliding indicator
  const [activeLayout, setActiveLayout] = React.useState<(TabLayout & { value: string }) | null>(null);
  const handleInteraction = (tabValue: string, type: string, layout: TabLayout | null) => {
    if (type !== 'select' || !layout || tabValue !== currentValue) {
      return;
    }
    setActiveLayout((prev) => (prev && sameLayout(prev, layout, tabValue) ? prev : { ...layout, value: tabValue }));
  };

  // Overflow tracking for edge fades + keep-active-visible scrolling
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollMetrics = React.useRef({ offset: 0, viewport: 0, content: 0 });
  const [sizeRevision, setSizeRevision] = React.useState(0);
  const [fades, setFades] = React.useState({ left: false, right: false });
  const updateFades = () => {
    const { offset, viewport, content } = scrollMetrics.current;
    const next = tabsOverflowFades(offset, viewport, content, direction);
    setFades((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  };

  const updateScrollSize = (dimension: 'viewport' | 'content', extent: number) => {
    if (!Object.is(scrollMetrics.current[dimension], extent)) {
      scrollMetrics.current[dimension] = extent;
      if (isWeb) {
        const selected = tabRefs.current.get(currentValue);
        if (selected && selected.offsetWidth > 0 && selected.offsetHeight > 0) {
          handleInteraction(currentValue, 'select', {
            x: selected.offsetLeft,
            y: selected.offsetTop,
            width: selected.offsetWidth,
            height: selected.offsetHeight,
          });
        }
      }
      setSizeRevision((current) => current + 1);
    }
    updateFades();
  };

  // Scroll the newly active tab into view when it is clipped
  React.useEffect(() => {
    if (!activeLayout || activeLayout.value !== currentValue) {
      return;
    }
    const { offset, viewport, content } = scrollMetrics.current;
    const target = tabsScrollIntoViewX(activeLayout, offset, viewport, content, direction);
    if (target !== undefined && Math.abs(target - offset) >= 1) {
      scrollRef.current?.scrollTo({ x: target, animated: true });
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- sizeRevision is a deliberate re-run trigger: scrollMetrics is a ref, so size changes are only visible through it
  }, [activeLayout, currentValue, direction, sizeRevision]);

  return {
    activeLayout,
    handleInteraction,
    scrollRef,
    fades,
    handleScroll: (offset: number) => {
      scrollMetrics.current.offset = offset;
      updateFades();
    },
    handleViewportChange: (width: number) => {
      updateScrollSize('viewport', width);
    },
    handleContentChange: (width: number) => {
      updateScrollSize('content', width);
    },
  };
};

interface TabIndicatorProps {
  activeLayout: (TabLayout & { value: string }) | null;
  isBand: boolean;
  isUnderline: boolean;
  indicatorTheme: ThemeName;
  knobProps: ResolvedKnobs['knobProps'];
  selectedTint: string | undefined;
  thumbRadius: ReturnType<typeof stackRadiusProps> | undefined;
}

const TabIndicator = ({
  activeLayout,
  isBand,
  isUnderline,
  indicatorTheme,
  knobProps,
  selectedTint,
  thumbRadius,
}: TabIndicatorProps) => {
  if (!activeLayout || isBand) {
    return null;
  }
  const { transition } = knobProps;
  if (isUnderline) {
    return (
      <Theme name={indicatorTheme}>
        <UnderlineIndicator
          x={activeLayout.x}
          width={activeLayout.width}
          data-tabs-indicator="underline"
          {...transitionProps(transition)}
        />
      </Theme>
    );
  }
  return (
    <Theme name={indicatorTheme}>
      <ThumbIndicator
        x={activeLayout.x}
        y={activeLayout.y}
        width={activeLayout.width}
        height={activeLayout.height}
        backgroundColor={selectedTint ?? '$color4'}
        data-tabs-indicator="thumb"
        {...thumbRadius}
        {...(knobProps.elevation === undefined ? undefined : { elevation: knobProps.elevation })}
        {...transitionProps(transition)}
      />
    </Theme>
  );
};

interface TabPanelsProps {
  items: TabsItem[];
  currentValue: string;
  lazyMount: boolean;
  visited: ReadonlySet<string>;
  fill: boolean;
  panelPadding: ResolvedKnobs['knobProps']['panelPadding'];
}

const TabPanels = ({ items, currentValue, lazyMount, visited, fill, panelPadding }: TabPanelsProps) => (
  <>
    {items.map((item) => {
      if (item.content === undefined || (lazyMount && !visited.has(item.value))) {
        return null;
      }
      const lazyProps = lazyMount
        ? { forceMount: true as const, display: item.value === currentValue ? ('flex' as const) : ('none' as const) }
        : undefined;
      return (
        <TamaguiTabs.Content
          key={item.value}
          value={item.value}
          {...lazyProps}
          {...(fill ? fillProps : undefined)}
          {...panelPadding}
          tabIndex={-1}
          outlineWidth={0}
          focusStyle={{ outlineWidth: 0 }}
          focusVisibleStyle={{ outlineWidth: 0 }}>
          {item.content}
        </TamaguiTabs.Content>
      );
    })}
  </>
);

const pickFeedbackBackground = (
  tabValue: string,
  pressValue: string | null,
  hoverValue: string | null,
): TabBackground => {
  if (pressValue === tabValue) {
    return componentColors.interactive.hover;
  }
  return hoverValue === tabValue ? componentColors.interactive.background : 'transparent';
};

const pickTriggerBackground = (
  isBand: boolean,
  isActive: boolean,
  isDisabled: boolean,
  feedbackBackground: TabBackground,
): TabBackground => {
  if (!isBand) {
    return 'transparent';
  }
  if (isActive) {
    return componentColors.surface.background;
  }
  return isDisabled ? 'transparent' : feedbackBackground;
};

const pickLabelColor = (
  isDisabled: boolean,
  isActive: boolean,
  contained: boolean,
  onSelectedTint: string | undefined,
  knobProps: ResolvedKnobs['knobProps'],
  disabledState: ResolvedKnobs['disabledState'],
): TabLabelColor => {
  if (isDisabled) {
    return disabledState.textKnobProps.color;
  }
  if (!isActive) {
    return knobProps.textAccentColor;
  }
  return contained && onSelectedTint != null && onSelectedTint !== '' ? onSelectedTint : componentColors.text.primary;
};

const pickDisabledChrome = (isDisabled: boolean, isActive: boolean, disabledState: ResolvedKnobs['disabledState']) => {
  if (!isDisabled) {
    return {};
  }
  return isActive
    ? disabledState.chromeKnobProps
    : { ...disabledState.chromeKnobProps, ...disabledState.textKnobProps };
};

interface TabItemChromeProps {
  item: TabsItem;
  variant: TabsVariant;
  equalDistribution: boolean;
  isActive: boolean;
  isDisabled: boolean;
  kbRing: boolean;
  feedbackBackground: TabBackground;
  cornerProps: ReturnType<typeof stackRadiusProps> | ReturnType<typeof underlineStackRadius>;
  onSelectedTint: string | undefined;
  knobProps: ResolvedKnobs['knobProps'];
  disabledState: ResolvedKnobs['disabledState'];
}

const TabItemChrome = ({
  item,
  variant,
  equalDistribution,
  isActive,
  isDisabled,
  kbRing,
  feedbackBackground,
  cornerProps,
  onSelectedTint,
  knobProps,
  disabledState,
}: TabItemChromeProps) => {
  const isBand = variant === 'band';
  const innerBackground = isBand || isActive || isDisabled ? 'transparent' : feedbackBackground;
  return (
    <View
      {...(isBand ? undefined : cornerProps)}
      // ONE chrome owner: the full control recipe
      // (height/paddingHorizontal/gap) lives on this inner row —
      // it also paints hover/press fill, so the pill covers the
      // padded box. The Trigger stays an unpainted hit target
      // (spreading the recipe there too doubled the horizontal
      // padding).
      {...knobProps.control}
      // Band columns share width; a minimal inset keeps labels off the edges.
      paddingHorizontal={isBand ? '$1' : knobProps.control.paddingHorizontal}
      alignSelf="stretch"
      flexGrow={equalDistribution ? 1 : undefined}
      flexShrink={equalDistribution ? 1 : undefined}
      flexBasis={equalDistribution ? 0 : undefined}
      minWidth={0}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      backgroundColor={innerBackground}
      {...(kbRing ? keyboardFocusRingProps : undefined)}>
      {item.icon}
      <TabLabel
        active={isActive}
        flexShrink={1}
        minWidth={0}
        {...knobProps.controlType}
        fontFamily={knobProps.label.fontFamily}
        fontWeight={!isBand && isActive ? '700' : knobProps.label.fontWeight}
        color={pickLabelColor(isDisabled, isActive, variant === 'contained', onSelectedTint, knobProps, disabledState)}>
        {wrapBareTextChildren(item.label, (label) => label)}
      </TabLabel>
      {item.badge}
    </View>
  );
};

interface TabItemTriggerProps {
  item: TabsItem;
  itemIndex: number;
  itemCount: number;
  variant: TabsVariant;
  equalDistribution: boolean;
  isActive: boolean;
  isDisabled: boolean;
  isTabStop: boolean;
  kbRing: boolean;
  feedbackBackground: TabBackground;
  radiusToken: RadiusToken;
  outerRadiusToken: RadiusToken;
  tabHitSlop: ReturnType<typeof pressTargetHitSlop>;
  onSelectedTint: string | undefined;
  knobProps: ResolvedKnobs['knobProps'];
  disabledState: ResolvedKnobs['disabledState'];
  tabRefs: React.RefObject<Map<string, HTMLElement>>;
  onKeyDown: (event: React.KeyboardEvent, tabValue: string) => void;
  onInteraction: (tabValue: string, type: string, layout: TabLayout | null) => void;
  onFocusTab: (tabValue: string) => void;
  onBlurTab: (tabValue: string) => void;
  onHoverTab: (tabValue: string) => void;
  onUnhoverTab: (tabValue: string) => void;
  onPressTab: (tabValue: string) => void;
  onReleaseTab: (tabValue: string) => void;
}

const TabItemTrigger = ({
  item,
  itemIndex,
  itemCount,
  variant,
  equalDistribution,
  isActive,
  isDisabled,
  isTabStop,
  kbRing,
  feedbackBackground,
  radiusToken,
  outerRadiusToken,
  tabHitSlop,
  onSelectedTint,
  knobProps,
  disabledState,
  tabRefs,
  onKeyDown,
  onInteraction,
  onFocusTab,
  onBlurTab,
  onHoverTab,
  onUnhoverTab,
  onPressTab,
  onReleaseTab,
}: TabItemTriggerProps) => {
  const isUnderline = variant === 'underline';
  const isBand = variant === 'band';
  const position = getGroupPosition(itemIndex, itemCount);
  const cornerProps = isUnderline
    ? underlineStackRadius(position, radiusToken)
    : stackRadiusProps(position, outerRadiusToken, 'horizontal');
  const nativeLabel = isBareTextChild(item.label) ? String(item.label) : undefined;
  return (
    <Trigger
      value={item.value}
      ref={(node) => {
        if (!isWeb) {
          return;
        }
        if (node instanceof HTMLElement) {
          tabRefs.current.set(item.value, node);
        } else {
          tabRefs.current.delete(item.value);
        }
      }}
      flex={equalDistribution ? 1 : undefined}
      minWidth={0}
      minHeight={equalDistribution ? MIN_PRESS_TARGET : undefined}
      borderEndWidth={isBand && itemIndex < itemCount - 1 ? 1 : 0}
      borderColor={isBand ? componentColors.surface.border : undefined}
      disabled={isDisabled}
      // oxlint-disable-next-line sonarjs/no-undefined-assignment -- an explicit undefined must override the aria-controls tamagui computes for a tab with no panel
      {...(item.content === undefined ? { 'aria-controls': undefined } : undefined)}
      data-tab-position={position}
      data-kb-ring={kbRing ? 'true' : undefined}
      {...(isWeb
        ? {
            tabIndex: isDisabled || !isTabStop ? -1 : 0,
            'aria-label': item.accessibilityLabel,
            onKeyDownCapture: (event: React.KeyboardEvent) => {
              onKeyDown(event, item.value);
            },
          }
        : {
            accessible: true,
            role: 'button' as const,
            accessibilityRole: 'button' as const,
            accessibilityLabel: item.accessibilityLabel ?? nativeLabel,
            accessibilityState: { selected: isActive, disabled: isDisabled },
          })}
      hitSlop={tabHitSlop}
      onInteraction={(type, layout) => {
        onInteraction(item.value, type, layout);
      }}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      backgroundColor={pickTriggerBackground(isBand, isActive, isDisabled, feedbackBackground)}
      borderRadius={0}
      {...pickDisabledChrome(isDisabled, isActive, disabledState)}
      {...(isWeb
        ? {
            onFocusCapture: () => {
              onFocusTab(item.value);
            },
            onBlurCapture: () => {
              onBlurTab(item.value);
            },
            onPointerEnter: () => {
              onHoverTab(item.value);
            },
            onPointerLeave: () => {
              onUnhoverTab(item.value);
            },
            onPointerDown: () => {
              onPressTab(item.value);
            },
            onPointerUp: () => {
              onReleaseTab(item.value);
            },
          }
        : undefined)}>
      <TabItemChrome
        item={item}
        variant={variant}
        equalDistribution={equalDistribution}
        isActive={isActive}
        isDisabled={isDisabled}
        kbRing={kbRing}
        feedbackBackground={feedbackBackground}
        cornerProps={cornerProps}
        onSelectedTint={onSelectedTint}
        knobProps={knobProps}
        disabledState={disabledState}
      />
    </Trigger>
  );
};

interface TabStripProps {
  tabList: ReactNode;
  variant: TabsVariant;
  equalDistribution: boolean;
  fades: { left: boolean; right: boolean };
  scrollRef: React.RefObject<ScrollView | null>;
  slop: number;
  onScrollOffset: (offset: number) => void;
  onViewportChange: (width: number) => void;
  onContentChange: (width: number) => void;
}

const TabStrip = ({
  tabList,
  variant,
  equalDistribution,
  fades,
  scrollRef,
  slop,
  onScrollOffset,
  onViewportChange,
  onContentChange,
}: TabStripProps) => {
  const isBand = variant === 'band';
  const isUnderline = variant === 'underline';
  const maskStyle = edgeFadeMask(fades);
  return (
    <StripWrapper
      backgroundColor={isBand ? '$color2' : undefined}
      borderBottomWidth={isBand ? 1 : undefined}
      borderBottomColor={isBand ? componentColors.surface.border : undefined}
      {...(isUnderline ? { ...hairline.bottom, borderColor: componentColors.surface.border } : undefined)}
      data-fade-left={fades.left ? 'true' : undefined}
      data-fade-right={fades.right ? 'true' : undefined}>
      {equalDistribution ? (
        <View
          alignSelf="stretch"
          minWidth={0}>
          {tabList}
        </View>
      ) : (
        <TabStripScroll
          ref={scrollRef}
          data-tabs-scroll="true"
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          style={maskStyle}
          // Slop padding keeps the 44px press floor from being clipped when
          // the painted tab is smaller than the floor (nested scale).
          contentContainerStyle={{ paddingVertical: slop }}
          marginVertical={-slop}
          onScroll={(e) => {
            onScrollOffset(e.nativeEvent.contentOffset.x);
          }}
          onLayout={(e) => {
            onViewportChange(e.nativeEvent.layout.width);
          }}
          onContentSizeChange={(width) => {
            onContentChange(width);
          }}>
          {tabList}
        </TabStripScroll>
      )}
    </StripWrapper>
  );
};

interface TabListFrameProps {
  children: ReactNode;
  loop: boolean;
  ariaLabel: string;
  variant: TabsVariant;
  equalDistribution: boolean;
  visualSizeToken: string;
  sizePx: number;
  knobProps: ResolvedKnobs['knobProps'];
}

const TabListFrame = ({
  children,
  loop,
  ariaLabel,
  variant,
  equalDistribution,
  visualSizeToken,
  sizePx,
  knobProps,
}: TabListFrameProps) => {
  const isUnderline = variant === 'underline';
  const isBand = variant === 'band';
  return (
    <TabsList
      loop={loop}
      aria-label={ariaLabel}
      data-tabs-list={variant}
      data-size-token={visualSizeToken}
      data-density={knobProps.density}
      data-visual-px={sizePx}
      {...(isWeb ? undefined : { role: 'tablist' as const })}
      alignSelf={equalDistribution ? 'stretch' : 'flex-start'}
      minWidth={0}
      contained={!isUnderline && !isBand}
      {...(isUnderline || isBand
        ? { gap: 0 }
        : {
            backgroundColor: componentColors.interactive.background,
            gap: 0,
            // Full fragment spread (AGENTS.md knob rule) so the
            // cornerSmoothing class rides along with the radius.
            ...knobProps.borderRadiusNested,
          })}>
      {children}
    </TabsList>
  );
};

const TabsRoot = ({
  items,
  value,
  defaultValue,
  onChange,
  variant = 'underline',
  distribution = 'content',
  accent,
  error,
  warning,
  success,
  size,
  compact,
  lazyMount,
  fill,
  activationMode = 'automatic',
  loop = true,
  disabled,
  ariaLabel,
}: TabsProps) => {
  const { t } = useTranslation();
  const direction = useDirection();
  const intent = resolveIntent({ accent, error, warning, success });
  // Size and density are independent axes: `size` pins height/type;
  // `compact` still steps spacing (and the default size when `size` is omitted).
  const { knobProps, disabledState } = useResolvedKnobs({
    intent,
    component: 'Tabs',
    size,
    compact,
  });
  const selectedTint = useAccentTintedSurface();
  const onSelectedTint = useReadableTextOn(selectedTint);

  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const interaction = useTabInteractionState();

  const [internalValue, setInternalValue] = React.useState(() => initialTabValue(defaultValue, items));
  const currentValue = value ?? internalValue;

  const [visited, setVisited] = React.useState<ReadonlySet<string>>(() => new Set(currentValue ? [currentValue] : []));
  React.useEffect(() => {
    if (!currentValue) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- tracks visited panels after commit; deriving it during render would mount lazy panels a pass earlier than before
    setVisited((prev) => {
      if (prev.has(currentValue)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(currentValue);
      return next;
    });
  }, [currentValue]);

  const handleChange = (next: string) => {
    if (value === undefined) {
      setInternalValue(next);
    }
    onChange?.(next);
  };

  const tabRefs = React.useRef(new Map<string, HTMLElement>());
  const strip = useTabStripScroll(currentValue, direction, tabRefs);
  const { scrollRef } = strip;

  const isUnderline = variant === 'underline';
  const isBand = variant === 'band';
  const equalDistribution = isBand || distribution === 'equal';
  const onTabKeyDown = (event: React.KeyboardEvent, tabValue: string) => {
    focusAdjacentTab(event, tabValue, { items, disabled: disabled === true, direction, loop, tabRefs });
  };
  // SAFETY: intent is one of 'accent' | 'error' | 'warning' | 'success', each a registered theme name
  const indicatorTheme = (intent ?? 'accent') as ThemeName;
  // Size recipe owns chrome. Explicit `size` already flowed into
  // knobProps via useResolvedKnobs. Compact tightens gaps only.
  // Press floor is hitSlop, never painted minHeight.
  const visualSizeToken = size ?? knobProps.sizeToken;
  const sizePx = knobProps.control.height;
  const slop = Math.max(0, Math.ceil((MIN_PRESS_TARGET - sizePx) / 2));
  const tabHitSlop = pressTargetHitSlop(sizePx);
  const radiusToken = knobProps.borderRadius.borderRadius;
  const outerRadiusToken = knobProps.borderRadiusNested.borderRadius;
  const enabledCount = items.length;
  const activeIndex = items.findIndex((i) => i.value === currentValue);
  const activePosition = getGroupPosition(Math.max(0, activeIndex), enabledCount);
  const thumbRadius = isUnderline ? undefined : stackRadiusProps(activePosition, outerRadiusToken, 'horizontal');
  const { fades } = strip;

  if (items.length === 0) {
    return null;
  }

  const tabStopIndex = resolveTabStopIndex(items, disabled === true, interaction.focusValue, currentValue);
  const tabList = (
    <TabListFrame
      loop={loop}
      ariaLabel={ariaLabel ?? t('Tabs')}
      variant={variant}
      equalDistribution={equalDistribution}
      visualSizeToken={visualSizeToken}
      sizePx={sizePx}
      knobProps={knobProps}>
      <TabIndicator
        activeLayout={strip.activeLayout}
        isBand={isBand}
        isUnderline={isUnderline}
        indicatorTheme={indicatorTheme}
        knobProps={knobProps}
        selectedTint={selectedTint}
        thumbRadius={thumbRadius}
      />
      {items.map((item, itemIndex) => (
        <TabItemTrigger
          key={item.value}
          item={item}
          itemIndex={itemIndex}
          itemCount={enabledCount}
          variant={variant}
          equalDistribution={equalDistribution}
          isActive={item.value === currentValue}
          isDisabled={disabled === true || item.disabled === true}
          isTabStop={itemIndex === tabStopIndex}
          kbRing={interaction.kbFocusValue === item.value}
          feedbackBackground={pickFeedbackBackground(item.value, interaction.pressValue, interaction.hoverValue)}
          radiusToken={radiusToken}
          outerRadiusToken={outerRadiusToken}
          tabHitSlop={tabHitSlop}
          onSelectedTint={onSelectedTint}
          knobProps={knobProps}
          disabledState={disabledState}
          tabRefs={tabRefs}
          onKeyDown={onTabKeyDown}
          onInteraction={strip.handleInteraction}
          onFocusTab={interaction.handleFocusTab}
          onBlurTab={interaction.handleBlurTab}
          onHoverTab={interaction.handleHoverTab}
          onUnhoverTab={interaction.handleUnhoverTab}
          onPressTab={interaction.handlePressTab}
          onReleaseTab={interaction.handleReleaseTab}
        />
      ))}
    </TabListFrame>
  );

  return (
    <TamaguiTabs
      value={currentValue}
      onValueChange={handleChange}
      orientation="horizontal"
      activationMode={activationMode}
      width={equalDistribution ? '100%' : undefined}
      alignSelf="stretch"
      minWidth={0}
      flexDirection="column"
      // The root is the first link in the chain a filling panel needs.
      // `flex: 1` alone is not enough — without `minHeight: 0` the column
      // refuses to shrink below its content and the panel never gets a box.
      {...(fill ? fillProps : undefined)}
      data-tabs-variant={variant}
      data-tabs-distribution={equalDistribution ? 'equal' : 'content'}
      data-tabs-fill={fill ? 'true' : undefined}
      data-tabs-dir={direction}
      data-size-token={visualSizeToken}
      data-density={knobProps.density}
      data-visual-px={sizePx}>
      <TabStrip
        tabList={tabList}
        variant={variant}
        equalDistribution={equalDistribution}
        fades={fades}
        scrollRef={scrollRef}
        slop={slop}
        onScrollOffset={strip.handleScroll}
        onViewportChange={strip.handleViewportChange}
        onContentChange={strip.handleContentChange}
      />

      {/*
        The panel host. Under `fill` it is the second link in the chain: it
        grows into what the strip leaves and permits its own child to shrink.
      */}
      <YStack
        data-tabs-panels=""
        {...(fill ? fillProps : undefined)}>
        <TabPanels
          items={items}
          currentValue={currentValue}
          lazyMount={lazyMount === true}
          visited={visited}
          fill={fill === true}
          panelPadding={knobProps.panelPadding}
        />
      </YStack>
    </TamaguiTabs>
  );
};

TabsRoot.displayName = 'Tabs';

export const Tabs = withStaticProperties(TabsRoot, {
  List: TamaguiTabs.List,
  Tab: TamaguiTabs.Tab,
  Content: TamaguiTabs.Content,
});

export type TabsTriggerProps = GetProps<typeof Trigger>;

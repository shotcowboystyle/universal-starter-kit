/**
 * Layout tokens.
 *
 * Canonical size classes for layout decisions (pane count, nav mode, overlay
 * sheet vs float). Primitives consume these classes / helpers — not raw px in
 * call sites.
 *
 * ## Canonical choice (2026-08-12)
 *
 * Hybrid of shipped MP1 behavior + Material window-size naming:
 * - **Names** follow Material (compact → xl).
 * - **Numbers** prefer already-shipped thresholds:
 *   - `medium` @ 640 = Tamagui `$sm` / DeskShell narrow (Fluent sm) — and,
 *     the overlay sheet↔float pivot (see OVERLAY_BREAKPOINT).
 *   - `expanded` @ 860 = pane-budget class only (~Material 840). No Tamagui
 *     counterpart; Tamagui has no pane system, so this stays additive.
 *   - `large` / `xl` = Tamagui `$lg` / `$xl`.
 *
 * Fluent (480/640/1024/1366/1920) and Material (600/840/1200/1600) stay in the
 * compat table below for mapping — they are not second sources of truth.
 *
 * | Class     | Min px | Max panes (default) | Tamagui media | Notes                          |
 * |-----------|--------|---------------------|---------------|--------------------------------|
 * | compact   | 0      | 1                   | < `$sm`       | phones; drawer nav; sheets     |
 * | medium    | 640    | 1                   | `$sm`         | DeskShell rail; overlays float |
 * | expanded  | 860    | 2                   | — (custom)    | 2 panes                        |
 * | large     | 1024   | 2                   | `$lg`         |                                |
 * | xl        | 1280   | 2                   | `$xl`         |                                |
 *
 * Compat: Material compact≈our compact (600→640), expanded≈our expanded
 * (840→860). Fluent sm=640 matches medium; Fluent lg=1024 matches large.
 */

import { isTouchable, isWebTouchable } from '@repo/platform';
import { useSyncExternalStore } from 'react';
import { isWeb, useWindowDimensions } from 'tamagui';

import { useResolvedKnobs } from './useResolvedKnobs';

// ── Breakpoint tokens ─────────────────────────────────────────

export type LayoutSizeClass = 'compact' | 'medium' | 'expanded' | 'large' | 'xl';

/**
 * Named min-widths. Prefer these over literals in layout code.
 *
 * The four names below used to be the whole table, so a
 * responsive design authored in Tamagui idiom named three breakpoints this
 * layout code could not — `xs` 460, `md` 768 and `xxl` 1536 simply had no
 * spelling here. The 860 pane threshold has an argument behind it and stays;
 * the MISSING names had no argument at all, which is why they are added
 * unconditionally and the pivot question is not settled here.
 *
 * The Tamagui-named entries carry Tamagui's numbers, exactly. A shared name
 * meaning a different width is the failure this table is supposed to prevent.
 */
export const layoutBreakpoints = {
  /** Tamagui `$xxs`. Smallest phones. */
  xxs: 340,
  /** Tamagui `$xs`. */
  xs: 460,
  /**
   * End of compact / DeskShell narrow drawer threshold (Tamagui `$sm`).
   * Also the overlay sheet↔float pivot and the DataTable card↔grid pivot —
   * one idiom flip per viewport.
   */
  medium: 640,
  /**
   * Tamagui `$md` — the width `<Adapt when="maxMd">` pivots on. Whether the
   * overlay pivot should MOVE here from `medium`, and `expanded` be deleted,
   * is still an open question, so it is not decided here. Naming it costs nothing and is what lets that
   * question be asked in code.
   */
  md: 768,
  /** Two-pane budget threshold (~M3 expanded 840). Not an overlay pivot. */
  expanded: 860,
  /** Tamagui `$lg`. */
  large: 1024,
  /** Tamagui `$xl`. */
  xl: 1280,
  /** Tamagui `$xxl`. */
  xxl: 1536,
} as const;

export type LayoutBreakpointName = keyof typeof layoutBreakpoints;

/**
 * Overlay sheet↔float pivot for FloatingPanel / AdaptivePopup consumers.
 *
 * Was `layoutBreakpoints.expanded` (860, a custom threshold with
 * no Tamagui counterpart), which split the system in two — at 700px a
 * DataTable rendered its desktop grid while a Select in one of its cells
 * opened as a bottom sheet. Overlays now pivot where the table does:
 * `layoutBreakpoints.medium` (640, Tamagui v5 `$sm` — the same `media.sm`
 * key DataTableRoot reads), so every surface flips idiom at one width.
 */
export const OVERLAY_BREAKPOINT = layoutBreakpoints.medium;

/** DeskShell sidebar collapse — same value as `layoutBreakpoints.medium`. */
export const NARROW_BREAKPOINT = layoutBreakpoints.medium;

export const LAYOUT_SIZE_CLASS_ORDER: readonly LayoutSizeClass[] = [
  'compact',
  'medium',
  'expanded',
  'large',
  'xl',
] as const;

/** Resolve a viewport width to the canonical layout size class. */
export function getLayoutSizeClass(width: number): LayoutSizeClass {
  if (width >= layoutBreakpoints.xl) {
    return 'xl';
  }
  if (width >= layoutBreakpoints.large) {
    return 'large';
  }
  if (width >= layoutBreakpoints.expanded) {
    return 'expanded';
  }
  if (width >= layoutBreakpoints.medium) {
    return 'medium';
  }
  return 'compact';
}

/** Default horizontal pane budget by size class (Material PaneScaffoldDirective). */
export function defaultMaxPanes(sizeClass: LayoutSizeClass): 1 | 2 {
  return sizeClass === 'compact' || sizeClass === 'medium' ? 1 : 2;
}

export function layoutSizeClassAtLeast(current: LayoutSizeClass, minimum: LayoutSizeClass): boolean {
  return LAYOUT_SIZE_CLASS_ORDER.indexOf(current) >= LAYOUT_SIZE_CLASS_ORDER.indexOf(minimum);
}

/** Web viewport width with an SSR fallback (`medium`). Web-only callers. */
function readViewportWidth(): number {
  if (typeof window === 'undefined') {
    return layoutBreakpoints.medium;
  }
  return window.innerWidth;
}

function subscribeViewportSizeClass(onChange: () => void): () => void {
  if (!isWeb || typeof window === 'undefined') {
    return () => {};
  }
  const queries = [
    layoutBreakpoints.xl,
    layoutBreakpoints.large,
    layoutBreakpoints.expanded,
    layoutBreakpoints.medium,
  ].map((width) => window.matchMedia(`(min-width: ${width}px)`));
  for (const mq of queries) {
    mq.addEventListener('change', onChange);
  }
  return () => {
    for (const mq of queries) {
      mq.removeEventListener('change', onChange);
    }
  };
}

function viewportSizeClass(): LayoutSizeClass {
  return getLayoutSizeClass(readViewportWidth());
}

function serverViewportSizeClass(): LayoutSizeClass {
  return getLayoutSizeClass(layoutBreakpoints.medium);
}

/**
 * Live layout size class from viewport width — cross-platform:
 * - Web: matchMedia listeners on the class thresholds (re-renders only when
 *   the class flips, not per resize pixel). The server renders `medium`, and
 *   so does the hydration render: a first client render at the
 *   viewport's class would not match the server HTML, so React adopts the
 *   live class right after hydrating. A client-only mount reads the viewport
 *   on its first render.
 * - Native: react-native window dimensions (rotation / split-screen), so
 *   phones report `compact` from the first render.
 */
export function useLayoutSizeClass(): LayoutSizeClass {
  const nativeWidth = useWindowDimensions().width;
  const webSizeClass = useSyncExternalStore(subscribeViewportSizeClass, viewportSizeClass, serverViewportSizeClass);
  return isWeb ? webSizeClass : getLayoutSizeClass(nativeWidth);
}

/** True when the viewport may show two side-by-side panes. */
export function useMultiPane(maxPanes?: 1 | 2): boolean {
  const sizeClass = useLayoutSizeClass();
  const budget = maxPanes ?? defaultMaxPanes(sizeClass);
  return budget >= 2 && defaultMaxPanes(sizeClass) >= 2;
}

// ── Reading width ─────────────────────────────────────────────

/** Ideal prose measure (mid of GOV.UK ≤75 / USWDS ~66). */
export const READING_WIDTH_CH = 70;
export const READING_WIDTH_MIN_CH = 65;
export const READING_WIDTH_MAX_CH = 75;

export interface ReadingWidthStyle {
  maxWidth: string;
  width: '100%';
}

/** Style props for prose / long-form columns. Pass `null`/`"none"` to eject. */
export function readingWidthStyle(
  measure: number | 'none' | null = READING_WIDTH_CH,
): ReadingWidthStyle | Record<string, never> {
  if (measure === 'none' || measure === null) {
    return {};
  }
  const ch = Math.min(READING_WIDTH_MAX_CH, Math.max(READING_WIDTH_MIN_CH, measure));
  return { maxWidth: `${ch}ch`, width: '100%' };
}

// ── Min press target ──────────────────────────────────────────

/** Platform floor for interactive targets (Fluent/HIG web+iOS 44; M3 48 on Android). */
export const MIN_PRESS_TARGET = 44;

/** Touch surfaces — native touchable or web touchable. */
export function isTouchSurface(): boolean {
  return isTouchable || isWebTouchable;
}

export interface PressTargetStyle {
  minWidth: number;
  minHeight: number;
}

export function pressTargetStyle(size: number = MIN_PRESS_TARGET): PressTargetStyle {
  return { minWidth: size, minHeight: size };
}

export interface HitSlopInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Expand hit area when the visual control is smaller than the floor. */
export function pressTargetHitSlop(visualSize: number, min: number = MIN_PRESS_TARGET): HitSlopInsets {
  const pad = Math.max(0, Math.ceil((min - visualSize) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

// ── Overlay anchoring (house rule) ────────────────────────────────────────

/**
 * House convention for every anchored overlay (Select/Combobox listboxes,
 * DropdownMenu, Popover, Tooltip, FloatingPanel):
 *
 * - Anchored MENUS and SELECT LISTBOXES match the trigger width EXACTLY
 *   (min-width = trigger width — no oversize fudge). They may grow only
 *   wider when option content genuinely overflows, never narrower, and
 *   stay start-aligned (flush with the trigger's leading edge).
 * - Pointer-positioned CONTEXT MENUS and free POPOVERS/TOOLTIPS size to
 *   content, start-aligned to their anchor.
 * - FREE overlays (tooltips, pointer-positioned context menus, popovers with
 *   no owning control) keep `OVERLAY_ANCHOR_GAP` px between anchor edge and
 *   overlay, and shift/flip at viewport edges instead of overflowing.
 * - ONE SURFACE OWNER per overlay: the overlay frame draws the single
 *   border + radius. When a panel intentionally covers its trigger
 *   (Select's macOS-style aligned listbox), the covered trigger must not
 *   paint focus decorations — a focus ring outside the trigger's border
 *   box would ghost around the overlay's corners as a doubled edge.
 */
export const OVERLAY_ANCHOR_GAP = 4;

/**
 * FloatingPanel ruling: COVER is the defining
 * behaviour of the FloatingPanel family: a panel attaches to the trigger it
 * was opened from and does not float clear of it. Floating 4px below is the
 * EXCEPTION, not the rule, and no member takes it unless explicitly ruled in.
 *
 * So the family anchors at zero: the panel's top edge coincides with the
 * trigger's bottom edge (or, for the covering members — Select and
 * single-value Combobox — with the trigger's own top edge). `OVERLAY_ANCHOR_GAP`
 * stays 4 for FREE overlays, which have no trigger to attach to.
 *
 * Measured before this landed (playwright, 1440x900 DPR 2, real components):
 * DropdownMenu 3.96, DatePicker 4.00, TimePicker 4.00, ColorPicker 4.00 px of
 * daylight between trigger bottom and panel top.
 */
export const OVERLAY_ATTACH_GAP = 0;

// ── Semantic gaps ─────────────────────────────────────────────

/**
 * Semantic spacing roles map onto the space-knob recipes:
 * `within-group` → `knobProps.gap`, `between-groups` → `knobProps.gapLg`.
 */
export function useSemanticGaps(): {
  withinGroup: { gap: string };
  betweenGroups: { gap: string };
} {
  const { knobProps } = useResolvedKnobs();
  return {
    withinGroup: knobProps.gap,
    betweenGroups: knobProps.gapLg,
  };
}

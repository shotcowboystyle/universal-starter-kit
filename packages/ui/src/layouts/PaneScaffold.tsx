/**
 * PaneScaffold + canonical layouts.
 *
 * PaneScaffold is a TWO-pane scaffold: `primary` and `secondary`, no more.
 * Three regions come from NESTING one scaffold inside a pane of another. The
 * resolved size class rides a context down, so an inner scaffold reflows with
 * the outer one instead of splitting inside a stacked column.
 *
 * The seam runs on one axis. `orientation="horizontal"` (the default) puts the
 * panes side by side; `orientation="vertical"` puts `secondary` under
 * `primary` (a console under a source pane, an editor under a page). The sash,
 * its clamps, keyboard handling and the controlled-fraction contract are the
 * same code with the axis swapped; only the dimension it reads changes.
 *
 * Devs declare pane roles; the scaffold picks 1 vs 2 columns from the
 * canonical layout size class (`expanded` @ 860 = two-pane budget).
 *
 * Split geometry follows Linear / VS Code / Polaris Frame: flush panes, a
 * device-pixel hairline at the seam (Axiom 15), and an optional sash
 * (APG window splitter) instead of a semantic gap. `paneGap` ejects to
 * gapped columns (Polaris Layout).
 *
 * - **List-detail**: secondary (detail) is meaningful on its own.
 * - **Supporting-pane**: secondary is meaningful only relative to primary.
 * - **Feed**: equal-weight cards in a responsive grid.
 *
 * Below the two-pane budget the panes STACK (primary above secondary) and the
 * sash goes away — a drag handle is a pointer affordance and there is nothing
 * to drag with a thumb. Hiding a pane is the list-detail navigation idiom, not
 * the responsive default: pass `activePane` (or `narrowLayout="swap"`) for it.
 */

import {
  defaultMaxPanes,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  hairline,
  hairlineWidth,
  pressTargetHitSlop,
  readingWidthStyle,
  useLayoutSizeClass,
  useMultiPane,
  useSemanticGaps,
  wasKeyboardFocus,
  type LayoutSizeClass,
  READING_WIDTH_CH,
} from '@repo/theme';
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { XStackProps, YStackProps } from 'tamagui';
import { isWeb, XStack, YStack } from 'tamagui';

import { useDirection } from '../hooks/useDirection';

/** Visual sash hit (VS Code sash.size ≈ 4–8). Native expands to 44 via hitSlop. */
const SASH_VISUAL = 8;
const FRACTION_STEP = 0.02;
const FRACTION_STEP_LARGE = 0.1;
const DEFAULT_MIN_FRACTION = 0.2;
const DEFAULT_MAX_FRACTION = 0.8;

// ── PaneScaffold ──────────────────────────────────────────────────────────

export type PaneRole = 'primary' | 'secondary';
export type PaneOrientation = 'horizontal' | 'vertical';

export interface PaneScaffoldProps extends Omit<XStackProps, 'children'> {
  primary: ReactNode;
  secondary?: ReactNode;
  /**
   * Axis of the seam. `horizontal` (default) sets the panes side by side;
   * `vertical` docks `secondary` under `primary`. A vertical scaffold splits
   * the height its parent gives it, so the parent must be bounded.
   */
  orientation?: PaneOrientation;
  /**
   * Which pane to show when `narrowLayout` is `swap`. Default: `primary`.
   * List-detail on compact typically flips to `secondary` once an item is
   * selected. Passing this prop opts the scaffold into `swap`.
   */
  activePane?: PaneRole;
  /**
   * What happens below the two-pane budget. `stack` (the default) puts
   * secondary under primary so no content is unreachable; `swap` renders
   * `activePane` alone, which is the list-detail navigation idiom.
   */
  narrowLayout?: 'stack' | 'swap';
  /** Override the default pane budget (compact/medium → 1, expanded+ → 2). */
  maxPanes?: 1 | 2;
  /**
   * Flex grow for primary : secondary when side-by-side.
   * List-detail defaults to `[1, 2]`; supporting-pane to `[2, 1]`.
   */
  paneFlex?: [number, number];
  /**
   * Gap between panes. Default: none — a hairline sash (Linear / VS Code /
   * Polaris Frame). Pass a gap to eject to spaced columns (Polaris Layout).
   */
  paneGap?: XStackProps['gap'];
  /**
   * Drag-to-resize like VS Code / Linear. Default `true` when two panes and
   * `paneGap` is unset. Keyboard: arrows / Home / End; double-press resets.
   */
  resizable?: boolean;
  /** Clamp for the primary share (0–1). Default 0.2–0.8. */
  minPaneFraction?: number;
  maxPaneFraction?: number;
  /** Controlled primary share (0–1). Omit for uncontrolled (from `paneFlex`). */
  primaryFraction?: number;
  onPrimaryFractionChange?: (fraction: number) => void;
  /** Optional size-class override (tests / Storybook viewports). */
  sizeClass?: LayoutSizeClass;
}

/**
 * Resolved size class handed down to nested scaffolds. Without it an inner
 * scaffold reads the WINDOW while the outer one was overridden (Storybook
 * viewport, template test), so a stacked outer could still hold a split
 * inner and the narrow reflow would only go one level deep.
 */
const PaneSizeClassContext = createContext<LayoutSizeClass | null>(null);

/**
 * Adaptive one-/two-pane shell. Geometry only — surface colors stay stable
 * across breakpoints (Material M-L5).
 */
export function PaneScaffold({
  primary,
  secondary,
  orientation = 'horizontal',
  activePane: activePaneProp,
  narrowLayout: narrowLayoutProp,
  maxPanes: maxPanesProp,
  paneFlex = [1, 1],
  paneGap,
  resizable: resizableProp,
  minPaneFraction = DEFAULT_MIN_FRACTION,
  maxPaneFraction = DEFAULT_MAX_FRACTION,
  primaryFraction: primaryFractionProp,
  onPrimaryFractionChange,
  sizeClass: sizeClassProp,
  ...rest
}: PaneScaffoldProps) {
  const liveClass = useLayoutSizeClass();
  const inheritedClass = useContext(PaneSizeClassContext);
  const sizeClass = sizeClassProp ?? inheritedClass ?? liveClass;
  // Explicit `maxPanes` is the eject hatch (force 1 or 2 regardless of class).
  const budget = maxPanesProp ?? defaultMaxPanes(sizeClass);
  const hasSecondary = secondary !== null && secondary !== undefined;
  const split = budget >= 2 && hasSecondary;
  const gapped = paneGap !== undefined;
  const gap = gapped ? paneGap : undefined;
  const resizable = (resizableProp ?? !gapped) && split && !gapped;
  // `activePane` only decides anything when a pane is dropped, so passing it
  // IS the swap opt-in. Everything else stacks: a scaffold that hides its
  // secondary by default leaves that content unreachable on a phone.
  const narrowLayout = narrowLayoutProp ?? (activePaneProp === undefined ? 'stack' : 'swap');
  const stacked = !split && hasSecondary && narrowLayout === 'stack';
  const vertical = orientation === 'vertical';
  const [primaryFlex, secondaryFlex] = paneFlex;

  // flexBasis auto, not the flex:1 shorthand's 0%: react-native-web resets
  // min-height to 0, so a 0% basis contributes zero intrinsic height inside
  // auto-height scroll flows (Screen scroll pages) and the scaffold collapses,
  // painting pane content over whatever follows. Bounded parents still fill
  // (grow 1) exactly as before.
  let content: ReactNode;
  if (stacked) {
    content = (
      <YStack
        flexGrow={1}
        flexShrink={1}
        flexBasis="auto"
        minWidth={0}
        width="100%"
        gap={gap ?? 0}
        data-testid="pane-scaffold"
        data-panes="2"
        data-pane-layout="stack"
        data-orientation={orientation}
        data-size-class={sizeClass}
        data-sash="false"
        {...rest}>
        <YStack
          flexGrow={1}
          flexShrink={1}
          flexBasis="auto"
          minWidth={0}
          minHeight={0}
          width="100%"
          {...(gapped ? undefined : paneHairlineBottom)}
          data-testid="pane-primary">
          {primary}
        </YStack>
        <YStack
          flexGrow={1}
          flexShrink={1}
          flexBasis="auto"
          minWidth={0}
          minHeight={0}
          width="100%"
          data-testid="pane-secondary">
          {secondary}
        </YStack>
      </YStack>
    );
  } else if (!split) {
    const activePane = activePaneProp ?? 'primary';
    const shown = activePane === 'secondary' && hasSecondary ? secondary : primary;
    content = (
      <YStack
        flexGrow={1}
        flexShrink={1}
        flexBasis="auto"
        minWidth={0}
        width="100%"
        data-testid="pane-scaffold"
        data-panes="1"
        data-pane-layout="single"
        data-orientation={orientation}
        data-size-class={sizeClass}
        {...rest}>
        {shown}
      </YStack>
    );
  } else {
    content = (
      <XStack
        flexDirection={vertical ? 'column' : 'row'}
        flexGrow={1}
        flexShrink={1}
        flexBasis="auto"
        minWidth={0}
        minHeight={0}
        width="100%"
        alignItems="stretch"
        gap={gap ?? 0}
        position="relative"
        data-testid="pane-scaffold"
        data-panes="2"
        data-pane-layout="split"
        data-orientation={orientation}
        data-size-class={sizeClass}
        data-sash={resizable ? 'true' : 'false'}
        {...rest}>
        {resizable ? (
          <ResizablePanes
            vertical={vertical}
            primary={primary}
            secondary={secondary}
            primaryFlex={primaryFlex}
            secondaryFlex={secondaryFlex}
            minFraction={minPaneFraction}
            maxFraction={maxPaneFraction}
            fraction={primaryFractionProp}
            onFractionChange={onPrimaryFractionChange}
          />
        ) : (
          <>
            <YStack
              flex={primaryFlex}
              minWidth={0}
              minHeight={0}
              {...(gapped ? undefined : vertical ? paneHairlineBottom : paneHairlineEnd)}
              data-testid="pane-primary">
              {primary}
            </YStack>
            <YStack flex={secondaryFlex} minWidth={0} minHeight={0} data-testid="pane-secondary">
              {secondary}
            </YStack>
          </>
        )}
      </XStack>
    );
  }

  return <PaneSizeClassContext.Provider value={sizeClass}>{content}</PaneSizeClassContext.Provider>;
}

const paneHairlineEnd = isWeb
  ? {
      borderInlineEndWidth: hairlineWidth,
      borderInlineEndStyle: 'solid' as const,
      borderColor: '$borderColor',
      className: 'mp-hairline-ie',
    }
  : { borderEndWidth: hairlineWidth, borderColor: '$borderColor' };

/** Stacked seam: the horizontal twin of `paneHairlineEnd`. */
const paneHairlineBottom = { ...hairline.bottom, borderColor: '$borderColor' };

function clampFraction(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function axisSize(vertical: boolean, rect: { width?: number; height?: number } | null | undefined): number {
  return (vertical ? rect?.height : rect?.width) ?? 0;
}

function pointerPos(vertical: boolean, e: any): number {
  return vertical ? (e.clientY ?? e.nativeEvent?.pageY ?? 0) : (e.clientX ?? e.nativeEvent?.pageX ?? 0);
}

function ResizablePanes({
  vertical,
  primary,
  secondary,
  primaryFlex,
  secondaryFlex,
  minFraction,
  maxFraction,
  fraction: fractionProp,
  onFractionChange,
}: {
  vertical: boolean;
  primary: ReactNode;
  secondary: ReactNode;
  primaryFlex: number;
  secondaryFlex: number;
  minFraction: number;
  maxFraction: number;
  fraction?: number;
  onFractionChange?: (fraction: number) => void;
}) {
  const sashId = useId();
  const rtl = useDirection() === 'rtl';
  // RTL mirrors the inline axis only; a vertical seam has no mirror.
  const dirSign = !vertical && rtl ? -1 : 1;
  const defaultFraction = primaryFlex / Math.max(primaryFlex + secondaryFlex, 1);
  const [uncontrolled, setUncontrolled] = useState(defaultFraction);
  const fraction = clampFraction(fractionProp ?? uncontrolled, minFraction, maxFraction);
  const [hot, setHot] = useState(false);
  const [kbFocus, setKbFocus] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sizeRef = useRef(0);
  const rowRef = useRef<any>(null);
  const dragRef = useRef<{ start: number; startFraction: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  const resizeCursor = vertical ? 'row-resize' : 'col-resize';

  const measureSize = useCallback(() => {
    const size = axisSize(vertical, rowRef.current?.getBoundingClientRect?.());
    if (size) {
      sizeRef.current = size;
    }
  }, [vertical]);

  ensureKeyboardModalityTracking();

  const commit = useCallback(
    (next: number) => {
      const clamped = clampFraction(next, minFraction, maxFraction);
      if (fractionProp === undefined) {
        setUncontrolled(clamped);
      }
      onFractionChange?.(clamped);
    },
    [fractionProp, minFraction, maxFraction, onFractionChange],
  );

  const reset = useCallback(() => {
    commit(defaultFraction);
  }, [commit, defaultFraction]);

  const finishDrag = useCallback(() => {
    const session = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setHot(false);
    if (session && !session.moved) {
      const now = Date.now();
      if (now - lastTapRef.current < 400) {
        reset();
      }
      lastTapRef.current = now;
    }
  }, [reset]);

  useEffect(() => {
    if (!isWeb || !dragging || typeof window === 'undefined') {
      return;
    }
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.documentElement.style.cursor;
    document.body.style.userSelect = 'none';
    document.documentElement.style.cursor = resizeCursor;

    const onMove = (e: PointerEvent) => {
      const session = dragRef.current;
      if (sizeRef.current <= 0) {
        measureSize();
      }
      const size = sizeRef.current;
      if (!session || size <= 0) {
        return;
      }
      const delta = (pointerPos(vertical, e) - session.start) * dirSign;
      if (Math.abs(delta) > 2) {
        session.moved = true;
      }
      commit(session.startFraction + delta / size);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.documentElement.style.cursor = prevCursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [commit, dirSign, dragging, finishDrag, measureSize, resizeCursor, vertical]);

  const onSashPointerDown = (e: any) => {
    if (e.button != null && e.button !== 0) {
      return;
    }
    e.preventDefault?.();
    e.stopPropagation?.();
    try {
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    } catch {
      /* native / no capture */
    }
    measureSize();
    dragRef.current = {
      start: pointerPos(vertical, e),
      startFraction: fraction,
      moved: false,
    };
    setDragging(true);
    setHot(true);
  };

  const onSashPointerMove = (e: any) => {
    if (!dragRef.current || isWeb) {
      return;
    }
    const size = sizeRef.current;
    if (size <= 0) {
      return;
    }
    const delta = (pointerPos(vertical, e) - dragRef.current.start) * dirSign;
    if (Math.abs(delta) > 2) {
      dragRef.current.moved = true;
    }
    commit(dragRef.current.startFraction + delta / size);
  };

  const keyBack = vertical ? 'ArrowUp' : 'ArrowLeft';
  const keyForward = vertical ? 'ArrowDown' : 'ArrowRight';

  const onSashKeyDown = (e: any) => {
    const key = e.key as string;
    const step = e.shiftKey ? FRACTION_STEP_LARGE : FRACTION_STEP;
    if (key === keyBack) {
      e.preventDefault?.();
      commit(fraction - step * dirSign);
    } else if (key === keyForward) {
      e.preventDefault?.();
      commit(fraction + step * dirSign);
    } else if (key === 'Home') {
      e.preventDefault?.();
      commit(minFraction);
    } else if (key === 'End') {
      e.preventDefault?.();
      commit(maxFraction);
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault?.();
      reset();
    }
  };

  const percent = Math.round(fraction * 100);
  const lineHot = hot || dragging || kbFocus;
  const sashOverhang = -(SASH_VISUAL - hairlineWidth) / 2;

  return (
    <XStack
      ref={rowRef}
      flexDirection={vertical ? 'column' : 'row'}
      flexGrow={1}
      flexShrink={1}
      flexBasis="auto"
      minWidth={0}
      minHeight={0}
      width="100%"
      alignItems="stretch"
      onLayout={(e) => {
        sizeRef.current = axisSize(vertical, e.nativeEvent.layout);
      }}>
      <YStack flexGrow={fraction} flexShrink={1} flexBasis={0} minWidth={0} minHeight={0} data-testid="pane-primary">
        {primary}
      </YStack>
      <YStack
        {...(vertical ? { height: hairlineWidth } : { width: hairlineWidth })}
        flexGrow={0}
        flexShrink={0}
        alignSelf="stretch"
        position="relative"
        zIndex={2}>
        <YStack
          position="absolute"
          {...(vertical
            ? {
                left: 0,
                right: 0,
                height: SASH_VISUAL,
                top: sashOverhang,
                justifyContent: 'center' as const,
              }
            : {
                top: 0,
                bottom: 0,
                width: SASH_VISUAL,
                left: sashOverhang,
                alignItems: 'center' as const,
              })}
          cursor={resizeCursor}
          userSelect="none"
          tabIndex={0}
          role="separator"
          aria-orientation={vertical ? 'horizontal' : 'vertical'}
          aria-controls={sashId}
          aria-valuemin={Math.round(minFraction * 100)}
          aria-valuemax={Math.round(maxFraction * 100)}
          aria-valuenow={percent}
          aria-label="Resize panes"
          data-testid="pane-sash"
          {...(!isWeb ? { hitSlop: pressTargetHitSlop(SASH_VISUAL) } : undefined)}
          {...(kbFocus ? ensureFocusVisibleRing() : undefined)}
          onPointerDown={onSashPointerDown}
          onPointerMove={onSashPointerMove}
          onPointerUp={isWeb ? undefined : finishDrag}
          onPointerCancel={isWeb ? undefined : finishDrag}
          // Tamagui forwards onHoverIn/onHoverOut at runtime; the RN-flavored
          // View prop type omits them (house Record cast).
          {...({
            onHoverIn: () => {
              setHot(true);
            },
            onHoverOut: () => {
              if (!dragging) {
                setHot(false);
              }
            },
          } as Record<string, unknown>)}
          onFocus={() => {
            if (wasKeyboardFocus()) {
              setKbFocus(true);
            }
          }}
          onBlur={() => {
            setKbFocus(false);
          }}
          onKeyDown={onSashKeyDown}>
          {vertical ? (
            <YStack
              alignSelf="stretch"
              height={lineHot ? 2 : hairlineWidth}
              backgroundColor={lineHot ? '$accentBackground' : '$borderColor'}
              {...(lineHot ? undefined : hairline.line)}
            />
          ) : (
            <YStack
              flex={1}
              width={lineHot ? 2 : hairlineWidth}
              backgroundColor={lineHot ? '$accentBackground' : '$borderColor'}
              {...(lineHot ? undefined : hairline.vline)}
            />
          )}
        </YStack>
      </YStack>
      <YStack
        id={sashId}
        flexGrow={1 - fraction}
        flexShrink={1}
        flexBasis={0}
        minWidth={0}
        minHeight={0}
        data-testid="pane-secondary">
        {secondary}
      </YStack>
    </XStack>
  );
}

// ── List-detail ───────────────────────────────────────────────────────────

export interface ListDetailLayoutProps extends Omit<PaneScaffoldProps, 'primary' | 'secondary' | 'paneFlex'> {
  list: ReactNode;
  detail: ReactNode;
  /** When true on single-pane viewports, show detail instead of list. */
  selected?: boolean;
}

/**
 * Canonical list-detail: explorative list + item detail. Detail remains
 * meaningful without the list (Material M-L4). List is the narrower pane
 * (Linear issue view / VS Code explorer), not a 50/50 split.
 *
 * Below the two-pane budget this SWAPS rather than stacks — list and detail
 * are two steps of one navigation, so `selected` decides which is on screen.
 * Pass `narrowLayout="stack"` to show both instead.
 */
export function ListDetailLayout({
  list,
  detail,
  selected = false,
  activePane,
  narrowLayout,
  ...rest
}: ListDetailLayoutProps) {
  return (
    <PaneScaffold
      primary={list}
      secondary={detail}
      paneFlex={[1, 2]}
      activePane={activePane ?? (selected ? 'secondary' : 'primary')}
      narrowLayout={narrowLayout ?? 'swap'}
      data-canonical="list-detail"
      {...rest}
    />
  );
}

// ── Supporting pane ───────────────────────────────────────────────────────

export interface SupportingPaneLayoutProps extends Omit<PaneScaffoldProps, 'primary' | 'secondary' | 'paneFlex'> {
  /** Main content (~⅔ when side-by-side). */
  children: ReactNode;
  supporting: ReactNode;
}

/**
 * Canonical supporting-pane: primary content + contextual support (~⅔ / ⅓).
 * Supporting content is only meaningful relative to primary (Material M-L4).
 * Seam is a hairline (Polaris Frame navigation / Linear properties column).
 *
 * Below the two-pane budget the supporting content stacks under the primary.
 * It is never dropped: it has no screen of its own to be reached from.
 */
export function SupportingPaneLayout({ children, supporting, ...rest }: SupportingPaneLayoutProps) {
  return (
    <PaneScaffold
      primary={children}
      secondary={supporting}
      paneFlex={[2, 1]}
      data-canonical="supporting-pane"
      {...rest}
    />
  );
}

// ── Feed ──────────────────────────────────────────────────────────────────

export interface FeedLayoutProps extends YStackProps {
  children: ReactNode;
  /** Min card width before the grid adds a column. Default 280. */
  minItemWidth?: number;
}

/**
 * Canonical feed: equal-weight items in a responsive grid. Uses semantic
 * `betweenGroups` gap between cards. Web uses auto-fill tracks (Polaris
 * card grid); native wraps at `minItemWidth`.
 */
export function FeedLayout({ children, minItemWidth = 280, ...rest }: FeedLayoutProps) {
  const gaps = useSemanticGaps();
  const multi = useMultiPane();

  return (
    <YStack
      flexDirection={multi && !isWeb ? 'row' : 'column'}
      flexWrap={multi && !isWeb ? 'wrap' : undefined}
      gap={gaps.betweenGroups.gap}
      data-testid="feed-layout"
      data-canonical="feed"
      {...(isWeb && multi
        ? {
            style: {
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
            },
          }
        : undefined)}
      {...rest}>
      {Children.map(children, (child, i) => (
        <YStack
          key={i}
          {...(multi && !isWeb
            ? {
                flexGrow: 1,
                flexBasis: minItemWidth,
                minWidth: minItemWidth,
                maxWidth: '100%',
              }
            : { minWidth: 0 })}>
          {child}
        </YStack>
      ))}
    </YStack>
  );
}

// ── Reading width ─────────────────────────────────────────────

export interface ReadingWidthProps extends YStackProps {
  /** Measure in `ch`. Default 70 (clamped 65–75). Pass `"none"` to eject. */
  measure?: number | 'none';
  children: ReactNode;
}

/**
 * Constrains prose / long-form content to a readable measure (~65–75ch).
 * Full-bleed is the eject (`measure="none"`), not the default.
 */
export function ReadingWidth({ measure = READING_WIDTH_CH, children, ...rest }: ReadingWidthProps) {
  return (
    <YStack alignSelf="flex-start" {...readingWidthStyle(measure)} data-testid="reading-width" {...rest}>
      {children}
    </YStack>
  );
}

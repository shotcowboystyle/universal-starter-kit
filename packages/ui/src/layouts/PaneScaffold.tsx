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
  READING_WIDTH_CH,
} from '@repo/theme';
import type { LayoutSizeClass } from '@repo/theme';
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { TamaguiElement, XStackProps, YStackProps } from 'tamagui';
import { isWeb, XStack, YStack } from 'tamagui';

import { useDirection } from '../hooks/use-direction';

/** Visual sash hit (VS Code sash.size ≈ 4–8). Native expands to 44 via hitSlop. */
const SASH_VISUAL = 8;
const FRACTION_STEP = 0.02;
const FRACTION_STEP_LARGE = 0.1;
const DEFAULT_MIN_FRACTION = 0.2;
const DEFAULT_MAX_FRACTION = 0.8;
const DEFAULT_PANE_FLEX: [number, number] = [1, 1];
const SEAM_COLOR = '$borderColor';
const DRAG_THRESHOLD = 2;

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

const clampFraction = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const axisSize = (vertical: boolean, rect: { width?: number; height?: number } | null | undefined): number =>
  (vertical ? rect?.height : rect?.width) ?? 0;

/** Pointer coordinates as DOM (`client*`) or native (`nativeEvent.page*`) events expose them. */
interface PointerLike {
  clientX?: number;
  clientY?: number;
  nativeEvent?: { pageX?: number; pageY?: number };
}

interface SashPointerEvent extends PointerLike {
  button?: number;
  pointerId: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  currentTarget?: { setPointerCapture?: (pointerId: number) => void };
}

interface SashKeyEvent {
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
}

const verticalPos = (e: PointerLike): number => e.clientY ?? e.nativeEvent?.pageY ?? 0;
const horizontalPos = (e: PointerLike): number => e.clientX ?? e.nativeEvent?.pageX ?? 0;
const pointerPos = (vertical: boolean, e: PointerLike): number => (vertical ? verticalPos(e) : horizontalPos(e));

/** Fraction a sash key moves to, `'reset'` for Enter/Space, or null for an unhandled key. */
const resolveSashKey = ({
  key,
  large,
  fraction,
  vertical,
  dirSign,
  minFraction,
  maxFraction,
}: {
  key: string | undefined;
  large: boolean;
  fraction: number;
  vertical: boolean;
  dirSign: number;
  minFraction: number;
  maxFraction: number;
}): number | 'reset' | null => {
  const step = large ? FRACTION_STEP_LARGE : FRACTION_STEP;
  if (key === (vertical ? 'ArrowUp' : 'ArrowLeft')) {
    return fraction - step * dirSign;
  }
  if (key === (vertical ? 'ArrowDown' : 'ArrowRight')) {
    return fraction + step * dirSign;
  }
  if (key === 'Home') {
    return minFraction;
  }
  if (key === 'End') {
    return maxFraction;
  }
  return key === 'Enter' || key === ' ' ? 'reset' : null;
};

/** Window-level pointer tracking for a web drag; returns the cleanup that restores body styles. */
const trackWindowDrag = ({
  cursor,
  onMove,
  onEnd,
}: {
  cursor: string;
  onMove: (e: PointerEvent) => void;
  onEnd: () => void;
}): (() => void) => {
  const prevUserSelect = document.body.style.userSelect;
  const prevCursor = document.documentElement.style.cursor;
  document.body.style.userSelect = 'none';
  document.documentElement.style.cursor = cursor;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  return () => {
    document.body.style.userSelect = prevUserSelect;
    document.documentElement.style.cursor = prevCursor;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
  };
};

type SashHandlers = Pick<
  YStackProps,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onFocus' | 'onBlur' | 'onKeyDown'
> & {
  onHoverIn: () => void;
  onHoverOut: () => void;
};

const SashLine = ({ vertical, lineHot }: { vertical: boolean; lineHot: boolean }) => {
  const thickness = lineHot ? 2 : hairlineWidth;
  const backgroundColor = lineHot ? '$accentBackground' : SEAM_COLOR;
  if (vertical) {
    return (
      <YStack
        alignSelf="stretch"
        height={thickness}
        backgroundColor={backgroundColor}
        {...(lineHot ? undefined : hairline.line)}
      />
    );
  }
  return (
    <YStack
      flex={1}
      width={thickness}
      backgroundColor={backgroundColor}
      {...(lineHot ? undefined : hairline.vline)}
    />
  );
};

/** APG window splitter: the focusable, draggable seam between two panes. */
const PaneSash = ({
  vertical,
  sashId,
  cursor,
  minFraction,
  maxFraction,
  percent,
  lineHot,
  kbFocus,
  handlers,
}: {
  vertical: boolean;
  sashId: string;
  cursor: 'row-resize' | 'col-resize';
  minFraction: number;
  maxFraction: number;
  percent: number;
  lineHot: boolean;
  kbFocus: boolean;
  handlers: SashHandlers;
}) => {
  const sashOverhang = -(SASH_VISUAL - hairlineWidth) / 2;
  return (
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
      cursor={cursor}
      userSelect="none"
      tabIndex={0}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- APG window splitter: a focusable, draggable separator; <hr> is non-interactive
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-controls={sashId}
      aria-valuemin={Math.round(minFraction * 100)}
      aria-valuemax={Math.round(maxFraction * 100)}
      aria-valuenow={percent}
      aria-label="Resize panes"
      data-testid="pane-sash"
      {...(isWeb ? undefined : { hitSlop: pressTargetHitSlop(SASH_VISUAL) })}
      {...(kbFocus ? ensureFocusVisibleRing() : undefined)}
      // Tamagui forwards onHoverIn/onHoverOut at runtime; the RN-flavored
      // View prop type omits them, so they ride in via spread.
      {...handlers}>
      <SashLine
        vertical={vertical}
        lineHot={lineHot}
      />
    </YStack>
  );
};

const ResizablePanes = ({
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
}) => {
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
  const rowRef = useRef<TamaguiElement>(null);
  const dragRef = useRef<{ start: number; startFraction: number; moved: boolean } | null>(null);
  const lastTapRef = useRef(0);
  const resizeCursor = vertical ? 'row-resize' : 'col-resize';

  const measureSize = useCallback(() => {
    const row = rowRef.current;
    // Native views have no getBoundingClientRect.
    const size = axisSize(
      vertical,
      row !== null && 'getBoundingClientRect' in row ? row.getBoundingClientRect() : null,
    );
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
    if (session !== null && !session.moved) {
      const now = Date.now();
      if (now - lastTapRef.current < 400) {
        reset();
      }
      lastTapRef.current = now;
    }
  }, [reset]);

  const onMove = useEffectEvent((e: PointerEvent) => {
    const session = dragRef.current;
    if (sizeRef.current <= 0) {
      measureSize();
    }
    const size = sizeRef.current;
    if (session === null || size <= 0) {
      return;
    }
    const delta = (pointerPos(vertical, e) - session.start) * dirSign;
    if (Math.abs(delta) > DRAG_THRESHOLD) {
      session.moved = true;
    }
    commit(session.startFraction + delta / size);
  });

  useEffect(
    () =>
      isWeb && dragging && typeof window !== 'undefined'
        ? trackWindowDrag({
            cursor: resizeCursor,
            onMove: (e) => {
              onMove(e);
            },
            onEnd: finishDrag,
          })
        : undefined,
    [dragging, finishDrag, resizeCursor],
  );

  const onSashPointerDown = (e: SashPointerEvent) => {
    if (e.button !== undefined && e.button !== 0) {
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

  const onSashPointerMove = (e: PointerLike) => {
    const session = dragRef.current;
    if (session === null || isWeb) {
      return;
    }
    const size = sizeRef.current;
    if (size <= 0) {
      return;
    }
    const delta = (pointerPos(vertical, e) - session.start) * dirSign;
    if (Math.abs(delta) > DRAG_THRESHOLD) {
      session.moved = true;
    }
    commit(session.startFraction + delta / size);
  };

  const onSashKeyDown = (e: SashKeyEvent) => {
    const next = resolveSashKey({
      key: e.key,
      large: e.shiftKey === true,
      fraction,
      vertical,
      dirSign,
      minFraction,
      maxFraction,
    });
    if (next === null) {
      return;
    }
    e.preventDefault?.();
    if (next === 'reset') {
      reset();
    } else {
      commit(next);
    }
  };

  const sashHandlers: SashHandlers = {
    onPointerDown: onSashPointerDown,
    onPointerMove: onSashPointerMove,
    onPointerUp: isWeb ? undefined : finishDrag,
    onPointerCancel: isWeb ? undefined : finishDrag,
    onHoverIn: () => {
      setHot(true);
    },
    onHoverOut: () => {
      if (!dragging) {
        setHot(false);
      }
    },
    onFocus: () => {
      if (wasKeyboardFocus()) {
        setKbFocus(true);
      }
    },
    onBlur: () => {
      setKbFocus(false);
    },
    onKeyDown: onSashKeyDown,
  };

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
      <YStack
        flexGrow={fraction}
        flexShrink={1}
        flexBasis={0}
        minWidth={0}
        minHeight={0}
        data-testid="pane-primary">
        {primary}
      </YStack>
      <YStack
        {...(vertical ? { height: hairlineWidth } : { width: hairlineWidth })}
        flexGrow={0}
        flexShrink={0}
        alignSelf="stretch"
        position="relative"
        zIndex={2}>
        <PaneSash
          vertical={vertical}
          sashId={sashId}
          cursor={resizeCursor}
          minFraction={minFraction}
          maxFraction={maxFraction}
          percent={Math.round(fraction * 100)}
          lineHot={hot || dragging || kbFocus}
          kbFocus={kbFocus}
          handlers={sashHandlers}
        />
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
};

const paneHairlineEnd = isWeb
  ? {
      borderInlineEndWidth: hairlineWidth,
      borderInlineEndStyle: 'solid' as const,
      borderColor: SEAM_COLOR,
      className: 'mp-hairline-ie',
    }
  : { borderEndWidth: hairlineWidth, borderColor: SEAM_COLOR };

/** Stacked seam: the horizontal twin of `paneHairlineEnd`. */
const paneHairlineBottom = { ...hairline.bottom, borderColor: SEAM_COLOR };

type PaneMode = 'stack' | 'split' | 'single';

const resolvePaneMode = ({
  budget,
  hasSecondary,
  narrowLayout,
}: {
  budget: number;
  hasSecondary: boolean;
  narrowLayout: 'stack' | 'swap';
}): PaneMode => {
  if (budget >= 2 && hasSecondary) {
    return 'split';
  }
  return hasSecondary && narrowLayout === 'stack' ? 'stack' : 'single';
};

interface ScaffoldVariantProps {
  primary: ReactNode;
  secondary: ReactNode;
  orientation: PaneOrientation;
  sizeClass: LayoutSizeClass;
  rootProps: Omit<XStackProps, 'children'>;
}

const StackedScaffold = ({
  primary,
  secondary,
  orientation,
  sizeClass,
  rootProps,
  gap,
}: ScaffoldVariantProps & { gap: XStackProps['gap'] }) => (
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
    {...rootProps}>
    <YStack
      flexGrow={1}
      flexShrink={1}
      flexBasis="auto"
      minWidth={0}
      minHeight={0}
      width="100%"
      {...(gap === undefined ? paneHairlineBottom : undefined)}
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

const SplitScaffold = ({
  primary,
  secondary,
  orientation,
  sizeClass,
  rootProps,
  gap,
  paneFlex: [primaryFlex, secondaryFlex],
  resizable: resizableProp,
  minFraction,
  maxFraction,
  primaryFraction,
  onPrimaryFractionChange,
}: ScaffoldVariantProps & {
  gap: XStackProps['gap'];
  paneFlex: [number, number];
  resizable: boolean | undefined;
  minFraction: number;
  maxFraction: number;
  primaryFraction: number | undefined;
  onPrimaryFractionChange: ((fraction: number) => void) | undefined;
}) => {
  const gapped = gap !== undefined;
  const vertical = orientation === 'vertical';
  const resizable = !gapped && (resizableProp ?? true);
  const primarySeam = vertical ? paneHairlineBottom : paneHairlineEnd;
  const seamProps = gapped ? undefined : primarySeam;
  return (
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
      {...rootProps}>
      {resizable ? (
        <ResizablePanes
          vertical={vertical}
          primary={primary}
          secondary={secondary}
          primaryFlex={primaryFlex}
          secondaryFlex={secondaryFlex}
          minFraction={minFraction}
          maxFraction={maxFraction}
          fraction={primaryFraction}
          onFractionChange={onPrimaryFractionChange}
        />
      ) : (
        <>
          <YStack
            flex={primaryFlex}
            minWidth={0}
            minHeight={0}
            {...seamProps}
            data-testid="pane-primary">
            {primary}
          </YStack>
          <YStack
            flex={secondaryFlex}
            minWidth={0}
            minHeight={0}
            data-testid="pane-secondary">
            {secondary}
          </YStack>
        </>
      )}
    </XStack>
  );
};

const SinglePaneScaffold = ({
  primary,
  secondary,
  orientation,
  sizeClass,
  rootProps,
  activePane,
}: ScaffoldVariantProps & { activePane: PaneRole }) => (
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
    {...rootProps}>
    {activePane === 'secondary' && secondary !== null && secondary !== undefined ? secondary : primary}
  </YStack>
);

/**
 * Adaptive one-/two-pane shell. Geometry only — surface colors stay stable
 * across breakpoints (Material M-L5).
 */
export const PaneScaffold = ({
  primary,
  secondary,
  orientation = 'horizontal',
  activePane: activePaneProp,
  narrowLayout: narrowLayoutProp,
  maxPanes: maxPanesProp,
  paneFlex = DEFAULT_PANE_FLEX,
  paneGap,
  resizable,
  minPaneFraction = DEFAULT_MIN_FRACTION,
  maxPaneFraction = DEFAULT_MAX_FRACTION,
  primaryFraction,
  onPrimaryFractionChange,
  sizeClass: sizeClassProp,
  ...rest
}: PaneScaffoldProps) => {
  const liveClass = useLayoutSizeClass();
  const inheritedClass = useContext(PaneSizeClassContext);
  const sizeClass = sizeClassProp ?? inheritedClass ?? liveClass;
  const mode = resolvePaneMode({
    // Explicit `maxPanes` is the eject hatch (force 1 or 2 regardless of class).
    budget: maxPanesProp ?? defaultMaxPanes(sizeClass),
    hasSecondary: secondary !== null && secondary !== undefined,
    // `activePane` only decides anything when a pane is dropped, so passing it
    // IS the swap opt-in. Everything else stacks: a scaffold that hides its
    // secondary by default leaves that content unreachable on a phone.
    narrowLayout: narrowLayoutProp ?? (activePaneProp === undefined ? 'stack' : 'swap'),
  });
  const variant = { primary, secondary, orientation, sizeClass, rootProps: rest };

  // flexBasis auto, not the flex:1 shorthand's 0%: react-native-web resets
  // min-height to 0, so a 0% basis contributes zero intrinsic height inside
  // auto-height scroll flows (Screen scroll pages) and the scaffold collapses,
  // painting pane content over whatever follows. Bounded parents still fill
  // (grow 1) exactly as before.
  let content: ReactNode;
  if (mode === 'stack') {
    content = (
      <StackedScaffold
        {...variant}
        gap={paneGap}
      />
    );
  } else if (mode === 'split') {
    content = (
      <SplitScaffold
        {...variant}
        gap={paneGap}
        paneFlex={paneFlex}
        resizable={resizable}
        minFraction={minPaneFraction}
        maxFraction={maxPaneFraction}
        primaryFraction={primaryFraction}
        onPrimaryFractionChange={onPrimaryFractionChange}
      />
    );
  } else {
    content = (
      <SinglePaneScaffold
        {...variant}
        activePane={activePaneProp ?? 'primary'}
      />
    );
  }

  return <PaneSizeClassContext.Provider value={sizeClass}>{content}</PaneSizeClassContext.Provider>;
};

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
export const ListDetailLayout = ({
  list,
  detail,
  selected = false,
  activePane,
  narrowLayout,
  ...rest
}: ListDetailLayoutProps) => (
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
export const SupportingPaneLayout = ({ children, supporting, ...rest }: SupportingPaneLayoutProps) => (
  <PaneScaffold
    primary={children}
    secondary={supporting}
    paneFlex={[2, 1]}
    data-canonical="supporting-pane"
    {...rest}
  />
);

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
export const FeedLayout = ({ children, minItemWidth = 280, ...rest }: FeedLayoutProps) => {
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
      {/* oxlint-disable-next-line react/no-react-children -- Children.map keys each wrapped child from its original key/index */}
      {Children.map(children, (child) => (
        <YStack
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
};

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
export const ReadingWidth = ({ measure = READING_WIDTH_CH, children, ...rest }: ReadingWidthProps) => (
  <YStack
    alignSelf="flex-start"
    {...readingWidthStyle(measure)}
    data-testid="reading-width"
    {...rest}>
    {children}
  </YStack>
);
